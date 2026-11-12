/**
 * TEAM-10 attempt 6 (Atlas `atlas-ok-team10-6.txt`, 12/11): the watchdog of the REAL round also stops the host at 200 mil RAW input (cache included) and when the ledger is not measuring per
 * turn. RED side: the REAL numbers of attempt 5 (12 turns, 469 mil raw: it would have been cut at the 5th turn). GREEN side: a round inside the goal (< 120 mil) and the old
 * price-weighted limits, unchanged.
 */
import { describe, expect, it } from 'vitest'
import type { LedgerEvidence, LedgerRow } from '../src/ledger-evidence.ts'
import { ledgerGuard } from '../src/team-round-guard.ts'

const row = (input: number, overrides: Partial<LedgerRow> = {}): LedgerRow => ({ kind: 'execution', engine: 'claude', origin: 'measured', inputTokens: input, outputTokens: 500, cacheReadTokens: Math.round(input * 0.8), cacheWriteTokens: Math.round(input * 0.15), ticketId: null, at: '2026-11-12T04:00:00.000Z', envMode: 'needed', ...overrides })
function ledgerOf(rows: LedgerRow[]): LedgerEvidence {
  const sum = (pick: (item: LedgerRow) => number): number => rows.reduce((total, item) => total + pick(item), 0)
  return { dbPath: 'x', rows, rawRows: [], turns: rows.length, inputTokens: sum(item => item.inputTokens), outputTokens: sum(item => item.outputTokens), cacheReadTokens: sum(item => item.cacheReadTokens), cacheWriteTokens: sum(item => item.cacheWriteTokens), allMeasured: rows.every(item => item.origin === 'measured') }
}
const attempt6 = { requireEnvMode: true, rawRoundAbort: 200_000, requireMeasured: true } as const

// the 12 turns of the real attempt 5 (`artifacts/team10/real-attempt-5-*`, ledger of the transcript): entrada bruta por turno
const ATTEMPT_5 = [37_051, 7_386, 7_382, 5_191, 85_345, 10_908, 6_148, 112_100, 21_192, 40_938, 82_063, 53_775]

describe('attempt 6 watchdog: 200 mil RAW input and a ledger that measures per turn', () => {
  it('a round inside the goal (< 120 mil raw, 4 turns) is left alone', () => {
    expect(ledgerGuard(ledgerOf([row(20_000), row(30_000), row(25_000), row(18_000)]), 8, attempt6)).toBeUndefined()
  })

  it('the REAL attempt 5 would have been cut as soon as its raw input passed 200 mil (the 8th turn, 112 mil heavy by itself is caught earlier by the price-weighted rule or here)', () => {
    let cut: number | undefined
    for (let turns = 1; turns <= ATTEMPT_5.length; turns += 1) {
      const reason = ledgerGuard(ledgerOf(ATTEMPT_5.slice(0, turns).map(input => row(input, { cacheReadTokens: 0, cacheWriteTokens: 0 }))), 12, { ...attempt6, requireEnvMode: false })
      if (reason !== undefined) { cut = turns; expect(reason).toMatch(/RAW input tokens|weighed|price-weighted/u); break }
    }
    expect(cut, 'attempt 5 (469 mil raw) must be cut before its last turn').toBeDefined()
    expect(cut!).toBeLessThan(ATTEMPT_5.length)
  })

  it('stops at exactly the line: 200 000 raw is allowed, 200 001 is not, and the reason says RAW and cache included', () => {
    const at = (total: number): LedgerEvidence => ledgerOf([row(total / 4), row(total / 4), row(total / 4), row(total / 4)].map(item => ({ ...item, cacheReadTokens: 0, cacheWriteTokens: 0 })))
    expect(ledgerGuard(at(200_000), 8, { rawRoundAbort: 200_000 })).toBeUndefined()
    const over = ledgerGuard(ledgerOf([row(50_000), row(50_000), row(50_000), row(50_001)].map(item => ({ ...item, cacheReadTokens: 0, cacheWriteTokens: 0 }))), 8, { rawRoundAbort: 200_000 })
    expect(over).toMatch(/200001 RAW input tokens \(cache included; > 200000\): host killed/u)
  })

  it('an estimate (or no origin) means the ledger is not measuring per turn: the host is stopped', () => {
    expect(ledgerGuard(ledgerOf([row(10_000), row(10_000, { origin: 'estimate' })]), 8, attempt6)).toMatch(/not MEASURED \(origin "estimate"\)/u)
    expect(ledgerGuard(ledgerOf([row(10_000, { origin: null })]), 8, attempt6)).toMatch(/not MEASURED \(origin null\)/u)
    // without the option nothing changes (the rehearsal and the older attempts)
    expect(ledgerGuard(ledgerOf([row(10_000, { origin: 'estimate' })]), 8, { requireEnvMode: false })).toBeUndefined()
  })

  it('the old limits stay: more turns than the cap, a native turn, and the price-weighted heavy turn', () => {
    expect(ledgerGuard(ledgerOf(Array.from({ length: 9 }, () => row(1_000))), 8, attempt6)).toMatch(/above the cap of 8/u)
    expect(ledgerGuard(ledgerOf([row(1_000, { envMode: 'native' })]), 8, attempt6)).toMatch(/NATIVE mode/u)
    expect(ledgerGuard(ledgerOf([row(309_000, { cacheReadTokens: 0, cacheWriteTokens: 309_000 })]), 8, { requireEnvMode: true })).toMatch(/weighed/u)
  })
})
