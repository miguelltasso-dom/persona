import { expect, it } from 'vitest'
import {
  Engine,
  MODEL_DEGRADE,
  MemoryRepositories,
  dirtyMulberry32,
  dirtySample,
  needsYou,
  parseCoordDecision,
  parseProposalPayload,
  parseReportPayload,
  parseRoutePayload,
  personaProposeFromModel,
  personaReportFromModel,
  personaRouteFromModel,
} from '../src/index.ts'
import type { Assessor, Candidate, EngineOptions, Executor, Policy, Trigger } from '../src/index.ts'

const member = { source: 'chat', id: 'alice' }

function trigger(id: string): Trigger {
  return {
    id, source: 'chat', threads: [{ source: 'chat', id: 't1' }], actor: member, human: true,
    at: `2026-09-23T00:00:${id.padStart(2, '0')}Z`, text: `message ${id}`,
    channel: { source: 'chat', thread: 't1', address: { message: id } }, meta: {},
  }
}

function harness() {
  const repo = new MemoryRepositories()
  const requests: Candidate[] = []
  const assessor: Assessor = { request: (candidate) => { requests.push(candidate) }, release: () => {} }
  const policy: Policy = {
    version: 'v1', paused: false, evalTimeoutMs: 60_000,
    gate: t => t.human ? { admissible: true, strength: 'explicit', basis: { via: 'listed' } } : { admissible: false, reason: 'not human' },
    revalidate: () => true,
    admitsInferred: () => true,
  }
  const executor: Executor = { start: () => {}, deliver: () => {}, stop: () => {} }
  const outbox: EngineOptions['outbox'] = { send: () => {}, status: () => undefined, withdraw: () => {} }
  const engine = new Engine({
    repo, assessor, executor, outbox, policy: () => policy,
    scope: { scope: () => ({ listened: true, observed: false }) },
    now: () => '2026-09-23T00:00:00.000Z',
  })
  engine.receive(trigger('1'))
  engine.evaluateDue()
  const ticketId = engine.decide(requests[0]!.triggers[0]!.id, {
    kind: 'accept', title: 'Fix', scope: 'small', reason: 'requested',
  }).ticketId!
  return { repo, engine, ticketId }
}

it('JSON truncado: repara ou pede um reparo; nunca aceita Tarefa', () => {
  const cut = parseRoutePayload('[{"kind":"accept","trigger_id":"2","title":"X","scope":"s","reason":"r"')
  expect(['repaired', 'needs_repair', 'degraded']).toContain(cut.status)
  if (cut.status === 'repaired') expect(cut.value?.[0]?.kind).toBe('accept')
  const h = harness()
  const before = h.repo.tickets.list().length
  const applied = personaRouteFromModel(h.engine, h.repo, '[{"kind":"accept","trigger_id":"9","title":', false)
  expect(applied.createdTicket).toBe(false)
  expect(h.repo.tickets.list().length).toBe(before)
})

it('cerca ```json', () => {
  const parsed = parseCoordDecision('claro\n```json\n{"decision":"ignore"}\n```\n')
  expect(parsed.status === 'ok' || parsed.status === 'repaired').toBe(true)
  expect(parsed.value).toBe('ignore')
})

it('prosa antes e depois', () => {
  const parsed = parseReportPayload('segue o relato\n{"state":"ready","summary":"feito"}\nobrigado')
  expect(parsed.value?.state).toBe('ready')
  expect(parsed.value?.summary).toBe('feito')
})

it('chaves duplicadas', () => {
  const parsed = parseCoordDecision('{"decision":"accept","decision":"ignore"}')
  expect(parsed.status === 'ok' || parsed.status === 'repaired').toBe(true)
  expect(parsed.value).toBe('ignore')
})

it('enum errado', () => {
  const parsed = parseReportPayload('{"state":"DONE","summary":"x"}')
  expect(parsed.status === 'needs_repair' || parsed.status === 'degraded').toBe(true)
  expect(parsed.value).toBeUndefined()
  const aliased = parseCoordDecision('{"decision":"ACCEPT"}')
  expect(aliased.value).toBe('accept')
})

it('campos extras', () => {
  const parsed = parseProposalPayload('{"title":"x","reason":"y","withinMandate":true,"extra":99}')
  expect(parsed.value).toEqual({ title: 'x', reason: 'y', withinMandate: true })
})

it('unicode e CRLF', () => {
  const parsed = parseCoordDecision('\uFEFF{"decision":"ask"}\r\n')
  expect(parsed.value).toBe('ask')
})

it('saída enorme', () => {
  const huge = `${'blá '.repeat(20_000)}{"decision":"silent"}`
  const parsed = parseCoordDecision(huge)
  expect(parsed.status === 'ok' || parsed.status === 'repaired' || parsed.status === 'needs_repair').toBe(true)
  if (parsed.value !== undefined) expect(parsed.value).toBe('silent')
})

it('JSON válido de outro esquema', () => {
  const parsed = parseRoutePayload('{"ok":true,"items":[]}')
  expect(parsed.value).toBeUndefined()
  expect(parsed.status === 'needs_repair' || parsed.status === 'degraded').toBe(true)
  const h = harness()
  const before = h.repo.tickets.list().length
  expect(personaRouteFromModel(h.engine, h.repo, '{"foo":1}', false).createdTicket).toBe(false)
  expect(h.repo.tickets.list().length).toBe(before)
})

it('um reparo e degrade honesto + Precisa de você; sem Tarefa', () => {
  const first = parseCoordDecision('não é json', false)
  expect(first.status).toBe('needs_repair')
  expect(first.repairPrompt).toMatch(/JSON/)
  const second = parseCoordDecision('ainda não', true)
  expect(second.status).toBe('degraded')
  expect(second.degrade?.message).toBe(MODEL_DEGRADE)
  const h = harness()
  const before = h.repo.tickets.list().length
  const report = personaReportFromModel(h.engine, h.repo, h.ticketId, '???', true)
  expect(report.createdTicket).toBe(false)
  expect(report.attention?.kind).toBe('needs_you')
  expect(needsYou(h.repo.tickets.get(h.ticketId)!)).toBe(true)
  expect(h.repo.tickets.list().length).toBe(before)
  expect(personaProposeFromModel('???', true).createdTicket).toBe(false)
})

it('fuzz semente 0xD1B7 nunca cria Tarefa', () => {
  const rand = dirtyMulberry32(0xD1B7)
  const h = harness()
  const before = h.repo.tickets.list().length
  for (let i = 0; i < 64; i += 1) {
    const raw = dirtySample(rand)
    const applied = personaRouteFromModel(h.engine, h.repo, raw, true)
    if (applied.parse.status === 'degraded' || applied.parse.status === 'needs_repair') {
      expect(applied.createdTicket).toBe(false)
    }
  }
  expect(h.repo.tickets.list().length).toBe(before)
})
