/** Fold usage records by provider / model / window. */

import type { UsageFold, UsageOrigin, UsageRecord } from './types.ts'

const RANK: Record<UsageOrigin, number> = {
  official: 4,
  measured: 3,
  estimate: 2,
  unavailable: 1,
}

function weaker(left: UsageOrigin, right: UsageOrigin): UsageOrigin {
  return RANK[left] <= RANK[right] ? left : right
}

/**
 * Fold records that share provider, model and window.
 * Origin is the weakest of the group so a mixed fold cannot look official.
 * @param records - Ledger rows.
 */
export function foldUsage(records: readonly UsageRecord[]): UsageFold[] {
  const groups = new Map<string, UsageFold>()
  for (const row of records) {
    const key = `${row.provider}\0${row.model}\0${row.window}`
    const existing = groups.get(key)
    if (existing === undefined) {
      groups.set(key, {
        provider: row.provider,
        model: row.model,
        window: row.window,
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        origin: row.origin,
        records: 1,
      })
      continue
    }
    existing.inputTokens += row.inputTokens
    existing.outputTokens += row.outputTokens
    existing.records += 1
    existing.origin = weaker(existing.origin, row.origin)
  }
  return [...groups.values()]
}
