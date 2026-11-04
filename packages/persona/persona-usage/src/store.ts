/** In-memory UsageStore for tests. Anvil persists the same port in SQLite. */

import { foldUsage } from './book.ts'
import { usagePortKind } from './turn-ledger.ts'
import { originLabel } from './types.ts'
import type { UsageEvent, UsageQuery, UsageStore, UsageTotals } from './store-types.ts'

/**
 * Process-local UsageStore. Production host uses Anvil's SQLite adapter.
 * @returns A store that never treats a missing row as 0%.
 */
export function createMemoryUsageStore(): UsageStore {
  const rows: UsageEvent[] = []
  return {
    record(event: UsageEvent): void {
      rows.push({
        ...event,
        ...(event.kind === undefined ? {} : { kind: usagePortKind(event.kind) }),
      })
    },
    query(filter: UsageQuery): UsageEvent[] {
      return rows.filter(row => match(row, filter))
    },
    totals(filter: UsageQuery): UsageTotals {
      const matched = rows.filter(row => match(row, filter))
      if (matched.length === 0) {
        return emptyTotals(filter)
      }
      const folds = foldUsage(matched.map(row => ({
        provider: row.provider,
        model: row.model,
        window: row.window ?? 'turn',
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        origin: row.origin,
        at: row.at,
      })))
      const origin = folds.reduce(
        (weakest, fold) => weaker(weakest, fold.origin),
        folds[0]?.origin ?? 'unavailable',
      )
      return {
        period: { from: filter.from, to: filter.to },
        inputTokens: matched.reduce((sum, row) => sum + row.inputTokens, 0),
        outputTokens: matched.reduce((sum, row) => sum + row.outputTokens, 0),
        runs: matched.length,
        origin,
        originLabel: originLabel(origin),
        ...(filter.personaId === undefined ? {} : { personaId: filter.personaId }),
        ...(filter.projectId === undefined ? {} : { projectId: filter.projectId }),
      }
    },
  }
}

function match(row: UsageEvent, filter: UsageQuery): boolean {
  if (row.at < filter.from || row.at > filter.to) return false
  if (filter.personaId !== undefined && row.personaId !== filter.personaId) return false
  if (filter.projectId !== undefined && row.projectId !== filter.projectId) return false
  return true
}

function emptyTotals(filter: UsageQuery): UsageTotals {
  return {
    period: { from: filter.from, to: filter.to },
    inputTokens: 0,
    outputTokens: 0,
    runs: 0,
    origin: 'unavailable',
    originLabel: originLabel('unavailable'),
    ...(filter.personaId === undefined ? {} : { personaId: filter.personaId }),
    ...(filter.projectId === undefined ? {} : { projectId: filter.projectId }),
  }
}

function weaker(
  left: UsageTotals['origin'],
  right: UsageTotals['origin'],
): UsageTotals['origin'] {
  const rank = { official: 4, measured: 3, estimate: 2, unavailable: 1 } as const
  return rank[left] <= rank[right] ? left : right
}
