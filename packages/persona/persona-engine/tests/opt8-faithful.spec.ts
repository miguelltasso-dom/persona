import { describe, expect, it } from 'vitest'
import {
  CUT_SCENARIOS,
  cutRows,
  formatOpt8FaithfulMarkdown,
  measureOpt8Faithful,
  pairedFaithful,
  ttlSensitivity,
} from '../src/bench/opt8-faithful.ts'
import { LEVERS_AS_WIRED, LEVERS_OPTIMIZED, runFaithfulScenario } from '../src/bench/token-faithful.ts'

describe('OPT-8 on the faithful runner', () => {
  it('orders naive ≥ today ≥ every lever on tokens and cost, with quality held', () => {
    const rows = cutRows()
    expect(rows.map(row => row.scenario)).toEqual([...CUT_SCENARIOS])
    for (const row of rows) {
      expect(row.todayTokens, row.scenario).toBeLessThanOrEqual(row.naiveTokens)
      expect(row.allTokens, row.scenario).toBeLessThanOrEqual(row.todayTokens)
      expect(row.todayCost, row.scenario).toBeLessThanOrEqual(row.naiveCost)
      expect(row.allCost, row.scenario).toBeLessThanOrEqual(row.todayCost)
      expect(runFaithfulScenario(row.scenario).quality.score, row.scenario).toBe(1)
    }
  })

  it('scores idle-zero and the 60% prefix cache, and keeps the −40% split honest', () => {
    const result = measureOpt8Faithful()
    expect(result.idleZero).toBe(true)
    expect(result.cache60).toBe(true)
    expect(result.cacheEngines.filter(row => row.prefixHit === undefined).map(row => row.engine)).toEqual(['opencode', 'cursor'])
    expect(result.cutTokens40).toBe(result.dayTokenCut >= 0.4)
    expect(result.cutCost40).toBe(result.dayCostCut >= 0.4)
    // Tokens are bounded by what the model must read; the saving the levers buy is mostly price (tiering, cache, output).
    expect(result.dayCostCut).toBeGreaterThan(result.dayTokenCut)
  })

  it('pairs the same task with the vendor base as an explicit parameter', () => {
    const bare = pairedFaithful(0)
    const based = pairedFaithful(12_000)
    expect(bare.map(row => row.task)).toEqual(['simple-ask', 'multi-review', 'research-summary'])
    for (const row of bare) expect(row.personaTokens, row.task).toBeGreaterThan(row.cliTokens)
    const single = based.find(row => row.task === 'simple-ask')
    expect(single?.personaCalls).toBe(1)
    expect(Math.abs(single?.tokenDelta ?? 1)).toBeLessThanOrEqual(0.1)
    for (const row of based.filter(item => item.personaCalls > 1)) {
      // Every extra Persona call re-reads the vendor base: tokens grow with calls, not with prompt text.
      expect(row.personaTokens, row.task).toBeGreaterThan(row.cliTokens * row.personaCalls * 0.9)
    }
  })

  it('a warm day costs no more than the first task of the day, with the same calls', () => {
    for (const id of ['multi-review', 'padaria-lua', 'dia-padaria'] as const) {
      const cold = runFaithfulScenario(id, LEVERS_OPTIMIZED)
      const warm = runFaithfulScenario(id, LEVERS_OPTIMIZED, { warm: true })
      expect(warm.calls, id).toBe(cold.calls)
      expect(warm.costMicroUsd, id).toBeLessThanOrEqual(cold.costMicroUsd)
      expect(warm.freshTokens, id).toBeLessThanOrEqual(cold.freshTokens)
    }
  })

  it('writes the report with the numbers it computed and the real-run caveat', () => {
    const text = formatOpt8FaithfulMarkdown()
    expect(text).toContain('# OPT-8')
    expect(text).toContain('PERSONA_PAIR_REAL=1')
    expect(text).toContain('Pareado CLI direta × Persona')
    const result = measureOpt8Faithful()
    expect(text).toContain(`${String(Math.round(result.dayCostCut * 100))}%`)
  })
})

describe('the spread day (cache and session TTL)', () => {
  it('costs more than the burst day and loses the prefix cache at a 5 minute TTL', () => {
    const burst = runFaithfulScenario('dia-padaria', LEVERS_AS_WIRED)
    const spread = runFaithfulScenario('dia-espacado', LEVERS_AS_WIRED)
    expect(spread.calls).toBe(burst.calls)
    expect(spread.costMicroUsd).toBeGreaterThan(burst.costMicroUsd)
    expect(spread.prefixHitRate).toBe(0)
    expect(burst.prefixHitRate).toBeGreaterThanOrEqual(0.6)
    expect(spread.quality.score).toBe(1)
  })

  it('a 60 minute TTL brings the prefix cache back on the spread day', () => {
    const rows = ttlSensitivity()
    const five = rows.find(row => row.scenario === 'dia-espacado' && row.cacheTtlMin === 5)
    const hour = rows.find(row => row.scenario === 'dia-espacado' && row.cacheTtlMin === 60)
    expect(five?.prefixHit).toBe(0)
    expect(hour?.prefixHit).toBeGreaterThanOrEqual(0.6)
    expect(hour?.costMicroUsd).toBeLessThan(five?.costMicroUsd ?? 0)
    expect(hour?.tokens).toBe(five?.tokens)
  })

  it('the warm session only pays inside its 10 minute window', () => {
    const on = { ...LEVERS_AS_WIRED, warmSession: true }
    const off = { ...LEVERS_AS_WIRED, warmSession: false }
    expect(runFaithfulScenario('dia-espacado', on).totalTokens).toBe(runFaithfulScenario('dia-espacado', off).totalTokens)
    expect(runFaithfulScenario('dia-padaria', on).totalTokens).toBeLessThan(runFaithfulScenario('dia-padaria', off).totalTokens)
  })

  it('reads the −40% goal on the worse of the two days', () => {
    const result = measureOpt8Faithful()
    expect(result.dayCostCut).toBe(Math.min(result.burstDayCostCut, result.spreadDayCostCut))
    expect(result.cutCost40).toBe(result.dayCostCut >= 0.4)
  })
})
