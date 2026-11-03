import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  foldUsage,
  labelledEstimate,
  readCodexRolloutLimits,
  readDeepSeekBalance,
  readOarAccountUsage,
  type UsageRecord,
} from '../src/index.ts'

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures')

function load(name: string): unknown {
  return JSON.parse(readFileSync(join(fixtures, name), 'utf8')) as unknown
}

describe('usage book', () => {
  it('folds by provider, model and window and keeps the weakest origin', () => {
    const records: UsageRecord[] = [
      { provider: 'claude', model: 'haiku', window: '5h', inputTokens: 10, outputTokens: 2, origin: 'measured', at: 't1' },
      { provider: 'claude', model: 'haiku', window: '5h', inputTokens: 5, outputTokens: 1, origin: 'estimate', at: 't2' },
      { provider: 'codex', model: 'gpt-5.5', window: '5h', inputTokens: 8, outputTokens: 3, origin: 'measured', at: 't3' },
    ]
    const folds = foldUsage(records)
    expect(folds).toEqual([
      { provider: 'claude', model: 'haiku', window: '5h', inputTokens: 15, outputTokens: 3, origin: 'estimate', records: 2 },
      { provider: 'codex', model: 'gpt-5.5', window: '5h', inputTokens: 8, outputTokens: 3, origin: 'measured', records: 1 },
    ])
  })
})

describe('official quota', () => {
  it('reads OAR claude accountUsage windows', () => {
    const quota = readOarAccountUsage('claude', load('oar-claude-usage.json'))
    expect(quota.origin).toBe('official')
    expect(quota.windows[0]).toMatchObject({ id: '5h', origin: 'official', usedPercent: 12.5, windowMinutes: 300 })
    expect(quota.windows[1]).toMatchObject({ id: 'weekly', origin: 'official', usedPercent: 4 })
  })

  it('reads Codex rollout rate_limits', () => {
    const quota = readCodexRolloutLimits(load('codex-rollout.json'))
    expect(quota.provider).toBe('codex')
    expect(quota.origin).toBe('official')
    expect(quota.windows.map(item => item.id)).toEqual(['5h', 'weekly'])
    expect(quota.windows[0]?.usedPercent).toBe(33)
  })

  it('never turns a missing quota into 0%', () => {
    const quota = readOarAccountUsage('claude', load('missing-quota.json'))
    expect(quota.origin).toBe('unavailable')
    expect(quota.windows).toEqual([])
    expect(JSON.stringify(quota)).not.toMatch(/"usedPercent":0/u)
    const empty = readDeepSeekBalance({})
    expect(empty.origin).toBe('unavailable')
    expect(empty.windows).toEqual([])
    const estimate = labelledEstimate({
      provider: 'claude', model: 'haiku', inputTokens: 20, outputTokens: 4, basis: 'chars/4',
    })
    expect(estimate.origin).toBe('estimate')
  })
})
