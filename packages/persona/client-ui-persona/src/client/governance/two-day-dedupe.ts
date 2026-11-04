import type { TwoDayRowView, TwoDayTestView } from './governance-contract.ts'

/** Dedupe key: persona name + role from labels like "Vigia (Luna)". */
export function twoDayRowIdentity(row: TwoDayRowView): string {
  const match = /^(.+?)\s+\(([^)]+)\)\s*$/u.exec(row.label.trim())
  if (match !== null) {
    return `${match[2]!.trim().toLowerCase()}|${match[1]!.trim().toLowerCase()}`
  }
  return row.id.toLowerCase()
}

function rowIsAllRuns(row: TwoDayRowView): boolean {
  return row.slots.length > 0 && row.slots.every(slot => slot === 'runs')
}

function preferTwoDayRow(a: TwoDayRowView, b: TwoDayRowView): TwoDayRowView {
  const aStub = rowIsAllRuns(a)
  const bStub = rowIsAllRuns(b)
  if (aStub && !bStub) return b
  if (!aStub && bStub) return a
  return a
}

/** Collapse duplicate persona rows (host × live-derived). */
export function dedupeTwoDayRows(rows: readonly TwoDayRowView[]): TwoDayRowView[] {
  const byKey = new Map<string, TwoDayRowView>()
  for (const row of rows) {
    const key = twoDayRowIdentity(row)
    const prev = byKey.get(key)
    byKey.set(key, prev === undefined ? row : preferTwoDayRow(prev, row))
  }
  return [...byKey.values()]
}

export function dedupeTwoDayView(view: TwoDayTestView): TwoDayTestView {
  return { ...view, rows: dedupeTwoDayRows(view.rows) }
}
