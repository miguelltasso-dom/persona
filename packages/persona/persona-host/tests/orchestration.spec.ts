import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { RECOVERY_NOTE } from '@deepseek-ai/dsh-persona-engine'
import { afterEach, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'

const roots: Context[] = []
const dirs: string[] = []
afterEach(async () => {
  await Promise.all(roots.splice(0).map(root => root.fiber.dispose()))
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

function host(databasePath = ''): PersonaHost {
  const ctx = new Context()
  roots.push(ctx)
  return new PersonaHost(ctx, { databasePath })
}

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createPersona({
    workspaceId: 'ws',
    projectId: 'pp',
    id: 'coord',
    name: 'Guia',
    title: 'Coordenação',
    description: 'Triagem.',
    personality: 'Calma.',
    instructions: 'Aceite pedidos claros.',
    avatarKind: 'gallery',
    avatarRef: 'guia',
    runnerKind: 'dsh',
    runnerCli: '',
    runnerModel: 'm',
    canRecruit: true,
    createdBy: 'ana',
  })
  h.product.updatePersona({
    ...h.product.getPersona('coord')!,
    systemRoles: ['coordination'],
  }, 'pp')
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
}

function ask(h: PersonaHost, id: string, body: string): void {
  h.postMessage({
    id,
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    body,
    actorId: 'ana',
    subjectId: 't1',
    occurredAt: '2026-11-03T15:00:00.000Z',
  })
}

it('turns a channel request into a kanban ticket and a coordination reply', () => {
  const h = host()
  seed(h)
  ask(h, 'm1', 'preciso de um README no projeto')
  const tasks = h.listTasks({ workspaceId: 'ws', projectId: 'pp' })
  expect(tasks.length).toBeGreaterThan(0)
  expect(tasks[0]?.title.toLowerCase()).toContain('readme')
  const page = h.listMessages({
    workspaceId: 'ws',
    projectId: 'pp',
    streamKind: 'channel',
    ownerId: 'geral',
    actorId: 'ana',
    afterSeq: 0,
    limit: 50,
  })
  expect(page.events.some(item => item.actorId === 'coord' && item.body.length > 0)).toBe(true)
})

it('passes a follow-up on a subscribed thread to the ticket without a second eval', () => {
  const h = host()
  seed(h)
  ask(h, 'm1', 'preciso de um README no projeto')
  const first = h.orchestration.runtime('pp').repo.tickets.list().length
  ask(h, 'm2', 'e coloca um badge também')
  const rt = h.orchestration.runtime('pp')
  expect(rt.repo.tickets.list()).toHaveLength(first)
  expect(rt.candidates).toEqual([])
})

it('resumes a running assignment with the recovery note after the host restarts', () => {
  const dir = mkdtempSync(join(tmpdir(), 'persona-orch-'))
  dirs.push(dir)
  const path = join(dir, 'persona.db')
  const first = host(path)
  seed(first)
  ask(first, 'm1', 'preciso de um README no projeto')
  const ticket = first.orchestration.runtime('pp').repo.tickets.list()[0]
  expect(ticket).toBeDefined()
  first.store.close()
  const second = host(path)
  second.orchestration.runtime('pp')
  expect(second.orchestration.runtime('pp').recoveryNotes).toContain(RECOVERY_NOTE)
})

it('keeps a single mutant run per ticket', () => {
  const h = host()
  seed(h)
  ask(h, 'm1', 'preciso de um README no projeto')
  const rt = h.orchestration.runtime('pp')
  const ticket = rt.repo.tickets.list()[0]
  expect(ticket).toBeDefined()
  expect(rt.started.size).toBe(1)
  expect(ticket?.assignments.filter(item => item.state !== 'ended')).toHaveLength(1)
})

it('ignores a channel message when no coordination function exists and nobody is mentioned', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'pp', name: 'geral', topic: '' })
  ask(h, 'm1', 'oi pessoal')
  expect(h.listTasks({ workspaceId: 'ws', projectId: 'pp' })).toEqual([])
})
