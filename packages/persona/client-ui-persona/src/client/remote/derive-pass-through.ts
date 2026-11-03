import type { PersonaNowSnapshot } from '../team/persona-work-state.ts'

/** Personas actively following the current subject (pass-through), not coordination. */
export function passThroughFollowers(rows: readonly PersonaNowSnapshot[]): readonly { readonly name: string }[] {
  const out: { name: string }[] = []
  for (const row of rows) {
    if (row.currentTask === undefined || row.currentTask.length === 0) continue
    if (row.member.state !== 'working' && row.member.state !== 'waiting') continue
    if (row.member.systemRoles?.includes('coordination') === true) continue
    out.push({ name: row.member.name })
  }
  return out
}
