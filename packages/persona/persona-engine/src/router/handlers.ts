/**
 * Pure Router / worker tool handlers (P9). Ticket-ended is enforced here
 * because CLI runners have no tools.guard.
 */

import { UserError } from '../core/errors.ts'
import { liveTicket } from '../core/model.ts'
import type { Engine } from '../core/engine.ts'
import type { Repositories } from '../core/ports.ts'
import { PERSONA_TOOL } from '../core/ids.ts'
import type { FollowupProposal } from '../continue.ts'
import {
  MODEL_DEGRADE,
  parseProposalPayload,
  parseReportPayload,
  parseRoutePayload,
  type ModelParseResult,
} from '../parse/model-output.ts'
import { ticketOfSession } from '../ports/runner.ts'

/**
 * Identity for persona_* tools comes from the runner session, never from
 * model-supplied ticket/actor/scope arguments.
 * @param run - Host-bound session (and optional actor the host already resolved).
 * @param claimed - Arguments the model tried to pass.
 */
export function bindRunIdentity(
  run: { sessionId: string; actorId?: string },
  claimed: { ticketId?: string; actorId?: string } = {},
): { ticketId: string } {
  const ticketId = ticketOfSession(run.sessionId)
  if (ticketId === undefined) throw new UserError('unknownTicket')
  if (claimed.ticketId !== undefined && claimed.ticketId !== ticketId) throw new UserError('unknownTicket')
  if (run.actorId !== undefined && claimed.actorId !== undefined && claimed.actorId !== run.actorId) {
    throw new UserError('unknownTicket')
  }
  return { ticketId }
}

export const PERSONA_ROUTE_LIMIT = 20

export type RouteDecision =
  | { kind: 'accept'; trigger_id: string; title: string; scope: string; reason: string }
  | { kind: 'ignore'; trigger_id: string; reason: string }
  | { kind: 'stop'; ticket_id: string; reason: string }
  | { kind: 'attach'; trigger_id: string; ticket_id: string }

export type RouteItemResult =
  | { ok: true; decision: RouteDecision }
  | { ok: false; error: string }

/**
 * Route up to 20 decisions. Invalid items are refused individually; valid
 * ones still apply (P9).
 * @param engine - Domain engine.
 * @param repo - Repositories (for the ended-ticket guard).
 * @param decisions - Decisions from the coordinator model.
 */
export function personaRoute(
  engine: Pick<Engine, 'decide' | 'attach' | 'stopTicket'>,
  repo: Repositories,
  decisions: readonly RouteDecision[],
): RouteItemResult[] {
  if (decisions.length > PERSONA_ROUTE_LIMIT) {
    throw new UserError('notAdmissible', { reason: `${PERSONA_TOOL}route accepts at most ${String(PERSONA_ROUTE_LIMIT)} items` })
  }
  return decisions.map((item): RouteItemResult => {
    try {
      if (item.kind === 'stop') {
        const ticket = repo.tickets.get(item.ticket_id)
        if (!ticket) throw new UserError('unknownTicket')
        if (!liveTicket(ticket)) throw new UserError('ticketEnded')
        engine.stopTicket(item.ticket_id, item.reason)
      }
      else if (item.kind === 'attach') {
        const ticket = repo.tickets.get(item.ticket_id)
        if (ticket && !liveTicket(ticket)) throw new UserError('ticketEnded')
        engine.attach(item.ticket_id, item.trigger_id)
      }
      else if (item.kind === 'accept') {
        engine.decide(item.trigger_id, {
          kind: 'accept',
          title: item.title,
          scope: item.scope,
          reason: item.reason,
        })
      }
      else {
        engine.decide(item.trigger_id, { kind: 'ignore', reason: item.reason })
      }
      return { ok: true, decision: item }
    }
    catch (error) {
      return { ok: false, error: error instanceof Error ? error.message : String(error) }
    }
  })
}

export interface ModelApplyResult<T> {
  parse: ModelParseResult<T>
  results?: RouteItemResult[]
  createdTicket: boolean
  attention?: { kind: 'needs_you'; message: string }
}

/**
 * Parse then apply route decisions. Dubious output never creates a Ticket.
 * @param engine - Domain engine.
 * @param repo - Repositories.
 * @param raw - Coordinator model text.
 * @param repairUsed - True after the single repair turn.
 */
export function personaRouteFromModel(
  engine: Pick<Engine, 'decide' | 'attach' | 'stopTicket'>,
  repo: Repositories,
  raw: string,
  repairUsed = false,
): ModelApplyResult<RouteDecision[]> {
  const parsed = parseRoutePayload(raw, repairUsed)
  if (parsed.status === 'needs_repair' || parsed.status === 'degraded' || parsed.value === undefined) {
    return {
      parse: parsed,
      createdTicket: false,
      ...(parsed.degrade === undefined ? {} : { attention: { kind: 'needs_you', message: parsed.degrade.message } }),
    }
  }
  const results = personaRoute(engine, repo, parsed.value)
  const createdTicket = results.some(row => row.ok && row.decision.kind === 'accept')
  return { parse: parsed, results, createdTicket }
}

/**
 * Parse then apply a worker report. Degrade blocks the live ticket (Precisa de você).
 * @param engine - Domain engine.
 * @param repo - Repositories.
 * @param ticketId - Ticket the worker reports on.
 * @param raw - Worker model text.
 * @param repairUsed - True after the single repair turn.
 */
export function personaReportFromModel(
  engine: Pick<Engine, 'report'>,
  repo: Repositories,
  ticketId: string,
  raw: string,
  repairUsed = false,
): ModelApplyResult<Parameters<Engine['report']>[1]> {
  const parsed = parseReportPayload(raw, repairUsed)
  if (parsed.status === 'needs_repair') {
    return { parse: parsed, createdTicket: false }
  }
  if (parsed.status === 'degraded' || parsed.value === undefined) {
    const ticket = repo.tickets.get(ticketId)
    if (ticket && liveTicket(ticket)) {
      engine.report(ticketId, { state: 'blocked', summary: MODEL_DEGRADE, question: MODEL_DEGRADE })
    }
    return {
      parse: parsed.status === 'degraded' ? parsed : { status: 'degraded', degrade: { message: MODEL_DEGRADE, attention: 'needs_you' } },
      createdTicket: false,
      attention: { kind: 'needs_you', message: MODEL_DEGRADE },
    }
  }
  personaReport(engine, repo, ticketId, parsed.value)
  return { parse: parsed, createdTicket: false }
}

/**
 * Parse a follow-up proposal. Dubious output never becomes a Ticket.
 * @param raw - Model text.
 * @param repairUsed - True after the single repair turn.
 */
export function personaProposeFromModel(raw: string, repairUsed = false): ModelApplyResult<FollowupProposal> {
  const parsed = parseProposalPayload(raw, repairUsed)
  if (parsed.status === 'ok' || parsed.status === 'repaired') {
    return { parse: parsed, createdTicket: false }
  }
  return {
    parse: parsed,
    createdTicket: false,
    ...(parsed.degrade === undefined ? {} : { attention: { kind: 'needs_you', message: parsed.degrade.message } }),
  }
}

/**
 * @param engine - Domain engine.
 * @param repo - Repositories.
 * @param ticketId - Ticket the worker reports on.
 * @param report - Worker report payload.
 */
export function personaReport(
  engine: Pick<Engine, 'report'>,
  repo: Repositories,
  ticketId: string,
  report: Parameters<Engine['report']>[1],
): ReturnType<Engine['report']> {
  const ticket = repo.tickets.get(ticketId)
  if (!ticket) throw new UserError('unknownTicket')
  if (!liveTicket(ticket)) throw new UserError('ticketEnded')
  return engine.report(ticketId, report)
}

/**
 * Worker report bound to the running session. Forged `ticketId`/`actorId` lose.
 * @param engine - Domain engine.
 * @param repo - Repositories.
 * @param run - Host session.
 * @param claimedTicketId - Model-supplied ticket id (ignored unless it matches).
 * @param report - Worker report payload.
 */
export function personaReportFromRun(
  engine: Pick<Engine, 'report'>,
  repo: Repositories,
  run: { sessionId: string; actorId?: string },
  claimedTicketId: string | undefined,
  report: Parameters<Engine['report']>[1],
): ReturnType<Engine['report']> {
  const { ticketId } = bindRunIdentity(run, claimedTicketId === undefined ? {} : { ticketId: claimedTicketId })
  return personaReport(engine, repo, ticketId, report)
}

/**
 * @param engine - Domain engine.
 * @param repo - Repositories.
 * @param ticketId - Ticket.
 * @param triggerId - Trigger to acknowledge.
 * @param text - Acknowledgement text.
 */
export function personaAck(
  engine: Pick<Engine, 'reply'>,
  repo: Repositories,
  ticketId: string,
  triggerId: string,
  text: string,
): ReturnType<Engine['reply']> {
  const ticket = repo.tickets.get(ticketId)
  if (ticket && !liveTicket(ticket)) throw new UserError('ticketEnded')
  return engine.reply({ purpose: 'acknowledgement', ticketId, triggerId, text })
}

/**
 * Ack bound to the running session.
 * @param engine - Domain engine.
 * @param repo - Repositories.
 * @param run - Host session.
 * @param claimedTicketId - Model-supplied ticket id.
 * @param triggerId - Trigger to acknowledge.
 * @param text - Acknowledgement text.
 */
export function personaAckFromRun(
  engine: Pick<Engine, 'reply'>,
  repo: Repositories,
  run: { sessionId: string; actorId?: string },
  claimedTicketId: string | undefined,
  triggerId: string,
  text: string,
): ReturnType<Engine['reply']> {
  const { ticketId } = bindRunIdentity(run, claimedTicketId === undefined ? {} : { ticketId: claimedTicketId })
  return personaAck(engine, repo, ticketId, triggerId, text)
}

/**
 * @param engine - Domain engine.
 * @param repo - Repositories.
 * @param ticketId - Ticket handing back.
 * @param triggerId - Trigger beyond the ticket.
 * @param reason - Why.
 */
export function personaHandback(
  engine: Pick<Engine, 'handback'>,
  repo: Repositories,
  ticketId: string,
  triggerId: string,
  reason: string,
): boolean {
  const ticket = repo.tickets.get(ticketId)
  if (!ticket) throw new UserError('unknownTicket')
  if (!liveTicket(ticket)) throw new UserError('ticketEnded')
  return engine.handback(ticketId, triggerId, reason)
}

/**
 * @param engine - Domain engine.
 * @param repo - Repositories.
 * @param ticketId - Ticket that follows.
 * @param thread - Thread ref.
 */
export function personaThreadFollow(
  engine: Pick<Engine, 'followForContext'>,
  repo: Repositories,
  ticketId: string,
  thread: Parameters<Engine['followForContext']>[1],
): boolean {
  const ticket = repo.tickets.get(ticketId)
  if (!ticket) throw new UserError('unknownTicket')
  if (!liveTicket(ticket)) throw new UserError('ticketEnded')
  return engine.followForContext(ticketId, thread)
}

export interface Notice {
  id: string
  text: string
  at: string
}

/**
 * Ordered, idempotent notices (same id keeps the first text).
 */
export class NoticeLog {
  private readonly items: Notice[] = []
  private readonly seen = new Set<string>()

  /**
   * @param notice - Notice to record.
   * @returns Whether it was new.
   */
  push(notice: Notice): boolean {
    if (this.seen.has(notice.id)) return false
    this.seen.add(notice.id)
    this.items.push(notice)
    return true
  }

  list(): readonly Notice[] {
    return this.items
  }
}
