/**
 * Aprovações: "decisão parada" e a ordem "as mais antigas primeiro" (NEXT-STEP-SHORTCUTS-SPEC §1, regra 4 de Aprovações;
 * Muse, 05/11 05:52). Funções puras, sem imports: o teste em Node carrega este arquivo direto.
 */

/** A decision is "parada" when it is still open and its moment is more than this many days before now. */
export const STALE_DECISION_DAYS = 3

const DAY_MS = 24 * 60 * 60 * 1000

/** Open and older than 3 days. A row without a readable moment (`at`) is never stale. */
export function isStaleDecision(at: string | undefined, open: boolean, nowMs: number): boolean {
  if (!open || at === undefined) return false
  const ms = Date.parse(at)
  return Number.isFinite(ms) && nowMs - ms > STALE_DECISION_DAYS * DAY_MS
}

/** Rows ordered oldest first (ascending `at`). Rows without a readable moment go last. Stable: ties keep their order. */
export function sortRowsOldestFirst<T extends { readonly at?: string | undefined }>(rows: readonly T[]): readonly T[] {
  const keyed = rows.map((row, index) => ({
    row,
    index,
    ms: row.at === undefined ? Number.NaN : Date.parse(row.at),
  }))
  keyed.sort((a, b) => {
    const aKnown = Number.isFinite(a.ms)
    const bKnown = Number.isFinite(b.ms)
    if (aKnown !== bKnown) return aKnown ? -1 : 1
    if (aKnown && bKnown && a.ms !== b.ms) return a.ms - b.ms
    return a.index - b.index
  })
  return keyed.map(entry => entry.row)
}

/** The same groups, each one with its rows oldest first. The group order is kept ("Precisa de você" stays first). */
export function sortGroupsOldestFirst<T extends { readonly at?: string | undefined }, G extends { readonly rows: readonly T[] }>(
  groups: readonly G[],
): readonly G[] {
  return groups.map(group => ({ ...group, rows: sortRowsOldestFirst(group.rows) }))
}
