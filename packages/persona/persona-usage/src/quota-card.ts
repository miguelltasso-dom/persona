/**
 * Card meters from official quota windows. Absence is never 0%.
 */

import type { OfficialQuota } from './types.ts'

/** UI meters for the persona card. Any field omitted means unavailable. */
export interface QuotaCardMeters {
  readonly fiveHourPct?: number
  readonly weekPct?: number
  readonly limitedUntil?: string
}

/**
 * Map official windows onto card meters. Missing/unavailable → undefined, never 0.
 * `limitedUntil` is the vendor `resetsAt` of a window at ≥100% (ISO). Host formats the clock.
 * @param quota - Official or unavailable snapshot.
 */
export function quotaCardMeters(quota: OfficialQuota): QuotaCardMeters | undefined {
  if (quota.origin === 'unavailable') return undefined
  let fiveHourPct: number | undefined
  let weekPct: number | undefined
  let limitedUntil: string | undefined
  for (const window of quota.windows) {
    if (window.origin !== 'official') continue
    // A window scoped to one model (`model_scoped:Fable`) lasts a week too, but it is not the week of the ACCOUNT: it never feeds these meters.
    if (window.id.includes(':')) continue
    const pct = window.usedPercent
    const five = /5h|five/iu.test(window.id) || window.windowMinutes === 300
    const week = /week|semana|7d/iu.test(window.id) || window.windowMinutes === 10_080
    if (pct !== undefined) {
      if (five) fiveHourPct = pct
      else if (week) weekPct = pct
      else if (fiveHourPct === undefined) fiveHourPct = pct
    }
    if ((pct ?? 0) >= 100 && window.resetsAt !== undefined) limitedUntil = window.resetsAt
  }
  if (fiveHourPct === undefined && weekPct === undefined && limitedUntil === undefined) return undefined
  return {
    ...(fiveHourPct === undefined ? {} : { fiveHourPct }),
    ...(weekPct === undefined ? {} : { weekPct }),
    ...(limitedUntil === undefined ? {} : { limitedUntil }),
  }
}
