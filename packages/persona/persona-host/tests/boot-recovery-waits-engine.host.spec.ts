import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { afterAll, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'
import { HOST_TEST_TIMEOUT_MS } from './host-harness.ts'

/**
 * Boot recovery must WAIT for the engine (Probe 17:57, Keel 18:00): when the host reopens a home, what was interrupted (a reply that never finished, a conversation nobody answered, a Task that was running) is run again
 * ONLY once the engine says "ready". Before, it ran at the very boot, before any engine was probed: the persona's runner could not resolve, the Task went `blocked` and the #geral got a `run-error` card
 * ("O motor de Coordenação não está disponível neste computador") on EVERY reopen. A reopened home must show nothing until the engine is ready; when it is, the held recovery runs (and only then can it fail honestly).
 */
const root = mkdtempSync(join(tmpdir(), 'persona-boot-recovery-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

const scope = { workspaceId: 'ws', projectId: 'pp' }
const HOME_PERSONAS = [['p-coord', 'Coordenação', 'Coordenação'], ['p-bia', 'Bia', 'Redatora']] as const

/** The first run of the app: a home with its team, a welcome bubble that never finished and a person's message nobody answered (the app was closed in the middle). */
async function firstRun(databasePath: string): Promise<void> {
  const ctx = new Context()
  const h = new PersonaHost(ctx, { databasePath })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, title] of HOME_PERSONAS) {
    h.createPersona({
      id, ...scope, name, title, description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
  const line = (id: string, type: string, actorId: string, body: string): void => {
    h.events.append({ id, ...scope, streamKind: 'channel', ownerId: 'geral', type, body, actorId, subjectId: '', occurredAt: '2026-11-12T12:00:00.000Z' })
  }
  line('onb-welcome', 'message', 'p-coord', 'Oi! Eu sou a Coordenação.')
  line('coord-onb-welcome-partial', 'partial', 'p-coord', 'Vou preparar') // the welcome bubble the app was still writing
  line('u1', 'message', 'ana', 'Bom dia, tudo bem?') // a conversation nobody answered
  await ctx.fiber.dispose()
}

const lines = (h: PersonaHost): string[] => h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(event => event.body)
const errorCards = (h: PersonaHost): string[] => lines(h).filter(body => body.includes('run-error') || body.includes('não está disponível neste computador'))

it('a reopened home shows NO engine-error card before the engine is ready, and the held recovery runs when it becomes ready', async () => {
  const previous = process.env.PERSONA_REAL_CLI
  process.env.PERSONA_REAL_CLI = '1' // the app's own mode: real runners, no scripted replies (the test machine has no CLI, as the Probe's)
  try {
    const databasePath = join(root, 'persona.db')
    await firstRun(databasePath)
    const ctx = new Context()
    const h = new PersonaHost(ctx, { databasePath }) // the reopen: the recovery of the boot starts here
    try {
      expect(h.orchestration.engineReadinessOf?.().state).not.toBe('ready') // nobody probed the engine yet
      await h.orchestration.flush('pp')
      expect(errorCards(h), 'before the engine is ready nothing is re-run: no run-error card').toEqual([])
      expect(h.listTasks(scope).filter(task => task.state === 'blocked'), 'and no Task is blocked by it').toEqual([])
      // The engine says ready: the held recovery runs now (it can fail honestly here: this machine has no CLI, but it was ASKED once the engine claimed to be ready).
      h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
      h.orchestration.resumeDeferredRecoveries('pp')
      await h.orchestration.flush('pp')
      expect(h.orchestration.deferredRecoveriesOf('pp')).toBe(0) // nothing is left waiting
    } finally {
      await ctx.fiber.dispose()
    }
  } finally {
    if (previous === undefined) delete process.env.PERSONA_REAL_CLI
    else process.env.PERSONA_REAL_CLI = previous
  }
}, HOST_TEST_TIMEOUT_MS)
