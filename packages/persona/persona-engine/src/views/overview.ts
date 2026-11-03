/**
 * Overview: problems, "Precisa de você", executor load, 24 h flow.
 */

import { latestReport, ticketStage, type Ticket } from '../core/index.ts'
import { newestFirst, type ViewHost } from './host.ts'
import { ticketRow, type TicketRowView } from './tickets.ts'

const day = 24 * 60 * 60 * 1000

export interface OverviewView {
  project_id: string
  problems: TicketRowView[]
  person: TicketRowView[]
  executor: { running: number; queued: number; maxWorkers: number; idle: number }
  flow: { created: number; ended: number }
}

/**
 * "Precisa de você": stage `person`, Attention, blocked/failed reports, reviews.
 * @param ticket - Ticket.
 */
export function needsYou(ticket: Ticket): boolean {
  if (ticketStage(ticket).stage === 'person') return true
  if (ticket.attention !== undefined) return true
  const report = latestReport(ticket)?.state
  return report === 'blocked' || report === 'failed' || report === 'ready'
}

/**
 * @param host - View host.
 */
export function overview(host: ViewHost): OverviewView {
  const visible = host.repo.tickets.list().filter(ticket => host.canReadTicket(ticket))
  const person = visible.filter(needsYou).sort(newestFirst).map(ticket => ticketRow(host, ticket))
  const problems = visible.filter((ticket) => {
    const report = latestReport(ticket)?.state
    return report === 'blocked' || report === 'failed'
  }).sort(newestFirst).map(ticket => ticketRow(host, ticket))
  const cutoff = Date.parse(host.now()) - day
  const flow = {
    created: visible.filter(ticket => Date.parse(ticket.createdAt) >= cutoff).length,
    ended: visible.filter(ticket => ticket.ended !== undefined && Date.parse(ticket.ended.at) >= cutoff).length,
  }
  const idle = Math.max(0, host.load.maxWorkers - host.load.running)
  return {
    project_id: host.projectId,
    problems,
    person,
    executor: { ...host.load, idle },
    flow,
  }
}
