import { readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  createMemoryUsageStore,
  evaluateSpend,
  foldUsage,
  labelledEstimate,
  officialQuota,
  originLabel,
  quotaCardMeters,
  quotaUiState,
  readCodexRolloutLimits,
  readDeepSeekBalance,
  readOarAccountUsage,
  readableAccountLabel,
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
  it('reads the REAL Claude Max payload: usedRatio (0..1) and durationMs, the account week as "week" and a model window under its own id', () => {
    // The shape OAR returned on 05/11 for a Max account: the week 67% used, a per-model window at 0%, and NO 5-hour window.
    const quota = readOarAccountUsage('claude', load('oar-claude-max-ratio.json'))
    expect(quota.origin).toBe('official')
    expect(quota.detail).toBe('max')
    expect(quota.windows).toEqual([
      { id: 'week', origin: 'official', usedPercent: 67, windowMinutes: 10_080, resetsAt: '2026-11-07T16:00:01.001Z' },
      { id: 'model_scoped:Fable', origin: 'official', usedPercent: 0, windowMinutes: 10_080, resetsAt: '2026-11-07T16:00:00.000Z' },
    ])
    expect(quotaUiState(quota)).toBe('ready')
    const meters = quotaCardMeters(quota)
    expect(meters?.weekPct).toBe(67)
    expect(meters?.fiveHourPct).toBeUndefined()
  })

  it('a ratio is a ratio: 1 is 100%, never above, never below 0; a missing ratio stays unknown (not 0)', () => {
    const windowOf = (usedRatio: number | undefined) => readOarAccountUsage('claude', { kind: 'available', windows: [{ id: 'seven_day', durationMs: 604_800_000, resetsAt: '2026-11-07T16:00:00Z', ...(usedRatio === undefined ? {} : { usedRatio }) }] }).windows[0]
    expect(windowOf(1)?.usedPercent).toBe(100)
    expect(windowOf(1.4)?.usedPercent).toBe(100)
    expect(windowOf(-0.2)?.usedPercent).toBe(0)
    expect(windowOf(0)?.usedPercent).toBe(0)
    expect(windowOf(undefined)?.usedPercent).toBeUndefined()
  })

  it('reads OAR claude accountUsage windows', () => {
    const quota = readOarAccountUsage('claude', load('oar-claude-usage.json'))
    expect(quota.origin).toBe('official')
    expect(quota.windows[0]).toMatchObject({ id: '5h', origin: 'official', usedPercent: 12.5, windowMinutes: 300 })
    expect(quota.windows[1]).toMatchObject({ id: 'week', origin: 'official', usedPercent: 4 })
  })

  it('reads Claude Max and Codex ChatGPT official windows (0% is official)', () => {
    const claude = readOarAccountUsage('claude', load('oar-claude-max.json'))
    expect(claude.origin).toBe('official')
    expect(claude.detail).toBe('max')
    expect(claude.windows[0]).toMatchObject({ id: '5h', origin: 'official', usedPercent: 0, windowMinutes: 300 })
    expect(claude.windows[1]).toMatchObject({ id: 'week', origin: 'official', usedPercent: 9 })
    expect(quotaUiState(claude)).toBe('ready')
    expect(readableAccountLabel({ provider: 'claude', accountId: 'default', plan: 'max' })).toBe('Claude Max')
    const meters = quotaCardMeters(claude)
    expect(meters?.fiveHourPct).toBe(0)
    expect(meters?.weekPct).toBe(9)
    const timed = { provider: 'codex', origin: 'unavailable' as const, windows: [], detail: 'accountUsage timeout' }
    expect(quotaUiState(timed)).toBe('timeout')
    expect(readableAccountLabel({ provider: 'codex', accountId: 'default' })).toBe('ChatGPT')
    expect(readableAccountLabel({ provider: 'codex', accountId: 'codex' })).toBe('ChatGPT')
    const codex = readOarAccountUsage('codex', load('oar-codex-chatgpt.json'))
    expect(codex.origin).toBe('official')
    expect(codex.detail).toBe('chatgpt')
    expect(codex.windows.map(item => item.id)).toEqual(['5h', 'week'])
    expect(codex.windows[0]?.usedPercent).toBe(18)
  })

  it('reads Codex rollout rate_limits', () => {
    const quota = readCodexRolloutLimits(load('codex-rollout.json'))
    expect(quota.provider).toBe('codex')
    expect(quota.origin).toBe('official')
    expect(quota.windows.map(item => item.id)).toEqual(['5h', 'week'])
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

  it('officialQuota missing payload is indisponível, never 0%', async () => {
    const missing = await officialQuota('claude')
    expect(missing.origin).toBe('unavailable')
    expect(missing.windows).toEqual([])
    expect(originLabel(missing.origin)).toBe('indisponível')
    expect(JSON.stringify(missing)).not.toMatch(/"usedPercent":0/u)
    const timed = await officialQuota('codex', {
      timeoutMs: 20,
      accountUsage: () => new Promise(() => undefined),
    })
    expect(timed.origin).toBe('unavailable')
    expect(timed.windows).toEqual([])
    expect(JSON.stringify(timed)).not.toMatch(/"usedPercent":0/u)
  })

  it('quotaCardMeters omits missing windows and never publishes 0%', () => {
    expect(quotaCardMeters({ provider: 'claude', origin: 'unavailable', windows: [] })).toBeUndefined()
    const meters = quotaCardMeters({
      provider: 'claude',
      origin: 'official',
      windows: [
        { id: '5h', origin: 'official', usedPercent: 100, windowMinutes: 300, resetsAt: '2026-11-03T21:30:00.000Z' },
        { id: 'weekly', origin: 'official', usedPercent: 17 },
      ],
    })
    expect(meters).toEqual({
      fiveHourPct: 100,
      weekPct: 17,
      limitedUntil: '2026-11-03T21:30:00.000Z',
    })
    const absent = quotaCardMeters({
      provider: 'claude',
      origin: 'official',
      windows: [{ id: '5h', origin: 'unavailable', usedPercent: 0 }],
    })
    expect(absent).toBeUndefined()
    expect(JSON.stringify(absent ?? {})).not.toMatch(/"fiveHourPct":0/u)
  })

  it('officialQuota caches each account separately', async () => {
    let calls = 0
    const cache = new Map<string, { at: number; value: import('../src/types.ts').OfficialQuota }>()
    const work = await officialQuota('claude', {
      accountId: 'work',
      cache,
      accountUsage: async () => {
        calls += 1
        return { windows: [{ id: '5h', usedPercent: 90, windowMinutes: 300 }] }
      },
    })
    const personal = await officialQuota('claude', {
      accountId: 'personal',
      cache,
      accountUsage: async () => {
        calls += 1
        return { windows: [{ id: '5h', usedPercent: 10, windowMinutes: 300 }] }
      },
    })
    expect(work.accountId).toBe('work')
    expect(personal.accountId).toBe('personal')
    expect(work.windows[0]?.usedPercent).toBe(90)
    expect(personal.windows[0]?.usedPercent).toBe(10)
    await officialQuota('claude', {
      accountId: 'work',
      cache,
      accountUsage: async () => {
        calls += 1
        return { windows: [{ id: '5h', usedPercent: 1, windowMinutes: 300 }] }
      },
    })
    expect(calls).toBe(2)
  })
})

describe('UsageStore', () => {
  it('totals fake runner events by persona, project and period', () => {
    const store = createMemoryUsageStore()
    store.record({
      personaId: 'nina', projectId: 'p1', provider: 'claude', model: 'haiku',
      inputTokens: 10, outputTokens: 2, origin: 'measured', at: '2026-11-03T10:00:00Z',
    })
    store.record({
      personaId: 'nina', projectId: 'p1', provider: 'claude', model: 'haiku',
      inputTokens: 5, outputTokens: 1, origin: 'measured', at: '2026-11-03T11:00:00Z',
    })
    store.record({
      personaId: 'sol', projectId: 'p1', provider: 'codex', model: 'default',
      inputTokens: 8, outputTokens: 3, origin: 'estimate', at: '2026-11-03T11:30:00Z',
      estimatedCost: { amount: 0, currency: 'USD', origin: 'estimate', basis: 'chars/4' },
    })
    store.record({
      personaId: 'nina', projectId: 'p2', provider: 'claude', model: 'haiku',
      inputTokens: 99, outputTokens: 9, origin: 'measured', at: '2026-11-03T12:00:00Z',
    })
    const nina = store.totals({
      from: '2026-11-03T00:00:00Z', to: '2026-11-03T23:59:59Z', personaId: 'nina', projectId: 'p1',
    })
    expect(nina).toMatchObject({
      personaId: 'nina', projectId: 'p1', inputTokens: 15, outputTokens: 3, runs: 2,
      origin: 'measured', originLabel: 'medido por nós',
    })
    const project = store.totals({ from: '2026-11-03T00:00:00Z', to: '2026-11-03T23:59:59Z', projectId: 'p1' })
    expect(project.runs).toBe(3)
    expect(project.originLabel).toBe('estimado')
    const empty = store.totals({ from: '2020-01-01T00:00:00Z', to: '2020-01-02T00:00:00Z' })
    expect(empty.origin).toBe('unavailable')
    expect(empty.originLabel).toBe('indisponível')
    expect(empty.runs).toBe(0)
    expect(JSON.stringify(empty)).not.toMatch(/usedPercent/u)
  })
})

describe('spend limits', () => {
  it('blocks a project executions/day cap with Precisa de você options', () => {
    const stop = evaluateSpend({
      persona: {},
      project: { executionsPerDay: 3 },
      personaMonthTokens: 0,
      projectMonthTokens: 0,
      personaDayRuns: 0,
      projectDayRuns: 3,
    })
    expect(stop.allow).toBe(false)
    expect(stop.scope).toBe('project')
    expect(stop.question).toMatch(/Precisa de você/u)
    expect(stop.question).toMatch(/Aumente o limite/u)
  })
})
