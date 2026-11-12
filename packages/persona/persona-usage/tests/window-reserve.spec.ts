import { describe, expect, it } from 'vitest'
import {
  WINDOW_RESERVE_PERCENT,
  backgroundWorkAllowed,
  ownerAnswerAllowed,
  reserveWindowLabel,
  windowReserveOf,
  type ReserveQuotaRow,
} from '../src/index.ts'

const NOW = Date.parse('2026-11-11T18:00:00.000Z')
const LATER = '2026-11-11T20:00:00.000Z'

function quota(partial: Partial<ReserveQuotaRow> = {}): ReserveQuotaRow {
  return {
    provider: 'claude',
    origin: 'official',
    windows: [{ id: '5h', origin: 'official', usedPercent: 40, resetsAt: LATER }],
    ...partial,
  }
}

describe('harvest 10: the last 5% of the window', () => {
  it('keeps the whole team running below 95% and never invents a percentage', () => {
    expect(WINDOW_RESERVE_PERCENT).toBe(95)
    expect(windowReserveOf([quota()], NOW)).toBeUndefined()
    expect(windowReserveOf([quota({ windows: [{ id: '5h', origin: 'official', usedPercent: 94.9, resetsAt: LATER }] })], NOW)).toBeUndefined()
    expect(windowReserveOf([quota({ windows: [{ id: '5h', origin: 'official' }] })], NOW)).toBeUndefined()
    expect(windowReserveOf([], NOW)).toBeUndefined()
  })

  it('reserves the last 5% at 95% and stops everything at 100%', () => {
    const reserve = windowReserveOf([quota({ windows: [{ id: '5h', origin: 'official', usedPercent: 95, resetsAt: LATER }] })], NOW)
    expect(reserve).toMatchObject({ state: 'reserve', windowId: '5h', usedPercent: 95, resetsAt: LATER })
    expect(backgroundWorkAllowed(reserve)).toBe(false)
    expect(ownerAnswerAllowed(reserve)).toBe(true)

    const exhausted = windowReserveOf([quota({ windows: [{ id: 'week', origin: 'official', usedPercent: 100, resetsAt: LATER }] })], NOW)
    expect(exhausted).toMatchObject({ state: 'exhausted', windowId: 'week', usedPercent: 100 })
    expect(backgroundWorkAllowed(exhausted)).toBe(false)
    expect(ownerAnswerAllowed(exhausted)).toBe(false)
    expect(backgroundWorkAllowed(undefined)).toBe(true)
    expect(ownerAnswerAllowed(undefined)).toBe(true)
  })

  it('ignores a window that already renewed and figures that are not official', () => {
    expect(windowReserveOf([quota({ windows: [{ id: '5h', origin: 'official', usedPercent: 99, resetsAt: '2026-11-11T17:59:00.000Z' }] })], NOW)).toBeUndefined()
    expect(windowReserveOf([quota({ origin: 'estimate' })], NOW)).toBeUndefined()
    expect(windowReserveOf([quota({ windows: [{ id: '5h', origin: 'estimate', usedPercent: 99, resetsAt: LATER }] })], NOW)).toBeUndefined()
  })

  it('picks the most used window and keeps the account that published it', () => {
    const reserve = windowReserveOf([
      quota({ accountId: 'work', windows: [{ id: '5h', origin: 'official', usedPercent: 96, resetsAt: LATER }] }),
      quota({ accountId: 'personal', windows: [{ id: 'week', origin: 'official', usedPercent: 98, resetsAt: LATER }] }),
    ], NOW)
    expect(reserve).toMatchObject({ state: 'reserve', accountId: 'personal', windowId: 'week', usedPercent: 98 })
  })

  it('names the window in the one line the owner reads', () => {
    expect(reserveWindowLabel({ state: 'reserve', provider: 'claude', windowId: '5h', usedPercent: 96 })).toBe('5 h')
    expect(reserveWindowLabel({ state: 'reserve', provider: 'claude', windowId: 'week', usedPercent: 96 })).toBe('semanal')
    expect(reserveWindowLabel({ state: 'reserve', provider: 'claude', windowId: 'primary', usedPercent: 96 })).toBe('da assinatura')
  })
})
