import { describe, expect, it } from 'vitest'
import { cacheHitRate, createMemoryUsageStore, foldTurnLedger, usagePortKind, usagePortWindow } from '../src/index.ts'

describe('OPT-1 turn ledger', () => {
  it('maps leftover exec/eval through usagePortKind only and folds as core kinds', () => {
    expect(usagePortKind('exec')).toBe('execution')
    expect(usagePortKind('eval')).toBe('evaluation')
    expect(usagePortKind('execution')).toBe('execution')
    expect(usagePortKind('evaluation')).toBe('evaluation')
    expect(usagePortKind('triage')).toBe('triage')
    expect(usagePortWindow('execution')).toBe('exec')
    expect(usagePortWindow('evaluation')).toBe('eval')
    expect(usagePortWindow('triage')).toBe('triage')
    const folds = foldTurnLedger([
      {
        personaId: 'nina', provider: 'claude', model: 'haiku', kind: 'triage',
        inputTokens: 100, outputTokens: 20, calls: 1, origin: 'measured', at: 't1',
        accountId: 'work', cacheReadTokens: 80,
      },
      {
        personaId: 'nina', provider: 'claude', model: 'sonnet', kind: 'exec',
        inputTokens: 400, outputTokens: 80, calls: 2, origin: 'measured', at: 't2',
        accountId: 'work',
      },
      {
        personaId: 'nina', provider: 'claude', model: 'sonnet', kind: 'execution',
        inputTokens: 50, outputTokens: 10, calls: 1, origin: 'measured', at: 't3',
        accountId: 'work', cacheWriteTokens: 12,
      },
    ])
    expect(folds.find(row => row.kind === 'triage')?.cacheHitRate).toBe(0.8)
    const execution = folds.find(row => row.kind === 'execution')
    expect(execution?.calls).toBe(3)
    expect(execution?.cacheWriteTokens).toBe(12)
    expect(execution?.cacheHitRate).toBeUndefined()
    expect(folds.map(row => row.kind).sort()).toEqual(['execution', 'triage'])
    expect(cacheHitRate(0, 10)).toBeUndefined()
    expect(JSON.stringify(execution)).not.toMatch(/"cacheHitRate":0/u)
  })

  it('persists canonical kind and vendor cache on the UsageStore port', () => {
    const store = createMemoryUsageStore()
    store.record({
      personaId: 'nina', projectId: 'p1', provider: 'claude', model: 'sonnet',
      inputTokens: 40, outputTokens: 8, origin: 'measured', at: '2026-11-04T04:00:00.000Z',
      kind: 'exec', cacheReadTokens: 16, cacheWriteTokens: 4, accountId: 'work',
    })
    const row = store.query({ from: '2026-11-04', to: '2026-11-05' })[0]
    expect(row?.kind).toBe('execution')
    expect(row?.cacheReadTokens).toBe(16)
    expect(row?.cacheWriteTokens).toBe(4)
    store.record({
      personaId: 'nina', projectId: 'p1', provider: 'claude', model: 'haiku',
      inputTokens: 10, outputTokens: 2, origin: 'measured', at: '2026-11-04T04:01:00.000Z',
    })
    expect(JSON.stringify(store.query({ from: '2026-11-04', to: '2026-11-05' })[1])).not.toMatch(/"cacheReadTokens":0/u)
  })
})
