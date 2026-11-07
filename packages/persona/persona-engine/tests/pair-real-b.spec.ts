/**
 * OPT-8b: the PRE-REGISTERED rule (reports/opt8b-prereg.md), locked in tests BEFORE any real call, so the verdict cannot bend to the data.
 */
import { describe, expect, it } from 'vitest'
import {
  assertPairRealBGuards, buildPairRealBPlan, evaluatePairRealB, MAX_DISPERSION, PAIR_B_CELLS, PAIR_REAL_B_CALL_CAP, PAIR_REAL_B_PLAN_CALLS,
  PARITY_BAND, renderPairRealBReport, type PairBCell, type PairBRow,
} from '../src/bench/pair-real-b.ts'

/** A call that failed for a reason of the CLI: no counters. */
const failedCall = (row: PairBRow): PairBRow => {
  const { inputTokens, ...rest } = row
  void inputTokens
  return { ...rest, failed: true }
}

/** Three calls of a cell with the given totals, answer-only, ready. */
function cell(name: PairBCell, totals: readonly [number, number, number], extra: Partial<PairBRow> = {}): PairBRow[] {
  return totals.map((inputTokens, at) => ({
    cell: name, repeat: at + 1, attempt: 1 as const, inputTokens, outputTokens: 100, envMode: 'answer-only',
    ...(name === 'triage-warm' ? {} : { ready: true }), ...extra,
  }))
}
/** A whole round at the given medians (three equal calls per cell unless said). */
function round(over: Partial<Record<PairBCell, readonly [number, number, number]>> = {}): PairBRow[] {
  const totals: Record<PairBCell, readonly [number, number, number]> = {
    'direct-cold': [10_000, 10_000, 10_000], 'persona-cold': [10_000, 10_000, 10_000],
    'direct-warm': [10_000, 10_000, 10_000], 'persona-warm': [10_000, 10_000, 10_000], 'triage-warm': [3_000, 3_000, 3_000], ...over,
  }
  return PAIR_B_CELLS.flatMap(name => cell(name, totals[name]))
}

describe('the plan: 15 calls, ceiling 40, no persona_lean', () => {
  const plan = buildPairRealBPlan()
  it('is 3 repeats of the cold pair and the warm trio: 12 + 3 = 15 planned', () => {
    expect(plan.calls).toHaveLength(PAIR_REAL_B_PLAN_CALLS)
    expect(PAIR_REAL_B_PLAN_CALLS).toBe(15)
    for (const name of PAIR_B_CELLS) expect(plan.calls.filter(call => call.cell === name).map(call => call.repeat)).toEqual([1, 2, 3])
    expect(plan.calls.map(call => call.cell)).not.toContain('persona_lean' as never)
    expect(plan.cap).toBe(PAIR_REAL_B_CALL_CAP)
    expect(plan.cli).toBe('claude')
    expect(plan.model).toBe('haiku')
  })

  it('the direct arm sends the plain text and the Persona arm the prompts the host builds; the prompts are never empty', () => {
    for (const call of plan.calls) expect(call.prompt.length, call.cell).toBeGreaterThan(20)
    const direct = plan.calls.find(call => call.cell === 'direct-cold')?.prompt ?? ''
    const persona = plan.calls.find(call => call.cell === 'persona-cold')?.prompt ?? ''
    expect(direct).toContain('Implemente o filtro de pedidos.')
    expect(persona.length).toBeGreaterThan(direct.length)
  })
})

describe('the guard: 40 for this round only, answer-only, the real lock, the limiter', () => {
  const ok = { PERSONA_PAIR_REAL_B: '1', PERSONA_REAL_E2E: '1', PERSONA_LOCK: 'real', PERSONA_CLI_ENV: 'answer-only', PERSONA_REAL_TURN_CAP: '40', PERSONA_REAL_TURN_LEDGER: 'C:/x/ledger.json' }
  it('accepts 40 (and less) with everything in place', () => {
    expect(assertPairRealBGuards(ok)).toEqual({ cap: 40, ledger: 'C:/x/ledger.json' })
    expect(assertPairRealBGuards({ ...ok, PERSONA_REAL_TURN_CAP: '15' }).cap).toBe(15)
  })
  it('refuses anything missing, and a cap over 40', () => {
    for (const [key, value] of [['PERSONA_PAIR_REAL_B', '0'], ['PERSONA_REAL_E2E', '0'], ['PERSONA_LOCK', 'check'], ['PERSONA_CLI_ENV', 'native'], ['PERSONA_REAL_TURN_CAP', '41'], ['PERSONA_REAL_TURN_CAP', 'abc'], ['PERSONA_REAL_TURN_LEDGER', 'ledger.json']] as const) {
      expect(() => assertPairRealBGuards({ ...ok, [key]: value }), `${key}=${value}`).toThrow()
    }
    expect(() => assertPairRealBGuards({})).toThrow()
  })
})

describe('the verdict, by the pre-registered rule', () => {
  it('parity: both ratios (cold and warm) in [0.90, 1.10], every cell dispersion ≤ 0.50, ready in all 3 of each', () => {
    const result = evaluatePairRealB(round({ 'persona-cold': [10_400, 10_500, 10_600], 'persona-warm': [9_600, 9_500, 9_700] }))
    expect(result.verdict).toBe('parity')
    expect(result.ratios.cold).toBeCloseTo(1.05, 5)
    expect(result.ratios.warm).toBeCloseTo(0.96, 5)
    expect(result.unblocksPairParity).toBe(true)
  })

  it('the band is closed at both ends (0.90 and 1.10 are parity)', () => {
    expect(evaluatePairRealB(round({ 'persona-cold': [11_000, 11_000, 11_000], 'persona-warm': [9_000, 9_000, 9_000] })).verdict).toBe('parity')
    expect(PARITY_BAND).toEqual({ low: 0.9, high: 1.1 })
    expect(MAX_DISPERSION).toBe(0.5)
  })

  it('no parity: both ratios outside the band in the SAME direction (more)', () => {
    const result = evaluatePairRealB(round({ 'persona-cold': [13_000, 13_000, 13_000], 'persona-warm': [12_000, 12_000, 12_000] }))
    expect(result.verdict).toBe('no-parity')
    expect(result.reasons[0]).toContain('MAIS')
    expect(result.unblocksPairParity).toBe(false)
  })

  it('no parity: both outside in the same direction (less)', () => {
    const result = evaluatePairRealB(round({ 'persona-cold': [7_000, 7_000, 7_000], 'persona-warm': [8_000, 8_000, 8_000] }))
    expect(result.verdict).toBe('no-parity')
    expect(result.reasons[0]).toContain('MENOS')
  })

  it('NOT measurable when one ratio is inside and the other outside (neither parity nor difference is declared)', () => {
    const result = evaluatePairRealB(round({ 'persona-cold': [10_000, 10_000, 10_000], 'persona-warm': [13_000, 13_000, 13_000] }))
    expect(result.verdict).toBe('not-measurable')
    expect(result.reasons[0]).toContain('lados diferentes')
  })

  it('NOT measurable when the ratios are outside in OPPOSITE directions (Addendum 2)', () => {
    expect(evaluatePairRealB(round({ 'persona-cold': [13_000, 13_000, 13_000], 'persona-warm': [7_000, 7_000, 7_000] })).verdict).toBe('not-measurable')
  })

  it('NOT measurable when ANY primary cell has dispersion above 0.50, even if the ratios look like parity', () => {
    // direct-cold: min 6,000 max 12,000 median 10,000 → dispersion 0.6
    const result = evaluatePairRealB(round({ 'direct-cold': [6_000, 10_000, 12_000] }))
    expect(result.cells['direct-cold'].dispersion).toBeCloseTo(0.6, 5)
    expect(result.verdict).toBe('not-measurable')
    expect(result.reasons[0]).toContain('histórico real de turnos')
    // exactly 0.50 is allowed: min 7,500 max 12,500 median 10,000
    expect(evaluatePairRealB(round({ 'direct-cold': [7_500, 10_000, 12_500] })).verdict).toBe('parity')
  })

  it('the triage cell does not decide anything (it is the value of a saved call, not part of the ratio)', () => {
    expect(evaluatePairRealB(round({ 'triage-warm': [1, 50_000, 90_000] })).verdict).toBe('parity')
  })

  it('NOT parity (not measurable) when the ratios say "same" but the ready criterion failed somewhere (Addendum 2)', () => {
    const rows = round().map(row => (row.cell === 'persona-warm' && row.repeat === 2 ? { ...row, ready: false } : row))
    const result = evaluatePairRealB(rows)
    expect(result.verdict).toBe('not-measurable')
    expect(result.cells['persona-warm'].readyAll).toBe(false)
    expect(result.unblocksPairParity).toBe(false)
  })

  it('uses the MEDIAN of the three, not the mean: one wild call does not move it', () => {
    const result = evaluatePairRealB(round({ 'persona-cold': [10_000, 10_500, 30_000] }))
    expect(result.cells['persona-cold'].median).toBe(10_500)
    // ... but its dispersion (20,000 / 10,500) is far above 0.5, so it is not measurable
    expect(result.verdict).toBe('not-measurable')
  })
})

describe('validity (Addendum 1): all calls in the SAME effective mode, answer-only', () => {
  it('a call that fell back to native makes the round INVALID for the verdict (observation only)', () => {
    const rows = round().map(row => (row.cell === 'direct-warm' && row.repeat === 3 ? { ...row, envMode: 'native', envModeRequested: 'answer-only' } : row))
    const result = evaluatePairRealB(rows)
    expect(result.verdict).toBe('invalid')
    expect(result.modes).toEqual(['answer-only', 'native'])
    expect(result.unblocksPairParity).toBe(false)
  })

  it('a call with no reported mode is not answer-only: invalid', () => {
    const rows = round().map(row => (row.cell === 'triage-warm' && row.repeat === 1 ? { ...row, envMode: undefined } : row)) as PairBRow[]
    expect(evaluatePairRealB(rows).verdict).toBe('invalid')
  })

  it('more than 40 calls (counting every attempt) is invalid', () => {
    const extra: PairBRow[] = Array.from({ length: 26 }, () => ({ cell: 'triage-warm' as const, repeat: 1, attempt: 2 as const, failed: true, envMode: 'answer-only' }))
    const result = evaluatePairRealB([...round(), ...extra])
    expect(result.callsMade).toBe(41)
    expect(result.withinCeiling).toBe(false)
    expect(result.verdict).toBe('invalid')
  })
})

describe('a CLI failure is replaced ONCE and both stay in the raw', () => {
  it('the replacement takes the place of the failed call; the failed one still counts against the ceiling', () => {
    const rows = round().flatMap(row => (row.cell === 'persona-cold' && row.repeat === 2
      ? [failedCall(row), { ...row, attempt: 2 as const }]
      : [row]))
    const result = evaluatePairRealB(rows)
    expect(result.callsMade).toBe(16)
    expect(result.cells['persona-cold'].n).toBe(3)
    expect(result.verdict).toBe('parity')
  })

  it('a cell with fewer than 3 usable calls is NOT measurable (never filled in)', () => {
    const rows = round().map(row => (row.cell === 'direct-cold' && row.repeat === 3 ? failedCall(row) : row))
    const result = evaluatePairRealB(rows)
    expect(result.cells['direct-cold'].n).toBe(2)
    expect(result.verdict).toBe('not-measurable')
    expect(result.reasons[0]).toContain('direct-cold')
  })

  it('an empty round never throws and is not measurable', () => {
    expect(evaluatePairRealB([]).verdict).toBe('invalid')
    expect(() => renderPairRealBReport(evaluatePairRealB([]))).not.toThrow()
  })
})

describe('the report', () => {
  it('says the verdict, the two ratios, each cell and what happens to pair-parity of the D-068 scoreboard', () => {
    const text = renderPairRealBReport(evaluatePairRealB(round({ 'persona-cold': [10_400, 10_500, 10_600] })))
    expect(text).toContain('**Veredito: HÁ PARIDADE.**')
    expect(text).toContain('| persona-cold | 3 | 10.500 |')
    expect(text).toContain('fria 1,05')
    expect(text).toContain('sai de `blocked`')
    const blocked = renderPairRealBReport(evaluatePairRealB(round({ 'persona-cold': [13_000, 13_000, 13_000], 'persona-warm': [13_000, 13_000, 13_000] })))
    expect(blocked).toContain('NÃO HÁ PARIDADE')
    expect(blocked).toContain('continua `blocked`')
  })
})
