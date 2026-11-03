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

function windowOf(id: string, raw: Record<string, unknown>): UsageWindow {
  const usedPercent = numberField(raw.used_percent) ?? numberField(raw.usedPercent)
  const windowMinutes = numberField(raw.window_minutes) ?? numberField(raw.windowMinutes)
  const resetsAt = stringField(raw.resets_at) ?? stringField(raw.resetsAt)
  if (usedPercent === undefined && windowMinutes === undefined && resetsAt === undefined) {
    return { id, origin: 'unavailable' }
  }
  const window: UsageWindow = { id, origin: 'official' }
  if (usedPercent !== undefined) window.usedPercent = usedPercent
  if (windowMinutes !== undefined) window.windowMinutes = windowMinutes
  if (resetsAt !== undefined) window.resetsAt = resetsAt
  return window
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
  const windows: UsageWindow[] = []
  const five = record['5h'] ?? record.fiveHour ?? record.rate_limits
  if (five !== null && typeof five === 'object' && !Array.isArray(five)) {
    windows.push(windowOf('5h', five as Record<string, unknown>))
  }
  const week = record.weekly ?? record.week
  if (week !== null && typeof week === 'object' && !Array.isArray(week)) {
    windows.push(windowOf('weekly', week as Record<string, unknown>))
  }
  if (Array.isArray(record.windows)) {
    for (const item of record.windows) {
      if (item !== null && typeof item === 'object') {
        const row = item as Record<string, unknown>
        windows.push(windowOf(stringField(row.id) ?? 'window', row))
      }
    }
  }
  if (windows.length === 0) {
    return { provider, origin: 'unavailable', windows: [], detail: 'no windows in accountUsage' }
  }
  const origin = windows.every(item => item.origin === 'official') ? 'official' : 'unavailable'
  return { provider, origin, windows }
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
