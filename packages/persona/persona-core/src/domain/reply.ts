/**
 * A reply binds the run and thread captured at send time, not the current tab.
 */

export interface ReplyCapture {
  runId: string
  ticketId: string
  threadKey: string
}

/**
 * @param runId - Assignment or session run.
 * @param ticketId - Ticket in view when the person started the reply.
 * @param threadKey - Thread in view when the person started the reply.
 */
export function captureReplyTarget(runId: string, ticketId: string, threadKey: string): ReplyCapture {
  return { runId, ticketId, threadKey }
}

/**
 * The current tab is ignored. The capture from send-time wins.
 * @param capture - Run/thread captured when the reply started.
 * @param currentTab - Whatever the UI now shows (unused).
 */
export function replyUsesCapture(capture: ReplyCapture, currentTab: { ticketId?: string; threadKey?: string }): ReplyCapture {
  void currentTab
  return capture
}
