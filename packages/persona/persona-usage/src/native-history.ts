/**
 * Native CLI history totals. Missing turns are skipped, never estimated from text.
 * Adapted from T3 Usage (MIT © 2026 T3 Tools Inc.; see NOTICE).
 */

import type { UsageOrigin } from './types.ts'

/** One recorded turn. Token fields stay omitted when the CLI saved no count. */
export interface NativeHistoryTurn {
  readonly at: string
  readonly inputTokens?: number
  readonly outputTokens?: number
}

/** Fold of recorded turns only. */
export interface NativeHistoryTotals {
  readonly inputTokens: number
  readonly outputTokens: number
  readonly turnsCounted: number
  readonly turnsSkipped: number
  readonly origin: UsageOrigin
}

/**
 * Sum only turns that stored tokens. Conversation text is never a fallback.
 * @param turns - Native session rows (Codex rollout, Claude JSONL, Grok, …).
 */
export function readNativeHistoryTotals(turns: readonly NativeHistoryTurn[]): NativeHistoryTotals {
  let inputTokens = 0
  let outputTokens = 0
  let turnsCounted = 0
  let turnsSkipped = 0
  for (const turn of turns) {
    if (turn.inputTokens === undefined && turn.outputTokens === undefined) {
      turnsSkipped += 1
      continue
    }
    turnsCounted += 1
    inputTokens += turn.inputTokens ?? 0
    outputTokens += turn.outputTokens ?? 0
  }
  return {
    inputTokens,
    outputTokens,
    turnsCounted,
    turnsSkipped,
    origin: turnsCounted === 0 ? 'unavailable' : 'measured',
  }
}
