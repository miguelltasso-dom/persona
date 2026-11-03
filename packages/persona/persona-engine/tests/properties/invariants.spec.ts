import { expect, it } from 'vitest'
import {
  EffectQueue,
  Engine,
  FakeClock,
  FakeRunner,
  MemoryEffectPersistence,
  MemoryOutbox,
  MemoryRepositories,
  WorkerSlots,
  bindExecutorEffects,
  resumeExecutor,
} from '../../src/index.ts'
import type { Assessor, Candidate, EngineOptions, Executor, ExecutorHost, Policy, Trigger } from '../../src/index.ts'

const SEED = 0xA11CE
const N = 32
const member = { source: 'chat', id: 'alice' }

function mulberry32(seed: number): () => number {
  let a = seed >>> 0
  return () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
}

function trigger(id: string, overrides: Partial<Trigger> = {}): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: member, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {}, ...overrides,
  }
}

function harness() {
  const repo = new MemoryRepositories()
  const outbox = new MemoryOutbox()
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (candidate) => { requests.push(candidate) }, release: () => {} }
  const launches: Array<{ ticketId: string; assignmentId: string }> = []
  const executor: Executor = {
    start: (ticket, assignment) => { launches.push({ ticketId: ticket.id, assignmentId: assignment.id }) },
    deliver: () => {},
    stop: () => {},
  }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: t => t.human ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } } : { admissible: false, reason: 'bot' },
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const queued: EngineOptions['outbox'] = {
    send: (message) => { outbox.send(message) },
    status: id => outbox.status(id),
    withdraw: (id) => { outbox.withdraw(id) },
  }
  const engine = new Engine({
    repo, assessor, executor, outbox: queued, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => '2026-09-23T00:00:00.000Z',
  })
  return { repo, engine, requests, launches, outbox }
}

it('propriedade: Trigger é idempotente (semente relatada se falhar)', () => {
  const rand = mulberry32(SEED)
  const h = harness()
  for (let i = 0; i < N; i += 1) {
    const id = String((i % 8) + 1)
    const first = h.engine.receive(trigger(id))
    const again = h.engine.receive(trigger(id, { text: `mutated ${String(rand())}` }))
    expect(again, `semente ${String(SEED)} i=${String(i)}`).toBe('duplicate')
    expect(first === 'stored' || first === 'duplicate', `semente ${String(SEED)} i=${String(i)}`).toBe(true)
    expect(h.repo.triggers.get(id)?.text, `semente ${String(SEED)} i=${String(i)}`).toBe(`message ${id}`)
  }
})

it('propriedade: 1 Eval por Thread (semente relatada se falhar)', () => {
  const h = harness()
  for (let i = 0; i < N; i += 1) {
    h.engine.receive(trigger(String(i + 1).padStart(2, '0')))
    h.engine.evaluateDue()
    const thread = h.repo.threads.get('chat:t1')
    const evals = thread?.evaluating === undefined ? 0 : 1
    expect(evals, `semente ${String(SEED)} i=${String(i)}`).toBe(1)
    expect(h.requests.length, `semente ${String(SEED)} i=${String(i)}`).toBe(1)
  }
})

it('propriedade: Mandate é imutável depois do accept (semente relatada se falhar)', () => {
  const rand = mulberry32(SEED)
  const h = harness()
  h.engine.receive(trigger('01'))
  h.engine.evaluateDue()
  const first = h.engine.decide(h.requests[0]!.triggers[0]!.id, {
    kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested',
  })
  const original = h.repo.tickets.get(first.ticketId!)!.mandate
  for (let i = 0; i < N; i += 1) {
    const id = String(i + 2).padStart(2, '0')
    h.engine.receive(trigger(id, { threads: [{ source: 'chat', id: `t${id}` }] }))
    h.engine.evaluateDue()
    const candidate = h.requests.at(-1)
    if (candidate === undefined) continue
    h.engine.decide(candidate.triggers[0]!.id, {
      kind: 'accept', title: 'Other', scope: rand() < 0.5 ? 'wide' : 'other', reason: 'requested',
    })
    expect(h.repo.tickets.get(first.ticketId!)!.mandate, `semente ${String(SEED)} i=${String(i)}`).toEqual(original)
  }
})

it('propriedade: outbox só depois do commit (semente relatada se falhar)', () => {
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (c) => { requests.push(c) }, release: () => {} }
  const repo = new MemoryRepositories()
  const sent: string[] = []
  const engine = new Engine({
    repo, assessor,
    executor: { start: () => {}, deliver: () => {}, stop: () => {} },
    outbox: { send: (m) => { sent.push(m.id) }, status: () => undefined, withdraw: () => {} },
    policy: () => ({
      version: 'v1', paused: false, evalTimeoutMs: 60_000,
      gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
      revalidate: () => true,
      admitsInferred: () => true,
    }),
    scope: { scope: () => ({ listened: true, observed: false }) },
    prepareTicket: () => { throw new Error('No directory') },
    now: () => '2026-09-23T00:00:00.000Z',
  })
  engine.receive(trigger('01'))
  engine.evaluateDue()
  expect(() => engine.decide(requests[0]!.triggers[0]!.id, {
    kind: 'accept', title: 'Fix', scope: 'small', reason: 'r', acknowledgement: 'ok',
  })).toThrow('No directory')
  expect(sent, `semente ${String(SEED)}`).toEqual([])
  expect(repo.tickets.list(), `semente ${String(SEED)}`).toEqual([])
})

it('propriedade: reentrada do resume é idempotente (semente relatada se falhar)', async () => {
  const repo = new MemoryRepositories()
  const persist = new MemoryEffectPersistence()
  const clock = new FakeClock(1_000)
  const runner = new FakeRunner(clock)
  const queue = new EffectQueue(persist, repo, () => clock.now())
  const slots = new WorkerSlots(() => [], () => 4)
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (c) => { requests.push(c) }, release: () => {} }
  const outbox = new MemoryOutbox()
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const executor: Executor = {
    start: (ticket, assignment) => { queue.enqueue('launch', assignment.id, { ticketId: ticket.id, assignmentId: assignment.id }) },
    deliver: (ticket) => { queue.enqueue('delivery', ticket.id, { ticketId: ticket.id }) },
    stop: () => {},
  }
  const engine = new Engine({
    repo, assessor, executor,
    outbox: { send: (m) => { outbox.send(m) }, status: id => outbox.status(id), withdraw: (id) => { outbox.withdraw(id) } },
    policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => new Date(clock.now()).toISOString(),
  })
  const host: ExecutorHost = { repo, engine, runner, slots, queue, paused: () => false, now: () => clock.now() }
  bindExecutorEffects(host)
  queue.start()
  engine.receive(trigger('01'))
  engine.evaluateDue()
  engine.decide(requests[0]!.triggers[0]!.id, { kind: 'accept', title: 'Fix', scope: 'small', reason: 'r' })
  await queue.idle()
  for (let i = 0; i < 4; i += 1) {
    await resumeExecutor(host)
    await queue.idle()
  }
  const open = repo.tickets.open()
  expect(open, `semente ${String(SEED)}`).toHaveLength(1)
  expect(runner.sessions.size, `semente ${String(SEED)}`).toBeGreaterThan(0)
})
