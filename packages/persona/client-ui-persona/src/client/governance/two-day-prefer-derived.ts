import type { TwoDayTestView } from './governance-contract.ts'
import { dedupeTwoDayRows } from './two-day-dedupe.ts'

function allSlotsRun(view: TwoDayTestView): boolean {
  return view.rows.length > 0 && view.rows.every(row => row.slots.every(slot => slot === 'runs'))
}

/** Prefer live-derived rows when the host only returns a single all-green stub; merge + dedupe by persona+role. */
export function preferDerivedTwoDay(fromHost: TwoDayTestView, derived: TwoDayTestView | null): TwoDayTestView {
  const slotLabels = fromHost.slotLabels.length === 4
    ? fromHost.slotLabels
    : (derived?.slotLabels.length === 4 ? derived.slotLabels : fromHost.slotLabels)

  if (derived === null || derived.rows.length === 0) {
    return { ...fromHost, slotLabels, rows: dedupeTwoDayRows(fromHost.rows) }
  }
  if (fromHost.rows.length === 0) {
    return { ...derived, slotLabels, rows: dedupeTwoDayRows(derived.rows) }
  }

  const hostStub = allSlotsRun(fromHost) && fromHost.rows.length <= 1
  const preferDerived = hostStub
    || (allSlotsRun(fromHost) && derived.rows.length > fromHost.rows.length)

  const ordered = preferDerived
    ? [...derived.rows, ...fromHost.rows]
    : [...fromHost.rows, ...derived.rows]

  return {
    workspaceId: fromHost.workspaceId,
    slotLabels,
    rows: dedupeTwoDayRows(ordered),
  }
}
