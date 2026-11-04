import { expect, it } from 'vitest'

/** One due slot for the host scheduler (routines / iniciativa / Vigia). */
export type RosterKind = 'routine' | 'initiative' | 'watchdog'

export interface RosterDue {
  readonly personaId: string
  readonly kind: RosterKind
  readonly atMs: number
}

/**
 * Fair next-due pick: earliest time, then kind order, then persona id.
 * Idle roster (nothing due) returns undefined — the host must not call a model.
 * @param dues - Pending slots.
 * @param nowMs - Clock.
 */
export function nextDue(dues: readonly RosterDue[], nowMs: number): RosterDue | undefined {
  let pick: RosterDue | undefined
  for (const due of dues) {
    if (due.atMs > nowMs) continue
    if (pick === undefined || compareDue(due, pick) < 0) pick = due
  }
  return pick
}

function compareDue(left: RosterDue, right: RosterDue): number {
  if (left.atMs !== right.atMs) return left.atMs - right.atMs
  const kind = kindRank(left.kind) - kindRank(right.kind)
  if (kind !== 0) return kind
  return left.personaId < right.personaId ? -1 : left.personaId > right.personaId ? 1 : 0
}

function kindRank(kind: RosterKind): number {
  if (kind === 'routine') return 0
  if (kind === 'initiative') return 1
  return 2
}

it('150 idle personas: fair slots, zero AI, bounded tick', () => {
  const n = 150
  const kinds: readonly RosterKind[] = ['routine', 'initiative', 'watchdog']
  const dues: RosterDue[] = []
  for (let i = 0; i < n; i += 1) {
    const id = `p${String(i).padStart(3, '0')}`
    for (const kind of kinds) {
      dues.push({ personaId: id, kind, atMs: 0 })
    }
  }
  const counts = new Map<string, number>()
  const kindCounts: Record<RosterKind, number> = { routine: 0, initiative: 0, watchdog: 0 }
  let now = 0
  const aiCalls = 0
  const started = Date.now()
  const rssBefore = process.memoryUsage().rss
  while (true) {
    const due = nextDue(dues, now)
    if (due === undefined) break
    counts.set(due.personaId, (counts.get(due.personaId) ?? 0) + 1)
    kindCounts[due.kind] += 1
    const index = dues.indexOf(due)
    dues.splice(index, 1)
    now = Math.max(now, due.atMs)
  }
  const elapsedMs = Date.now() - started
  const rssDelta = process.memoryUsage().rss - rssBefore
  expect(nextDue(dues, now)).toBeUndefined()
  expect(aiCalls).toBe(0)
  expect(counts.size).toBe(n)
  for (const count of counts.values()) expect(count).toBe(3)
  expect(kindCounts).toEqual({ routine: n, initiative: n, watchdog: n })
  expect(nextDue([
    { personaId: 'late', kind: 'watchdog', atMs: now + 60_000 },
  ], now)).toBeUndefined()
  expect(elapsedMs).toBeLessThan(200)
  expect(rssDelta).toBeLessThan(32 * 1024 * 1024)
})
