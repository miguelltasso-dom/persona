/**
 * Isolated PersonaHost for product journeys. File SQLite, injectable clock,
 * scripted fake runner. Does not use Anvil's shared in-memory harness.
 */

import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterEach } from 'vitest'
import PersonaHost from '../../src/index.ts'
import { HOST_TEST_TIMEOUT_MS } from '../host-harness.ts'

export { it } from '../host-harness.ts'

export const CLOCK = '2026-11-03T15:00:00.000Z'
export const SCOPE = { workspaceId: 'ws', projectId: 'pp' } as const
/** File SQLite + Cordis under load — same budget as Anvil host-harness. */
export const JOURNEY_TIMEOUT_MS = 20_000

const dirs: string[] = []
const extras: Context[] = []

afterEach(async () => {
  for (const ctx of extras.splice(0)) await ctx.fiber.dispose()
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
}, HOST_TEST_TIMEOUT_MS)

/**
 * Open a throwaway in-memory host (Vitest default). File SQLite only for resume.
 * @param clock - ISO now for orchestration.
 */
export function openJourney(clock: string = CLOCK): PersonaHost {
  const ctx = new Context()
  extras.push(ctx)
  const h = new PersonaHost(ctx)
  h.orchestration.now = () => clock
  h.orchestration.scripted = true
  return h
}

/**
 * File-backed host for crash/resume.
 * @param clock - ISO now.
 */
export function openJourneyFile(clock: string = CLOCK): PersonaHost {
  const dir = mkdtempSync(join(tmpdir(), 'persona-journey-'))
  dirs.push(dir)
  const ctx = new Context()
  extras.push(ctx)
  const h = new PersonaHost(ctx, { databasePath: join(dir, 'p.db') })
  h.orchestration.now = () => clock
  h.orchestration.scripted = true
  return h
}

/**
 * Reopen the same SQLite file (crash/resume).
 * @param host - Previous host (its db path is reused via PERSONA_HOME sibling).
 * @param databasePath - File path.
 * @param clock - ISO now.
 */
export function reopenJourney(databasePath: string, clock: string = CLOCK): PersonaHost {
  const ctx = new Context()
  extras.push(ctx)
  const h = new PersonaHost(ctx, { databasePath })
  h.orchestration.now = () => clock
  h.orchestration.scripted = true
  return h
}

/**
 * Owner + optional coordination persona + #geral.
 * @param h - Host.
 * @param team - Personas to create (empty = none).
 */
export function seedJourney(
  h: PersonaHost,
  team: ReadonlyArray<{
    id: string
    name: string
    title: string
    coordination?: boolean
    canRecruit?: boolean
  }> = [],
): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  for (const row of team) {
    h.createPersona({
      workspaceId: 'ws',
      projectId: 'pp',
      id: row.id,
      name: row.name,
      title: row.title,
      description: row.title,
      personality: 'Clara.',
      instructions: 'Ajude.',
      avatarKind: 'gallery',
      avatarRef: row.name.toLowerCase(),
      runnerKind: 'dsh',
      runnerCli: '',
      runnerModel: 'm',
      canRecruit: row.canRecruit === true,
      createdBy: 'ana',
      ...(row.coordination === true ? { systemRoles: ['coordination'] as const } : {}),
    })
  }
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

/** `#geral` channel id for a project (`geral` on Pessoal; `geral:<projectId>` after createProject). */
export function geralChannelId(h: PersonaHost, projectId: string): string {
  const channels = h.listChannels({ workspaceId: 'ws', projectId })
  const row = channels.find(channel => channel.name === 'geral')
  if (row === undefined) throw new Error(`missing #geral for project ${projectId}`)
  return row.id
}

/**
 * Second project on the same workspace (owner already exists).
 * @param h - Host.
 * @param project - Id, name, optional flow template and team.
 */
export function seedProject(
  h: PersonaHost,
  project: {
    id: string
    name: string
    template?: 'contratacao' | 'site' | 'software' | 'marketing' | 'atendimento' | 'simples' | 'em_branco'
    team?: ReadonlyArray<{
      id: string
      name: string
      title: string
      coordination?: boolean
    }>
  },
): void {
  h.createProject({
    id: project.id, workspaceId: 'ws', name: project.name, description: project.name,
  })
  for (const row of project.team ?? []) {
    h.createPersona({
      workspaceId: 'ws',
      projectId: project.id,
      id: row.id,
      name: row.name,
      title: row.title,
      description: row.title,
      personality: 'Clara.',
      instructions: 'Ajude.',
      avatarKind: 'gallery',
      avatarRef: row.name.toLowerCase(),
      runnerKind: 'dsh',
      runnerCli: '',
      runnerModel: 'm',
      canRecruit: true,
      createdBy: 'ana',
      ...(row.coordination === true ? { systemRoles: ['coordination'] as const } : {}),
    })
  }
  if (project.template !== undefined) {
    h.createWorkflowFromTemplate({
      workspaceId: 'ws', projectId: project.id, template: project.template,
    })
  }
}

/**
 * Human line on a project channel.
 * @param h - Host.
 * @param projectId - Tenant.
 * @param id - Event id.
 * @param body - Text.
 */
export function sayOn(h: PersonaHost, projectId: string, id: string, body: string): void {
  h.postMessage({
    id,
    workspaceId: 'ws',
    projectId,
    streamKind: 'channel',
    ownerId: geralChannelId(h, projectId),
    body,
    actorId: 'ana',
    subjectId: id,
    occurredAt: CLOCK,
  })
}

export function say(h: PersonaHost, id: string, body: string): void {
  h.postMessage({
    id,
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    body,
    actorId: 'ana',
    subjectId: id,
    occurredAt: CLOCK,
  })
}

export function dbPathOf(h: PersonaHost): string {
  return h.store.path
}
