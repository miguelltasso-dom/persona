import type { GovernanceFixKind, TwoDayRowView } from './governance-contract.ts'

export interface TwoDayFixGroup {
  readonly fixKind: GovernanceFixKind
  /** The diagnosis the rows share, written once for the group instead of once per row. */
  readonly reason: string
  readonly rows: readonly TwoDayRowView[]
}

/**
 * Rows with the SAME diagnosis and the SAME fix are one problem, not N: the screen writes the sentence once and offers one button for all
 * (DESIGN-01-MUSE cena 11). A row that is alone, or has no fix, stays as it is.
 *
 * @param rows The rows of the 2-day test, in screen order.
 * @param minSize How many equal rows make a group.
 * @returns The groups and the ids of the rows they absorbed.
 */
export function groupTwoDayFixes(
  rows: readonly TwoDayRowView[],
  minSize = 2,
): { readonly groups: readonly TwoDayFixGroup[]; readonly groupedRowIds: ReadonlySet<string> } {
  const byKey = new Map<string, TwoDayRowView[]>()
  for (const row of rows) {
    if (row.fixKind === undefined || row.reason === undefined) continue
    const key = `${row.fixKind}\u0000${row.reason}`
    byKey.set(key, [...(byKey.get(key) ?? []), row])
  }
  const groups: TwoDayFixGroup[] = []
  const groupedRowIds = new Set<string>()
  for (const members of byKey.values()) {
    if (members.length < minSize) continue
    const first = members[0]!
    groups.push({ fixKind: first.fixKind!, reason: first.reason!, rows: members })
    for (const member of members) groupedRowIds.add(member.id)
  }
  return { groups, groupedRowIds }
}
