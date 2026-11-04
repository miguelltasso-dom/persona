import { EMPTY_LAYERS, foldUsagePanel } from '@deepseek-ai/dsh-persona-core'
import { usagePortWindow } from '@deepseek-ai/dsh-persona-usage'
import type { TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { expect, it } from 'vitest'
import { StoreError } from '../src/errors.ts'
import { TurnLedgerRepos } from '../src/ledger/repos.ts'
import { withTempStore } from '../src/test-helpers.ts'

const at = '2026-11-04T03:30:00.000Z'

function entry(overrides: Partial<TurnLedgerEntry> = {}): TurnLedgerEntry {
  return {
    id: 't1',
    personaId: 'atlas',
    engine: 'claude',
    kind: 'execution',
    inputTokens: 40,
    outputTokens: 10,
    cacheReadTokens: 0,
    cacheWriteTokens: 28,
    layers: { ...EMPTY_LAYERS, system: 20, tools: 8, message: 12 },
    at,
    ticketId: 'task-1',
    origin: 'measured',
    ...overrides,
  }
}

it('persists canonical execution/evaluation and refuses Rivet port tags', async () => {
  await withTempStore(async (store) => {
    const book = new TurnLedgerRepos(store)
    book.put('pp', entry())
    book.put('pp', entry({
      id: 't2',
      personaId: 'nina',
      kind: 'evaluation',
      inputTokens: 50,
      outputTokens: 20,
      cacheReadTokens: 28,
      cacheWriteTokens: 0,
      layers: { ...EMPTY_LAYERS, system: 20, tools: 8, message: 22 },
    }))
    const rows = book.list({ projectId: 'pp' })
    expect(rows.map(row => row.kind)).toEqual(['execution', 'evaluation'])
    expect(rows[0]?.layers.message).toBe(12)
    expect(() => book.put('pp', entry({
      id: 'bad',
      kind: 'exec' as TurnLedgerEntry['kind'],
    }))).toThrow(StoreError)
    expect(usagePortWindow('execution')).toBe('exec')
    expect(usagePortWindow('evaluation')).toBe('eval')
    const panel = foldUsagePanel(rows, ['task-1'])
    expect(panel.origin).toBe('measured')
    expect(panel.tokensPerSuccessfulTask).toBe(120)
    expect(panel.byKind.map(row => row.key)).toEqual(['execution', 'evaluation'])
    expect(book.list({ projectId: 'other' })).toEqual([])
  })
})
