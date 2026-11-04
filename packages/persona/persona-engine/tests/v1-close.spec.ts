import type { TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { expect, it } from 'vitest'
import { assertV1Close, formatV1CloseMarkdown, measureV1Close, measureV1CloseView } from '../src/index.ts'

const emptyLayers = { system: 0, tools: 0, required: 0, subject: 0, recall: 0, message: 10 }
const book = (inputTokens: number, outputTokens: number): TurnLedgerEntry[] => [{
  id: 'e1',
  personaId: 'atlas',
  engine: 'claude',
  kind: 'execution',
  inputTokens,
  outputTokens,
  cacheReadTokens: 0,
  cacheWriteTokens: 0,
  layers: emptyLayers,
  at: '2026-11-04T06:00:00.000Z',
  ticketId: 't1',
}]

it('closes v1 when PRO-6, GES-6 and OPT-8 have no failures', () => {
  const scored = measureV1Close()
  expect(scored.passed).toBe(true)
  expect(scored.proactivity.passed).toBe(6)
  expect(scored.proactivity.failed).toEqual([])
  expect(scored.gestor).toEqual({ passed: 3, total: 3, failed: [] })
  expect(scored.gestorTools).toEqual({ passed: 4, total: 4, failed: [] })
  expect(scored.gestorMulti).toEqual({ passed: 3, total: 3, failed: [] })
  expect(scored.firstDelivery).toEqual({ passed: 4, total: 4, failed: [] })
  // D-080: cache-60 from the provider's own report, cut-40 on the view with the measured base (W3 deferred by decision); only the parity waits.
  expect(scored.origin).toBe('calibrated')
  expect(scored.baseline).toBe('levers-before-wiring')
  expect(scored.opt8.passed).toBe(3)
  expect(scored.opt8.total).toBe(4)
  expect(scored.opt8.failed).toEqual([])
  expect(scored.opt8.blocked).toEqual(['pair-parity'])
  expect(formatV1CloseMarkdown()).toContain('Gate **verde**')
  expect(formatV1CloseMarkdown()).toContain('cut-40')
  expect(assertV1Close().passed).toBe(true)
  const emptyView = measureV1CloseView()
  expect(emptyView.passed).toBe(true)
  expect(emptyView.gestorTools).toEqual({ passed: 4, total: 4, failed: [] })
  expect(emptyView.gestorMulti).toEqual({ passed: 3, total: 3, failed: [] })
  expect(emptyView.firstDelivery).toEqual({ passed: 4, total: 4, failed: [] })
  expect(emptyView.opt8.blocked).toEqual(['pair-parity'])
  expect(emptyView.opt8.liveEntries).toBe(0)
  expect(emptyView.opt8.evidence.baseline).toBe('levers-before-wiring')
})

it('a live book is reported but never moves the OPT-8 goal (D-068)', () => {
  const scored = measureV1Close({ baselineTokensPerTask: 100, liveEntries: book(40, 10) })
  expect(scored.passed).toBe(true)
  expect(scored.opt8.passed).toBe(3)
  expect(scored.opt8.blocked).toEqual(['pair-parity'])
  const view = measureV1CloseView(book(40, 10))
  expect(view.opt8.passed).toBe(3)
  expect(view.opt8.blocked).toEqual(['pair-parity'])
  expect(view.opt8.liveEntries).toBe(1)
  expect(view.opt8.evidence.cut40.status).toBe('passed')
})

it('a heavy live book cannot fail the gate: the 134 fixture is out of the goal (D-068)', () => {
  expect(() => assertV1Close({ baselineTokensPerTask: 10, liveEntries: book(80, 20) })).not.toThrow()
  expect(measureV1CloseView(book(80, 20)).passed).toBe(true)
})
