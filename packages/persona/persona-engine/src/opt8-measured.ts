/** D-068: estimate-only Remote evidence from one comparable pipeline, without executing a benchmark. */

/** Comparable scenario totals supplied by the faithful pipeline. Costs use micro-USD. */
export interface Opt8MeasuredRow {
  readonly scenario: string
  readonly todayTokens: number
  readonly nowTokens: number
  readonly allTokens: number
  readonly todayCost: number
  readonly nowCost: number
  readonly allCost: number
}
/** Caller-owned pipeline and wiring evidence; no provider measurements are inferred. */
export interface Opt8MeasuredInput {
  readonly rows: readonly Opt8MeasuredRow[]
  readonly idleZero: boolean
  readonly cacheEngines: readonly { readonly engine: string; readonly prefixHit: number | undefined }[]
  readonly allLeversWired: boolean
  readonly quality?: { readonly beforeWiring: boolean; readonly asWired: boolean; readonly projectionAll: boolean }
}
/** Quality remains unavailable unless the pipeline supplies an actual fidelity result. */
export type Opt8QualityStatus = 'passed' | 'failed' | 'unavailable'
/** Totals over the same collection of scenarios, not an invented per-task average. */
export interface Opt8MeasuredBucket {
  readonly tokens: number
  readonly cost: number
  readonly quality: Opt8QualityStatus
}
/** Additive evidence for the existing OPT-8 / v1-close Remote score. */
export interface Opt8MeasuredEvidence {
  readonly origin: 'estimate'
  readonly baseline: 'levers-before-wiring'
  readonly historical: { readonly id: 'historical-134-fixture'; readonly countsForGoal: false }
  readonly beforeWiring: Opt8MeasuredBucket
  readonly asWired: Opt8MeasuredBucket
  readonly projectionAll: Opt8MeasuredBucket & { readonly label: 'projection' }
  readonly scenarios: readonly Opt8MeasuredRow[]
  readonly idleZero: boolean
  readonly cacheEstimate: readonly { readonly engine: string; readonly prefixHit: number | null }[]
  readonly providerCache: { readonly prefixHit: 0; readonly status: 'blocked'; readonly origin: 'unavailable' }
  readonly parity: { readonly status: 'blocked'; readonly reason: 'requires-paired-real-run' }
  readonly cut40: {
    readonly status: 'blocked' | 'passed' | 'failed'
    readonly costCut: number | null
    readonly tokensDelta: number | null
    readonly reason: 'wiring-incomplete' | 'comparison-unavailable' | 'cost-cut-below-40' | 'tokens-increased' | 'quality-regressed' | 'goal-met'
  }
}

function qualityStatus(value: boolean | undefined): Opt8QualityStatus {
  return value === undefined ? 'unavailable' : value ? 'passed' : 'failed'
}

/**
 * Build JSON-safe estimate evidence without starting a runner, reading a ledger or using the historical fixture as a goal.
 * Only the worse actual wired day (burst and spread) can satisfy the cost target; projection never does.
 * @param input - Faithful rows, explicit wiring state and optional fidelity results from that same pipeline.
 * @returns Additive origin/baseline, current totals, labelled projection and an honest goal state.
 */
export function buildOpt8Measured(input: Opt8MeasuredInput): Opt8MeasuredEvidence {
  const bucket = (tokens: 'todayTokens' | 'nowTokens' | 'allTokens', cost: 'todayCost' | 'nowCost' | 'allCost',
    quality: boolean | undefined): Opt8MeasuredBucket => ({
    tokens: input.rows.reduce((sum, row) => sum + row[tokens], 0),
    cost: input.rows.reduce((sum, row) => sum + row[cost], 0),
    quality: qualityStatus(quality),
  })
  const days = ['dia-padaria', 'dia-espacado'].map(id => input.rows.find(row => row.scenario === id))
  const validDays: Opt8MeasuredRow[] = []
  for (const day of days) {
    if (day !== undefined && day.todayCost > 0 && day.todayTokens > 0
      && [day.todayCost, day.nowCost, day.todayTokens, day.nowTokens].every(value => Number.isFinite(value) && value >= 0)) validDays.push(day)
  }
  const costCut = validDays.length === 2 ? Math.min(...validDays.map(day => 1 - day.nowCost / day.todayCost)) : null
  const tokensDelta = validDays.length === 2 ? Math.max(...validDays.map(day => day.nowTokens / day.todayTokens - 1)) : null
  let status: Opt8MeasuredEvidence['cut40']['status'] = 'blocked'
  let reason: Opt8MeasuredEvidence['cut40']['reason'] = 'wiring-incomplete'
  if (costCut === null || tokensDelta === null) reason = 'comparison-unavailable'
  else if (input.allLeversWired) {
    status = 'failed'
    if (input.quality?.asWired === false) reason = 'quality-regressed'
    else if (tokensDelta > 0) reason = 'tokens-increased'
    else if (costCut < 0.4) reason = 'cost-cut-below-40'
    else { status = 'passed'; reason = 'goal-met' }
  }
  return {
    origin: 'estimate', baseline: 'levers-before-wiring', historical: { id: 'historical-134-fixture', countsForGoal: false },
    beforeWiring: bucket('todayTokens', 'todayCost', input.quality?.beforeWiring),
    asWired: bucket('nowTokens', 'nowCost', input.quality?.asWired),
    projectionAll: { ...bucket('allTokens', 'allCost', input.quality?.projectionAll), label: 'projection' },
    scenarios: input.rows.map(row => ({ ...row })), idleZero: input.idleZero,
    cacheEstimate: input.cacheEngines.map(row => ({ engine: row.engine, prefixHit: row.prefixHit ?? null })),
    providerCache: { prefixHit: 0, status: 'blocked', origin: 'unavailable' },
    parity: { status: 'blocked', reason: 'requires-paired-real-run' },
    cut40: { status, costCut, tokensDelta, reason },
  }
}
