/**
 * Harvest 10 — the last 5% of a subscription window.
 *
 * At 95% the team's own work (routines, initiatives, hand-offs) pauses and the person's short answers keep their turn.
 * At 100% every request of a conversation waits in ONE row per conversation; the renewal runs one turn per
 * conversation with everything that arrived, and a conversation the persona already answered is skipped.
 */

import type { ScreenRepos, StoredEvent } from '@deepseek-ai/dsh-persona-store'
import { reserveWindowLabel, type WindowReserve } from '@deepseek-ai/dsh-persona-usage'

/** One row per conversation waiting for the window to renew. */
export const WINDOW_RESUME_KIND = 'window_resume_queue'
/** The one line a conversation gets per window cycle (never one per message). */
export const WINDOW_NOTICE_KIND = 'window_reserve_notice'
/** “Continuar agora”: spend the last 5% until this window renews. */
export const WINDOW_OVERRIDE_KIND = 'window_reserve_override'

/** Requests of one conversation that wait for the window. */
export interface WindowResumeRow {
  readonly conversationId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  /** Stored messages, oldest first; the first one carries the resumed turn. */
  readonly eventIds: readonly string[]
  readonly responderId: string
  /** Instant the first request of this row arrived. */
  readonly since: string
  /** Stream sequence of the first request (what “after the pause” means, exact even when the clock does not move). */
  readonly sinceSeq: number
  readonly resetAt?: string
}

/** The person said “Continuar agora” for this window cycle. */
export interface WindowReserveOverride {
  readonly windowId: string
  readonly resetsAt?: string
  readonly at: string
}

/** The one line a conversation got in this window cycle (so a second request does not repeat it). */
export interface WindowReserveNotice {
  readonly windowId: string
  readonly resetsAt?: string
  readonly messageId: string
}

/** Durable queue: one row per conversation, merged in arrival order. */
export class WindowResumeQueue {
  /** Doc store. */
  readonly screens: ScreenRepos

  /**
   * @param screens - Doc store.
   */
  constructor(screens: ScreenRepos) {
    this.screens = screens
  }

  /**
   * Add one request to its conversation's row.
   * @param projectId - Tenant.
   * @param row - The request and where it goes.
   * @returns `new` when this conversation had no row in this window cycle (the caller posts the one line).
   */
  hold(projectId: string, row: WindowResumeRow): 'new' | 'merged' {
    const existing = this.screens.get<WindowResumeRow>(projectId, WINDOW_RESUME_KIND, row.conversationId)
    if (existing === undefined) {
      this.screens.put(projectId, WINDOW_RESUME_KIND, row.conversationId, { ...row, eventIds: [...new Set(row.eventIds)] })
      return 'new'
    }
    // A request is never dropped, even when the window renewed before the release ran: the row keeps its order and
    // adopts the new cycle (the caller posts the one line of the new cycle).
    const eventIds = [...existing.eventIds]
    for (const id of row.eventIds) if (!eventIds.includes(id)) eventIds.push(id)
    this.screens.put(projectId, WINDOW_RESUME_KIND, row.conversationId, {
      ...existing,
      eventIds,
      responderId: existing.responderId === '' ? row.responderId : existing.responderId,
      ...(row.resetAt === undefined ? {} : { resetAt: row.resetAt }),
    })
    return existing.resetAt === row.resetAt ? 'merged' : 'new'
  }

  /**
   * The waiting conversations, oldest first.
   * @param projectId - Tenant.
   * @returns The rows, oldest first.
   */
  list(projectId: string): WindowResumeRow[] {
    return this.screens.list<WindowResumeRow>(projectId, WINDOW_RESUME_KIND)
      .sort((a, b) => a.since.localeCompare(b.since) || a.conversationId.localeCompare(b.conversationId))
  }

  /**
   * How many conversations wait.
   * @param projectId - Tenant.
   * @returns The number of waiting conversations.
   */
  count(projectId: string): number {
    return this.list(projectId).length
  }

  /**
   * Forget the conversation's row (released or resolved).
   * @param projectId - Tenant.
   * @param conversationId - `channel:geral` / `dm:<id>`.
   */
  drop(projectId: string, conversationId: string): void {
    this.screens.delete(projectId, WINDOW_RESUME_KIND, conversationId)
  }
}

/**
 * The one line a conversation gets when its first request waits.
 * @param reserve - The window that paused the team.
 * @param clock - Local `HH:MM` of the reset, or `''` when the vendor gave no clock.
 * @returns The line the person reads in the conversation.
 */
export function reserveLine(reserve: WindowReserve, clock: string): string {
  const when = clock === '' ? 'quando a janela renovar' : `às ${clock}`
  const label = reserveWindowLabel(reserve)
  return `A janela ${label} está em ${Math.round(reserve.usedPercent)}%. Pauso o trabalho de fundo e guardo os pedidos; o que for resposta rápida eu respondo. Retomo ${when}.`
}

/**
 * Whether the persona already answered a later message of that conversation (nothing to replay).
 * @param events - Every live event of the project.
 * @param row - The waiting conversation.
 * @param isPersonAuthor - The host's rule for a human message.
 * @param hasFinalLine - The host's rule for a message with its final line.
 * @returns Whether the conversation can be skipped.
 */
export function conversationResolved(
  events: readonly StoredEvent[],
  row: WindowResumeRow,
  isPersonAuthor: (event: StoredEvent) => boolean,
  hasFinalLine: (eventId: string) => boolean,
): boolean {
  return events.some(event =>
    event.streamId === row.conversationId
    && event.seq > row.sinceSeq
    && isPersonAuthor(event)
    && hasFinalLine(event.id))
}

/**
 * Local `HH:MM` of the window reset, or `''` when the vendor gave no clock.
 * @param reserve - The window that paused the team.
 * @returns The local clock, or `''`.
 */
export function windowClock(reserve: WindowReserve): string {
  if (reserve.resetsAt === undefined) return ''
  const at = new Date(reserve.resetsAt)
  if (Number.isNaN(at.getTime())) return ''
  return at.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
