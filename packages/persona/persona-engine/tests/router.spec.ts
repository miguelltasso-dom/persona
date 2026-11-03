import { expect, it } from 'vitest'
import {
  Engine,
  MasterAssessor,
  MemoryRepositories,
  NoticeLog,
  PERSONA_ROUTE_LIMIT,
  PERSONA_TOOL,
  UserError,
  personaAck,
  personaHandback,
  personaReport,
  personaRoute,
  personaThreadFollow,
} from '../src/index.ts'
import type { Assessor, Candidate, EngineOptions, Executor, OutboundMessage, Policy, Trigger } from '../src/index.ts'

const member = { source: 'chat', id: 'alice' }

function trigger(id: string, overrides: Partial<Trigger> = {}): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: member, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {}, ...overrides,
  }
}

function routerHarness() {
  const repo = new MemoryRepositories()
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
  const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
  const engine = new Engine({
    repo, assessor, executor, outbox: queued, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => '2026-09-23T00:00:00.000Z',
  })
  const accept = (id = '1') => {
    engine.receive(trigger(id))
    engine.evaluateDue()
    const candidate = requests.at(-1)
    if (candidate === undefined) throw new Error('no candidate')
    return engine.decide(candidate.triggers[0]!.id, {
      kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested', acknowledgement: 'ok',
    })
  }
  return { repo, engine, requests, outbox, accept }
}

it('applies valid route items and refuses invalid ones individually', () => {
  const h = routerHarness()
  const ticketId = h.accept().ticketId!
  h.engine.receive(trigger('2'))
  h.engine.evaluateDue()
  const results = personaRoute(h.engine, h.repo, [
    { kind: 'accept', trigger_id: '2', title: 'More', scope: 'small', reason: 'also' },
    { kind: 'stop', ticket_id: 'missing', reason: 'nope' },
    { kind: 'ignore', trigger_id: 'no-such', reason: 'gone' },
  ])
  expect(results[0]).toMatchObject({ ok: true })
  expect(results[1]).toMatchObject({ ok: false })
  expect(results[2]).toMatchObject({ ok: false })
  expect(h.repo.tickets.get(ticketId)?.ended).toBeUndefined()
})

it('refuses more than 20 route items', () => {
  const h = routerHarness()
  const items = Array.from({ length: PERSONA_ROUTE_LIMIT + 1 }, (_, i) => ({
    kind: 'ignore' as const, trigger_id: String(i), reason: 'x',
  }))
  expect(() => personaRoute(h.engine, h.repo, items)).toThrow(UserError)
  expect(() => personaRoute(h.engine, h.repo, items)).toThrow(new RegExp(`${PERSONA_TOOL}route`))
})

it('guards report, ack, handback and follow against an ended ticket', () => {
  const h = routerHarness()
  const ticketId = h.accept().ticketId!
  h.engine.report(ticketId, { state: 'ready', summary: 'done' })
  expect(() => personaReport(h.engine, h.repo, ticketId, { state: 'progress', summary: 'late' })).toThrow(/ended/i)
  expect(() => personaAck(h.engine, h.repo, ticketId, '1', 'ok')).toThrow(/ended/i)
  expect(() => personaHandback(h.engine, h.repo, ticketId, '1', 'beyond')).toThrow(/ended/i)
  expect(() => personaThreadFollow(h.engine, h.repo, ticketId, { source: 'chat', id: 'other' })).toThrow(/ended/i)
})

it('acks a live ticket through engine.reply', () => {
  const h = routerHarness()
  const ticketId = h.accept().ticketId!
  const reply = personaAck(h.engine, h.repo, ticketId, '1', 'On it')
  expect(reply.status).toBe('pending')
  expect(h.outbox.some(item => item.kind === 'acknowledgement')).toBe(true)
})

it('follows a thread for context on a live ticket', () => {
  const h = routerHarness()
  const ticketId = h.accept().ticketId!
  expect(personaThreadFollow(h.engine, h.repo, ticketId, { source: 'chat', id: 'extra' })).toBe(true)
  expect(personaThreadFollow(h.engine, h.repo, ticketId, { source: 'chat', id: 'extra' })).toBe(false)
})

it('keeps the first notice for a repeated id', () => {
  const log = new NoticeLog()
  expect(log.push({ id: 'n1', text: 'first', at: 't0' })).toBe(true)
  expect(log.push({ id: 'n1', text: 'second', at: 't1' })).toBe(false)
  expect(log.list()).toEqual([{ id: 'n1', text: 'first', at: 't0' }])
})

it('reads a bounded thread window when the assessor is requested', () => {
  const seen: string[][] = []
  const assessor = new MasterAssessor(
    { window: (threadKey, limit) => {
      expect(limit).toBe(20)
      return [{ id: 'm1', text: `${threadKey} hello` }]
    } },
    (_candidate, window) => { seen.push(window.map(item => item.text)) },
  )
  assessor.request({
    evalId: 'e1',
    thread: { key: 'chat:t1', source: 'chat', id: 't1', pending: [], subscriptions: [] },
    triggers: [],
    strength: 'explicit',
    policyVersion: 'v1',
    tickets: [],
  })
  assessor.release('e1')
  expect(assessor.requested).toEqual(['e1'])
  expect(assessor.released).toEqual(['e1'])
  expect(seen).toEqual([['chat:t1 hello']])
})
