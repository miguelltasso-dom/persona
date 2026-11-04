/** Counters and filters over the single Decision[] (every screen reads these, never its own count). */

import type { Decision } from './decision-types.ts'

/** A card the person can still act on: waiting, or back after a failed attempt. */
export function isDecisionOpen(decision: Decision): boolean {
  return decision.state === 'pending' || decision.state === 'failed'
}

/** Blocking decisions someone is waiting on (Visão geral "Precisa de você" and the Aprovações reactive list). */
export function blockingDecisions(decisions: readonly Decision[] | undefined): readonly Decision[] {
  return (decisions ?? []).filter(decision => decision.blocking)
}

/** The one number: chip "2 pendentes", rail badge and tray all read this. */
export function openBlockingCount(decisions: readonly Decision[] | undefined): number {
  return blockingDecisions(decisions).filter(isDecisionOpen).length
}

/** Titles of what blocks the team (kept in the snapshot for older consumers). */
export function openBlockingTitles(decisions: readonly Decision[] | undefined): readonly string[] {
  return blockingDecisions(decisions).filter(isDecisionOpen).map(decision => decision.title)
}
