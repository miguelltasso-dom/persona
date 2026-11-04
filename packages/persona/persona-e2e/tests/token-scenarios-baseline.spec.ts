/**
 * Committed baseline for TOKEN-OPTIMIZATION gate (Forge fills metrics; Probe validates shape + numbers).
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

const BASELINE_PATH = join(process.cwd(), 'persona-spec/baselines/token-scenarios.json')

const REQUIRED_SCENARIO_IDS = ['TOK-1', 'TOK-2', 'TOK-3', 'TOK-4', 'TOK-5'] as const

const FROZEN_TOKENS: Record<(typeof REQUIRED_SCENARIO_IDS)[number], number> = {
  'TOK-1': 99,
  'TOK-2': 148,
  'TOK-3': 0,
  'TOK-4': 0,
  'TOK-5': 155,
}

const FROZEN_CALLS: Record<(typeof REQUIRED_SCENARIO_IDS)[number], number> = {
  'TOK-1': 2,
  'TOK-2': 3,
  'TOK-3': 0,
  'TOK-4': 0,
  'TOK-5': 3,
}

interface ScenarioRow {
  readonly id: string
  readonly label: string
  readonly tokensPerCompletedTask: number
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly modelCalls: number
}

interface BaselineFile {
  readonly version: number
  readonly status: string
  readonly regressionThresholdPercent: number
  readonly scenarios: readonly ScenarioRow[]
  readonly paired: readonly { readonly verdict: string }[]
}

describe('token-scenarios baseline artifact', () => {
  it('committed JSON lists TOK-1..5 with scripted totals and regression threshold 10%', () => {
    const raw = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as BaselineFile
    expect(raw.version).toBe(1)
    expect(raw.status).toBe('scripted')
    expect(raw.regressionThresholdPercent).toBe(10)
    const ids = raw.scenarios.map(s => s.id)
    expect(ids).toEqual([...REQUIRED_SCENARIO_IDS])
    for (const s of raw.scenarios) {
      expect(s.label.length).toBeGreaterThan(0)
      const id = s.id as (typeof REQUIRED_SCENARIO_IDS)[number]
      expect(s.tokensPerCompletedTask).toBe(FROZEN_TOKENS[id])
      expect(s.modelCalls).toBe(FROZEN_CALLS[id])
      expect(s.inputTokens + s.outputTokens).toBe(s.tokensPerCompletedTask)
    }
    expect(raw.scenarios[2]?.modelCalls).toBe(0)
    expect(raw.scenarios[3]?.modelCalls).toBe(0)
    expect(raw.paired.every(row => row.verdict === 'parity')).toBe(true)
  })
})
