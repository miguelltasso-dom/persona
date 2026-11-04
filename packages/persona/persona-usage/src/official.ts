/**
 * Read-only official quota parsers. Missing vendor fields stay `unavailable`.
 */

import type { OfficialQuota, UsageWindow } from './types.ts'

function numberField(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value) ? value : undefined
}

function stringField(value: unknown): string | undefined {
  return typeof value === 'string' && value.length > 0 ? value : undefined
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function clampPct(value: number): number {
  return Math.min(100, Math.max(0, value))
}

function usedPercentOf(raw: Record<string, unknown>): number | undefined {
  const direct = numberField(raw.used_percent) ?? numberField(raw.usedPercent)
  if (direct !== undefined) return clampPct(direct)
  const remaining = numberField(raw.remaining_percent) ?? numberField(raw.remainingPercent)
  if (remaining !== undefined) return clampPct(100 - remaining)
  const util = numberField(raw.utilization) ?? numberField(raw.utilized)
  if (util === undefined) return undefined
  return util <= 1 ? clampPct(util * 100) : clampPct(util)
}

function resetsAtOf(raw: Record<string, unknown>): string | undefined {
  const text = stringField(raw.resets_at) ?? stringField(raw.resetsAt)
  if (text !== undefined) {
    if (/^\d+$/u.test(text)) {
      const n = Number(text)
      return new Date(n < 1e12 ? n * 1000 : n).toISOString()
    }
    const parsed = Date.parse(text)
    return Number.isNaN(parsed) ? text : new Date(parsed).toISOString()
  }
  const n = numberField(raw.resets_at) ?? numberField(raw.resetsAt)
  if (n === undefined) return undefined
  return new Date(n < 1e12 ? n * 1000 : n).toISOString()
}

function canonicalWindowId(id: string, windowMinutes: number | undefined): string {
  if (/5h|five|session/iu.test(id) || windowMinutes === 300) return '5h'
  if (/week|semana|7d/iu.test(id) || windowMinutes === 10_080) return 'week'
  return id
}

function windowOf(id: string, raw: Record<string, unknown>): UsageWindow {
  const usedPercent = usedPercentOf(raw)
  const windowMinutes = numberField(raw.window_minutes) ?? numberField(raw.windowMinutes)
  const resetsAt = resetsAtOf(raw)
  const canonical = canonicalWindowId(id, windowMinutes)
  if (usedPercent === undefined && windowMinutes === undefined && resetsAt === undefined) {
    return { id: canonical, origin: 'unavailable' }
  }
  const window: UsageWindow = { id: canonical, origin: 'official' }
  if (usedPercent !== undefined) window.usedPercent = usedPercent
  if (windowMinutes !== undefined) window.windowMinutes = windowMinutes
  if (resetsAt !== undefined) window.resetsAt = resetsAt
  return window
}

function planOf(record: Record<string, unknown>): string | undefined {
  const nested = record.account
  return stringField(record.plan)
    ?? stringField(record.subscription)
    ?? stringField(record.rate_limit_tier)
    ?? (isRecord(nested) ? stringField(nested.plan) ?? stringField(nested.subscription) : undefined)
}

function unwrapLimits(record: Record<string, unknown>): Record<string, unknown> {
  const limits = record.rate_limits
  if (isRecord(limits) && (limits['5h'] !== undefined || limits.weekly !== undefined || limits.week !== undefined)) {
    return { ...record, ...limits }
  }
  return record
}

/**
 * Parse OAR `runtime.accountUsage` (claude / codex). Read-only.
 * @param provider - `claude` or `codex`.
 * @param raw - Vendor payload; unknown keys ignored.
 */
export function readOarAccountUsage(provider: string, raw: unknown): OfficialQuota {
  if (raw === null || typeof raw !== 'object') {
    return { provider, origin: 'unavailable', windows: [], detail: 'accountUsage missing' }
  }
  const record = raw as Record<string, unknown>
  if (record.kind === 'unavailable' || record.kind === 'error' || record.kind === 'unauthenticated') {
    const quota: OfficialQuota = { provider, origin: 'unavailable', windows: [] }
    const detail = stringField(record.detail) ?? stringField(record.reason)
    if (detail !== undefined) quota.detail = detail
    return quota
  }
  const body = unwrapLimits(record)
  const windows: UsageWindow[] = []
  const five = body['5h'] ?? body.fiveHour ?? body.five_hour ?? body.session
  if (isRecord(five)) windows.push(windowOf('5h', five))
  const week = body.weekly ?? body.week ?? body.seven_day ?? body.sevenDay
  if (isRecord(week)) windows.push(windowOf('week', week))
  if (Array.isArray(body.windows)) {
    for (const item of body.windows) {
      if (isRecord(item)) windows.push(windowOf(stringField(item.id) ?? 'window', item))
    }
  }
  if (windows.length === 0) {
    return { provider, origin: 'unavailable', windows: [], detail: 'no windows in accountUsage' }
  }
  const origin = windows.some(item => item.origin === 'official') ? 'official' : 'unavailable'
  const plan = planOf(body)
  return plan === undefined
    ? { provider, origin, windows }
    : { provider, origin, windows, detail: plan }
}

/**
 * Parse Codex rollout `rate_limits` (5h / weekly).
 * @param raw - One rollout object or a `{ rate_limits }` envelope.
 */
export function readCodexRolloutLimits(raw: unknown): OfficialQuota {
  if (raw === null || typeof raw !== 'object') {
    return { provider: 'codex', origin: 'unavailable', windows: [], detail: 'rollout missing' }
  }
  const record = raw as Record<string, unknown>
  const limits = record.rate_limits !== null && typeof record.rate_limits === 'object'
    ? record.rate_limits as Record<string, unknown>
    : record
  return readOarAccountUsage('codex', limits)
}

/**
 * Parse a DeepSeek account balance payload when present.
 * @param raw - Account details; missing balance stays unavailable (not 0%).
 */
export function readDeepSeekBalance(raw: unknown): OfficialQuota {
  if (raw === null || typeof raw !== 'object') {
    return { provider: 'deepseek', origin: 'unavailable', windows: [], detail: 'balance missing' }
  }
  const record = raw as Record<string, unknown>
  const balance = record.balance ?? record.totalBalance
  if (typeof balance !== 'number' || !Number.isFinite(balance)) {
    return { provider: 'deepseek', origin: 'unavailable', windows: [], detail: 'balance missing' }
  }
  return {
    provider: 'deepseek',
    origin: 'official',
    windows: [{ id: 'balance', origin: 'official' }],
    detail: 'balance present (value not a percent)',
  }
}

/**
 * Label an estimate so it cannot be mistaken for official quota.
 * @param input - Token guess and the basis string shown in the UI.
 */
export function labelledEstimate(input: {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  basis: string
}): {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  origin: 'estimate'
  basis: string
} {
  return { ...input, origin: 'estimate' }
}
