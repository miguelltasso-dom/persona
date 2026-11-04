/**
 * Honest turn activity for the thread (T3 §9). Same kind/status literals as
 * the Muse ActivityGroup. Failures never count as done; waiting ≠ finished.
 */

export type TurnActivityKind = 'command' | 'file' | 'hire' | 'message' | 'read' | 'check'
export type TurnActivityStatus = 'done' | 'failed' | 'running' | 'waiting'

/** One tool or report row on a thread. */
export interface TurnActivityEvent {
  readonly id: string
  readonly personaId: string
  readonly threadId: string
  readonly kind: TurnActivityKind
  readonly title: string
  readonly status: TurnActivityStatus
  readonly at: string
}

/** Mutations first, then messages; reads/checks last. */
export const ACTIVITY_KIND_ORDER: readonly TurnActivityKind[] = [
  'command', 'file', 'hire', 'message', 'read', 'check',
]

/** One persona on one thread, ready for ActivityGroup. */
export interface ActivityGroupFold {
  readonly personaId: string
  readonly threadId: string
  readonly items: readonly TurnActivityEvent[]
  readonly doneByKind: Readonly<Partial<Record<TurnActivityKind, number>>>
  readonly shownKinds: readonly TurnActivityKind[]
  readonly moreCount: number
  readonly failedCount: number
  readonly unfinished: boolean
}

/**
 * @param status - Event status.
 * @returns True only for a finished success.
 */
export function activityCountsAsDone(status: TurnActivityStatus): boolean {
  return status === 'done'
}

/**
 * Sort mutations first; keep relative order inside a kind.
 * @param events - Unsorted rows.
 * @returns Copy in display order.
 */
export function sortActivity(events: readonly TurnActivityEvent[]): TurnActivityEvent[] {
  return [...events].sort((a, b) => {
    const rank = ACTIVITY_KIND_ORDER.indexOf(a.kind) - ACTIVITY_KIND_ORDER.indexOf(b.kind)
    if (rank !== 0) return rank
    return a.at < b.at ? -1 : a.at > b.at ? 1 : 0
  })
}

/**
 * Group consecutive work per persona+thread. Failures stay listed but out of
 * the done counts; running/waiting mark the group unfinished.
 * @param events - Raw ledger of the turn.
 * @returns One fold per persona+thread.
 */
/**
 * Done / (done + failed). Empty or still-running turns are not 0%.
 * @param events - Turn rows (one thread or the whole book).
 * @returns Rate 0–1, or `null` when there is nothing finished.
 */
export function activitySuccessRate(events: readonly TurnActivityEvent[]): number | null {
  const finished = events.filter(row => row.status === 'done' || row.status === 'failed')
  if (finished.length === 0) return null
  return finished.filter(row => row.status === 'done').length / finished.length
}

export function groupTurnActivity(events: readonly TurnActivityEvent[]): ActivityGroupFold[] {
  const order: string[] = []
  const groups = new Map<string, TurnActivityEvent[]>()
  for (const row of events) {
    const key = `${row.personaId}\0${row.threadId}`
    const hit = groups.get(key)
    if (hit === undefined) {
      order.push(key)
      groups.set(key, [row])
      continue
    }
    hit.push(row)
  }
  return order.map((key) => {
    const items = sortActivity(groups.get(key) ?? [])
    const doneByKind: Partial<Record<TurnActivityKind, number>> = {}
    let failedCount = 0
    let unfinished = false
    for (const row of items) {
      if (row.status === 'failed') failedCount += 1
      if (row.status === 'running' || row.status === 'waiting') unfinished = true
      if (!activityCountsAsDone(row.status)) continue
      doneByKind[row.kind] = (doneByKind[row.kind] ?? 0) + 1
    }
    const ranked = ACTIVITY_KIND_ORDER.filter(kind => (doneByKind[kind] ?? 0) > 0)
    const moreCount = ranked.slice(2).reduce((sum, kind) => sum + (doneByKind[kind] ?? 0), 0)
    return {
      personaId: items[0]?.personaId ?? '',
      threadId: items[0]?.threadId ?? '',
      items,
      doneByKind,
      shownKinds: ranked.slice(0, 2),
      moreCount,
      failedCount,
      unfinished,
    }
  })
}
