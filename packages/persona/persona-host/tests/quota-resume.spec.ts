/**
 * IV-7, "No limite → Retomar" de verdade (D-076):
 *  - a Task that the quota window stopped runs again, once, when the engine is ready again;
 *  - the messages sent while the engine is out stay queued (the engine keeps each stream in order) and run when it is back;
 *  - a retry or an answered question runs the worker again (the done line follows the Assignment, not the Ticket).
 */
import { RunnerResolveError } from '@deepseek-ai/dsh-persona-runners'
import { expect, vi } from 'vitest'
import PersonaHost from '../src/index.ts'
import { doneEventId } from '../src/ticket-done.ts'
import { quotaRecheckDelay } from '../src/quota-wait.ts'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()
const CLOCK = '2026-11-04T15:00:00.000Z'
const SCOPE = { workspaceId: 'ws', projectId: 'pp' }

function seed(h: PersonaHost): void {
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  h.createWorkspace({ id: 'ws', name: 'Padaria', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', ...SCOPE, displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createPersona({
    ...SCOPE, id: 'atlas', name: 'Atlas', title: 'Coordenação',
    description: 'Coordena.', personality: 'Calmo.', instructions: 'Despache.',
    avatarKind: 'gallery', avatarRef: 'atlas', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: false, createdBy: 'ana', systemRoles: ['coordination'],
  })
  h.createPersona({
    ...SCOPE, id: 'bento', name: 'Bento', title: 'Engenharia',
    description: 'Implementa.', personality: 'Direto.', instructions: 'Prove.',
    avatarKind: 'gallery', avatarRef: 'bento', runnerKind: 'dsh', runnerCli: '',
    runnerModel: 'm', canRecruit: true, createdBy: 'ana',
  })
  h.createChannel({ id: 'geral', ...SCOPE, name: 'geral', topic: '' })
}

interface Seen { deliveries: number; resolves: number; quota: { out: boolean; resetAt: string } }

/** Runner factory: while `quota.out` the task runner cannot be resolved (the window is out); otherwise a fake runner. */
function engine(h: PersonaHost): Seen {
  const seen: Seen = { deliveries: 0, resolves: 0, quota: { out: false, resetAt: '2026-11-04T20:00:00.000Z' } }
  h.orchestration.runnerFactory = async (request) => {
    if (seen.quota.out && request?.purpose === 'task') {
      throw new RunnerResolveError('quota_exhausted', 'claude', { resetAt: seen.quota.resetAt })
    }
    seen.resolves += 1
    const { createFakeRunner } = await import('@deepseek-ai/dsh-persona-runners')
    const inner = createFakeRunner()
    return new Proxy(inner, {
      get(target, prop, receiver) {
        if (prop === 'deliver') {
          return async (sessionId: string, requestId: string, text: string, mode: 'queue' | 'steer' | 'inject') => {
            seen.deliveries += 1
            await target.deliver(sessionId, requestId, text, mode)
          }
        }
        return Reflect.get(target, prop, receiver) as unknown
      },
    })
  }
  return seen
}

function say(h: PersonaHost, id: string, body: string, owner = 'geral'): void {
  h.postMessage({ id, ...SCOPE, streamKind: 'channel', ownerId: owner, body, actorId: 'ana', subjectId: `s-${id}`, occurredAt: CLOCK })
}

function doneBodies(h: PersonaHost, ticketId: string): string[] {
  const ticket = h.orchestration.runtime('pp').repo.tickets.get(ticketId)!
  return ticket.assignments.map((assignment) => {
    const id = ticket.assignments.length <= 1 || assignment.id === ticket.assignments[0]!.id
      ? `coord-${ticketId}-done`
      : `coord-${ticketId}-${assignment.id}-done`
    return h.events.get(id)?.body ?? ''
  })
}

it('IV-7: a Task the quota stopped waits, then runs again once the engine is ready, and is delivered', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  seen.quota.out = true
  say(h, 'm-work', 'Monte o cardápio da semana com preços')
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]!
  expect(h.listTasks(SCOPE)[0]?.stage).toBe('blocked')
  expect(seen.deliveries).toBe(0)
  expect(h.events.get(`coord-${ticket.id}-done`)?.body).toContain('quota_exhausted')
  expect(h.orchestration.quotaWaiting()).toEqual([{ projectId: 'pp', ticketId: ticket.id, resetAt: '2026-11-04T20:00:00.000Z' }])
  // what the "No limite" band shows: how many Tasks wait and until when
  expect(h.getEngineStatus(SCOPE)).toMatchObject({ quotaWaiting: 1, quotaResetsAt: '2026-11-04T20:00:00.000Z' })

  // the engine is still out: nothing runs and the Task keeps waiting
  h.orchestration.engineReadinessOf = () => ({ state: 'unavailable', reason: 'quota_exhausted' })
  expect(await h.orchestration.resumeQuotaWaiting('pp')).toBe(0)
  expect(h.orchestration.quotaWaiting()).toHaveLength(1)

  // the window is back: it runs again, in the same Ticket, once
  seen.quota.out = false
  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  expect(await h.orchestration.resumeQuotaWaiting('pp')).toBe(1)
  await h.orchestration.flush('pp')
  expect(seen.deliveries).toBe(1)
  expect(h.listTasks(SCOPE)).toHaveLength(1)
  expect(h.listTasks(SCOPE)[0]?.stage).not.toBe('blocked')
  expect(h.orchestration.quotaWaiting()).toEqual([])
  expect(h.getEngineStatus(SCOPE).quotaWaiting).toBeUndefined()
  const after = h.orchestration.runtime('pp').repo.tickets.get(ticket.id)!
  expect(after.assignments.length).toBe(2)
  expect(h.events.has(doneEventId(after))).toBe(true)
  expect(h.events.get(doneEventId(after))?.body).not.toContain('quota_exhausted')

  // and only once: a second pass finds nothing to run
  expect(await h.orchestration.resumeQuotaWaiting('pp')).toBe(0)
  expect(seen.deliveries).toBe(1)
})

it('IV-7: a Ticket that moved on while it waited is dropped, not run twice', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  seen.quota.out = true
  say(h, 'm-work', 'Monte o cardápio da semana com preços')
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]!
  // the person clicked "Tentar de novo" (retry) before the window came back: a new Assignment exists
  seen.quota.out = false
  h.runTicketCommand({ ...SCOPE, ticketId: ticket.id, command: 'retry', reason: '' })
  await h.orchestration.driveTicket('pp', ticket.id)
  const deliveries = seen.deliveries
  expect(deliveries).toBe(1)
  expect(await h.orchestration.resumeQuotaWaiting('pp')).toBe(0)
  expect(seen.deliveries).toBe(deliveries)
  expect(h.orchestration.quotaWaiting()).toEqual([])
})

it('IV-7: a retry runs the worker again (the done line follows the Assignment, not the Ticket)', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  seen.quota.out = true
  say(h, 'm-work', 'Monte o cardápio da semana com preços')
  await h.orchestration.flush('pp')
  const ticket = h.orchestration.runtime('pp').repo.tickets.list()[0]!
  seen.quota.out = false
  h.runTicketCommand({ ...SCOPE, ticketId: ticket.id, command: 'retry', reason: '' })
  await h.orchestration.driveTicket('pp', ticket.id)
  expect(seen.deliveries).toBe(1)
  const bodies = doneBodies(h, ticket.id)
  expect(bodies).toHaveLength(2)
  expect(bodies[0]).toContain('quota_exhausted')
  expect(bodies[1]).not.toBe('')
  expect(bodies[1]).not.toContain('quota_exhausted')
})

it('IV-7: messages sent while the engine is out stay queued (none lost) and run when it is back', async () => {
  const h = host()
  seed(h)
  const seen = engine(h)
  h.orchestration.engineReadinessOf = () => ({ state: 'unavailable', reason: 'quota_exhausted' })
  say(h, 'q1', 'Monte o cardápio da semana', 'geral')
  h.createChannel({ id: 'extra', ...SCOPE, name: 'extra', topic: '' })
  say(h, 'q2', 'Pesquise 3 concorrentes da padaria', 'extra')
  await h.orchestration.flush('pp')
  expect(seen.deliveries).toBe(0)
  expect(h.getEngineStatus(SCOPE)).toMatchObject({ state: 'unavailable', reason: 'quota_exhausted', pending: 2 })
  expect(h.listTasks(SCOPE)).toHaveLength(0)

  h.orchestration.engineReadinessOf = () => ({ state: 'ready', reason: null })
  expect(h.orchestration.resumeEngineTriggers('pp')).toBe(2)
  await h.orchestration.flush('pp')
  expect(h.listTasks(SCOPE).map(task => task.title).sort()).toEqual(['Monte o cardápio da semana', 'Pesquise 3 concorrentes da padaria'])
  expect(seen.deliveries).toBe(2)
  expect(h.getEngineStatus(SCOPE).pending).toBe(0)
})

it('the recheck waits for the reset clock, or 5 minutes when the vendor gave none', () => {
  const now = Date.parse('2026-11-04T15:00:00.000Z')
  expect(quotaRecheckDelay([], now, 300_000)).toBeUndefined()
  expect(quotaRecheckDelay([{}], now, 300_000)).toBe(300_000)
  expect(quotaRecheckDelay([{ resetAt: '2026-11-04T15:30:00.000Z' }, {}], now, 300_000)).toBe(30 * 60_000 + 1_000)
  expect(quotaRecheckDelay([{ resetAt: '2026-11-04T16:00:00.000Z' }, { resetAt: '2026-11-04T15:10:00.000Z' }], now, 300_000)).toBe(10 * 60_000 + 1_000)
  // a clock already in the past: look again in a second, never in a tight loop
  expect(quotaRecheckDelay([{ resetAt: '2026-11-04T14:00:00.000Z' }], now, 300_000)).toBe(1_000)
})

it('IV-7: the host looks again at the reset clock by itself, re-checks the engine and runs the Task again', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
  vi.setSystemTime(new Date('2026-11-04T15:00:00.000Z'))
  vi.stubEnv('PERSONA_REAL_CLI', '1')
  try {
    const h = host()
    seed(h)
    const probed = vi.spyOn(h.connections, 'ready').mockResolvedValue([])
    vi.spyOn(h.connections, 'list').mockReturnValue([{ id: 'claude', kind: 'claude', phase: 'ready', available: true, loggedIn: true }] as never)
    const seen = engine(h)
    seen.quota.out = true
    seen.quota.resetAt = '2026-11-04T15:01:00.000Z'
    say(h, 'm-work', 'Monte o cardápio da semana com preços')
    await h.orchestration.flush('pp')
    expect(h.orchestration.quotaWaiting()).toHaveLength(1)
    expect(seen.deliveries).toBe(0)
    // before the clock: nothing happens
    await vi.advanceTimersByTimeAsync(30_000)
    expect(probed).not.toHaveBeenCalled()
    // the window is back: at the clock the host re-checks and runs the Task again, on its own
    seen.quota.out = false
    await vi.advanceTimersByTimeAsync(32_000)
    await h.orchestration.flush('pp')
    expect(probed).toHaveBeenCalled()
    expect(seen.deliveries).toBe(1)
    expect(h.orchestration.quotaWaiting()).toEqual([])
  } finally {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  }
})
