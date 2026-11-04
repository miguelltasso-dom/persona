/**
 * Colored conversation subjects (WAVE2 §1). Color + name always (never color only).
 */

import { DomainError } from './schemas.ts'

export const SUBJECT_COLORS = ['lilac', 'amber', 'mint', 'rose', 'sky', 'peach', 'ink'] as const
export type SubjectColor = (typeof SUBJECT_COLORS)[number]
export type SubjectColorIndex = 0 | 1 | 2 | 3 | 4 | 5 | 6

export const SUBJECT_COLOR_NAMES: Record<SubjectColor, string> = {
  lilac: 'Lilás',
  amber: 'Âmbar',
  mint: 'Menta',
  rose: 'Rosa',
  sky: 'Céu',
  peach: 'Pêssego',
  ink: 'Tinta',
}

export const DEFAULT_SUBJECT_PACK: readonly {
  readonly id: string
  readonly name: string
  readonly color: SubjectColor
  readonly colorIndex: SubjectColorIndex
}[] = [
  { id: 'subject-geral', name: 'Geral', color: 'lilac', colorIndex: 0 },
  { id: 'subject-ui', name: 'UI', color: 'amber', colorIndex: 1 },
  { id: 'subject-func', name: 'Funcionalidades', color: 'mint', colorIndex: 2 },
  { id: 'subject-fin', name: 'Financeiro', color: 'rose', colorIndex: 3 },
  { id: 'subject-mkt', name: 'Marketing', color: 'sky', colorIndex: 4 },
  { id: 'subject-ops', name: 'Operações', color: 'peach', colorIndex: 5 },
  { id: 'subject-arq', name: 'Arquivo', color: 'ink', colorIndex: 6 },
]

export interface ConversationRef {
  readonly kind: 'dm' | 'channel'
  readonly id: string
}

export interface ConversationSubject {
  readonly id: string
  readonly conversationId: string
  readonly color: SubjectColor
  readonly colorIndex: SubjectColorIndex
  readonly name: string
  readonly archived: boolean
  readonly unread: number
  readonly workingPersonaIds: readonly string[]
  readonly threadKey: string
}

export interface ConversationMessage {
  readonly id: string
  readonly conversationId: string
  readonly subjectId: string
  readonly body: string
  readonly sequence: number
  readonly at: string
}

export interface TicketSubjectLink {
  readonly ticketId: string
  readonly subjectId: string
  readonly conversationId: string
  readonly color: SubjectColor
  readonly colorIndex: SubjectColorIndex
  readonly name: string
}

/**
 * Super-agent Thread key: `kind:conversationId:subject:subjectId`.
 * @param conversation - DM or channel.
 * @param subjectId - Subject id.
 * @returns Stable thread key.
 */
export function subjectThreadKey(conversation: ConversationRef, subjectId: string): string {
  return `${conversation.kind}:${conversation.id}:subject:${subjectId}`
}

/**
 * Seven default subjects. Names are never empty so the chip is never color-only.
 * @param conversation - DM or channel.
 * @returns The default pack for that conversation.
 */
export function defaultSubjects(conversation: ConversationRef): ConversationSubject[] {
  const conversationId = `${conversation.kind}:${conversation.id}`
  return DEFAULT_SUBJECT_PACK.map(row => ({
    id: row.id,
    conversationId,
    color: row.color,
    colorIndex: row.colorIndex,
    name: row.name,
    archived: false,
    unread: 0,
    workingPersonaIds: [],
    threadKey: subjectThreadKey(conversation, row.id),
  }))
}

/**
 * @param subject - Current subject.
 * @param name - Non-empty display name.
 * @returns Subject with the new name.
 */
export function renameSubject(subject: ConversationSubject, name: string): ConversationSubject {
  const trimmed = name.trim()
  if (trimmed === '') throw new DomainError('INVALID_SUBJECT', 'NAME_REQUIRED')
  return { ...subject, name: trimmed }
}

/**
 * @param subject - Subject to archive.
 * @returns Archived subject (unread and working cleared).
 */
export function archiveSubject(subject: ConversationSubject): ConversationSubject {
  return { ...subject, archived: true, unread: 0, workingPersonaIds: [] }
}

/**
 * @param subjects - Conversation subjects.
 * @param subjectId - Subject to open.
 * @returns The live subject with unread cleared.
 */
export function activateSubject(
  subjects: readonly ConversationSubject[],
  subjectId: string,
): ConversationSubject {
  const found = subjects.find(row => row.id === subjectId)
  if (found === undefined || found.archived) throw new DomainError('INVALID_SUBJECT', 'UNKNOWN')
  return { ...found, unread: 0 }
}

/**
 * @param subject - Subject that received a message while not in view.
 * @returns Subject with unread incremented.
 */
export function bumpUnread(subject: ConversationSubject): ConversationSubject {
  return { ...subject, unread: subject.unread + 1 }
}

/**
 * @param subject - Subject a persona is working on.
 * @param personaId - Worker.
 * @param working - True to add, false to remove.
 * @returns Subject with the working set updated.
 */
export function markSubjectWorking(
  subject: ConversationSubject,
  personaId: string,
  working: boolean,
): ConversationSubject {
  const next = subject.workingPersonaIds.filter(id => id !== personaId)
  if (working) next.push(personaId)
  return { ...subject, workingPersonaIds: next }
}

/**
 * @param message - Message on the conversation.
 * @param dest - Destination subject (same conversation, not archived).
 * @returns Message tagged with the destination subject.
 */
export function moveMessageToSubject(
  message: ConversationMessage,
  dest: ConversationSubject,
): ConversationMessage {
  if (dest.archived) throw new DomainError('INVALID_SUBJECT', 'ARCHIVED')
  if (dest.conversationId !== message.conversationId) {
    throw new DomainError('INVALID_SUBJECT', 'OTHER_CONVERSATION')
  }
  return { ...message, subjectId: dest.id }
}

/**
 * Search / recall filter: subject and optional date window (inclusive).
 * @param messages - Already-scoped messages.
 * @param subjectId - Active or queried subject.
 * @param window - Optional ISO bounds.
 * @returns Messages on that subject inside the window.
 */
export function filterMessagesBySubject(
  messages: readonly ConversationMessage[],
  subjectId: string,
  window?: { since?: string; until?: string },
): ConversationMessage[] {
  const from = window?.since === undefined ? -Infinity : Date.parse(window.since)
  const to = window?.until === undefined ? Infinity : Date.parse(window.until)
  return messages.filter((row) => {
    if (row.subjectId !== subjectId) return false
    const at = Date.parse(row.at)
    return Number.isFinite(at) && at >= from && at <= to
  })
}

/**
 * @param ticketId - Ticket created from this subject.
 * @param subject - Origin subject.
 * @returns Durable ticket↔subject link.
 */
export function bindTicketToSubject(ticketId: string, subject: ConversationSubject): TicketSubjectLink {
  if (ticketId.trim() === '') throw new DomainError('INVALID_SUBJECT', 'TICKET')
  return {
    ticketId,
    subjectId: subject.id,
    conversationId: subject.conversationId,
    color: subject.color,
    colorIndex: subject.colorIndex,
    name: subject.name,
  }
}

/**
 * Board chip: color + name (WAVE2 a11y).
 * @param link - Ticket origin.
 * @returns Color, index, and name for the card.
 */
export function ticketSubjectChip(link: TicketSubjectLink): { color: SubjectColor; colorIndex: SubjectColorIndex; name: string } {
  return { color: link.color, colorIndex: link.colorIndex, name: link.name }
}

/**
 * Live board card: subject id for `TaskView.topicId` plus the chip.
 * @param link - Ticket origin.
 * @returns Topic id and chip fields.
 */
export function ticketCardTopic(link: TicketSubjectLink): {
  readonly topicId: string
  readonly name: string
  readonly color: SubjectColor
  readonly colorIndex: SubjectColorIndex
} {
  return { topicId: link.subjectId, ...ticketSubjectChip(link) }
}
