import { describe, expect, it } from 'vitest'
import {
  canUseReset,
  dedupeLimitAccounts,
  harvestLimitReports,
  limitWindowKindOf,
  officialQuotaPuts,
  persistOfficialQuotaPuts,
  poolProviderLimits,
  redeemReset,
  reportFromOfficialQuota,
} from '../src/index.ts'
import type { OfficialQuota, UsageWindow } from '../src/types.ts'

const checked = '2026-11-04T12:00:00.000Z'

function window(partial: Partial<UsageWindow> & Pick<UsageWindow, 'id'>): UsageWindow {
  return { origin: 'official', ...partial }
}

describe('T3 harvest → putProviderLimitReports', () => {
  it('maps official windows to LimitAccountReport and skips unavailable percents', async () => {
    expect(limitWindowKindOf(window({ id: '5h', windowMinutes: 300 }))).toBe('session')
    expect(limitWindowKindOf(window({ id: 'week' }))).toBe('weekly')
    expect(limitWindowKindOf(window({ id: 'month' }))).toBe('monthly')
    expect(limitWindowKindOf(window({ id: 'extra' }))).toBe('other')
    const quota: OfficialQuota = {
      provider: 'claude',
      origin: 'official',
      windows: [
        window({ id: '5h', usedPercent: 12, resetsAt: '2026-11-04T17:00:00.000Z' }),
        { id: 'ghost', origin: 'unavailable', usedPercent: 0 },
      ],
    }
    const report = reportFromOfficialQuota(
      {
        accountId: 'work',
        provider: 'claude',
        label: 'Trabalho',
        email: 'ana@acme.com',
        environmentId: 'desk',
        environmentLabel: 'Desktop',
        resetCredits: { remaining: 1, nextCreditId: 'r1' },
      },
      quota,
      checked,
    )
    expect(report.label).toBe('ana')
    expect(report.windows).toEqual([
      { id: '5h', kind: 'session', usedPercent: 12, resetsAt: '2026-11-04T17:00:00.000Z' },
    ])
    expect(JSON.stringify(report)).not.toMatch(/"usedPercent":0/u)
    expect(canUseReset(report.resetCredits)).toBe(true)

    const reports = await harvestLimitReports(
      [
        { accountId: 'work', provider: 'claude', label: 'Trabalho', email: 'ana@acme.com' },
        { accountId: 'home', provider: 'claude', label: 'Pessoal' },
      ],
      async (account): Promise<OfficialQuota> => (
        account.accountId === 'work'
          ? quota
          : { provider: 'claude', origin: 'unavailable', windows: [] }
      ),
      () => checked,
    )
    expect(reports).toHaveLength(2)
    expect(reports[1]?.windows).toEqual([])
    const pools = poolProviderLimits(dedupeLimitAccounts(reports), Date.parse(checked))
    expect(pools[0]?.accounts).toHaveLength(2)
  })

  it('redeems only when the vendor published a credit id', async () => {
    const seen: string[] = []
    expect(await redeemReset({ remaining: 2 }, async (id) => { seen.push(id) })).toEqual({
      used: false,
      why: 'unavailable',
    })
    expect(await redeemReset({ remaining: 2, nextCreditId: 'c9' }, async (id) => { seen.push(id) })).toEqual({
      used: true,
      creditId: 'c9',
    })
    expect(seen).toEqual(['c9'])
  })

  it('maps probe officialQuota onto putQuota rows without default labels', () => {
    const rows = officialQuotaPuts([
      { id: 'dsh' },
      {
        id: 'claude',
        officialQuota: {
          provider: 'claude',
          origin: 'official',
          detail: 'max',
          windows: [window({ id: '5h', usedPercent: 0 })],
        },
      },
      {
        id: 'codex',
        officialQuota: {
          provider: 'codex',
          origin: 'unavailable',
          detail: 'accountUsage timeout',
          windows: [],
        },
      },
    ])
    expect(rows[0]?.accountLabel).toBe('Claude Max')
    expect(rows[1]?.accountLabel).toBe('ChatGPT')
    expect(JSON.stringify(rows)).not.toMatch(/"accountLabel":"default"/u)
    expect(rows[1]?.detail).toBe('accountUsage timeout')
    const written: string[] = []
    const stored = persistOfficialQuotaPuts((row) => { written.push(row.accountLabel) }, [
      {
        id: 'claude',
        officialQuota: {
          provider: 'claude',
          origin: 'official',
          detail: 'max',
          windows: [window({ id: '5h', usedPercent: 0 })],
        },
      },
    ])
    expect(written).toEqual(['Claude Max'])
    expect(stored[0]?.accountLabel).toBe('Claude Max')
    expect(stored[0]?.accountId).toBe('claude')
  })
})
