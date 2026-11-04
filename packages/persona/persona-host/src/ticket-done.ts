/**
 * The id of the line the coordination posts when a Ticket's run ends (delivery or failure).
 *
 * It used to be one id per Ticket (`coord-<ticket>-done`), so a Ticket that failed once was never run again: a retry, an
 * answered question or a Task waiting for the quota to come back created a new Assignment that every loop skipped because
 * "the done line already exists" (Bolt's finding, IV-7). The id now follows the Assignment: the first one keeps the old id
 * (nothing already stored moves), every later one gets its own.
 */

/** @param ticket - The Ticket (only its id and its Assignments are read). @returns The id of the done line of its current run. */
export function doneEventId(ticket: { readonly id: string; readonly assignments: readonly { readonly id: string }[] }): string {
  const latest = ticket.assignments.at(-1)
  return ticket.assignments.length <= 1 || latest === undefined ? `coord-${ticket.id}-done` : `coord-${ticket.id}-${latest.id}-done`
}
