/**
 * Person answers Attention: the answer binds the captured ticket and resumes it.
 */

import type { Ticket, TicketInput } from './core/model.ts'

/**
 * Clear the open question and append the person's answer as an input.
 * The host then wakes the worker (Engine.receive of the human follow-up also does).
 * @param ticket - Ticket with Attention.
 * @param text - Person's answer.
 * @param at - ISO timestamp.
 */
export function applyAttentionAnswer(ticket: Ticket, text: string, at: string): Ticket {
  const input: TicketInput = { id: `ans-${ticket.id}-${at}`, kind: 'text', text, at }
  const next: Ticket = {
    ...ticket,
    inputs: [...ticket.inputs, input],
    undelivered: [...ticket.undelivered, input.id],
    updatedAt: at,
  }
  delete next.attention
  return next
}

/**
 * @param read - Card `read` pointer (`ticket/<id>` …).
 */
export function citedCardTicketId(read: string): string | undefined {
  const match = /^ticket\/([^/]+)/.exec(read)
  return match?.[1]
}
