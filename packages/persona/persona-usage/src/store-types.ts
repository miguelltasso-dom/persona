/** UsageStore port. Anvil implements SQLite; tests use the memory store. */

import type { TurnKind } from './turn-ledger.ts'
import type { UsageOrigin } from './types.ts'

/** Labelled cost guess. Never an official quota percent. */
export interface UsageCostEstimate {
  readonly amount: number
  readonly currency: string
  readonly origin: 'estimate'
  readonly basis: string
}

/** One run written to the book. */
export interface UsageEvent {
  readonly personaId: string
  readonly projectId: string
  readonly provider: string
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly origin: UsageOrigin
  readonly at: string
  readonly runId?: string
  readonly window?: string
  readonly estimatedCost?: UsageCostEstimate
  /** Canonical after {@link usagePortKind}; leftover `exec`/`eval` still accepted. */
  readonly kind?: TurnKind
  readonly accountId?: string
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}

/** Query window. Persona/project omitted = all. */
export interface UsageQuery {
  readonly from: string
  readonly to: string
  readonly personaId?: string
  readonly projectId?: string
}

/** Folded totals for engine limits (`tokensPerMonth` / `runs`). */
export interface UsageTotals {
  readonly period: { readonly from: string; readonly to: string }
  readonly inputTokens: number
  readonly outputTokens: number
  readonly runs: number
  readonly origin: UsageOrigin
  readonly originLabel: string
  readonly personaId?: string
  readonly projectId?: string
}

/**
 * Ledger Anvil persists and Lumen reads via Remote.
 * Missing official quota is `unavailable`, never 0%.
 */
export interface UsageStore {
  record(event: UsageEvent): void
  query(filter: UsageQuery): UsageEvent[]
  totals(filter: UsageQuery): UsageTotals
}
