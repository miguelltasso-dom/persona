/**
 * Ticket-stage → kanban column (SUPERAGENT-ADOPTION §2) and review-thread (D-039).
 */

import type { StageCategory } from '@deepseek-ai/dsh-persona-core'
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
 * Map the old mixed-board column (PB-10) onto a stage category.
 * `blocked` stays a marker; the card sits in `needs_you`.
 * @param column - Legacy GlobalKanban column.
 */
export function legacyKanbanToCategory(column: KanbanColumn): StageCategory {
  if (column === 'blocked') return 'needs_you'
  return column
}

/**
 * Portuguese labels of the pre-Quadros board.
 * @param label - Visible column name.
 */
export function legacyColumnLabelToCategory(label: string): StageCategory | undefined {
  const key = label.trim().toLowerCase()
  if (key === 'a fazer' || key === 'todo') return 'todo'
  if (key === 'em andamento' || key === 'andando' || key === 'doing') return 'doing'
  if (key === 'em revisão' || key === 'revisar' || key === 'review') return 'review'
  if (key === 'bloqueado' || key === 'precisa de você' || key === 'blocked' || key === 'needs_you') return 'needs_you'
  if (key === 'concluído' || key === 'pronto' || key === 'done') return 'done'
  return undefined
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
