import { vi } from 'vitest'
import { Engine } from '../../src/index.ts'
import type { Assessor, Assignment, Candidate, EngineOptions, Executor, OutboundMessage, Policy, Ticket, Trigger } from '../../src/index.ts'
import { MemoryRepositories, runningAssignment } from '../../src/index.ts'

export function trigger(id: string, overrides: Partial<Trigger> = {}): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }],
    actor: { source: 'chat', id: 'alice' }, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {}, ...overrides,
  }
}

export function harness() {
  const repo = new MemoryRepositories('launch')
  const outbox: OutboundMessage[] = []
  const requests: Candidate[] = []
  const assessor: Assessor = { request: vi.fn((candidate) => { requests.push(candidate) }), release: vi.fn() }
  const launches: [Ticket, Assignment][] = []
  const deliveries = new Set<string>()
  const executor: Executor = {
    start: vi.fn((ticket, assignment) => { launches.push([ticket, assignment]) }),
    deliver: vi.fn((ticket) => { deliveries.add(ticket.id) }),
    stop: vi.fn(),
  }
  let version = 'v1'
  const policy: Policy = {
    get version() { return version },
    paused: false,
    evalTimeoutMs: 60_000,
    gate: t => t.human
      ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } }
      : { admissible: false, reason: 'not human' },
    revalidate: () => version !== 'revoked',
    admitsInferred: () => true,
  }
  const queued: EngineOptions['outbox'] = {
    send: (message) => { if (!outbox.some(item => item.id === message.id)) outbox.push(message) },
    status: id => outbox.some(item => item.id === id) ? 'pending' : undefined,
    withdraw: () => {},
  }
  const engine = new Engine({
    repo, assessor, executor, outbox: queued, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
  })
  function settle() {
    for (;;) {
      const next = launches.shift()
      if (next) { engine.assignmentStarted(next[0].id, next[1].id); continue }
      const [ticketId] = deliveries
      if (ticketId === undefined) return
      deliveries.delete(ticketId)
      const ticket = repo.tickets.get(ticketId)
      const assignment = ticket === undefined ? undefined : runningAssignment(ticket)
      if (ticket === undefined || ticket.ended || assignment === undefined) continue
      if (ticket.undelivered.length) engine.inputsDelivered(ticketId, assignment.id, [...ticket.undelivered])
    }
  }
  const pump = () => { engine.evaluateDue(); settle() }
  const decide = (candidate: Candidate, outcome: { kind: 'accept' | 'ignore'; title?: string; scope?: string; reason: string; acknowledgement?: string }) =>
    engine.decide(candidate.triggers[0]!.id, { ...outcome, evalId: candidate.evalId } as never)
  return {
    repo, engine, outbox, requests, setVersion: (value: string) => { version = value }, settle, pump, decide,
  }
}

export function accepted(h: ReturnType<typeof harness>) {
  h.engine.receive(trigger('1'))
  h.pump()
  const decision = h.decide(h.requests.at(-1)!, { kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested', acknowledgement: 'ok' })
  h.settle()
  return decision
}
