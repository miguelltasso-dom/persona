/**
 * Thread list / detail with a stable `<at>|<id>` timeline cursor.
 */

import { page, newestFirst, turnsFromRepo, type ViewHost } from './host.ts'
import { preview } from './text.ts'

function turnsOf(host: ViewHost, key: string): TimelineTurn[] {
  return host.turns?.(key) ?? turnsFromRepo(host.repo, key)
}

export interface ThreadRowView {
  key: string
  project_id: string
  source: string
  id: string
  last: string
  subscriptions: number
}

/**
 * @param host - View host.
 */
export function threadList(host: ViewHost, offset: number, limit: number): {
  items: ThreadRowView[]
  total: number
  next_offset: number | null
  project_id: string
} {
  const shown = host.repo.threads.list()
    .filter(thread => host.canReadThread(thread.key))
    .sort(newestFirst)
  const result = page(shown, offset, limit)
  return {
    ...result,
    items: result.items.map(thread => ({
      key: thread.key,
      project_id: host.projectId,
      source: thread.ref.source,
      id: thread.ref.id,
      last: preview(turnsOf(host, thread.key).at(-1)?.text ?? ''),
      subscriptions: thread.subscriptions.length,
    })),
    project_id: host.projectId,
  }
}

export interface TimelineTurn {
  at: string
  id: string
  role: string
  text: string
}

/**
 * Encode a stable timeline cursor. Format: `<at>|<id>`.
 * @param at - ISO timestamp.
 * @param id - Turn id.
 */
export function encodeCursor(at: string, id: string): string {
  return `${at}|${id}`
}

/**
 * @param cursor - `<at>|<id>`.
 */
export function decodeCursor(cursor: string): { at: string; id: string } | undefined {
  const split = cursor.indexOf('|')
  if (split <= 0) return undefined
  return { at: cursor.slice(0, split), id: cursor.slice(split + 1) }
}

/**
 * @param host - View host.
 * @param key - Thread key.
 * @param cursor - Exclusive start (`<at>|<id>`), or omit from the beginning.
 * @param limit - Page size.
 */
export function threadDetail(host: ViewHost, key: string, cursor?: string, limit: number = 50): {
  key: string
  project_id: string
  source: string
  id: string
  turns: TimelineTurn[]
  next_cursor: string | null
  correlated: { ticketId: string }[]
} | undefined {
  const thread = host.repo.threads.get(key)
  if (thread === undefined || !host.canReadThread(key)) return undefined
  const turns = turnsOf(host, key)
  const parsed = cursor === undefined ? undefined : decodeCursor(cursor)
  const after = parsed === undefined
    ? turns
    : turns.filter(turn =>
      turn.at > parsed.at || (turn.at === parsed.at && turn.id > parsed.id))
  const pageTurns = after.slice(0, limit)
  const last = pageTurns.at(-1)
  const tickets = host.repo.tickets.list()
    .filter(ticket => host.canReadTicket(ticket))
    .filter(ticket =>
      thread.subscriptions.includes(ticket.id)
      || thread.context?.includes(ticket.id)
      || ticket.follows?.some(follow => follow.thread === key))
  return {
    key: thread.key,
    project_id: host.projectId,
    source: thread.ref.source,
    id: thread.ref.id,
    turns: pageTurns,
    next_cursor: last !== undefined && after.length > limit ? encodeCursor(last.at, last.id) : null,
    correlated: tickets.map(ticket => ({ ticketId: ticket.id })),
  }
}
