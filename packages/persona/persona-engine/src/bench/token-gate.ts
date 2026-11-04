/**
 * OPT-2 local gate: compare the faithful scenarios with the frozen baseline.
 * A scenario fails when tokens or cost rise > 10 % without a recorded quality
 * gain (≥ 0.15), when delivery quality drops, or when an idle scenario spends.
 */

import {
  ENGINE_REPORTS_CACHE,
  FAITHFUL_SCENARIO_IDS,
  LEVERS_LEGACY,
  LEVERS_OPTIMIZED,
  runFaithfulScenario,
  type FaithfulEngine,
  type FaithfulReport,
  type FaithfulScenarioId,
} from './token-faithful.ts'

/** Regression threshold shared with TOKEN-OPTIMIZATION §3. */
export const FAITHFUL_REGRESSION_RATIO = 0.10
/** Quality lift that excuses a spend increase. */
export const FAITHFUL_QUALITY_GAIN = 0.15
/** Quality loss tolerated before the gate fails (rounding only). */
export const FAITHFUL_QUALITY_SLACK = 0.01

export interface FaithfulBaselineRow {
  readonly id: FaithfulScenarioId
  readonly tokens: number
  readonly freshTokens: number
  readonly costMicroUsd: number
  readonly calls: number
  readonly cacheHitRate: number
  readonly prefixHitRate: number
  readonly quality: number
}

export interface FaithfulBaseline {
  readonly version: 1
  readonly origin: 'estimate'
  readonly note: string
  /** What the optimized configuration spends. The gate compares against this. */
  readonly optimized: readonly FaithfulBaselineRow[]
  /** What the same scenarios spend with every lever off (the "before"). */
  readonly legacy: readonly FaithfulBaselineRow[]
}

export interface FaithfulGateFinding {
  readonly id: FaithfulScenarioId
  readonly reason: 'tokens' | 'cost' | 'quality' | 'idle' | 'calls'
  readonly detail: string
}

function round(value: number): number {
  return Math.round(value * 1000) / 1000
}

function rowOf(report: FaithfulReport): FaithfulBaselineRow {
  return {
    id: report.id,
    tokens: report.totalTokens,
    freshTokens: report.freshTokens,
    costMicroUsd: report.costMicroUsd,
    calls: report.calls,
    cacheHitRate: round(report.cacheHitRate),
    prefixHitRate: round(report.prefixHitRate),
    quality: round(report.quality.score),
  }
}

/**
 * Fresh numbers for every faithful scenario.
 * @returns Optimized and legacy rows, ready to freeze as the baseline.
 */
export function faithfulSnapshot(): FaithfulBaseline {
  return {
    version: 1,
    origin: 'estimate',
    note: 'Faithful scripted runner (persona-engine bench/token-faithful). Counts come from the real prompt composers over Padaria Lua fixtures; provider cache = longest common prefix; real CLI runs stay opt-in.',
    optimized: FAITHFUL_SCENARIO_IDS.map(id => rowOf(runFaithfulScenario(id, LEVERS_OPTIMIZED))),
    legacy: FAITHFUL_SCENARIO_IDS.map(id => rowOf(runFaithfulScenario(id, LEVERS_LEGACY))),
  }
}

function rise(base: number, now: number): number {
  if (base === 0) return now > 0 ? Number.POSITIVE_INFINITY : 0
  return (now - base) / base
}

/**
 * Compare measured rows with a frozen baseline.
 * @param baseline - Frozen optimized rows.
 * @param measured - Current optimized rows.
 * @param qualityGain - Recorded quality lift per scenario (excuses a spend increase).
 * @returns Findings; empty means the gate passes.
 */
export function compareFaithfulRows(
  baseline: readonly FaithfulBaselineRow[],
  measured: readonly FaithfulBaselineRow[],
  qualityGain: Readonly<Partial<Record<FaithfulScenarioId, number>>> = {},
): FaithfulGateFinding[] {
  const findings: FaithfulGateFinding[] = []
  for (const base of baseline) {
    const now = measured.find(row => row.id === base.id)
    if (now === undefined) {
      findings.push({ id: base.id, reason: 'calls', detail: 'scenario missing from the measured set' })
      continue
    }
    if (base.tokens === 0) {
      if (now.tokens > 0 || now.calls > 0) {
        findings.push({ id: base.id, reason: 'idle', detail: `idle scenario spent ${String(now.tokens)} tokens in ${String(now.calls)} calls` })
      }
      continue
    }
    const excused = (qualityGain[base.id] ?? now.quality - base.quality) >= FAITHFUL_QUALITY_GAIN
    const tokenRise = rise(base.tokens, now.tokens)
    const costRise = rise(base.costMicroUsd, now.costMicroUsd)
    if (tokenRise > FAITHFUL_REGRESSION_RATIO && !excused) {
      findings.push({ id: base.id, reason: 'tokens', detail: `${String(now.tokens)} > ${String(base.tokens)} (+${(tokenRise * 100).toFixed(1)}%)` })
    }
    if (costRise > FAITHFUL_REGRESSION_RATIO && !excused) {
      findings.push({ id: base.id, reason: 'cost', detail: `${String(now.costMicroUsd)} > ${String(base.costMicroUsd)} micro-USD (+${(costRise * 100).toFixed(1)}%)` })
    }
    if (now.quality < base.quality - FAITHFUL_QUALITY_SLACK) {
      findings.push({ id: base.id, reason: 'quality', detail: `quality ${String(now.quality)} < ${String(base.quality)}: fewer tokens may not cost delivery` })
    }
    if (now.calls > base.calls && tokenRise > 0) {
      findings.push({ id: base.id, reason: 'calls', detail: `${String(now.calls)} model calls > ${String(base.calls)}` })
    }
  }
  return findings
}

/**
 * Gate against a frozen baseline.
 * @param baseline - Parsed `persona-spec/baselines/token-faithful.json`.
 * @param current - Fresh snapshot (default: run now).
 * @returns Findings; empty means pass.
 */
export function gateFaithful(
  baseline: FaithfulBaseline,
  current: FaithfulBaseline = faithfulSnapshot(),
): FaithfulGateFinding[] {
  return compareFaithfulRows(baseline.optimized, current.optimized)
}

function pct(before: number, after: number): string {
  return before === 0 ? '—' : `${String(Math.round((after - before) / before * 100))}%`
}

/**
 * Markdown table for `persona-spec/reports/tokens-faithful.md`.
 * @param snapshot - Fresh snapshot.
 */
export function formatFaithfulTable(snapshot: FaithfulBaseline): string {
  const lines = [
    '| cenário | antes: tokens / custo µUSD / chamadas | depois: tokens / custo µUSD / chamadas | Δ tokens | Δ custo | cache prefixo | qualidade |',
    '|---|---|---|---:|---:|---:|---:|',
  ]
  for (const after of snapshot.optimized) {
    const before = snapshot.legacy.find(row => row.id === after.id)
    if (before === undefined) continue
    lines.push(`| ${after.id} | ${String(before.tokens)} / ${String(before.costMicroUsd)} / ${String(before.calls)} | ${String(after.tokens)} / ${String(after.costMicroUsd)} / ${String(after.calls)} | ${pct(before.tokens, after.tokens)} | ${pct(before.costMicroUsd, after.costMicroUsd)} | ${after.prefixHitRate.toFixed(2)} | ${before.quality.toFixed(2)} → ${after.quality.toFixed(2)} |`)
  }
  return lines.join('\n')
}

export interface EngineCacheRow {
  readonly engine: FaithfulEngine
  /** False when the adapter does not read cache from the vendor: the rate is "n/d", never 0 %. */
  readonly reported: boolean
  readonly legacyPrefixHit: number
  readonly optimizedPrefixHit: number
}

/**
 * Prefix cache hit per engine on the day scenario (OPT-3 target ≥ 60 % where the engine reports).
 * @returns One row per engine in {@link ENGINE_REPORTS_CACHE}.
 */
export function engineCacheTable(): EngineCacheRow[] {
  return (Object.keys(ENGINE_REPORTS_CACHE) as FaithfulEngine[]).map((engine) => {
    const legacy = runFaithfulScenario('dia-padaria', LEVERS_LEGACY, { engine })
    const optimized = runFaithfulScenario('dia-padaria', LEVERS_OPTIMIZED, { engine })
    return {
      engine,
      reported: optimized.cacheReported,
      legacyPrefixHit: round(legacy.prefixHitRate),
      optimizedPrefixHit: round(optimized.prefixHitRate),
    }
  })
}

/**
 * Markdown table of {@link engineCacheTable}.
 * @param rows - Rows from {@link engineCacheTable}.
 */
export function formatEngineCacheTable(rows: readonly EngineCacheRow[]): string {
  return [
    '| motor | reporta cache | prefixo em cache (antes) | prefixo em cache (depois) | meta ≥ 60% |',
    '|---|---|---:|---:|---|',
    ...rows.map(row => row.reported
      ? `| ${row.engine} | sim | ${row.legacyPrefixHit.toFixed(2)} | ${row.optimizedPrefixHit.toFixed(2)} | ${row.optimizedPrefixHit >= 0.6 ? 'passou' : 'falhou'} |`
      : `| ${row.engine} | não (adapter não lê cache do vendor) | n/d | n/d | n/d — ausência ≠ 0% |`),
  ].join('\n')
}
