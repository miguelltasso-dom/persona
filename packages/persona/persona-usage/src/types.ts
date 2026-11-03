/**
 * Usage book and official quota. Absence is never shown as 0%.
 */

/** How a figure was obtained. Always present on every published row. */
export type UsageOrigin = 'measured' | 'estimate' | 'official' | 'unavailable'

/** One measured or estimated turn folded into the book. */
export interface UsageRecord {
  provider: string
  model: string
  window: string
  inputTokens: number
  outputTokens: number
  origin: UsageOrigin
  at: string
}

/** Fold of records that share provider + model + window. */
export interface UsageFold {
  provider: string
  model: string
  window: string
  inputTokens: number
  outputTokens: number
  origin: UsageOrigin
  records: number
}

/**
 * Official quota window. `usedPercent` is omitted when the vendor did not
 * publish a figure — callers must not treat that as 0%.
 */
export interface UsageWindow {
  id: string
  origin: UsageOrigin
  usedPercent?: number
  windowMinutes?: number
  resetsAt?: string
}

/** Snapshot the host Remote exposes and the Uso e limites screen consumes. */
export interface OfficialQuota {
  provider: string
  origin: UsageOrigin
  windows: UsageWindow[]
  detail?: string
}

/** Labelled estimate (never mixed with official without the origin tag). */
export interface UsageEstimate {
  provider: string
  model: string
  inputTokens: number
  outputTokens: number
  origin: 'estimate'
  basis: string
}
