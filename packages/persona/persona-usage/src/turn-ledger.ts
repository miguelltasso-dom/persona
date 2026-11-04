/**
 * OPT-1 turn ledger: kind + cache read/write. Missing cache is omitted, never 0%.
 */

import type { UsageOrigin } from './types.ts'

/** Core `TurnLedgerEntry` kinds. Persist these. */
export type CanonicalTurnKind =
  | 'triage'
  | 'reply'
  | 'execution'
  | 'initiative'
  | 'librarian'
  | 'watchdog'
  | 'evaluation'

/** Short tags still accepted on the wire. Map only through {@link usagePortKind}. */
export type LegacyTurnKind = 'exec' | 'eval'

/** Wire kind: canonical or the two leftover short tags. */
export type TurnKind = CanonicalTurnKind | LegacyTurnKind

const CANONICAL_KINDS: readonly CanonicalTurnKind[] = [
  'triage',
  'reply',
  'execution',
  'initiative',
  'librarian',
  'watchdog',
  'evaluation',
]

/**
 * Only legacy→canonical map (Rivet usage port). `exec`/`eval` stay readable.
 * @param kind - Core kind or leftover short tag.
 */
export function usagePortKind(kind: string): CanonicalTurnKind {
  if (kind === 'exec') return 'execution'
  if (kind === 'eval') return 'evaluation'
  for (const candidate of CANONICAL_KINDS) {
    if (candidate === kind) return candidate
  }
  return 'execution'
}

/**
 * UsageStore `window` tag Anvil reads (`exec` / `eval`). Inverse of {@link usagePortKind}.
 * @param kind - Canonical ledger kind.
 */
export function usagePortWindow(kind: CanonicalTurnKind): string {
  const aliases = ['exec', 'eval'] as const
  for (const alias of aliases) {
    if (usagePortKind(alias) === kind) return alias
  }
  return kind
}

/** One measured turn. Cache fields stay omitted when the vendor did not publish them. */
export interface TurnLedgerRow {
  readonly personaId: string
  readonly provider: string
  readonly model: string
  readonly kind: TurnKind
  readonly inputTokens: number
  readonly outputTokens: number
  readonly calls: number
  readonly origin: UsageOrigin
  readonly at: string
  readonly accountId?: string
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly contextBytes?: number
}

/** Fold of turns that share kind + provider + account. */
export interface TurnLedgerFold {
  readonly kind: CanonicalTurnKind
  readonly provider: string
  readonly accountId?: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly calls: number
  readonly turns: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
  readonly cacheHitRate?: number
}

/**
 * Cache hit rate when the vendor published cache-read tokens.
 * @param inputTokens - Prompt tokens.
 * @param cacheReadTokens - Cache read, if any.
 */
export function cacheHitRate(inputTokens: number, cacheReadTokens: number | undefined): number | undefined {
  if (cacheReadTokens === undefined || inputTokens <= 0) return undefined
  return cacheReadTokens / inputTokens
}

/**
 * Fold scripted (or real) turns for bench-tokens.
 * @param rows - Ledger rows.
 */
interface TurnLedgerDraft {
  kind: CanonicalTurnKind
  provider: string
  accountId?: string
  inputTokens: number
  outputTokens: number
  calls: number
  turns: number
  cacheReadTokens?: number
  cacheWriteTokens?: number
}

function toFold(draft: TurnLedgerDraft): TurnLedgerFold {
  const hit = cacheHitRate(draft.inputTokens, draft.cacheReadTokens)
  return {
    kind: draft.kind,
    provider: draft.provider,
    ...(draft.accountId === undefined ? {} : { accountId: draft.accountId }),
    inputTokens: draft.inputTokens,
    outputTokens: draft.outputTokens,
    calls: draft.calls,
    turns: draft.turns,
    ...(draft.cacheReadTokens === undefined ? {} : { cacheReadTokens: draft.cacheReadTokens }),
    ...(draft.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: draft.cacheWriteTokens }),
    ...(hit === undefined ? {} : { cacheHitRate: hit }),
  }
}

export function foldTurnLedger(rows: readonly TurnLedgerRow[]): TurnLedgerFold[] {
  const groups = new Map<string, TurnLedgerDraft>()
  for (const row of rows) {
    const kind = usagePortKind(row.kind)
    const key = `${kind}\0${row.provider}\0${row.accountId ?? ''}`
    const existing = groups.get(key)
    if (existing === undefined) {
      groups.set(key, {
        kind,
        provider: row.provider,
        ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
        inputTokens: row.inputTokens,
        outputTokens: row.outputTokens,
        calls: row.calls,
        turns: 1,
        ...(row.cacheReadTokens === undefined ? {} : { cacheReadTokens: row.cacheReadTokens }),
        ...(row.cacheWriteTokens === undefined ? {} : { cacheWriteTokens: row.cacheWriteTokens }),
      })
      continue
    }
    existing.inputTokens += row.inputTokens
    existing.outputTokens += row.outputTokens
    existing.calls += row.calls
    existing.turns += 1
    if (row.cacheReadTokens !== undefined) {
      existing.cacheReadTokens = (existing.cacheReadTokens ?? 0) + row.cacheReadTokens
    }
    if (row.cacheWriteTokens !== undefined) {
      existing.cacheWriteTokens = (existing.cacheWriteTokens ?? 0) + row.cacheWriteTokens
    }
  }
  return [...groups.values()].map(toFold)
}
