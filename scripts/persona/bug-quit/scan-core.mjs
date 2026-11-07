// BUG-QUIT-1 measurer: the ONE rule that decides which processes of a machine-wide listing belong to the app launch being measured.
// Pure (no I/O), so scan-selftest.mjs tests exactly what bug-quit.mjs runs.
//
//   rows  : every process of the machine, { pid, ppid, name, created (ISO 8601 with offset), cmd }
//   rootPid / startedAtMs : the process the script itself spawned and the instant it did so
//   known : Map pid -> row, the members of THIS launch seen by earlier listings (mutated: members of this listing are added)
//
// A process of another agent must never be pulled in (nor signalled), so ownership is proven, not assumed:
//   1. the spawned root counts only if it was created after the script started (otherwise its pid belongs to somebody else now);
//   2. a member seen before counts only if it is still THE SAME process (same creation time): a recycled pid is not ours, and neither are its children;
//   3. a child is never older than its parent: an older "child" only points at a recycled parent pid.

const born = row => Date.parse(row.created)

/**
 * @param {readonly {pid:number, ppid:number, name:string, created:string, cmd:string}[]} rows - The listing.
 * @param {{ rootPid: number, startedAtMs: number, known: Map<number, object> }} context - What this launch is.
 * @returns {Map<number, object>} The rows that belong to this launch right now, by pid.
 */
export function walkOwned(rows, { rootPid, startedAtMs, known }) {
  const byPid = new Map(rows.map(row => [row.pid, row]))
  const ours = new Map()
  const root = byPid.get(rootPid)
  if (root !== undefined && born(root) >= startedAtMs - 1000) ours.set(root.pid, root)
  for (const entry of known.values()) {
    const now = byPid.get(entry.pid)
    if (now !== undefined && now.created === entry.created) ours.set(now.pid, now)
  }
  for (let grew = true; grew;) {
    grew = false
    for (const row of rows) {
      if (ours.has(row.pid)) continue
      const parent = ours.get(row.ppid)
      if (parent !== undefined && born(row) >= born(parent)) { ours.set(row.pid, row); grew = true }
    }
  }
  for (const row of ours.values()) known.set(row.pid, row)
  return ours
}
