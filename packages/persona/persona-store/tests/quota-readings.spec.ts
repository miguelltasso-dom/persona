/**
 * USD-1 / D-092: the trail of official readings kept on a quota row. The host pairs two readings of the same cycle with the tokens measured between
 * them to learn what a token costs in the vendor's window (`calibrateQuota`); the store only has to remember what the vendor said and when.
 */
import { expect, it } from 'vitest'
import { openPersonaStore } from '../src/store.ts'
import { QUOTA_READINGS_CAP, SqliteUsageStore, mergeQuotaReadings, type StoredOfficialQuota } from '../src/usage/store.ts'

function book() {
  const store = openPersonaStore({ path: ':memory:' })
  return { store, usage: new SqliteUsageStore(store) }
}

const WEEK_RESET = '2026-11-09T12:00:00.000Z'
const FIVE_RESET = '2026-11-05T17:00:00.000Z'

function read(at: string, week: number, five?: number, extra: Partial<StoredOfficialQuota> = {}): StoredOfficialQuota {
  return {
    provider: 'claude', origin: 'official', accountId: 'work', at,
    windows: [
      { id: 'week', origin: 'official', usedPercent: week, resetsAt: WEEK_RESET },
      ...(five === undefined ? [] : [{ id: '5h', origin: 'official' as const, usedPercent: five, resetsAt: FIVE_RESET }]),
    ],
    ...extra,
  }
}

it('records each published window of the account with the instant of the read and its cycle', () => {
  const { store, usage } = book()
  try {
    usage.putQuota('pp', {
      ...read('2026-11-05T10:00:00.000Z', 70, 12),
      windows: [
        { id: 'week', origin: 'official', usedPercent: 70, resetsAt: WEEK_RESET },
        { id: '5h', origin: 'official', usedPercent: 12, resetsAt: FIVE_RESET },
        { id: 'model_scoped:opus', origin: 'official', usedPercent: 33, resetsAt: WEEK_RESET },
        { id: 'week-extra', origin: 'official', resetsAt: WEEK_RESET },
      ],
    })
    const row = usage.listQuota('pp', 'claude')[0]
    expect(row?.readings).toEqual([
      { at: '2026-11-05T10:00:00.000Z', windowId: 'week', usedPercent: 70, resetsAt: WEEK_RESET },
      { at: '2026-11-05T10:00:00.000Z', windowId: '5h', usedPercent: 12, resetsAt: FIVE_RESET },
    ])
  } finally {
    store.close()
  }
})

it('adds a reading only when it tells something: a new percentage, or a new cycle at the same percentage', () => {
  const { store, usage } = book()
  try {
    usage.putQuota('pp', read('2026-11-05T10:00:00.000Z', 70))
    // The same number read again, the reset clock only jittering by milliseconds: nothing new.
    usage.putQuota('pp', { ...read('2026-11-05T10:05:00.000Z', 70), windows: [{ id: 'week', origin: 'official', usedPercent: 70, resetsAt: '2026-11-09T12:00:00.400Z' }] })
    expect(usage.listQuota('pp', 'claude')[0]?.readings).toHaveLength(1)

    usage.putQuota('pp', read('2026-11-05T11:00:00.000Z', 73))
    // Another cycle (the week reset) at the SAME percentage is a different reading: the calibration must not pair across it.
    usage.putQuota('pp', { ...read('2026-11-12T12:01:00.000Z', 73), windows: [{ id: 'week', origin: 'official', usedPercent: 73, resetsAt: '2026-11-16T12:00:00.000Z' }] })
    expect(usage.listQuota('pp', 'claude')[0]?.readings?.map(row => [row.at, row.usedPercent, row.resetsAt])).toEqual([
      ['2026-11-05T10:00:00.000Z', 70, WEEK_RESET],
      ['2026-11-05T11:00:00.000Z', 73, WEEK_RESET],
      ['2026-11-12T12:01:00.000Z', 73, '2026-11-16T12:00:00.000Z'],
    ])
  } finally {
    store.close()
  }
})

it('keeps the trail through a read that found nothing, per account, and never trusts a trail that arrives with the snapshot', () => {
  const { store, usage } = book()
  try {
    usage.putQuota('pp', read('2026-11-05T10:00:00.000Z', 70, 5))
    usage.putQuota('pp', { provider: 'claude', origin: 'unavailable', windows: [], accountId: 'work', at: '2026-11-05T10:30:00.000Z' })
    expect(usage.listQuota('pp', 'claude')[0]?.readings).toHaveLength(2)

    usage.putQuota('pp', read('2026-11-05T10:40:00.000Z', 71, 5, {
      readings: [{ at: '2020-01-01T00:00:00.000Z', windowId: 'week', usedPercent: 1 }],
    }))
    const work = usage.listQuota('pp', 'claude').find(row => row.accountId === 'work')
    expect(work?.readings?.map(row => row.usedPercent)).toEqual([70, 5, 71])

    usage.putQuota('pp', { ...read('2026-11-05T10:50:00.000Z', 20), accountId: 'home' })
    expect(usage.listQuota('pp', 'claude').find(row => row.accountId === 'home')?.readings?.map(row => row.usedPercent)).toEqual([20])
    expect(usage.listQuota('pp', 'claude').find(row => row.accountId === 'work')?.readings).toHaveLength(3)
  } finally {
    store.close()
  }
})

it('keeps the newest readings up to the cap and drops the oldest', () => {
  const { store, usage } = book()
  try {
    const total = QUOTA_READINGS_CAP + 50
    for (let index = 0; index < total; index += 1) {
      const resetsAt = new Date(Date.UTC(2026, 10, 9, 12) + index * 7 * 24 * 3600 * 1000).toISOString()
      usage.putQuota('pp', {
        provider: 'claude', origin: 'official', accountId: 'work', at: new Date(Date.UTC(2026, 10, 5, 10) + index * 60_000).toISOString(),
        windows: [{ id: 'week', origin: 'official', usedPercent: index % 100, resetsAt }],
      })
    }
    const readings = usage.listQuota('pp', 'claude')[0]?.readings ?? []
    expect(readings).toHaveLength(QUOTA_READINGS_CAP)
    expect(readings[0]?.at).toBe(new Date(Date.UTC(2026, 10, 5, 10) + 50 * 60_000).toISOString())
    expect(readings.at(-1)?.at).toBe(new Date(Date.UTC(2026, 10, 5, 10) + (total - 1) * 60_000).toISOString())
  } finally {
    store.close()
  }
})

it('leaves a snapshot without a usable percentage exactly as it came', () => {
  const next: StoredOfficialQuota = { provider: 'claude', origin: 'unavailable', windows: [{ id: 'week', origin: 'unavailable' }] }
  expect(mergeQuotaReadings(next, undefined, '2026-11-05T10:00:00.000Z')).toBe(next)
  const zero: StoredOfficialQuota = { provider: 'claude', origin: 'official', windows: [{ id: 'week', origin: 'official', usedPercent: 0, resetsAt: WEEK_RESET }] }
  // A real 0% is a reading (the cycle just began); only a MISSING percentage is not.
  expect(mergeQuotaReadings(zero, undefined, '2026-11-05T10:00:00.000Z').readings).toEqual([
    { at: '2026-11-05T10:00:00.000Z', windowId: 'week', usedPercent: 0, resetsAt: WEEK_RESET },
  ])
})
