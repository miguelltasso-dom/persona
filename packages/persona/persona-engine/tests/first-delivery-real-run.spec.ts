import { expect, it } from 'vitest'
import { EMPTY_LAYERS, type TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { verifyRealFirstDeliveryRun, type RealFirstDeliveryRunInput } from '../src/first-delivery-real-run.ts'

const entry: TurnLedgerEntry = { id: 'call', personaId: 'bento', engine: 'claude', kind: 'execution',
  inputTokens: 250, outputTokens: 80, cacheReadTokens: 0, cacheWriteTokens: 0, layers: EMPTY_LAYERS,
  at: '2026-11-04T12:00:00.000Z', ticketId: 'ticket', origin: 'measured' }
function input(patch: Partial<RealFirstDeliveryRunInput> = {}): RealFirstDeliveryRunInput {
  return { observation: { askId: 'first-delivery', ticket: { id: 'ticket', triggerId: 'first-delivery', stage: 'done' },
    loggedCli: ['claude'], delivery: { ticketId: 'ticket', streamKind: 'channel', ownerId: 'geral', source: 'runner', body: 'Entrega.' },
    milestone: { status: 'ready', ticketId: 'ticket', feedEventId: 'milestone' }, milestoneEventIds: ['milestone'],
    elapsedMs: 45_000, maxElapsedMs: 120_000, maxCalls: 1 },
  ledger: [entry], attempts: [{ paidTurns: 1 }], currentAttempt: 1, ...patch }
}

it('accepts one execution and counts all three settled attempts toward the shared authorization', () => {
  const result = verifyRealFirstDeliveryRun(input({ attempts: [{ paidTurns: 1 }, { paidTurns: 1 }, { paidTurns: 1 }], currentAttempt: 3 }))
  expect(result).toMatchObject({ passed: true, failed: [], ledgerValid: true, attemptsValid: true,
    paidTurnsTotal: 3, executionTurns: 1, triageTurns: 0, injectTurns: 0 })
  expect(result.run).toEqual({ passed: true, failed: [], calls: 1, inputTokens: 250, outputTokens: 80 })
})

it.each(['triage', 'reply', 'execution'] as const)('refuses an extra %s turn and does not hide its spent budget', (kind) => {
  const result = verifyRealFirstDeliveryRun(input({ ledger: [entry, { ...entry, id: 'extra', kind }], attempts: [{ paidTurns: 2 }] }))
  expect(result.passed).toBe(false)
  expect(result.failed).toContain('call-budget')
  expect(result.failed).toContain('attempt-turn-budget')
  expect(result.run?.calls).toBe(2)
  expect(result.paidTurnsTotal).toBe(2)
})

it('rejects an inject row rather than dropping it from the ledger', () => {
  const result = verifyRealFirstDeliveryRun(input({ ledger: [entry, { ...entry, id: 'inject', kind: 'inject' }], attempts: [{ paidTurns: 2 }] }))
  expect(result.passed).toBe(false)
  expect(result.failed).toContain('ledger-corrupt')
  expect(result.ledgerValid).toBe(false)
  expect(result.run).toBeNull()
  expect(result.injectTurns).toBeNull()
})

it('rejects four paid turns even when the current attempt has exactly one execution', () => {
  const result = verifyRealFirstDeliveryRun(input({ attempts: [{ paidTurns: 1 }, { paidTurns: 2 }, { paidTurns: 1 }], currentAttempt: 3 }))
  expect(result.failed).toEqual(['attempt-turn-budget', 'total-paid-turn-budget'])
  expect(result.paidTurnsTotal).toBe(4)
})

it('caps attempts even when earlier failures claim zero paid turns', () => {
  const result = verifyRealFirstDeliveryRun(input({ attempts: [{ paidTurns: 0 }, { paidTurns: 0 }, { paidTurns: 0 }, { paidTurns: 1 }], currentAttempt: 4 }))
  expect(result.failed).toEqual(['attempt-count-budget'])
})

it.each([undefined, null, '{broken', {}, [{ paidTurns: null }], [{ paidTurns: -1 }], [{ paidTurns: 0.5 }], [{ paidTurns: '1' }],
  [{ paidTurns: Number.NaN }], [{ paidTurns: Number.MAX_SAFE_INTEGER }, { paidTurns: 1 }]])('fails closed on unreadable or invalid history: %j', (attempts) => {
  const result = verifyRealFirstDeliveryRun(input({ attempts }))
  expect(result.passed).toBe(false)
  expect(result.failed).toContain('attempt-history-corrupt')
  expect(result.paidTurnsTotal).toBeNull()
})

it.each([undefined, null, '{broken', {}, [{ ...entry, inputTokens: Number.NaN }], [{ ...entry, outputTokens: -1 }],
  [{ ...entry, layers: { ...EMPTY_LAYERS, tools: 251 } }], [{ ...entry, at: 'not-a-date' }],
  [{ ...entry, at: '2026-02-30T12:00:00Z' }], [{ ...entry, at: '2026-11-04T24:00:00Z' }],
  [{ ...entry, kind: 'unknown' }], [entry, entry]])('fails closed on corrupt ledger rows: %j', (ledger) => {
  const result = verifyRealFirstDeliveryRun(input({ ledger }))
  expect(result.failed).toContain('ledger-corrupt')
  expect(result.run).toBeNull()
  expect(result.executionTurns).toBeNull()
})

it('accepts a valid calendar timestamp with an explicit non-UTC offset', () => {
  expect(verifyRealFirstDeliveryRun(input({ ledger: [{ ...entry, at: '2026-11-04T09:00-03:00' }] })).passed).toBe(true)
})

it.each([
  { currentAttempt: 0 }, { currentAttempt: 2 }, { currentAttempt: Number.NaN },
  { attempts: [{ paidTurns: 0 }] }, { attempts: [] },
])('rejects an attempt index or count that disagrees with the complete current ledger: %j', (patch) => {
  expect(verifyRealFirstDeliveryRun(input(patch)).failed).toContain('attempt-ledger-mismatch')
})

it('retains channel, board, connected CLI and unique milestone checks', () => {
  const original = input()
  const result = verifyRealFirstDeliveryRun({ ...original, observation: { ...original.observation,
    milestoneEventIds: [], ticket: { id: 'ticket', triggerId: 'first-delivery', stage: 'review' } } })
  expect(result.failed).toEqual(['board-done', 'milestone'])
})

it('does not mutate persisted inputs and returns only safe counts and failure codes', () => {
  const original = input()
  const before = structuredClone(original)
  const result = verifyRealFirstDeliveryRun(original)
  expect(original).toEqual(before)
  expect(result.passed).toBe(true)
  expect(JSON.stringify(result)).not.toContain('Entrega.')
})
