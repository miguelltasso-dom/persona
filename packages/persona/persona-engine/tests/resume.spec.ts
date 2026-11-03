import { expect, it } from 'vitest'
import {
  BACKGROUND_LIMIT_MS,
  EffectQueue,
  Engine,
  FakeClock,
  FakeRunner,
  MemoryEffectPersistence,
  MemoryRepositories,
  RECOVERY_NOTE,
  WorkerSlots,
  bindExecutorEffects,
  idleOutcome,
  latestAssignment,
  redeliverUnread,
  resumeExecutor,
  runningAssignment,
} from '../src/index.ts'
import type { Assessor, Candidate, EngineOptions, Executor, ExecutorHost, OutboundMessage, Policy, Trigger } from '../src/index.ts'

const member = { source: 'chat', id: 'alice' }

function trigger(id: string, overrides: Partial<Trigger> = {}): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: member, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {}, ...overrides,
  }
}

function resumeHarness() {
  const repo = new MemoryRepositories()
  const persist = new MemoryEffectPersistence()
  const clock = new FakeClock(1_000)
  const runner = new FakeRunner(clock)
  const queue = new EffectQueue(persist, repo, () => clock.now())
  const slots = new WorkerSlots(() => [], () => 4)
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (candidate) => { requests.push(candidate) }, release: () => {} }
  const outbox: OutboundMessage[] = []
  const queued: EngineOptions['outbox'] = {
    send: (message) => { if (!outbox.some(item => item.id === message.id)) outbox.push(message) },
    status: id => outbox.some(item => item.id === id) ? 'pending' : undefined,
    withdraw: () => {},
  }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: t => t.human ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } } : { admissible: false, reason: 'not human' },
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const executor: Executor = {
    start: (ticket, assignment) => { queue.enqueue('launch', assignment.id, { ticketId: ticket.id, assignmentId: assignment.id }) },
    deliver: (ticket) => { queue.enqueue('delivery', ticket.id, { ticketId: ticket.id }) },
    stop: () => {},
  }
  const engine = new Engine({
    repo, assessor, executor, outbox: queued, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => new Date(clock.now()).toISOString(),
  })
  const host: ExecutorHost = { repo, engine, runner, slots, queue, paused: () => false, now: () => clock.now() }
  bindExecutorEffects(host)
  queue.start()
  return { repo, engine, runner, queue, persist, host, requests }
}

async function acceptedRunning(h: ReturnType<typeof resumeHarness>) {
  h.engine.receive(trigger('1'))
  h.engine.evaluateDue()
  const candidate = h.requests.at(-1)
  if (candidate === undefined) throw new Error('no candidate')
  const decision = h.engine.decide(candidate.triggers[0]!.id, { kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested' })
  await h.queue.idle()
  return decision.ticketId!
}

it('restarts an interrupted running assignment with RECOVERY_NOTE', async () => {
  const h = resumeHarness()
  const ticketId = await acceptedRunning(h)
  expect(runningAssignment(h.repo.tickets.get(ticketId)!)?.state).toBe('running')
  await resumeExecutor(h.host)
  expect(h.runner.cancelled.some(item => item.sessionId === `worker-${ticketId}`)).toBe(true)
  expect(h.runner.deliveries.some(item => item.text === RECOVERY_NOTE)).toBe(true)
  expect(latestAssignment(h.repo.tickets.get(ticketId)!)?.state).toBe('running')
})

it('keeps a waiting assignment session and does not inject RECOVERY_NOTE', async () => {
  const h = resumeHarness()
  const ticketId = await acceptedRunning(h)
  h.engine.report(ticketId, { state: 'waiting', summary: 'paused' })
  const before = h.runner.deliveries.length
  await resumeExecutor(h.host)
  expect(h.runner.deliveries.slice(before).some(item => item.text === RECOVERY_NOTE)).toBe(false)
  expect(h.runner.status(`worker-${ticketId}`)).not.toBe('missing')
})

it('re-enqueues a pending assignment that has no delivery failure', async () => {
  const h = resumeHarness()
  h.engine.receive(trigger('1'))
  h.engine.evaluateDue()
  const candidate = h.requests.at(-1)
  if (candidate === undefined) throw new Error('no candidate')
  const decision = h.engine.decide(candidate.triggers[0]!.id, { kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested' })
  const assignmentId = latestAssignment(h.repo.tickets.get(decision.ticketId!)!)!.id
  h.queue.cancel('launch', assignmentId)
  await resumeExecutor(h.host)
  expect(h.persist.pending('launch', assignmentId)).toBe(true)
})

it('does not relaunch a pending assignment whose prepare already failed', async () => {
  const h = resumeHarness()
  h.engine.receive(trigger('1'))
  h.engine.evaluateDue()
  const candidate = h.requests.at(-1)
  if (candidate === undefined) throw new Error('no candidate')
  const decision = h.engine.decide(candidate.triggers[0]!.id, { kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested' })
  const ticketId = decision.ticketId!
  const assignmentId = latestAssignment(h.repo.tickets.get(ticketId)!)!.id
  h.queue.cancel('launch', assignmentId)
  const ticket = h.repo.tickets.get(ticketId)!
  h.repo.tickets.save({ ...ticket, delivery: { error: 'disk full', at: '2026-09-23T00:00:00Z' } })
  await resumeExecutor(h.host)
  expect(h.persist.pending('launch', assignmentId)).toBe(false)
})

it('prefixes unread inputs with RECOVERY_NOTE on redeliverUnread', async () => {
  const h = resumeHarness()
  const ticketId = await acceptedRunning(h)
  await redeliverUnread(h.host, ticketId)
  expect(h.runner.deliveries.filter(item => item.text === RECOVERY_NOTE).length).toBeGreaterThanOrEqual(1)
})

it('maps idle to waiting without background, person when handed over, else background', () => {
  expect(idleOutcome({}, false, false)).toBe('waiting')
  expect(idleOutcome({ attention: { id: 'a', question: '?' } }, true, false)).toBe('person')
  expect(idleOutcome({}, true, true)).toBe('person')
  expect(idleOutcome({}, true, false)).toBe('background')
  expect(BACKGROUND_LIMIT_MS).toBe(30 * 60_000)
})
