import { expect, it } from 'vitest'
import {
  EffectQueue, Engine, FakeClock, FakeRunner, MemoryEffectPersistence, MemoryRepositories,
  RECOVERY_NOTE, WorkerSlots, bindExecutorEffects, resumeExecutor, runningAssignment,
} from '../../src/index.ts'
import type { Assessor, Candidate, EngineOptions, Executor, ExecutorHost, OutboundMessage, Policy, Trigger } from '../../src/index.ts'

it('Assignment interrompida retoma: resumeExecutor cancela e relança com RECOVERY_NOTE', async () => {
  const repo = new MemoryRepositories('launch')
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
    gate: (t: Trigger) => t.human ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } } : { admissible: false, reason: 'not human' },
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
  const trigger: Trigger = {
    id: '1', source: 'chat', threads: [{ source: 'chat', id: 't1' }],
    actor: { source: 'chat', id: 'alice' }, human: true, at: '2026-09-23T00:00:01Z',
    text: 'go', channel: { source: 'chat', thread: 't1', address: { message: '1' } }, meta: {},
  }
  engine.receive(trigger)
  engine.evaluateDue()
  engine.decide(requests[0]!.triggers[0]!.id, { kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested', evalId: requests[0]!.evalId })
  await queue.idle()
  const ticketId = repo.tickets.open()[0]!.id
  expect(runningAssignment(repo.tickets.get(ticketId)!)).toBeDefined()
  await resumeExecutor(host)
  await queue.idle()
  expect(runner.deliveries.some(item => item.text === RECOVERY_NOTE)).toBe(true)
})
