import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import { afterAll, expect, it } from 'vitest'
import PersonaHost from '../src/index.ts'

/**
 * Probe 22:23 (S3): with the recovery waiting for the engine, the first delivery was POSTED AGAIN at every reopen (one paid turn and a duplicate in #geral per restart). The talk recovery took for "a person waiting for an
 * answer" two things that had already been answered or that nobody was waiting on: (A) the system's own welcome (`onb-welcome`, authored by `system` when the team did not exist yet), (B) a message that BECAME a Task and
 * was answered by that Task's own lines (no `coord-<id>-…` line exists for it). Rule: RECOVERY NEVER REDOES A DELIVERY ALREADY POSTED, and answers only a PERSON. A Task still running is resumed by `recover`.
 */
const root = mkdtempSync(join(tmpdir(), 'persona-boot-no-redo-'))
afterAll(() => { rmSync(root, { recursive: true, force: true }) })

const scope = { workspaceId: 'ws', projectId: 'pp' }
const DELIVERY = 'Aqui está a primeira entrega para a equipe: 1. Agência Ponto — estúdio de sites.'

function deliveredTask(triggerId: string): Ticket {
  return {
    id: 't-first', title: 'Primeira entrega', decisionId: 'd-first',
    mandate: { strength: 'explicit', policyVersion: 'v1', basis: { via: 'listed' }, actor: { source: 'channel', id: 'ana' }, scope: 'small' },
    channels: [], assignments: [{ id: 'a-first', state: 'ended', createdAt: '2026-11-12T12:00:00.000Z' }], inputs: [], undelivered: [],
    createdAt: '2026-11-12T12:00:00.000Z', updatedAt: '2026-11-12T12:05:00.000Z', origin: { triggerId, triggerIds: [triggerId] },
    execution: { name: 'Bia', directory: '.', assignment: 'go' }, ended: { at: '2026-11-12T12:05:00.000Z', by: 'executor', outcome: 'completed' },
  }
}

type Line = (id: string, type: string, actorId: string, body: string) => void

/** The first run of the app: a home with its team and what the first session left in the thread; then the app is closed. */
async function firstRun(databasePath: string, leave: (h: PersonaHost, line: Line) => void): Promise<void> {
  const ctx = new Context()
  const h = new PersonaHost(ctx, { databasePath })
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...scope, displayName: 'Ana', handle: 'ana', role: 'owner' })
  for (const [id, name, title] of [['p-coord', 'Coordenação', 'Coordenação'], ['p-bia', 'Bia', 'Redatora']] as const) {
    h.createPersona({
      id, ...scope, name, title, description: 'Implementa.', personality: 'Direta.', instructions: 'Prove.',
      avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '', runnerModel: 'default', canRecruit: false, createdBy: 'ana',
    })
  }
  h.product.updatePersona({ ...h.product.getPersona('p-coord')!, systemRoles: ['coordination'] }, 'pp')
  h.createChannel({ id: 'geral', ...scope, name: 'geral', topic: '' })
  leave(h, (id, type, actorId, body) => {
    h.events.append({ id, ...scope, streamKind: 'channel', ownerId: 'geral', type, body, actorId, subjectId: '', occurredAt: '2026-11-12T12:00:00.000Z' })
  })
  await ctx.fiber.dispose()
}

const lines = (h: PersonaHost): string[] => h.listMessages({ ...scope, streamKind: 'channel', ownerId: 'geral', actorId: 'ana', afterSeq: 0, limit: 200 }).events.map(event => `${event.type}/${event.actorId}: ${event.body}`)

/**
 * Reopen with the engine saying ready: whatever the boot held back runs NOW.
 * @returns The thread, and the ids of the messages the host started a MODEL TURN for (`finishReply`: the paid thing, whatever it wrote).
 */
async function reopenReady(databasePath: string): Promise<{ readonly thread: string[]; readonly answered: string[] }> {
  const ctx = new Context()
  const h = new PersonaHost(ctx, { databasePath })
  const answered: string[] = []
  const inner = h.orchestration as unknown as { finishReply: (rt: unknown, event: { id: string }, speaker: unknown) => Promise<void> }
  const original = inner.finishReply.bind(inner)
  inner.finishReply = (rt, event, speaker) => { answered.push(event.id); return original(rt, event, speaker) }
  try {
    await h.orchestration.flush('pp')
    h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
    h.orchestration.resumeDeferredRecoveries('pp')
    await h.orchestration.flush('pp')
    expect(h.orchestration.deferredRecoveriesOf('pp')).toBe(0)
    return { thread: lines(h), answered }
  } finally {
    await ctx.fiber.dispose()
  }
}

async function withRealRunners<T>(work: () => Promise<T>): Promise<T> {
  const previous = process.env.PERSONA_REAL_CLI
  process.env.PERSONA_REAL_CLI = '1' // the app's own mode: real runners (this machine has no CLI: a model turn would fail honestly into a run-error card)
  try {
    return await work()
  } finally {
    if (previous === undefined) delete process.env.PERSONA_REAL_CLI
    else process.env.PERSONA_REAL_CLI = previous
  }
}

it('(A) the SYSTEM welcome is nobody waiting for an answer: reopening twice with the engine ready posts nothing and starts no turn', async () => {
  await withRealRunners(async () => {
    const databasePath = join(root, 'a.db')
    await firstRun(databasePath, (_h, line) => { line('onb-welcome', 'message', 'system', 'Boas-vindas à Persona.') })
    const before = ['message/system: Boas-vindas à Persona.']
    for (const round of ['first reopen', 'second reopen']) {
      const after = await reopenReady(databasePath)
      expect(after.answered, `${round}: no model turn for the welcome`).toEqual([])
      expect(after.thread, `${round}: nothing new in the thread`).toEqual(before)
    }
  })
}, 60_000)

it('(B) a message that BECAME a Task was answered by that Task: reopening twice with the engine ready does not deliver again', async () => {
  await withRealRunners(async () => {
    const databasePath = join(root, 'b.db')
    await firstRun(databasePath, (h, line) => {
      line('m1', 'message', 'ana', 'Equipe, como está a primeira entrega?') // a question: not "wants work", yet it became a Task
      line('d1', 'runner', 'p-bia', DELIVERY) // the Task's own delivery: no `coord-m1-…` line anywhere
      h.orchestration.runtime('pp').repo.tickets.save(deliveredTask('m1'))
    })
    const before = ['message/ana: Equipe, como está a primeira entrega?', `runner/p-bia: ${DELIVERY}`]
    for (const round of ['first reopen', 'second reopen']) {
      const after = await reopenReady(databasePath)
      expect(after.answered, `${round}: no model turn for a message the Task already answered`).toEqual([])
      expect(after.thread, `${round}: no second delivery`).toEqual(before)
    }
  })
}, 60_000)

it('(D) a bubble left open for a message that became a Task is SETTLED where it is (kept, not spinning), never re-run', async () => {
  await withRealRunners(async () => {
    const databasePath = join(root, 'd.db')
    await firstRun(databasePath, (h, line) => {
      line('m1', 'message', 'ana', 'Equipe, como está a primeira entrega?')
      line('coord-m1-partial', 'partial', 'p-coord', 'Aqui está a primeira')
      h.orchestration.runtime('pp').repo.tickets.save(deliveredTask('m1'))
    })
    const after = await reopenReady(databasePath)
    expect(after.answered, 'no model turn').toEqual([])
    expect(after.thread.some(row => row.startsWith('partial/')), 'the bubble does not stay open').toBe(false)
    expect(after.thread.some(row => row.includes('Aqui está a primeira')), 'what was written is kept').toBe(true)
  })
}, 60_000)

it('control: a PERSON\'s message nobody answered IS still recovered when the engine becomes ready (the fix is not "recover nothing")', async () => {
  await withRealRunners(async () => {
    const databasePath = join(root, 'c.db')
    await firstRun(databasePath, (_h, line) => { line('u1', 'message', 'ana', 'Bom dia, tudo bem?') })
    const after = await reopenReady(databasePath)
    expect(after.answered, 'the held recovery ran the turn for the message nobody answered').toEqual(['u1'])
    expect(after.thread.length, 'and something was written for it (a reply, or the honest failure of this machine without a CLI)').toBeGreaterThan(1)
  })
}, 60_000)
