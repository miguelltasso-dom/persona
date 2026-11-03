/**
 * Ticket-stage → kanban column (SUPERAGENT-ADOPTION §2) and review-thread (D-039).
 */

import { ticketStage, type Ticket, type TicketStage, type ThreadRef } from './core/index.ts'

/** Product columns. `waiting` is a chip on the card, not a column. */
export type KanbanColumn = 'todo' | 'doing' | 'review' | 'blocked' | 'done'

export type KanbanProjection =
  | { column: KanbanColumn; chip?: undefined }
  | { column: KanbanColumn; chip: 'waiting' }

/**
 * Project a ticket stage onto a kanban column.
 * @param stage - Result of {@link ticketStage}.
 */
export function kanbanColumn(stage: TicketStage): KanbanProjection {
  if (stage.stage === 'ended') return { column: 'done' }
  if (stage.stage === 'idle') return { column: 'doing', chip: 'waiting' }
  if (stage.stage === 'working') {
    return stage.action === 'queued' ? { column: 'todo' } : { column: 'doing' }
  }
  if (stage.action === 'review') return { column: 'review' }
  return { column: 'blocked' }
}

/**
 * Project a ticket onto a kanban card.
 * @param ticket - Engine ticket.
 */
export function projectKanban(ticket: Ticket): KanbanProjection & { ticketId: string; stage: TicketStage } {
  const stage = ticketStage(ticket)
  return { ticketId: ticket.id, stage, ...kanbanColumn(stage) }
}

/**
 * Dedicated review thread for a ticket in `person/review` (D-039).
 * The origin channel stays for coordination replies; review lives on `review:<ticketId>`.
 * @param ticket - Engine ticket.
 */
export function reviewThread(ticket: Ticket): ThreadRef | undefined {
  const stage = ticketStage(ticket)
  if (stage.stage !== 'person' || stage.action !== 'review') return undefined
  return { source: 'review', id: ticket.id }
}
