/**
 * "Visão geral agora" and "Enquanto você estava fora" (PRO-2 / PROACTIVITY.md §7).
 * Honest states: idle without work ≠ stuck ≠ waiting on you.
 */

import { ticketStage, type Ticket } from '../core/index.ts'
import { newestFirst, type ViewHost } from './host.ts'
import { ticketRow, type TicketRowView } from './tickets.ts'

export type HonestState = 'working' | 'waiting_on_you' | 'stuck' | 'idle_no_work' | 'done'

/**
 * @param ticket - Ticket.
 */
export function honestState(ticket: Ticket): HonestState {
  if (ticket.ended) return 'done'
  const stage = ticketStage(ticket)
  if (stage.stage === 'person') {
    return stage.action === 'blocked' || stage.action === 'failed' ? 'stuck' : 'waiting_on_you'
  }
  if (stage.stage === 'working') return 'working'
  if (stage.stage === 'idle') return ticket.attention ? 'waiting_on_you' : 'idle_no_work'
  return 'done'
}

export interface PersonaNow {
  persona_id: string
  state: HonestState
  ticket_id?: string
  idle_ms: number
  queue: number
}

export interface NowOverview {
  project_id: string
  personas: PersonaNow[]
  deliveries_today: TicketRowView[]
  proposals_accepted: number
}

export interface PersonaLoad {
  personaId: string
  ticketId?: string
  lastProgressAt: number
  queue: number
}

/**
 * @param host - View host.
 * @param loads - Per-persona runtime facts from the host.
 * @param acceptedToday - Accepted proposals today.
 */
export function nowOverview(host: ViewHost, loads: readonly PersonaLoad[], acceptedToday: number): NowOverview {
  const now = Date.parse(host.now())
  const cutoff = now - 24 * 60 * 60 * 1000
  const visible = host.repo.tickets.list().filter(ticket => host.canReadTicket(ticket))
  const byId = new Map(visible.map(ticket => [ticket.id, ticket]))
  const personas = loads.map((load) => {
    const ticket = load.ticketId === undefined ? undefined : byId.get(load.ticketId)
    const row: PersonaNow = {
      persona_id: load.personaId,
      state: ticket === undefined ? (load.queue > 0 ? 'working' : 'idle_no_work') : honestState(ticket),
      idle_ms: Math.max(0, now - load.lastProgressAt),
      queue: load.queue,
    }
    if (load.ticketId !== undefined) row.ticket_id = load.ticketId
    return row
  })
  const deliveries = visible
    .filter(ticket => ticket.ended !== undefined && Date.parse(ticket.ended.at) >= cutoff)
    .sort(newestFirst)
    .map(ticket => ticketRow(host, ticket))
  return {
    project_id: host.projectId,
    personas,
    deliveries_today: deliveries,
    proposals_accepted: acceptedToday,
  }
}

export interface AwayEvent {
  at: string
  kind: 'ticket_created' | 'ticket_ended' | 'attention' | 'proposal'
  title: string
  ticketId?: string
}

export interface WhileAway {
  project_id: string
  items: { at: string; kind: string; title: string; ticket_id?: string }[]
}

/**
 * Peak-end digest since the person last opened the app. Links are ticket ids.
 * @param host - View host.
 * @param since - ISO timestamp of last open.
 * @param extras - Host events (proposals) already ACL-filtered.
 */
export function whileAway(host: ViewHost, since: string, extras: readonly AwayEvent[] = []): WhileAway {
  const from = Date.parse(since)
  const items: WhileAway['items'] = []
  for (const ticket of host.repo.tickets.list().filter(ticket => host.canReadTicket(ticket))) {
    if (Date.parse(ticket.createdAt) >= from) {
      items.push({ at: ticket.createdAt, kind: 'ticket_created', title: ticket.title, ticket_id: ticket.id })
    }
    if (ticket.ended !== undefined && Date.parse(ticket.ended.at) >= from) {
      items.push({ at: ticket.ended.at, kind: 'ticket_ended', title: ticket.title, ticket_id: ticket.id })
    }
    if (ticket.attention !== undefined && Date.parse(ticket.updatedAt) >= from) {
      items.push({ at: ticket.updatedAt, kind: 'attention', title: ticket.attention.question, ticket_id: ticket.id })
    }
  }
  for (const extra of extras) {
    if (Date.parse(extra.at) < from) continue
    const row: WhileAway['items'][number] = { at: extra.at, kind: extra.kind, title: extra.title }
    if (extra.ticketId !== undefined) row.ticket_id = extra.ticketId
    items.push(row)
  }
  items.sort((a, b) => b.at.localeCompare(a.at))
  return { project_id: host.projectId, items }
}
