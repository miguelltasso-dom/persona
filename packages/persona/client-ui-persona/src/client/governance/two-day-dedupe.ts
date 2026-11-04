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

/** Same persona on host vs live-derived (e.g. `luna` vs `p-luna`), not two roster slots with recycled names. */
export function shouldMergeTwoDayRows(a: TwoDayRowView, b: TwoDayRowView): boolean {
  if (a.id === b.id) return true
  if (twoDayRowIdentity(a) !== twoDayRowIdentity(b)) return false
  return rowIsAllRuns(a) !== rowIsAllRuns(b)
}

/** Collapse host stub × live-derived duplicates only — keep one row per persona id/label slot. */
export function dedupeTwoDayRows(rows: readonly TwoDayRowView[]): TwoDayRowView[] {
  const out: TwoDayRowView[] = []
  for (const row of rows) {
    const mergeIndex = out.findIndex(prev => shouldMergeTwoDayRows(prev, row))
    if (mergeIndex >= 0) {
      out[mergeIndex] = preferTwoDayRow(out[mergeIndex]!, row)
    } else {
      out.push(row)
    }
  }
  return out
}

export function dedupeTwoDayView(view: TwoDayTestView): TwoDayTestView {
  return { ...view, rows: dedupeTwoDayRows(view.rows) }
}
