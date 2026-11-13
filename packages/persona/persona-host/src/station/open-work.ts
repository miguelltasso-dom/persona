/**
 * M4 (Marco Dogfood, critério 4): how many cards the paired station could still move on its own. It keeps Windows awake between turns (backoff, retries, the wait for
 * memory) and lets it sleep when only cards waiting for the person are left.
 *
 * A card counts when it is not finished and its latest Assignment is `pending`, or `running` with no report yet or a `progress` report (work in progress). A card whose
 * Assignment ended or whose report is `blocked` / `failed` / `waiting` / `ready` needs a person or a Trigger, so it does not count. The cards the station itself stopped
 * ("sem vaga") are counted by the gate, under their own source.
 */

/** The part of a Ticket this count reads. */
export interface OpenWorkTicket {
  readonly ended?: unknown
  readonly assignments: readonly { readonly state: string; readonly report?: { readonly state: string } }[]
}

/**
 * @param projects - The tickets of each open project.
 * @returns How many cards have work the station can do by itself.
 */
export function countOpenWork(projects: Iterable<readonly OpenWorkTicket[]>): number {
  let count = 0
  for (const tickets of projects) {
    for (const ticket of tickets) {
      if (ticket.ended !== undefined) continue
      const latest = ticket.assignments.at(-1)
      if (latest === undefined) continue
      if (latest.state === 'pending' || (latest.state === 'running' && (latest.report === undefined || latest.report.state === 'progress'))) count += 1
    }
  }
  return count
}
