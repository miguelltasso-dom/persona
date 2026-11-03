/**
 * Ticket stage ↔ project workflow column (D-053 / PB-2).
 * Domain types live in persona-core; this file only projects engine Tickets.
 */

import {
  firstColumnOf,
  wipWarning,
  type ProjectWorkflow,
  type StageCategory,
  type TicketBoardSeat,
} from '@deepseek-ai/dsh-persona-core'
import { ticketStage, type Ticket, type TicketStage } from './core/index.ts'
import { kanbanColumn } from './kanban.ts'
import { WorkflowError } from './workflow-error.ts'

export type { TicketBoardSeat as TicketPlacement }

/**
 * Map an engine ticket stage onto a board category.
 * `blocked`/`failed` waiting on a person is `needs_you` plus a blocked marker.
 * @param stage - {@link ticketStage} result.
 */
export function stageCategory(stage: TicketStage): StageCategory {
  if (stage.stage === 'ended') return 'done'
  if (stage.stage === 'idle') return 'doing'
  if (stage.stage === 'working') return stage.action === 'queued' ? 'todo' : 'doing'
  if (stage.action === 'review') return 'review'
  return 'needs_you'
}

/**
 * Whether the stage also raises the blocked marker.
 * @param stage - {@link ticketStage} result.
 */
export function stageBlocked(stage: TicketStage): boolean {
  return stage.stage === 'person' && (stage.action === 'blocked' || stage.action === 'failed')
}

/**
 * Column the ticket should occupy. A stored placement wins when its column still
 * exists and matches the current stage category; otherwise the first column of
 * that category. Missing category column → undefined (blank flow).
 * @param workflow - Project flow.
 * @param ticket - Engine ticket.
 * @param placement - Stored seat, when any.
 */
export function resolveColumn(
  workflow: ProjectWorkflow,
  ticket: Ticket,
  placement?: TicketBoardSeat,
) {
  const category = stageCategory(ticketStage(ticket))
  const storedId = placement?.columnId ?? ticket.columnId
  if (storedId !== undefined) {
    const current = workflow.columns.find(column => column.id === storedId)
    if (current !== undefined && current.category === category) return current
  }
  return firstColumnOf(workflow, category)
}

/**
 * After an automatic stage change: seat the ticket on the first column of the new category.
 * @param workflow - Project flow.
 * @param ticket - Ticket whose stage just changed.
 * @param placement - Previous seat.
 */
export function syncPlacementFromStage(
  workflow: ProjectWorkflow,
  ticket: Ticket,
  placement?: TicketBoardSeat,
): TicketBoardSeat {
  const stage = ticketStage(ticket)
  const column = firstColumnOf(workflow, stageCategory(stage))
  const next: TicketBoardSeat = {
    projectId: workflow.projectId,
    ticketId: ticket.id,
    ...(placement?.campos !== undefined ? { campos: placement.campos } : {}),
    ...(placement?.sprintId !== undefined ? { sprintId: placement.sprintId } : ticket.sprintId !== undefined ? { sprintId: ticket.sprintId } : {}),
  }
  if (column !== undefined) next.columnId = column.id
  if (placement?.blocked === true || stageBlocked(stage)) next.blocked = true
  return next
}

/**
 * Mutate ticket fields so {@link ticketStage} matches a category (manual column move).
 * @param ticket - Current ticket.
 * @param category - Column category the person chose.
 * @param now - ISO now.
 */
export function applyCategoryToTicket(ticket: Ticket, category: StageCategory, now: string): Ticket {
  const next: Ticket = {
    ...ticket,
    assignments: ticket.assignments.map(row => ({ ...row })),
    inputs: [...ticket.inputs],
    undelivered: [...ticket.undelivered],
    updatedAt: now,
  }
  if (category === 'done') {
    if (next.ended === undefined) next.ended = { at: now, by: 'human', outcome: 'completed' }
    delete next.attention
    delete next.delivery
    return next
  }
  delete next.ended
  if (category === 'needs_you') {
    if (next.attention === undefined) next.attention = { id: `att-${ticket.id}`, question: 'Precisa de você' }
    return next
  }
  delete next.attention
  if (category === 'review') {
    if (next.assignments.length === 0) {
      next.assignments = [{
        id: `asg-${ticket.id}`, state: 'ended', createdAt: now, endedAt: now,
        report: { state: 'ready', summary: 'Pronto para revisão', at: now },
      }]
      return next
    }
    const last = { ...next.assignments[next.assignments.length - 1]! }
    last.state = 'ended'
    last.endedAt = now
    last.report = { state: 'ready', summary: last.report?.summary ?? 'Pronto para revisão', at: now }
    next.assignments = [...next.assignments.slice(0, -1), last]
    return next
  }
  if (category === 'doing') {
    if (next.assignments.length === 0) {
      next.assignments = [{
        id: `asg-${ticket.id}`, state: 'running', createdAt: now, startedAt: now,
        report: { state: 'progress', summary: '', at: now },
      }]
      return next
    }
    const last = { ...next.assignments[next.assignments.length - 1]! }
    last.state = 'running'
    last.startedAt = last.startedAt ?? now
    last.report = { state: 'progress', summary: last.report?.summary ?? '', at: now }
    next.assignments = [...next.assignments.slice(0, -1), last]
    return next
  }
  if (next.assignments.length === 0) {
    next.assignments = [{ id: `asg-${ticket.id}`, state: 'pending', createdAt: now }]
    return next
  }
  const last = { ...next.assignments[next.assignments.length - 1]! }
  last.state = 'pending'
  delete last.report
  next.assignments = [...next.assignments.slice(0, -1), last]
  return next
}

/**
 * Move a ticket onto a column. Adjusts the ticket stage to the column category.
 * WIP is a warning (D-053) — the move still happens.
 * @param workflow - Project flow.
 * @param ticket - Ticket being moved.
 * @param columnId - Destination.
 * @param placements - Current seats (this ticket's old seat is ignored for WIP).
 * @param now - ISO now.
 */
export function moveToColumn(
  workflow: ProjectWorkflow,
  ticket: Ticket,
  columnId: string,
  placements: readonly TicketBoardSeat[],
  now: string,
): { ticket: Ticket; placement: TicketBoardSeat; wipWarning: boolean } {
  const column = workflow.columns.find(row => row.id === columnId)
  if (column === undefined) throw new WorkflowError('unknown_column', columnId)
  const previous = placements.find(row => row.ticketId === ticket.id)
  const nextTicket = applyCategoryToTicket(ticket, column.category, now)
  nextTicket.columnId = columnId
  const placement: TicketBoardSeat = {
    projectId: workflow.projectId,
    ticketId: ticket.id,
    columnId,
    ...(previous?.campos !== undefined ? { campos: previous.campos } : {}),
    ...(previous?.sprintId !== undefined ? { sprintId: previous.sprintId } : {}),
    ...(previous?.blocked === true ? { blocked: true } : {}),
  }
  return {
    ticket: nextTicket,
    placement,
    wipWarning: wipWarning(workflow, columnId, placements, ticket.id),
  }
}

/**
 * Card on a custom flow. Falls back to the legacy kanban column when the flow has no matching column.
 * @param workflow - Project flow.
 * @param ticket - Engine ticket.
 * @param placement - Stored seat.
 */
export function projectBoardCard(
  workflow: ProjectWorkflow,
  ticket: Ticket,
  placement?: TicketBoardSeat,
): {
  ticketId: string
  stage: TicketStage
  category: StageCategory
  columnId?: string
  columnName?: string
  blocked: boolean
  chip?: 'waiting'
} {
  const stage = ticketStage(ticket)
  const column = resolveColumn(workflow, ticket, placement)
  const legacy = kanbanColumn(stage)
  const card: {
    ticketId: string
    stage: TicketStage
    category: StageCategory
    columnId?: string
    columnName?: string
    blocked: boolean
    chip?: 'waiting'
  } = {
    ticketId: ticket.id,
    stage,
    category: stageCategory(stage),
    blocked: placement?.blocked === true || stageBlocked(stage),
  }
  if (column !== undefined) {
    card.columnId = column.id
    card.columnName = column.name
  }
  if (legacy.chip === 'waiting') card.chip = 'waiting'
  return card
}

export { WorkflowError, type WorkflowFail } from './workflow-error.ts'
