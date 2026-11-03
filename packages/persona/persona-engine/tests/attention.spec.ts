import { expect, it } from 'vitest'
import {
  Engine,
  MemoryRepositories,
  applyAttentionAnswer,
  citedCardTicketId,
  milestoneSummary,
  type Ticket,
} from '../src/index.ts'

const base: Ticket = {
  id: 't1',
  title: 'Qual pasta?',
  decisionId: 'd1',
  mandate: {
    strength: 'explicit',
    policyVersion: 'v1',
    basis: { via: 'listed' },
    actor: { source: 'chat', id: 'ana' },
    scope: 'small',
  },
  channels: [],
  assignments: [],
  inputs: [],
  undelivered: [],
  createdAt: '2026-11-03T15:00:00.000Z',
  updatedAt: '2026-11-03T15:00:00.000Z',
  origin: { triggerId: 'm1', triggerIds: ['m1'] },
  attention: { id: 'att-1', question: 'Qual pasta?' },
}

it('applyAttentionAnswer stores the text and clears the question', () => {
  const next = applyAttentionAnswer(base, 'src/', '2026-11-03T15:01:00.000Z')
  expect(next.attention).toBeUndefined()
  expect(next.inputs.some(item => item.kind === 'text' && item.text === 'src/')).toBe(true)
  expect(next.undelivered.length).toBe(1)
  expect(base.attention?.question).toBe('Qual pasta?')
})

it('cited card pointer opens the real ticket id', () => {
  expect(citedCardTicketId('ticket/abc')).toBe('abc')
  expect(citedCardTicketId('ticket/abc/files')).toBe('abc')
  expect(citedCardTicketId('dm/secret')).toBeUndefined()
})

it('milestone summary stays short and lists titles', () => {
  expect(milestoneSummary([])).toBe('')
  expect(milestoneSummary(['README'])).toBe('Concluído: README.')
  expect(milestoneSummary(['A', 'B', 'C', 'D', 'E', 'F'])).toMatch(/e mais 1/)
})

it('MemoryRepositories keeps the answered ticket', () => {
  const repo = new MemoryRepositories()
  repo.tickets.save(base)
  const next = applyAttentionAnswer(repo.tickets.get('t1')!, 'src/', '2026-11-03T15:01:00.000Z')
  repo.tickets.save(next)
  expect(repo.tickets.get('t1')?.attention).toBeUndefined()
})

function silentEngine(repo: MemoryRepositories): Engine {
  return new Engine({
    repo,
    policy: () => ({
      version: 'v1',
      paused: false,
      evalTimeoutMs: 60_000,
      gate: () => ({ admissible: true, strength: 'explicit', basis: { via: 'listed' } }),
      revalidate: () => true,
      admitsInferred: () => true,
    }),
    scope: { scope: () => ({ listened: true, observed: false }) },
    assessor: { request: () => {}, release: () => {} },
    executor: { start: () => {}, deliver: () => {}, stop: () => {} },
    outbox: { send: () => {}, status: () => undefined, withdraw: () => {} },
    now: () => '2026-11-03T15:01:00.000Z',
  })
}

it('Engine.answerAttention stores the text, clears the question, rejects unknown', () => {
  const repo = new MemoryRepositories()
  repo.tickets.save(base)
  const engine = silentEngine(repo)
  const next = engine.answerAttention('t1', 'src/')
  expect(next.attention).toBeUndefined()
  expect(JSON.stringify(next.inputs)).toMatch(/src\//)
  expect(() => engine.answerAttention('missing', 'x')).toThrow(/Unknown ticket/)
})
