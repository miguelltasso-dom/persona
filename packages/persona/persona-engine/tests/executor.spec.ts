import { expect, it } from 'vitest'
import {
  EffectQueue,
  Engine,
  FakeClock,
  FakeRunner,
  Later,
  MemoryEffectPersistence,
  MemoryRepositories,
  PrepareFailed,
  WorkerSlots,
  bindExecutorEffects,
  latestAssignment,
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

function executorHarness(max = 2) {
  const repo = new MemoryRepositories()
  const persist = new MemoryEffectPersistence()
  let nowMs = 1_000
  const clock = new FakeClock(nowMs)
  const runner = new FakeRunner(clock)
  const queue = new EffectQueue(persist, repo, () => nowMs)
  const slots = new WorkerSlots(
    () => repo.tickets.list().flatMap(ticket => latestAssignment(ticket)?.state === 'running' ? [ticket.id] : []),
    () => max,
  )
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
    prepareTicket: ticket => ({ ...ticket, execution: { name: 'w', directory: '/tmp/work', assignment: ticket.title } }),
    now: () => new Date(nowMs).toISOString(),
  })
  const host: ExecutorHost = {
    repo, engine, runner, slots, queue, paused: () => false, now: () => nowMs,
  }
  bindExecutorEffects(host)
  queue.start()
  return {
    repo, engine, runner, queue, persist, slots, requests, host,
    advance: (ms: number) => { nowMs += ms; clock.advance(ms) },
    pump: () => { engine.evaluateDue() },
    accept: (id = '1') => {
      engine.receive(trigger(id))
      engine.evaluateDue()
      const candidate = requests.at(-1)
      if (candidate === undefined) throw new Error('no candidate')
      return engine.decide(candidate.triggers[0]!.id, { kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested' })
    },
  }
}

it('launches a pending assignment through the runner and starts it', async () => {
  const h = executorHarness()
  const decision = h.accept()
  const ticketId = decision.ticketId!
  await h.queue.idle()
  const ticket = h.repo.tickets.get(ticketId)!
  expect(latestAssignment(ticket)?.state).toBe('running')
  expect(h.runner.status(`worker-${ticketId}`)).toBe('running')
  expect(h.runner.deliveries[0]).toMatchObject({ mode: 'queue' })
})

it('records ticket.delivery on PrepareFailed and does not retry', async () => {
  const h = executorHarness()
  h.host.prepare = async () => { throw new PrepareFailed('disk full') }
  const ticketId = h.accept().ticketId!
  await h.queue.idle()
  expect(h.repo.tickets.get(ticketId)?.delivery?.error).toBe('disk full')
  expect(h.persist.pending('launch')).toBe(false)
  expect(h.runner.deliveries).toHaveLength(0)
})

it('retries a transient launch three times then writes ticket.delivery', async () => {
  const h = executorHarness()
  h.runner.script = 'transient'
  const ticketId = h.accept().ticketId!
  for (let i = 0; i < 8 && h.repo.tickets.get(ticketId)?.delivery === undefined; i += 1) {
    await h.queue.idle()
    h.advance(100)
  }
  expect(h.repo.tickets.get(ticketId)?.delivery?.error).toMatch(/ECONNRESET/)
  expect(h.persist.pending('launch')).toBe(false)
})

it('delivers a follow-up once the assignment is running', async () => {
  const h = executorHarness()
  const ticketId = h.accept().ticketId!
  await h.queue.idle()
  h.engine.receive(trigger('2'))
  await h.queue.idle()
  expect(h.runner.deliveries.some(item => item.requestId.includes('2') || item.text.includes('2') || item.mode === 'steer')).toBe(true)
  expect(h.repo.tickets.get(ticketId)?.undelivered).toEqual([])
})

it('throws Later when launch slots are full so the queue reschedules', async () => {
  const h = executorHarness(1)
  h.accept('1')
  await h.queue.idle()
  const first = [...h.repo.tickets.list()][0]!
  expect(latestAssignment(first)?.state).toBe('running')
  h.engine.receive(trigger('2', { threads: [{ source: 'chat', id: 't2' }] }))
  h.engine.evaluateDue()
  const second = h.requests.at(-1)
  if (second === undefined) throw new Error('no second candidate')
  h.engine.decide(second.triggers[0]!.id, { kind: 'accept', title: 'Other', scope: 'small', reason: 'requested' })
  await h.queue.idle()
  const pending = h.persist.get('launch', latestAssignment(h.repo.tickets.list().find(t => t.id !== first.id)!)!.id)
  expect(pending?.attempts).toBe(0)
  expect(() => { h.slots.reserve('extra', 'launch') }).toThrow(Later)
})
