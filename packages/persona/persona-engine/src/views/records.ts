/**
 * Decision list and project search (tickets + threads + decisions).
 */

import { reasonText, type Decision } from '../core/index.ts'
import { listDecisions, newestFirst, page, turnsFromRepo, type ViewHost } from './host.ts'
import { preview } from './text.ts'
import { ticketRow, type TicketRowView } from './tickets.ts'

export interface DecisionRowView {
  id: string
  project_id: string
  triggerId: string
  kind: string
  reason: string
  at: string
}

/**
 * @param decision - Decision.
 */
export function decisionRow(host: ViewHost, decision: Decision): DecisionRowView {
  return {
    id: decision.id,
    project_id: host.projectId,
    triggerId: decision.triggerIds[0] ?? '',
    kind: decision.kind,
    reason: preview(reasonText(decision.reason), 240),
    at: decision.at,
  }
}

/**
 * @param host - View host.
 */
export function decisionList(host: ViewHost, offset: number, limit: number): {
  items: DecisionRowView[]
  total: number
  next_offset: number | null
  project_id: string
} {
  const shown = listDecisions(host.repo).sort(newestFirst)
  const result = page(shown, offset, limit)
  return { ...result, items: result.items.map(decision => decisionRow(host, decision)), project_id: host.projectId }
}

export interface SearchHit {
  kind: 'ticket' | 'thread' | 'decision'
  id: string
  project_id: string
  title: string
}

/**
 * ACL-aware search. Tickets and threads that fail `canRead*` are omitted.
 * @param host - View host.
 * @param q - Query (case-insensitive substring).
 */
export function search(host: ViewHost, q: string): {
  project_id: string
  tickets: TicketRowView[]
  threads: SearchHit[]
  decisions: SearchHit[]
} {
  const needle = q.trim().toLowerCase()
  if (needle === '') return { project_id: host.projectId, tickets: [], threads: [], decisions: [] }
  const tickets = host.repo.tickets.list()
    .filter(ticket => host.canReadTicket(ticket))
    .filter(ticket =>
      ticket.title.toLowerCase().includes(needle)
      || ticket.id.toLowerCase().includes(needle)
      || (ticket.attention?.question ?? '').toLowerCase().includes(needle))
    .sort(newestFirst)
    .map(ticket => ticketRow(host, ticket))
  const threads = host.repo.threads.list()
    .filter(thread => host.canReadThread(thread.key))
    .filter(thread =>
      thread.key.toLowerCase().includes(needle)
      || (host.turns?.(thread.key) ?? turnsFromRepo(host.repo, thread.key))
        .some(turn => turn.text.toLowerCase().includes(needle)))
    .sort(newestFirst)
    .map(thread => ({
      kind: 'thread' as const,
      id: thread.key,
      project_id: host.projectId,
      title: preview((host.turns?.(thread.key) ?? turnsFromRepo(host.repo, thread.key)).at(-1)?.text ?? thread.key),
    }))
  const decisions = listDecisions(host.repo)
    .filter(decision =>
      decision.id.toLowerCase().includes(needle)
      || reasonText(decision.reason).toLowerCase().includes(needle)
      || decision.triggerIds.some(id => id.toLowerCase().includes(needle)))
    .sort(newestFirst)
    .map(decision => ({
      kind: 'decision' as const,
      id: decision.id,
      project_id: host.projectId,
      title: preview(reasonText(decision.reason)),
    }))
  return { project_id: host.projectId, tickets, threads, decisions }
}
