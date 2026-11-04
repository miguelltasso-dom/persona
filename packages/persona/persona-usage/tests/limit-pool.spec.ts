import { describe, expect, it } from 'vitest'
import {
  AUTO_QUOTA_CHECK_MS,
  accountIdentityKey,
  canUseReset,
  dedupeLimitAccounts,
  officialQuota,
  poolProviderLimits,
  readNativeHistoryTotals,
  shouldAutoCheckQuota,
  type LimitAccountReport,
} from '../src/index.ts'

const checked = '2026-11-04T12:00:00.000Z'

function report(partial: Partial<LimitAccountReport> & Pick<LimitAccountReport, 'accountId' | 'provider'>): LimitAccountReport {
  return {
    label: partial.label ?? partial.accountId,
    checkedAt: partial.checkedAt ?? checked,
    windows: partial.windows ?? [{ id: '5h', kind: 'session', usedPercent: 40, resetsAt: '2026-11-04T15:00:00.000Z' }],
    ...partial,
  }
}

describe('T3 harvest: identity and pool', () => {
  it('counts the same email once across environments and keeps the fresher windows', () => {
    expect(accountIdentityKey({ provider: 'claude', email: 'Ada@x.com' })).toBe('claude:ada@x.com')
    const merged = dedupeLimitAccounts([
      report({
        accountId: 'work-desk',
        provider: 'claude',
        email: 'ada@x.com',
        environmentId: 'desk',
        environmentLabel: 'mesa',
        windows: [{ id: '5h', kind: 'session', usedPercent: 90, resetsAt: '2026-11-04T14:00:00.000Z' }],
      }),
      report({
        accountId: 'work-hub',
        provider: 'claude',
        email: 'ada@x.com',
        environmentId: 'hub',
        environmentLabel: 'hub',
        checkedAt: '2026-11-04T12:05:00.000Z',
        windows: [{ id: '5h', kind: 'session', usedPercent: 10, resetsAt: '2026-11-04T16:00:00.000Z' }],
        resetCredits: { remaining: 2, nextCreditId: 'c1' },
      }),
    ])
    expect(merged).toHaveLength(1)
    expect(merged[0]?.environments.map(row => row.id)).toEqual(['desk', 'hub'])
    expect(merged[0]?.windows[0]?.usedPercent).toBe(10)
    expect(canUseReset(merged[0]?.resetCredits)).toBe(true)
  })

  it('orders accounts by the next session refill and pools one window per provider', () => {
    const soon = report({
      accountId: 'a',
      provider: 'codex',
      label: 'Pessoal',
      windows: [{ id: 'primary', kind: 'session', usedPercent: 80, resetsAt: '2026-11-04T13:00:00.000Z' }],
    })
    const later = report({
      accountId: 'b',
      provider: 'codex',
      label: 'Trabalho',
      windows: [{ id: 'secondary', kind: 'session', usedPercent: 20, resetsAt: '2026-11-04T18:00:00.000Z' }],
    })
    const pools = poolProviderLimits(dedupeLimitAccounts([later, soon]), Date.parse(checked))
    expect(pools[0]?.accounts.map(row => row.accountId)).toEqual(['a', 'b'])
    expect(pools[0]?.windows[0]?.kind).toBe('session')
    expect(pools[0]?.windows[0]?.usedPercent).toBe(50)
    expect(pools[0]?.windows[0]?.remainingPercent).toBe(50)
    expect(JSON.stringify(pools)).not.toMatch(/"usedPercent":0/u)
  })

  it('never estimates missing native-history tokens and waits 5 min between auto checks', async () => {
    const totals = readNativeHistoryTotals([
      { at: 't1', inputTokens: 10, outputTokens: 2 },
      { at: 't2' },
      { at: 't3', inputTokens: 5 },
    ])
    expect(totals).toEqual({
      inputTokens: 15,
      outputTokens: 2,
      turnsCounted: 2,
      turnsSkipped: 1,
      origin: 'measured',
    })
    expect(readNativeHistoryTotals([{ at: 'empty' }]).origin).toBe('unavailable')
    expect(shouldAutoCheckQuota(1_000, 1_000 + AUTO_QUOTA_CHECK_MS - 1)).toBe(false)
    expect(shouldAutoCheckQuota(1_000, 1_000 + AUTO_QUOTA_CHECK_MS)).toBe(true)
    const cache = new Map<string, { at: number; value: import('../src/types.ts').OfficialQuota }>()
    let now = 10_000
    let calls = 0
    const read = async () => {
      calls += 1
      return { windows: [{ id: '5h', usedPercent: 9, windowMinutes: 300 }] }
    }
    await officialQuota('claude', { cache, now: () => now, accountUsage: read })
    now += 60_000
    await officialQuota('claude', { cache, now: () => now, accountUsage: read })
    expect(calls).toBe(1)
    await officialQuota('claude', { cache, now: () => now, force: true, accountUsage: read })
    expect(calls).toBe(2)
    expect(canUseReset({ remaining: 1 })).toBe(false)
  })
})
