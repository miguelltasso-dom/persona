/**
 * Bounded model-facing cards. Full bodies stay behind a `read` pointer.
 * Generic: no GitHub, no Feishu.
 */

import {
  latestReport, reasonText, threadKey, ticketStage,
  type Decision, type Mandate, type Thread, type Ticket, type TicketInput, type Trigger, type TriggerDisposition,
} from './core/index.ts'
import { capped, preview } from './views/text.ts'

export const INPUTS = 10
export const ASSIGNMENTS = 3
const INPUT_TEXT = 80

export const TICKET_STATES = [
  'person/delivery', 'person/answer', 'person/review', 'person/blocked', 'person/failed',
  'working', 'working/queued', 'idle',
  'completed', 'merged', 'closed', 'dropped', 'stopped',
] as const
export type TicketCardState = typeof TICKET_STATES[number]

function cardState(ticket: Ticket): TicketCardState {
  if (ticket.ended) return ticket.ended.outcome
  const stage = ticketStage(ticket)
  if (stage.stage === 'person') return `person/${stage.action}`
  return stage.stage === 'idle' ? 'idle' : stage.stage === 'working' && stage.action ? 'working/queued' : 'working'
}

/**
 * @param trigger - Immutable trigger.
 * @param disposition - Optional routing record.
 */
export function triggerCard(trigger: Trigger, disposition?: TriggerDisposition): {
  trigger_id: string
  source: string
  actor: string
  thread: string
  human: boolean
  at: string
  preview: string
  chars: number
  spilled: boolean
  read: string
  source_url?: string
  disposition?: { filtered?: string; decision_id?: string; delivered_to: string[] }
} {
  const cap = capped(trigger.text)
  const card: ReturnType<typeof triggerCard> = {
    trigger_id: trigger.id,
    source: trigger.source,
    actor: trigger.actor.id,
    thread: threadKey(trigger.threads[0]!),
    human: trigger.human,
    at: trigger.at,
    preview: cap.preview,
    chars: cap.chars,
    spilled: cap.spilled,
    read: `trigger/${trigger.id}`,
  }
  if (trigger.url !== undefined) card.source_url = trigger.url
  if (disposition !== undefined) {
    const item: { filtered?: string; decision_id?: string; delivered_to: string[] } = { delivered_to: disposition.fanout }
    if (disposition.filtered !== undefined) item.filtered = reasonText(disposition.filtered)
    if (disposition.decisionId !== undefined) item.decision_id = disposition.decisionId
    card.disposition = item
  }
  return card
}

/**
 * @param ticket - Ticket.
 */
export function ticketCard(ticket: Ticket): {
  ticket_id: string
  title: string
  state: TicketCardState
  strength: string
  preview: string
  chars: number
  spilled: boolean
  read: string
  ended?: { at: string; by: string; reason: string }
  attention?: { question: string; trigger_id?: string }
} {
  const summary = latestReport(ticket)?.summary ?? ''
  const cap = capped(summary)
  const card: ReturnType<typeof ticketCard> = {
    ticket_id: ticket.id,
    title: ticket.title,
    state: cardState(ticket),
    strength: ticket.mandate.strength,
    preview: cap.preview,
    chars: cap.chars,
    spilled: cap.spilled,
    read: `ticket/${ticket.id}`,
  }
  if (ticket.ended !== undefined) {
    card.ended = { at: ticket.ended.at, by: ticket.ended.by, reason: ticket.ended.reason ?? ticket.ended.outcome }
  }
  if (ticket.attention !== undefined) {
    const attention: { question: string; trigger_id?: string } = { question: ticket.attention.question }
    if (ticket.attention.triggerId !== undefined) attention.trigger_id = ticket.attention.triggerId
    card.attention = attention
  }
  return card
}

const mandateOf = ({ policyVersion: _version, ...mandate }: Mandate): Omit<Mandate, 'policyVersion'> => mandate

/**
 * @param ticket - Ticket.
 * @param input - One input.
 * @param worker - Hide decision ids from workers.
 */
export function inputLine(ticket: Ticket, input: TicketInput, worker = false): Record<string, unknown> {
  const read = { read: `ticket/${ticket.id}/input/${input.id}` }
  const names = input.kind === 'trigger' || input.kind === 'resumed'
    ? { trigger_id: input.triggerId }
    : input.kind === 'reopen' && !worker
      ? { decision_id: input.decisionId }
      : input.kind === 'text'
        ? (input.text.length <= INPUT_TEXT
          ? { text: input.text }
          : { preview: preview(input.text, INPUT_TEXT), chars: input.text.length, ...read })
        : read
  return {
    kind: input.kind,
    at: input.at,
    ...names,
    ...ticket.undelivered.includes(input.id) ? { undelivered: true } : {},
  }
}

/**
 * @param ticket - Ticket.
 * @param item - Assignment.
 */
export function assignmentLine(ticket: Ticket, item: Ticket['assignments'][number]): Record<string, unknown> {
  const line: Record<string, unknown> = { id: item.id, state: item.state, at: item.createdAt }
  if (item.endedReason !== undefined) line.ended_reason = reasonText({ code: item.endedReason })
  if (item.report !== undefined) {
    const cap = capped(item.report.summary, 100)
    line.report = {
      state: item.report.state,
      at: item.report.at,
      preview: cap.preview,
      chars: cap.chars,
      spilled: cap.spilled,
      read: `ticket/${ticket.id}/report/${item.id}`,
    }
  }
  return line
}

/**
 * @param items - Oldest-first store order.
 * @param offset - Skip from newest.
 * @param size - Page size.
 * @param line - Projector.
 * @param next - Next resource id.
 */
export function newestPage<T, L>(
  items: readonly T[],
  offset: number,
  size: number,
  line: (item: T) => L,
  next: string,
): { items: L[]; next_resource?: string; next_offset?: number } {
  const newest = items.slice().reverse()
  const more = offset + size < newest.length
  const page: { items: L[]; next_resource?: string; next_offset?: number } = {
    items: newest.slice(offset, offset + size).map(line),
  }
  if (more) {
    page.next_resource = next
    page.next_offset = offset + size
  }
  return page
}

export interface TicketThread { thread: string; context?: true; bound?: true }

/**
 * @param ticket - Ticket.
 * @param threads - Linked threads.
 * @param worker - Hide decision ids.
 */
export function ticketDetails(ticket: Ticket, threads: TicketThread[], worker = false): Record<string, unknown> {
  const card = ticketCard(ticket)
  return {
    ...card,
    trigger_id: ticket.origin.triggerId,
    ...worker ? {} : { decision_id: ticket.decisionId },
    threads,
    directory: ticket.execution?.directory,
    scope: ticket.mandate.scope,
    requested_by: ticket.mandate.actor.id,
    assignments: newestPage(ticket.assignments, 0, ASSIGNMENTS, item => assignmentLine(ticket, item), `ticket/${ticket.id}/assignments`),
    inputs: newestPage(ticket.inputs, 0, INPUTS, input => inputLine(ticket, input, worker), `ticket/${ticket.id}/inputs`),
    assignment: `ticket/${ticket.id}/assignment`,
    result: `ticket/${ticket.id}/result`,
    transcript: `ticket/${ticket.id}/transcript`,
  }
}

/**
 * @param thread - Thread.
 * @param label - Display label.
 */
export function threadCard(thread: Thread, label: string): Record<string, unknown> {
  const card: Record<string, unknown> = {
    thread: thread.key,
    label,
    source: thread.ref.source,
    tickets: thread.subscriptions,
    pending: thread.pending.length,
    read: `thread/${thread.key}`,
  }
  if (thread.evaluating !== undefined) {
    card.evaluating = { since: thread.evaluating.startedAt, deadline: thread.evaluating.deadline }
  }
  return card
}

/**
 * @param decision - Decision.
 */
export function decisionCard(decision: Decision): Record<string, unknown> {
  const card: Record<string, unknown> = {
    decision_id: decision.id,
    kind: decision.kind,
    reason: reasonText(decision.reason),
    strength: decision.strength,
    thread: decision.threadKey,
    trigger_ids: decision.triggerIds,
    at: decision.at,
    read: `decision/${decision.id}`,
  }
  if (decision.ticketId !== undefined) card.ticket_id = decision.ticketId
  return card
}

/**
 * @param decision - Decision.
 */
export function decisionDetails(decision: Decision): Record<string, unknown> {
  return {
    ...decisionCard(decision),
    ...decision.mandate ? { mandate: mandateOf(decision.mandate) } : {},
    ...decision.audit ? { audit: decision.audit } : {},
  }
}

/**
 * UTF-16 slice so concatenated pages reconstruct the exact string.
 * @param resource - Resource id.
 * @param text - Full body.
 * @param offset - Start.
 * @param limit - Page size.
 */
export function textPage(resource: string, text: string, offset: number, limit: number): {
  resource: string
  offset: number
  total_chars: number
  next_offset: number | null
  text: string
} {
  const end = Math.min(text.length, offset + limit)
  return { resource, offset, total_chars: text.length, next_offset: end < text.length ? end : null, text: text.slice(offset, end) }
}
