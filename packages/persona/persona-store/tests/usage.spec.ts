import { expect, it } from 'vitest'
import { applySqliteRetention } from '../src/retention/store.ts'
import { openPersonaStore } from '../src/store.ts'
import { SqliteUsageStore } from '../src/usage/store.ts'

function book() {
  const store = openPersonaStore({ path: ':memory:' })
  return { store, usage: new SqliteUsageStore(store) }
}

it('records measured turns and folds a period that crosses a month', () => {
  const { store, usage } = book()
  try {
    usage.record({
      id: 'oct', projectId: 'pp', personaId: 'coord', provider: 'claude', model: 'haiku',
      window: 'turn', inputTokens: 10, outputTokens: 4, origin: 'measured', at: '2026-10-31T23:00:00.000Z',
    })
    usage.record({
      id: 'nov', projectId: 'pp', personaId: 'coord', provider: 'claude', model: 'haiku',
      window: 'turn', inputTokens: 6, outputTokens: 2, origin: 'measured', at: '2026-11-01T01:00:00.000Z',
    })
    const across = { projectId: 'pp', from: '2026-10-15T00:00:00.000Z', to: '2026-11-15T00:00:00.000Z' }
    expect(usage.list(across)).toHaveLength(2)
    expect(usage.tokens(across)).toBe(22)
    expect(usage.runs(across)).toBe(2)
    const november = { projectId: 'pp', from: '2026-11-01T00:00:00.000Z', to: '2026-11-30T23:59:59.000Z' }
    expect(usage.list(november)).toHaveLength(1)
    expect(usage.tokens(november)).toBe(8)
    expect(usage.list({ projectId: 'other', from: across.from, to: across.to })).toEqual([])
  } finally {
    store.close()
  }
})

it('stores official quota without inventing 0%', () => {
  const { store, usage } = book()
  try {
    expect(usage.listQuota('pp')).toEqual([])
    usage.putQuota('pp', { provider: 'claude', origin: 'unavailable', windows: [] })
    const [row] = usage.listQuota('pp', 'claude')
    expect(row?.origin).toBe('unavailable')
    expect(row?.windows).toEqual([])
    expect(JSON.stringify(row)).not.toMatch(/"usedPercent":0/u)
  } finally {
    store.close()
  }
})

it('purges usage rows when retention kind usage expires', () => {
  const { store, usage } = book()
  try {
    usage.record({
      id: 'old', projectId: 'pp', personaId: 'coord', provider: 'dsh', model: 'm',
      window: 'turn', inputTokens: 1, outputTokens: 1, origin: 'measured', at: '2020-01-01T00:00:00.000Z',
    })
    usage.record({
      id: 'new', projectId: 'pp', personaId: 'coord', provider: 'dsh', model: 'm',
      window: 'turn', inputTokens: 1, outputTokens: 1, origin: 'measured', at: '2026-11-03T00:00:00.000Z',
    })
    applySqliteRetention(store, {
      windows: [{ kind: 'usage', archiveAfterMs: 86_400_000 }],
    }, Date.parse('2026-11-03T12:00:00.000Z'))
    expect(usage.list({
      projectId: 'pp', from: '2019-01-01T00:00:00.000Z', to: '2026-12-01T00:00:00.000Z',
    }).map(item => item.id)).toEqual(['new'])
  } finally {
    store.close()
  }
})
