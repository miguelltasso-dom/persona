/**
 * Ticket list / row / detail (Persona terms, pt-BR labels, `project_id`).
 */

import {
  canRetry, latestReport, liveTicket, ticketStage,
  type MandateBasis, type Ticket,
} from '../core/index.ts'
import { kanbanColumn, type KanbanColumn } from '../kanban.ts'
import { workerSessionId } from '../ports/runner.ts'
import { page, newestFirst, type ViewHost } from './host.ts'

export type BasisFact =
  | { name: 'addressed'; value: 'mention' | 'direct' }
  | { name: 'followup' }
  | { name: 'listed' }
  | { name: 'bot' }
  | { name: 'sender'; value: string }

/**
 * @param basis - Immutable mandate basis.
 */
export function basisFacts(basis: MandateBasis): { facts: BasisFact[] } {
  const facts: BasisFact[] = []
  if (basis.sender !== undefined) facts.push({ name: 'sender', value: basis.sender })
  if (basis.via === 'bot') facts.push({ name: 'bot' })
  if (basis.via === 'followup') facts.push({ name: 'followup' })
  if (basis.via === 'listed') facts.push({ name: 'listed' })
  if (basis.via !== 'followup' && basis.addressed !== undefined) {
    facts.push({ name: 'addressed', value: basis.addressed })
  }
  return { facts }
}

export interface TicketRowView {
  id: string
  title: string
  project_id: string
  stage: string
  column: KanbanColumn
  chip?: 'waiting'
  chipLabel?: 'Aguardando evento'
  outcome?: string
  actions: { retry: boolean; stop: boolean }
  strategy: string
  summary: string
  deliveryError?: string
  attention?: string
  assignments: number
  inputs: number
  updatedAt: string
}

/**
 * @param host - View host.
 * @param ticket - Visible ticket.
 */
export function ticketRow(host: ViewHost, ticket: Ticket): TicketRowView {
  const stage = ticketStage(ticket)
  const kanban = kanbanColumn(stage)
  const row: TicketRowView = {
    id: ticket.id,
    title: ticket.title,
    project_id: host.projectId,
    stage: stage.stage === 'person' ? `person/${stage.action}` : stage.stage === 'working' && stage.action === 'queued' ? 'working/queued' : stage.stage,
    column: kanban.column,
    actions: { retry: canRetry(ticket), stop: liveTicket(ticket) },
    strategy: ticket.mandate.strength,
    summary: latestReport(ticket)?.summary ?? '',
    assignments: ticket.assignments.length,
    inputs: ticket.inputs.length,
    updatedAt: ticket.updatedAt,
  }
  if (kanban.chip === 'waiting') {
    row.chip = 'waiting'
    row.chipLabel = 'Aguardando evento'
  }
  if (ticket.ended?.outcome !== undefined) row.outcome = ticket.ended.outcome
  if (ticket.delivery?.error !== undefined) row.deliveryError = ticket.delivery.error
  if (ticket.attention?.question !== undefined) row.attention = ticket.attention.question
  return row
}

export const ticketSummary = ticketRow

/**
 * @param host - View host.
 * @param stage - `open` or a ticketStage stage.
 * @param offset - Skip.
 * @param limit - Page size.
 */
export function ticketList(
  host: ViewHost,
  stage: 'open' | 'person' | 'working' | 'idle' | 'ended',
  offset: number,
  limit: number,
): { items: TicketRowView[]; total: number; next_offset: number | null; project_id: string } {
  const pool = stage === 'ended' ? host.repo.tickets.list() : host.repo.tickets.open()
  const shown = pool.filter(ticket => host.canReadTicket(ticket))
    .filter(ticket => stage === 'open' ? liveTicket(ticket) : ticketStage(ticket).stage === stage)
    .sort(newestFirst)
  const result = page(shown, offset, limit)
  return { ...result, items: result.items.map(ticket => ticketRow(host, ticket)), project_id: host.projectId }
}

export interface TicketDetailView extends Omit<TicketRowView, 'assignments' | 'inputs'> {
  mandate: { strength: string; scope: string; actorId: string; basis: BasisFact[] }
  originTriggerId: string
  decisionId: string
  channels: { source: string; thread: string }[]
  assignments: { id: string; state: string; sessionId?: string }[]
  inputs: { id: string; kind: string; delivered: boolean }[]
  threads: { key: string; context?: true }[]
}

/**
 * @param host - View host.
 * @param id - Ticket id.
 */
export function ticketDetail(host: ViewHost, id: string): TicketDetailView | undefined {
  const ticket = host.repo.tickets.get(id)
  if (ticket === undefined || !host.canReadTicket(ticket)) return undefined
  const row = ticketRow(host, ticket)
  const threads = host.repo.threads.list()
    .filter(thread => thread.subscriptions.includes(id) || ticket.follows?.some(follow => follow.thread === thread.key))
    .map((thread) => {
      const item: { key: string; context?: true } = { key: thread.key }
      if (thread.context?.includes(id)) item.context = true
      return item
    })
  return {
    ...row,
    mandate: {
      strength: ticket.mandate.strength,
      scope: ticket.mandate.scope,
      actorId: ticket.mandate.actor.id,
      basis: basisFacts(ticket.mandate.basis).facts,
    },
    originTriggerId: ticket.origin.triggerId,
    decisionId: ticket.decisionId,
    channels: ticket.channels.map(channel => ({ source: channel.source, thread: channel.thread })),
    assignments: ticket.assignments.map((assignment) => {
      const item: { id: string; state: string; sessionId?: string } = { id: assignment.id, state: assignment.state }
      if (assignment.startedAt !== undefined) item.sessionId = workerSessionId(ticket.id)
      return item
    }),
    inputs: ticket.inputs.map(input => ({
      id: input.id,
      kind: input.kind,
      delivered: !ticket.undelivered.includes(input.id),
    })),
    threads,
  }
}
