import type { OfficialQuotaView } from '@deepseek-ai/dsh-persona-host/types'

/** Map host official windows to 5h / week meters (never invent 0%). */
export function quotaViewsToSeatPct(views: readonly OfficialQuotaView[]): {
  readonly fiveHourPct?: number
  readonly weekPct?: number
} {
  const windows = views.flatMap(view => view.windows)
  const pick = (id: string): number | undefined => {
    const row = windows.find(window => window.id === id)
    return row?.usedPercent
  }
  const fiveHourPct = pick('5h') ?? pick('five_hour')
  const weekPct = pick('week') ?? pick('seven_day')
  return {
    ...(fiveHourPct === undefined ? {} : { fiveHourPct }),
    ...(weekPct === undefined ? {} : { weekPct }),
  }
}
