import { expect, it } from 'vitest'
import { assertV1Close, formatV1CloseMarkdown, measureV1Close, measureV1CloseView } from '../src/index.ts'

it('closes v1 when PRO-6, GES-6 and OPT-8 have no failures', () => {
  const scored = measureV1Close()
  expect(scored.passed).toBe(true)
  expect(scored.proactivity.passed).toBe(6)
  expect(scored.proactivity.failed).toEqual([])
  expect(scored.gestor).toEqual({ passed: 3, total: 3, failed: [] })
  expect(scored.opt8.passed).toBe(3)
  expect(scored.opt8.total).toBe(4)
  expect(scored.opt8.failed).toEqual([])
  expect(scored.opt8.blocked).toEqual(['cut-40'])
  expect(formatV1CloseMarkdown()).toContain('Gate **verde**')
  expect(formatV1CloseMarkdown()).toContain('cut-40')
  expect(assertV1Close().passed).toBe(true)
  const emptyView = measureV1CloseView()
  expect(emptyView.passed).toBe(true)
  expect(emptyView.opt8.blocked).toEqual(['cut-40'])
  expect(emptyView.opt8.liveEntries).toBe(0)
})

it('scores OPT-8 cut-40 when a live book is present', () => {
  const emptyLayers = { system: 0, tools: 0, required: 0, subject: 0, recall: 0, message: 10 }
  const scored = measureV1Close({
    baselineTokensPerTask: 100,
    liveEntries: [{
      id: 'e1',
      personaId: 'atlas',
      engine: 'claude',
      kind: 'execution',
      inputTokens: 40,
      outputTokens: 10,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      layers: emptyLayers,
      at: '2026-11-04T06:00:00.000Z',
      ticketId: 't1',
    }],
  })
  expect(scored.passed).toBe(true)
  expect(scored.opt8.passed).toBe(4)
  expect(scored.opt8.blocked).toEqual([])
  const view = measureV1CloseView([{
    id: 'e1',
    personaId: 'atlas',
    engine: 'claude',
    kind: 'execution',
    inputTokens: 40,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    layers: emptyLayers,
    at: '2026-11-04T06:00:00.000Z',
    ticketId: 't1',
  }])
  expect(view.opt8.passed).toBe(4)
  expect(view.opt8.blocked).toEqual([])
  expect(view.opt8.liveEntries).toBe(1)
})

it('throws when a live book misses the OPT-8 cut', () => {
  const emptyLayers = { system: 0, tools: 0, required: 0, subject: 0, recall: 0, message: 10 }
  expect(() => assertV1Close({
    baselineTokensPerTask: 10,
    liveEntries: [{
      id: 'e2',
      personaId: 'atlas',
      engine: 'claude',
      kind: 'execution',
      inputTokens: 80,
      outputTokens: 20,
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
      layers: emptyLayers,
      at: '2026-11-04T06:00:00.000Z',
      ticketId: 't1',
    }],
  })).toThrow('V1_CLOSE OPT:cut-40')
})
