import { expect, it } from 'vitest'
import { EMPTY_LAYERS, type TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { verifyFirstDeliveryRun, type FirstDeliveryRunEvidence } from '../src/index.ts'

const ENTRY: TurnLedgerEntry = {
  id: 'worker-call', personaId: 'worker', engine: 'claude', kind: 'execution',
  ticketId: 'ticket', origin: 'measured', at: '2026-11-04T12:00:00.000Z',
  inputTokens: 250, outputTokens: 80, cacheReadTokens: 0, cacheWriteTokens: 0,
  layers: EMPTY_LAYERS,
}
const EVIDENCE = {
  askId: 'first-delivery',
  ticket: { id: 'ticket', triggerId: 'first-delivery', stage: 'done' },
  loggedCli: ['codex', 'claude'], entries: [ENTRY],
  delivery: { ticketId: 'ticket', streamKind: 'channel', ownerId: 'geral', source: 'runner', body: 'Entrega.' },
  milestone: { status: 'ready', ticketId: 'ticket', feedEventId: 'first-delivery-milestone' },
  milestoneEventIds: ['first-delivery-milestone'],
  elapsedMs: 45_000, maxElapsedMs: 120_000, maxCalls: 3,
} satisfies FirstDeliveryRunEvidence

it('accepts a measured execution and delivery for the requested ticket', () => {
  expect(verifyFirstDeliveryRun(EVIDENCE)).toEqual({
    passed: true, failed: [], calls: 1, inputTokens: 250, outputTokens: 80,
  })
})

it.each([
  { ...ENTRY, engine: 'fake' },
  { ...ENTRY, engine: 'dsh' },
  { ...ENTRY, origin: 'estimate' as const },
  { ...ENTRY, ticketId: 'other-ticket' },
  { ...ENTRY, engine: 'codex' },
  { ...ENTRY, kind: 'reply' as const },
  { ...ENTRY, outputTokens: 0 },
])('rejects an execution without measured usage from the chosen CLI: %j', (entry) => {
  expect(verifyFirstDeliveryRun({ ...EVIDENCE, entries: [entry] }).failed).toContain('measured-execution')
})

it('counts coordination calls toward the shared limit and includes their tokens', () => {
  const coord = { ...ENTRY, id: 'coord-call', kind: 'reply' as const }
  const result = verifyFirstDeliveryRun({
    ...EVIDENCE,
    entries: [ENTRY, coord, { ...coord, id: 'retry-1' }, { ...coord, id: 'retry-2' }],
  })
  expect(result.failed).toEqual(['call-budget'])
  expect(result.calls).toBe(4)
  expect(result.inputTokens).toBe(1000)
  expect(result.outputTokens).toBe(320)
})

it('does not hide unmeasured calls when a measured execution is present', () => {
  const result = verifyFirstDeliveryRun({
    ...EVIDENCE,
    entries: [ENTRY, { ...ENTRY, id: 'unmeasured', origin: 'estimate' }],
    maxCalls: 1,
  })
  expect(result.failed).toEqual(['unmeasured-usage', 'call-budget'])
  expect(result.calls).toBe(2)
  expect(result.inputTokens).toBe(250)
})

it.each(['working', 'failed'])('rejects milestone status %s even with a runner reply', (status) => {
  expect(verifyFirstDeliveryRun({
    ...EVIDENCE, milestone: { ...EVIDENCE.milestone, status },
  }).failed).toEqual(['milestone'])
})

it('rejects missing or duplicate milestones and delivery from another ticket', () => {
  expect(verifyFirstDeliveryRun({ ...EVIDENCE, milestoneEventIds: [] }).failed).toEqual(['milestone'])
  expect(verifyFirstDeliveryRun({
    ...EVIDENCE, milestoneEventIds: ['first-delivery-milestone', 'first-delivery-milestone'],
  }).failed).toEqual(['milestone'])
  expect(verifyFirstDeliveryRun({
    ...EVIDENCE, delivery: { ...EVIDENCE.delivery, ticketId: 'other-ticket' },
  }).failed).toEqual(['channel-delivery'])
})

it('reports missing stages in order instead of accepting an empty run', () => {
  const result = verifyFirstDeliveryRun({
    ...EVIDENCE, ticket: undefined, entries: [], delivery: undefined, loggedCli: [], milestoneEventIds: [],
  })
  expect(result.passed).toBe(false)
  expect(result.failed).toEqual([
    'ask-ticket', 'connected-cli', 'measured-execution', 'call-budget', 'channel-delivery', 'board-done', 'milestone',
  ])
})

it.each([120_000, 120_001, -1, Number.NaN])('rejects elapsed time %s', (elapsedMs) => {
  expect(verifyFirstDeliveryRun({ ...EVIDENCE, elapsedMs }).failed).toEqual(['elapsed-time'])
})

it('requires the board to be done and the delivery to be on #geral', () => {
  expect(verifyFirstDeliveryRun({
    ...EVIDENCE, ticket: { ...EVIDENCE.ticket, stage: 'review' },
    delivery: { ...EVIDENCE.delivery, streamKind: 'dm' },
  }).failed).toEqual(['channel-delivery', 'board-done'])
})
