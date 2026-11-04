import { describe, expect, it } from 'vitest'
import {
  CUT_SCENARIOS,
  allLeversWired,
  cutRows,
  executionOnCheapBound,
  formatOpt8FaithfulMarkdown,
  keepWarmEconomics,
  leverCandidates,
  measureOpt8Faithful,
  opt8MeasuredInputs,
  pairedFaithful,
  ttlSensitivity,
} from '../src/bench/opt8-faithful.ts'
import { LEVERS_AS_WIRED, LEVERS_OPTIMIZED, runFaithfulScenario } from '../src/bench/token-faithful.ts'

describe('OPT-8 on the faithful runner', () => {
  it('orders naive ≥ today ≥ every lever on tokens and cost, with quality held', () => {
    const rows = cutRows()
    expect(rows.map(row => row.scenario)).toEqual([...CUT_SCENARIOS])
    for (const row of rows) {
      // The Persona prompt of a single question carries a few more tokens than a naive one (stable prefix, brevity rule): ≤ 2%.
      expect(row.todayTokens, row.scenario).toBeLessThanOrEqual(row.naiveTokens * 1.02)
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

  it('a 60 minute TTL cannot bring the prefix cache back on the spread day once the triage is gone, and its 2× write is not free', () => {
    const rows = ttlSensitivity()
    const five = rows.find(row => row.scenario === 'dia-espacado' && row.cacheTtlMin === 5)
    const hour = rows.find(row => row.scenario === 'dia-espacado' && row.cacheTtlMin === 60)
    expect(five?.prefixHit).toBe(0)
    // The big shared prefix was the coordination prompt; with skipTriage on the calls left are one persona's own small prefix each.
    expect(hour?.prefixHit ?? 1).toBeGreaterThanOrEqual(five?.prefixHit ?? 0)
    expect(hour?.tokens).toBe(five?.tokens)
    expect(five?.writeFactor).toBe(1.25)
    expect(hour?.writeFactor).toBe(2)
    // On the Persona prompts alone (small prefix, large per-message tail) the 2× write on the tail outweighs the read discount.
    // The 1 h cache pays for the vendor base, which both arms carry (see keepWarmEconomics), not for these prompts.
    expect(hour?.costMicroUsd).toBeGreaterThan(five?.costMicroUsd ?? 0)
  })

  it('the warm session only pays inside its 10 minute window', () => {
    // The warm session only ever served the coordination triage: with the triage skipped it has nothing to keep warm.
    const on = { ...LEVERS_AS_WIRED, skipTriage: false, warmSession: true }
    const off = { ...LEVERS_AS_WIRED, skipTriage: false, warmSession: false }
    expect(runFaithfulScenario('dia-espacado', on).totalTokens).toBe(runFaithfulScenario('dia-espacado', off).totalTokens)
    expect(runFaithfulScenario('dia-padaria', on).totalTokens).toBeLessThan(runFaithfulScenario('dia-padaria', off).totalTokens)
  })

  it('reads the −40% goal on the worse of the two days', () => {
    const result = measureOpt8Faithful()
    expect(result.dayCostCut).toBe(Math.min(result.burstDayCostCut, result.spreadDayCostCut))
    expect(result.cutCost40).toBe(result.dayCostCut >= 0.4)
  })
})

describe('inputs for the D-068 facade', () => {
  it('says plainly that W3 and skipTriage are not wired yet, and that quality held in every bucket', () => {
    const input = opt8MeasuredInputs()
    expect(input.allLeversWired).toBe(false)
    expect(allLeversWired()).toBe(false)
    expect(input.quality).toEqual({ beforeWiring: true, asWired: true, projectionAll: true })
    expect(input.rows.map(row => row.scenario)).toEqual([...CUT_SCENARIOS])
    expect(input.idleZero).toBe(true)
    expect(input.cacheEngines.find(row => row.engine === 'cursor')?.prefixHit).toBeUndefined()
  })

  it('the pieces of the cut come from the SAME rows: before, as wired and projection sums', () => {
    const { rows } = opt8MeasuredInputs()
    const sum = (pick: (row: (typeof rows)[number]) => number): number => rows.reduce((total, row) => total + pick(row), 0)
    expect(sum(row => row.allCost)).toBeLessThanOrEqual(sum(row => row.nowCost))
    expect(sum(row => row.nowCost)).toBeLessThanOrEqual(sum(row => row.todayCost))
    const burst = rows.find(row => row.scenario === 'dia-padaria')
    const spread = rows.find(row => row.scenario === 'dia-espacado')
    // As wired (W1 + W4 on) is already cheaper than before, and the gate reads the worse of the two days.
    expect(burst?.nowCost).toBeLessThan(burst?.todayCost ?? 0)
    expect(spread?.nowCost).toBeLessThan(spread?.todayCost ?? 0)
    expect(burst?.nowTokens).toBeLessThanOrEqual(burst?.todayTokens ?? 0)
  })
})

describe('what is left against the −40% (Atlas queue 2, D-073)', () => {
  it('measures every candidate on the two days against the host before the wirings, quality held', () => {
    const rows = leverCandidates()
    expect(rows.map(row => row.id)).toEqual(['w1-w4', 'skip-triage', 'courtesy-free', 'cache-1h', 'w3'])
    for (const row of rows) expect(row.quality, row.id).toBe(true)
    const byId = (id: string) => rows.find(row => row.id === id)
    const worst = (id: string): number => Math.min(byId(id)?.burstCostCut ?? 0, byId(id)?.spreadCostCut ?? 0)
    // Each wired lever moves the worse day up; the host as wired now (triage skipped, courtesy by reaction) is still short of 40%; W3 on top passes.
    expect(worst('w1-w4')).toBeLessThan(0.4)
    expect(worst('skip-triage')).toBeGreaterThan(worst('w1-w4'))
    expect(worst('courtesy-free')).toBeGreaterThan(worst('skip-triage'))
    expect(worst('courtesy-free')).toBeLessThan(0.4)
    expect(worst('w3')).toBeGreaterThanOrEqual(0.4)
    // skipTriage removes calls (and the tokens they read); W3 only shortens the answer (cost, not tokens).
    expect(byId('skip-triage')?.calls).toBeLessThan(byId('w1-w4')?.calls ?? 0)
    expect(byId('w3')?.calls).toBe(byId('courtesy-free')?.calls)
    expect(byId('skip-triage')?.spreadTokenCut ?? 0).toBeGreaterThan(byId('w1-w4')?.spreadTokenCut ?? 1)
    // The 1 h cache is not a Persona-prompt lever: it is worse than the 5 min cache on these prompts.
    expect(byId('cache-1h')?.spreadCostCut ?? 1).toBeLessThan(byId('courtesy-free')?.spreadCostCut ?? 0)
  })

  it('no candidate may be counted as wired unless it is: the status says who can switch it on', () => {
    const rows = leverCandidates()
    expect(rows.filter(row => row.status === 'wired').map(row => row.id)).toEqual(['w1-w4', 'skip-triage', 'courtesy-free'])
    expect(rows.find(row => row.id === 'cache-1h')?.status).toBe('only-api-key')
    expect(rows.find(row => row.id === 'w3')?.status).toBe('off-until-real-run')
    expect(rows.find(row => row.id === 'courtesy-free')?.owner).toContain('Anvil')
    expect(rows.find(row => row.id === 'skip-triage')?.owner).toContain('Anvil')
  })

  it('the host as wired skips the triage and the bench says so: fewer calls, same quality', () => {
    for (const day of ['dia-padaria', 'dia-espacado'] as const) {
      const wired = runFaithfulScenario(day, LEVERS_AS_WIRED)
      const withTriage = runFaithfulScenario(day, { ...LEVERS_AS_WIRED, skipTriage: false })
      expect(wired.calls).toBeLessThan(withTriage.calls)
      expect(wired.turns.some(turn => turn.entry.kind === 'triage')).toBe(false)
      expect(wired.quality.score).toBe(1)
    }
  })

  it('keeping a cache warm can be cheaper in money and still not be allowed: it adds calls', () => {
    const near = keepWarmEconomics({ prefixTokens: 12_000, gapMin: 30, ttlMin: 5 })
    expect(near.cheaperInMoney).toBe(true)
    expect(near.callsAdded).toBe(5)
    const far = keepWarmEconomics({ prefixTokens: 1000, gapMin: 120, ttlMin: 5 })
    expect(far.cheaperInMoney).toBe(false)
    expect(keepWarmEconomics({ prefixTokens: 1000, gapMin: 3, ttlMin: 5 }).callsAdded).toBe(0)
  })

  it('bounds the smaller-model lever by the share of the day the worker costs', () => {
    for (const day of ['dia-padaria', 'dia-espacado'] as const) {
      const bound = executionOnCheapBound(day)
      expect(bound.executionShare).toBeGreaterThan(0.5)
      // 100% of worker turns on the cheap tier cannot save more than their share of the cost × (1 − 1/3).
      expect(bound.saving).toBeCloseTo(bound.executionShare * (1 - 1 / 3), 6)
    }
  })
})
