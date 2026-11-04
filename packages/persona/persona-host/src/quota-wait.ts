/**
 * Tasks stopped by the quota window, kept until the window resets (IV-7, "No limite → Retomar").
 *
 * A message sent while the engine is unavailable is already retained by the engine (and released in order when it is ready).
 * A Task that was RUNNING when the window ran out is different: it ends blocked with a "limite" line and nothing brought it
 * back. This book remembers it (persisted, so a restart keeps it) so the host can run it again when the engine is ready:
 * on the probe saying so, at the reset clock, or when the person clicks Retomar. One row per Ticket, oldest first.
 */

import type { ScreenRepos } from '@deepseek-ai/dsh-persona-store'

export const QUOTA_WAIT_KIND = 'quota_wait'

export interface QuotaWaitRow {
  readonly ticketId: string
  /** The Assignment that hit the limit: the row is stale when the Ticket moved on to another one. */
  readonly assignmentId: string
  /** Display name of the provider ("Claude"). */
  readonly provider: string
  /** ISO clock the vendor gave for the window to reset; absent when it gave none. */
  readonly resetAt?: string
  readonly since: string
}

export class QuotaWaitBook {
  constructor(private readonly screens: ScreenRepos) {}

  /** Remember a Ticket the quota stopped (idempotent per Ticket). */
  record(projectId: string, row: QuotaWaitRow): void {
    this.screens.put(projectId, QUOTA_WAIT_KIND, row.ticketId, row)
  }

  /** @returns The waiting Tickets, oldest first. */
  list(projectId: string): QuotaWaitRow[] {
    return this.screens.list<QuotaWaitRow>(projectId, QUOTA_WAIT_KIND)
      .sort((a, b) => a.since.localeCompare(b.since) || a.ticketId.localeCompare(b.ticketId))
  }

  clear(projectId: string, ticketId: string): void {
    this.screens.delete(projectId, QUOTA_WAIT_KIND, ticketId)
  }
}

/**
 * When to look again: the earliest known reset clock (plus a short margin), or a fixed recheck when the vendor gave none.
 * @param rows - Waiting Tickets.
 * @param nowMs - Now.
 * @param fallbackMs - Recheck period when no row has a reset clock.
 * @returns Milliseconds to wait, or `undefined` when nothing waits.
 */
export function quotaRecheckDelay(rows: readonly { readonly resetAt?: string }[], nowMs: number, fallbackMs: number): number | undefined {
  if (rows.length === 0) return undefined
  const clocks = rows
    .map(row => (row.resetAt === undefined ? Number.NaN : Date.parse(row.resetAt)))
    .filter(ms => Number.isFinite(ms))
  if (clocks.length === 0) return fallbackMs
  return Math.max(1_000, Math.min(...clocks) - nowMs + 1_000)
}
