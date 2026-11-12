/** Always-on shell IPC. Renderer → main for attention/power; main → renderer for deep links. */

import { PERSONA_TICKET_ID } from './deep-link.ts'

export const ALWAYS_ON_IPC = {
  attention: 'dsh-desktop:attention',
  runningAssignments: 'dsh-desktop:running-assignments',
  /** Renderer → main: the number shown as "Precisa de você · n" on the tray. A SET, never an increment. */
  needsYouCount: 'dsh-desktop:needs-you-count',
  catchUp: 'dsh-desktop:catch-up',
  openTask: 'dsh-desktop:open-task',
  /** Main → renderer: a valid invitation link was opened (team id, token). The screen shows the team and a button; nothing joins alone. */
  openInvite: 'dsh-desktop:open-invite',
  pauseTeam: 'dsh-desktop:pause-team',
} as const

export interface AlwaysOnAttentionPayload {
  readonly id: string
  readonly kind: 'needs-you' | 'review' | 'question' | 'failed' | 'done'
  readonly title: string
  readonly ticketId: string
  readonly at: string
  readonly personaName?: string
  readonly avatarId?: string
  readonly question?: string
  readonly code?: string
  readonly threadId?: string
  readonly streamId?: string
}

/**
 * Validate a renderer attention payload at the IPC wire.
 * @param value - Untrusted IPC argument.
 */
export function isAlwaysOnAttention(value: unknown): value is AlwaysOnAttentionPayload {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return typeof rec.id === 'string' && rec.id.length > 0
    && (rec.kind === 'needs-you' || rec.kind === 'review' || rec.kind === 'question' || rec.kind === 'failed' || rec.kind === 'done')
    && typeof rec.title === 'string'
    && typeof rec.ticketId === 'string' && PERSONA_TICKET_ID.test(rec.ticketId)
    && typeof rec.at === 'string'
    && ['personaName', 'avatarId', 'question', 'code', 'threadId', 'streamId']
      .every(key => rec[key] === undefined || typeof rec[key] === 'string')
}

/** Validate a set of resolved event IDs received from the renderer. */
export function isAlwaysOnResolved(value: unknown): value is { kind: 'resolved'; eventIds: string[] } {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return rec.kind === 'resolved' && Array.isArray(rec.eventIds)
    && rec.eventIds.every(id => typeof id === 'string' && id.length > 0)
}

/**
 * Coerce a running-assignment count from IPC.
 * @param value - Untrusted IPC argument.
 */
export function runningAssignmentCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.floor(value)
}

/**
 * Coerce the "needs you" count the renderer sets for the tray.
 * @param value - Untrusted IPC argument.
 * @returns A whole number >= 0, or undefined for anything else (the previous count then stays).
 */
export function needsYouCountValue(value: unknown): number | undefined {
  return runningAssignmentCount(value)
}
