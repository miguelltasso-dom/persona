import { expect, it } from 'vitest'
import {
  DomainError,
  EMPTY_LAYERS,
  appendTurn,
  cacheHitRate,
  callsForTicket,
  dropRecordsInPrefix,
  estimateTokens,
  fitLayersToBudget,
  foldUsagePanel,
  ticketIdsFromLedger,
  incrementalSubjectSummary,
  measureLayers,
  minifyToolDescription,
  tokensPerSuccessfulTask,
  totalTokens,
  turnFromLayers,
  usagePortKind,
} from '../src/index.ts'
import type { TurnLedgerEntry } from '../src/index.ts'

const at = '2026-11-04T03:30:00.000Z'

function entry(overrides: Partial<TurnLedgerEntry> = {}): TurnLedgerEntry {
  const layers = overrides.layers ?? { ...EMPTY_LAYERS, system: 20, tools: 8, message: 12 }
  return {
    id: 't1',
    personaId: 'atlas',
    engine: 'claude',
    kind: 'triage',
    inputTokens: 40,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 28,
    layers,
    at,
    ticketId: 'task-1',
    ...overrides,
  }
}

it('estimates tokens and measures the six context layers', () => {
  expect(estimateTokens('')).toBe(0)
  expect(estimateTokens('abcd')).toBe(1)
  expect(estimateTokens('abcde')).toBe(2)
  const layers = measureLayers({
    system: 'xxxx',
    tools: 'yyyy',
    required: '',
    subject: 'zzzz',
    message: 'ok',
  })
  expect(layers).toEqual({ system: 1, tools: 1, required: 0, subject: 1, recall: 0, message: 1 })
})

it('appends a turn and folds cache hit, calls, and tokens per successful task', () => {
  const first = entry()
  const second = entry({
    id: 't2',
    kind: 'execution',
    inputTokens: 50,
    outputTokens: 20,
    cacheReadTokens: 28,
    cacheWriteTokens: 0,
    layers: { ...EMPTY_LAYERS, system: 20, tools: 8, message: 22 },
  })
  const book = appendTurn(appendTurn([], first), second)
  expect(totalTokens(book)).toBe(120)
  expect(callsForTicket(book, 'task-1')).toBe(2)
  expect(cacheHitRate(book)).toBeCloseTo(28 / 56)
  expect(tokensPerSuccessfulTask(book, ['task-1'])).toBe(120)
  expect(tokensPerSuccessfulTask(book, [])).toBe(0)
})

it('fits variable layers to a budget and keeps the prefix', () => {
  const fitted = fitLayersToBudget({
    system: 10, tools: 5, required: 5, subject: 20, recall: 10, message: 20,
  }, 30)
  expect(fitted).toEqual({ system: 10, tools: 5, required: 5, subject: 10, recall: 0, message: 0 })
  expect(() => fitLayersToBudget({
    system: 20, tools: 10, required: 10, subject: 0, recall: 0, message: 0,
  }, 20)).toThrow('INVALID_TOKEN_LEDGER')
})

it('drops context records already present in the prefix', () => {
  const prefix = 'Nunca inventar preço.\nAtlas coordena.'
  const kept = dropRecordsInPrefix([
    {
      id: 'a', workspaceId: 'ws', projectId: 'p', revision: 1, kind: 'constraint',
      status: 'active', body: 'Nunca inventar preço.', sourceIds: [],
    },
    {
      id: 'b', workspaceId: 'ws', projectId: 'p', revision: 1, kind: 'memory',
      status: 'active', body: 'Ana pediu 20 pães.', sourceIds: [],
    },
  ], prefix)
  expect(kept.map(row => row.id)).toEqual(['b'])
})

it('summarizes a subject incrementally and shortens tool text', () => {
  expect(incrementalSubjectSummary('ontem pão', 'hoje café da Ana', 20)).toContain('café')
  expect(minifyToolDescription('Lê arquivos do projeto. Também escreve quando o mandato permite.')).toBe('Lê arquivos do projeto.')
  expect(minifyToolDescription('x'.repeat(90)).endsWith('...')).toBe(true)
})

it('folds the Uso panel by persona, kind, task, cache, and origin', () => {
  const first = turnFromLayers({
    id: 't1', personaId: 'atlas', engine: 'claude', kind: 'triage',
    layers: { ...EMPTY_LAYERS, system: 20, tools: 8, message: 12 },
    outputTokens: 10, cacheReadTokens: 0, cacheWriteTokens: 28, at,
    ticketId: 'task-1', origin: 'measured',
  })
  const second = turnFromLayers({
    id: 't2', personaId: 'nina', engine: 'claude', kind: 'execution',
    layers: { ...EMPTY_LAYERS, system: 20, tools: 8, message: 22 },
    outputTokens: 20, cacheReadTokens: 28, cacheWriteTokens: 0, at,
    ticketId: 'task-1', origin: 'measured',
  })
  const panel = foldUsagePanel(appendTurn(appendTurn([], first), second), ['task-1'])
  expect(panel.origin).toBe('measured')
  expect(panel.tokensPerSuccessfulTask).toBe(120)
  expect(panel.byPersona.map(row => row.key)).toEqual(['atlas', 'nina'])
  expect(panel.byKind.map(row => row.key)).toEqual(['triage', 'execution'])
  expect(panel.cacheHitRate).toBeCloseTo(28 / 56)
  expect(usagePortKind('execution')).toBe('exec')
  expect(usagePortKind('evaluation')).toBe('eval')
  expect(foldUsagePanel([]).origin).toBe('estimate')
  const { ticketId: _omit, ...noTicket } = second
  expect(ticketIdsFromLedger([first, second, { ...noTicket, id: 't3' }])).toEqual(['task-1'])
  expect(ticketIdsFromLedger([])).toEqual([])
})

it('durationMs is optional; a present value must be a whole number of milliseconds, 0 or more', () => {
  expect(appendTurn([], entry({})).length).toBe(1)
  expect(appendTurn([], entry({ durationMs: 0 }))[0]?.durationMs).toBe(0)
  expect(appendTurn([], entry({ durationMs: 41_250 }))[0]?.durationMs).toBe(41_250)
  for (const bad of [-1, 1.5, Number.NaN, Number.POSITIVE_INFINITY]) {
    expect(() => appendTurn([], entry({ durationMs: bad })), String(bad)).toThrow('INVALID_TOKEN_LEDGER')
  }
})

it('envMode (D-085) is optional; present it must be native, answer-only or needed', () => {
  for (const mode of ['native', 'answer-only', 'needed'] as const) {
    expect(appendTurn([], entry({ envMode: mode }))[0]?.envMode, mode).toBe(mode)
  }
  expect(appendTurn([], entry({}))[0]?.envMode).toBeUndefined()
  for (const bad of ['', 'strict', 'NATIVE', 'answer_only', 7, null]) {
    expect(() => appendTurn([], entry({ envMode: bad as never })), String(bad)).toThrow('INVALID_TOKEN_LEDGER')
  }
})

it('refuses a negative counter and layers larger than input', () => {
  expect(() => appendTurn([], entry({ inputTokens: -1 }))).toThrow(DomainError)
  expect(() => appendTurn([], entry({
    inputTokens: 10,
    layers: { ...EMPTY_LAYERS, system: 20 },
  }))).toThrow('INVALID_TOKEN_LEDGER')
})
