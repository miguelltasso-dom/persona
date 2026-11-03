/** Always-on shell IPC. Renderer → main for attention/power; main → renderer for deep links. */

export const ALWAYS_ON_IPC = {
  attention: 'dsh-desktop:attention',
  runningAssignments: 'dsh-desktop:running-assignments',
  catchUp: 'dsh-desktop:catch-up',
  openTask: 'dsh-desktop:open-task',
  pauseTeam: 'dsh-desktop:pause-team',
} as const

export interface AlwaysOnAttentionPayload {
  readonly id: string
  readonly kind: 'needs-you' | 'review'
  readonly title: string
  readonly ticketId: string
  readonly at: string
}

/**
 * Validate a renderer attention payload at the IPC wire.
 * @param value - Untrusted IPC argument.
 */
export function isAlwaysOnAttention(value: unknown): value is AlwaysOnAttentionPayload {
  if (typeof value !== 'object' || value === null) return false
  const rec = value as Record<string, unknown>
  return typeof rec.id === 'string' && rec.id.length > 0
    && (rec.kind === 'needs-you' || rec.kind === 'review')
    && typeof rec.title === 'string'
    && typeof rec.ticketId === 'string' && rec.ticketId.length > 0
    && typeof rec.at === 'string'
}

/**
 * Coerce a running-assignment count from IPC.
 * @param value - Untrusted IPC argument.
 */
export function runningAssignmentCount(value: unknown): number | undefined {
  if (typeof value !== 'number' || !Number.isFinite(value) || value < 0) return undefined
  return Math.floor(value)
}
