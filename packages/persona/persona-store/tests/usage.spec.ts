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

it('stamps when an official quota was read, keeps an explicit instant, and refreshes it on every write', async () => {
  const { store, usage } = book()
  try {
    const before = Date.now()
    usage.putQuota('pp', { provider: 'claude', origin: 'unavailable', windows: [], accountId: 'a' })
    const stamped = usage.listQuota('pp', 'claude')[0]?.at
    expect(stamped).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/u)
    expect(Date.parse(stamped!)).toBeGreaterThanOrEqual(before)
    expect(Date.parse(stamped!)).toBeLessThanOrEqual(Date.now())

    // An even "found nothing" read has a time: the pill can say "checked 2 min ago".
    await new Promise(resolve => setTimeout(resolve, 5))
    usage.putQuota('pp', { provider: 'claude', origin: 'unavailable', windows: [], accountId: 'a' })
    expect(Date.parse(usage.listQuota('pp', 'claude')[0]!.at!)).toBeGreaterThan(Date.parse(stamped!))

    usage.putQuota('pp', { provider: 'claude', origin: 'official', windows: [], accountId: 'b', at: '2026-11-04T12:00:00.000Z' })
    expect(usage.listQuota('pp', 'claude').find(row => row.accountId === 'b')?.at).toBe('2026-11-04T12:00:00.000Z')
  } finally {
    store.close()
  }
})

it('keeps one official quota row per account and a short refill trail', () => {
  const { store, usage } = book()
  try {
    usage.putQuota('pp', {
      provider: 'claude', origin: 'official', accountId: 'work', accountLabel: 'Trabalho',
      windows: [{ id: '5h', origin: 'official', usedPercent: 40, resetsAt: '2026-11-04T10:00:00.000Z' }],
    })
    usage.putQuota('pp', {
      provider: 'claude', origin: 'official', accountId: 'home', accountLabel: 'Pessoal',
      windows: [{ id: '5h', origin: 'official', usedPercent: 10, resetsAt: '2026-11-04T11:00:00.000Z' }],
    })
    usage.putQuota('pp', {
      provider: 'claude', origin: 'official', accountId: 'work', accountLabel: 'Trabalho',
      windows: [{ id: '5h', origin: 'official', usedPercent: 80, resetsAt: '2026-11-04T15:00:00.000Z' }],
    })
    const rows = usage.listQuota('pp', 'claude')
    expect(rows.map(row => row.accountId)).toEqual(['home', 'work'])
    const work = rows.find(row => row.accountId === 'work')
    expect(work?.accountLabel).toBe('Trabalho')
    expect(work?.windows[0]?.usedPercent).toBe(80)
    expect(work?.refillHistory?.map(point => point.resetsAt)).toEqual([
      '2026-11-04T10:00:00.000Z',
      '2026-11-04T15:00:00.000Z',
    ])
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
