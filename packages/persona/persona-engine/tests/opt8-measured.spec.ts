import { expect, it } from 'vitest'
import { buildOpt8Measured, type Opt8MeasuredInput, type Opt8MeasuredRow } from '../src/opt8-measured.ts'

function row(scenario: string, patch: Partial<Opt8MeasuredRow> = {}): Opt8MeasuredRow {
  return { scenario, todayTokens: 100, nowTokens: 98, allTokens: 90, todayCost: 100, nowCost: 67, allCost: 5, ...patch }
}
function input(patch: Partial<Opt8MeasuredInput> = {}): Opt8MeasuredInput {
  return { rows: [row('dia-padaria', { nowCost: 63 }), row('dia-espacado')], idleZero: true,
    cacheEngines: [{ engine: 'claude', prefixHit: 1 }, { engine: 'opencode', prefixHit: undefined }], allLeversWired: false, ...patch }
}

it('labels estimates and the historical fixture without promoting projected savings or simulated cache', () => {
  const result = buildOpt8Measured(input())
  expect(result.origin).toBe('estimate')
  expect(result.baseline).toBe('levers-before-wiring')
  expect(result.historical).toEqual({ id: 'historical-134-fixture', countsForGoal: false })
  expect(result.asWired).toEqual({ tokens: 196, cost: 130, quality: 'unavailable' })
  expect(result.beforeWiring).toEqual({ tokens: 200, cost: 200, quality: 'unavailable' })
  expect(result.projectionAll).toEqual({ tokens: 180, cost: 10, quality: 'unavailable', label: 'projection' })
  expect(result.cut40.status).toBe('blocked')
  expect(result.cut40.reason).toBe('wiring-incomplete')
  expect(result.cut40.costCut).toBeCloseTo(0.33)
  expect(result.cut40.tokensDelta).toBeCloseTo(-0.02)
  expect(result.providerCache).toEqual({ prefixHit: 0, status: 'blocked', origin: 'unavailable' })
  expect(result.parity).toEqual({ status: 'blocked', reason: 'requires-paired-real-run' })
  expect(result.cacheEstimate).toEqual([{ engine: 'claude', prefixHit: 1 }, { engine: 'opencode', prefixHit: null }])
})

it('does not accept the projection even when all levers are declared wired', () => {
  expect(buildOpt8Measured(input({ allLeversWired: true })).cut40).toMatchObject({ status: 'failed', reason: 'cost-cut-below-40' })
})

it('requires both days to meet exactly forty percent with tokens no greater than before', () => {
  const rows = [row('dia-padaria', { nowCost: 60, nowTokens: 100 }), row('dia-espacado', { nowCost: 60, nowTokens: 99 })]
  const passed = buildOpt8Measured(input({ allLeversWired: true, rows }))
  expect(passed.cut40).toEqual({ status: 'passed', reason: 'goal-met', costCut: 0.4, tokensDelta: 0 })
  expect(buildOpt8Measured(input({ rows })).cut40.status).toBe('blocked')
  expect(buildOpt8Measured(input({ allLeversWired: true, rows: [rows[0]!, row('dia-espacado', { nowCost: 61 })] })).cut40.status).toBe('failed')
})

it('rejects a flattering average when the spread day or its tokens regress', () => {
  const result = buildOpt8Measured(input({ allLeversWired: true, rows: [row('dia-padaria', { nowCost: 1 }), row('dia-espacado', { nowCost: 70 })] }))
  expect(result.cut40.costCut).toBeCloseTo(0.3)
  expect(result.cut40.status).toBe('failed')
  expect(buildOpt8Measured(input({ allLeversWired: true, rows: [row('dia-padaria', { nowCost: 1 }), row('dia-espacado', { nowCost: 1, nowTokens: 101 })] })).cut40)
    .toMatchObject({ status: 'failed', reason: 'tokens-increased' })
})

it('blocks missing or zero baselines instead of inventing a comparable cost', () => {
  for (const rows of [[], [row('dia-padaria')], [row('dia-padaria', { todayCost: 0 }), row('dia-espacado')]]) {
    expect(buildOpt8Measured(input({ allLeversWired: true, rows })).cut40)
      .toEqual({ status: 'blocked', reason: 'comparison-unavailable', costCut: null, tokensDelta: null })
  }
})

it('retains actual quality results and refuses savings obtained by losing fidelity', () => {
  const result = buildOpt8Measured(input({ allLeversWired: true, rows: [row('dia-padaria', { nowCost: 1 }), row('dia-espacado', { nowCost: 1 })],
    quality: { beforeWiring: true, asWired: false, projectionAll: true } }))
  expect(result.asWired.quality).toBe('failed')
  expect(result.projectionAll.quality).toBe('passed')
  expect(result.cut40).toMatchObject({ status: 'failed', reason: 'quality-regressed' })
})

it('returns owned JSON-safe data and never mutates pipeline rows', () => {
  const source = input()
  const original = structuredClone(source)
  const result = buildOpt8Measured(source)
  expect(source).toEqual(original)
  expect(result.scenarios[0]).not.toBe(source.rows[0])
  expect(JSON.parse(JSON.stringify(result))).toEqual(result)
})
