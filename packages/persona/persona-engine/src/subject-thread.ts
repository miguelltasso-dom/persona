/**
 * WAVE2 §1: one Super-agent Thread per conversation subject.
 */

import {
  bindTicketToSubject,
  subjectThreadKey,
  ticketSubjectChip,
  type ConversationRef,
  type ConversationSubject,
  type TicketSubjectLink,
} from '@deepseek-ai/dsh-persona-core'
import type { ThreadRef } from './core/model.ts'

/**
 * Thread the engine already stores (`source:id`).
 * @param conversation - DM or channel.
 * @param subjectId - Active subject.
 * @returns Super-agent thread ref.
 */
export function subjectThreadRef(conversation: ConversationRef, subjectId: string): ThreadRef {
  return { source: conversation.kind, id: `${conversation.id}:subject:${subjectId}` }
}

/**
 * @param conversation - DM or channel.
 * @param subject - Subject in view.
 * @returns Thread key already stored on the subject.
 */
export function threadKeyForSubject(conversation: ConversationRef, subject: ConversationSubject): string {
  return subject.threadKey === '' ? subjectThreadKey(conversation, subject.id) : subject.threadKey
}

export { bindTicketToSubject, ticketSubjectChip }
export type { TicketSubjectLink }
