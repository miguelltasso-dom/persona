/**
 * USD-1 / D-092: the host side of the account of an ask. The type of account comes from the engine and its environment; the windows come from the
 * official quota; and — once the store keeps the trail of readings (`readings`, Rivet) — the share of the window one ask uses is CALIBRATED on this
 * account: pairs of readings of one window cycle, with the tokens the ledger measured between them.
 */
import { EMPTY_LAYERS, type TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { quotaImpact } from '@deepseek-ai/dsh-persona-engine'
import { SqliteUsageStore, openPersonaStore, type StoredOfficialQuota } from '@deepseek-ai/dsh-persona-store'
import { describe, expect, it } from 'vitest'
import { accountForEstimate, ledgerTokensBetween } from '../src/estimate-account.ts'

const RESETS = '2026-11-07T16:00:00.020Z'
const NO_KEY: NodeJS.ProcessEnv = {}

function turn(at: string, tokens: number, over: Partial<TurnLedgerEntry> = {}): TurnLedgerEntry {
  return {
    id: `t-${at}`, personaId: 'nina', engine: 'claude', kind: 'execution', inputTokens: tokens - 100, outputTokens: 100, cacheReadTokens: 0, cacheWriteTokens: 0,
    layers: EMPTY_LAYERS, at, origin: 'measured', accountId: 'claude:pessoal', ...over,
  }
}

function row(readings: readonly unknown[] | undefined, over: Partial<StoredOfficialQuota> = {}): StoredOfficialQuota {
  return {
    provider: 'claude', origin: 'official', detail: 'max', accountId: 'claude:pessoal',
    windows: [{ id: 'week', origin: 'official', usedPercent: 70, resetsAt: RESETS }, { id: 'model_scoped:Fable', origin: 'official', usedPercent: 0 }],
    ...(readings === undefined ? {} : { readings }),
    ...over,
  } as unknown as StoredOfficialQuota
}

const read = (at: string, usedPercent: number, resetsAt = RESETS) => ({ at, windowId: 'week', usedPercent, resetsAt })

/** Four readings of one cycle that rose 4, 5, 6 points, with 400k, 450k and 540k Persona tokens between them: 100k, 90k, 90k tokens per point. */
const TRAIL = [read('2026-11-05T01:00:00.000Z', 50), read('2026-11-05T03:00:00.000Z', 54), read('2026-11-05T06:00:00.000Z', 59), read('2026-11-05T09:00:00.000Z', 65)]
const LEDGER = [
  turn('2026-11-05T02:00:00.000Z', 400_000), turn('2026-11-05T04:00:00.000Z', 450_000), turn('2026-11-05T07:00:00.000Z', 540_000),
]
const BASE = { cli: 'claude', loggedCli: 'claude', env: NO_KEY, accountId: 'claude:pessoal' }

describe('ledgerTokensBetween: what the Persona spent on THIS engine and account between two readings', () => {
  const between = ledgerTokensBetween(LEDGER, { engine: 'claude', accountId: 'claude:pessoal' })
  it('counts the measured rows in (from, to]: total input + output', () => {
    expect(between('2026-11-05T01:00:00.000Z', '2026-11-05T03:00:00.000Z')).toBe(400_000)
    expect(between('2026-11-05T02:00:00.000Z', '2026-11-05T04:00:00.000Z')).toBe(450_000)
    expect(between('2026-11-05T04:00:00.000Z', '2026-11-05T04:30:00.000Z')).toBe(0)
  })
  it('ignores an estimated row, another engine and another account', () => {
    const noisy = [...LEDGER, turn('2026-11-05T02:30:00.000Z', 999_999, { origin: 'estimate' }), turn('2026-11-05T02:40:00.000Z', 999_999, { engine: 'codex' }), turn('2026-11-05T02:50:00.000Z', 999_999, { accountId: 'claude:trabalho' })]
    expect(ledgerTokensBetween(noisy, { engine: 'claude', accountId: 'claude:pessoal' })('2026-11-05T01:00:00.000Z', '2026-11-05T03:00:00.000Z')).toBe(400_000)
  })
  it('the input is the TOTAL: a row whose cache is a PART of it is never counted twice', () => {
    const total = [turn('2026-11-05T02:00:00.000Z', 1000, { inputTokens: 900, cacheReadTokens: 600, cacheWriteTokens: 200, outputTokens: 100 })]
    expect(ledgerTokensBetween(total, { engine: 'claude', accountId: 'claude:pessoal' })('2026-11-05T01:00:00.000Z', '2026-11-05T03:00:00.000Z')).toBe(1000)
  })
  it('a row whose input is below its own cache books the uncached input alone: the cache is added (the guard)', () => {
    const cached = [turn('2026-11-05T02:00:00.000Z', 1000, { inputTokens: 100, cacheReadTokens: 600, cacheWriteTokens: 200, outputTokens: 100 })]
    expect(ledgerTokensBetween(cached, { engine: 'claude', accountId: 'claude:pessoal' })('2026-11-05T01:00:00.000Z', '2026-11-05T03:00:00.000Z')).toBe(1000)
  })
})

describe('accountForEstimate: the windows and, with the trail, the calibration', () => {
  it('today\'s store (no trail of readings): the window is there, the calibration is not ("cota não medida")', () => {
    const conta = accountForEstimate({ ...BASE, quotas: [row(undefined)], ledger: LEDGER })
    expect(conta).toMatchObject({ billing: 'subscription', janelas: [{ id: 'week', usedPercent: 70 }] })
    expect(conta.calibracoes).toBeUndefined()
    expect(quotaImpact({ windows: conta.janelas ?? [], tokens: { min: 1000, max: 2000 } })?.pct).toBeNull()
  })

  it('with the trail and the ledger the week is calibrated: the share of the window an ask uses is a range, from the cautious side', () => {
    const conta = accountForEstimate({ ...BASE, quotas: [row(TRAIL)], ledger: LEDGER })
    expect(conta.calibracoes).toEqual([{ window: 'week', tokensPerPoint: { min: 90_000, max: 100_000 }, rows: 3 }])
    const impact = quotaImpact({ windows: conta.janelas ?? [], ...(conta.calibracoes === undefined ? {} : { calibrations: conta.calibracoes }), tokens: { min: 9_000, max: 90_000 } })
    expect(impact).toMatchObject({ window: 'week', origin: 'calibrated', usedPct: 70 })
    expect(impact?.pct).toEqual({ min: 0, max: 1 })
    expect(impact?.basis).toMatch(/3 leituras da sua conta/u)
  })

  it('a trail without enough usable pairs does not calibrate; a trail with no ledger behind it does not either', () => {
    expect(accountForEstimate({ ...BASE, quotas: [row(TRAIL.slice(0, 3))], ledger: LEDGER }).calibracoes).toBeUndefined()
    expect(accountForEstimate({ ...BASE, quotas: [row(TRAIL)] }).calibracoes).toBeUndefined()
    expect(accountForEstimate({ ...BASE, quotas: [row(TRAIL)], ledger: [] }).calibracoes).toBeUndefined()
  })

  it('a ledger of ANOTHER account does not calibrate this one', () => {
    const other = LEDGER.map(entry => ({ ...entry, accountId: 'claude:trabalho' }))
    expect(accountForEstimate({ ...BASE, quotas: [row(TRAIL)], ledger: other }).calibracoes).toBeUndefined()
  })

  it('readings of two cycles are never paired (the clock is allowed to differ by milliseconds, not by a refill)', () => {
    const NEXT = '2026-11-14T16:00:00.000Z'
    const mixed = [read('2026-11-05T01:00:00.000Z', 50), read('2026-11-05T03:00:00.000Z', 54, '2026-11-07T16:00:00.071Z'), read('2026-11-12T01:00:00.000Z', 3, NEXT), read('2026-11-12T03:00:00.000Z', 8, NEXT)]
    const ledger = [turn('2026-11-05T02:00:00.000Z', 400_000), turn('2026-11-12T02:00:00.000Z', 100_000)]
    // one pair in each cycle only: two pairs are not enough
    expect(accountForEstimate({ ...BASE, quotas: [row(mixed)], ledger }).calibracoes).toBeUndefined()
  })

  it('garbage in the trail is ignored, never thrown at', () => {
    const dirty = [null, 7, 'x', { at: 1 }, { at: 'x', windowId: 'week', usedPercent: 'many' }, ...TRAIL]
    expect(accountForEstimate({ ...BASE, quotas: [row(dirty)], ledger: LEDGER }).calibracoes).toHaveLength(1)
  })

  it('an API account has no window and no calibration, whatever the store holds', () => {
    const conta = accountForEstimate({ ...BASE, env: { ANTHROPIC_API_KEY: 'sk-ant-x' }, quotas: [row(TRAIL)], ledger: LEDGER })
    expect(conta).toEqual({ billing: 'api' })
  })
})

describe('end to end with the REAL store: the trail the store keeps is the one the calibration reads (Rivet, 05/11)', () => {
  /** The four reads of TRAIL arriving the way the vendor's meter does, through `putQuota`: the store builds the trail itself (a snapshot never carries it). */
  function readsThroughTheStore(): StoredOfficialQuota[] {
    const store = openPersonaStore({ path: ':memory:' })
    try {
      const usage = new SqliteUsageStore(store)
      for (const point of TRAIL) {
        usage.putQuota('pp', {
          provider: 'claude', origin: 'official', detail: 'max', accountId: 'claude:pessoal', at: point.at,
          windows: [{ id: 'week', origin: 'official', usedPercent: point.usedPercent, resetsAt: point.resetsAt }, { id: 'model_scoped:Fable', origin: 'official', usedPercent: 0 }],
        })
      }
      return usage.listQuota('pp', 'claude')
    } finally {
      store.close()
    }
  }

  it('four official reads through putQuota + the ledger the host measured = the week is calibrated on this account, with no help from a test double', () => {
    const rows = readsThroughTheStore()
    expect(rows).toHaveLength(1)
    // the model-scoped window never enters the trail (Rivet), and the trail is the account's own
    expect((rows[0]?.readings ?? []).map(item => item.windowId)).toEqual(['week', 'week', 'week', 'week'])
    const conta = accountForEstimate({ ...BASE, quotas: rows, ledger: LEDGER })
    expect(conta.calibracoes).toEqual([{ window: 'week', tokensPerPoint: { min: 90_000, max: 100_000 }, rows: 3 }])
    const impact = quotaImpact({ windows: conta.janelas ?? [], ...(conta.calibracoes === undefined ? {} : { calibrations: conta.calibracoes }), tokens: { min: 9_000, max: 90_000 } })
    expect(impact).toMatchObject({ window: 'week', origin: 'calibrated', usedPct: 65 })
  })

  it('the same read arriving twice, or one read only, does not manufacture a calibration', () => {
    const store = openPersonaStore({ path: ':memory:' })
    try {
      const usage = new SqliteUsageStore(store)
      const one = (at: string) => usage.putQuota('pp', { provider: 'claude', origin: 'official', accountId: 'claude:pessoal', at, windows: [{ id: 'week', origin: 'official', usedPercent: 50, resetsAt: RESETS }] })
      one('2026-11-05T01:00:00.000Z')
      one('2026-11-05T02:00:00.000Z')
      const conta = accountForEstimate({ ...BASE, quotas: usage.listQuota('pp', 'claude'), ledger: LEDGER })
      expect(conta.calibracoes).toBeUndefined()
      expect(quotaImpact({ windows: conta.janelas ?? [], tokens: { min: 1000, max: 2000 } })?.pct).toBeNull()
    } finally {
      store.close()
    }
  })
})
