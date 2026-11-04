/**
 * Fold persisted host rows into local insight events. Nothing leaves the machine.
 */

import type { InsightEvent } from '@deepseek-ai/dsh-persona-engine'
import type { StoredEvent } from '@deepseek-ai/dsh-persona-store'
import type { ApprovalView } from './types.ts'

/** Ticket fields the fold reads. */
export interface InsightTicket {
  readonly createdAt: string
  readonly ended?: { at: string; outcome: string }
  readonly execution?: { name: string }
}

/** Inputs already stored by the host. */
export interface InsightFoldInput {
  readonly onboarded: boolean
  readonly onboardedAt: number
  readonly workspaceCreatedAt: number
  readonly now: number
  readonly events: readonly StoredEvent[]
  readonly personaIds: ReadonlySet<string>
  readonly tickets: readonly InsightTicket[]
  readonly personas: readonly { id: string; name: string; systemRoles: readonly string[] }[]
  readonly approvals: readonly ApprovalView[]
}

/**
 * Derive insight events from onboarding, messages, tickets, and approvals.
 * @param input - Persisted rows.
 */
export function foldInsightEvents(input: InsightFoldInput): InsightEvent[] {
  const out: InsightEvent[] = []
  if (input.onboarded) out.push({ kind: 'onboarded', at: input.onboardedAt })
  out.push({ kind: 'session', at: input.workspaceCreatedAt })
  const days = new Set<string>([dayKey(input.workspaceCreatedAt)])
  for (const event of input.events) {
    const at = Date.parse(event.occurredAt)
    if (!Number.isFinite(at)) continue
    const key = dayKey(at)
    if (!days.has(key)) {
      days.add(key)
      out.push({ kind: 'session', at })
    }
    if (event.id === 'onb-welcome' || event.actorId === 'system') continue
    if (input.personaIds.has(event.actorId) || event.type === 'runner') {
      out.push({ kind: 'useful_reply', at, personaId: event.actorId })
    }
  }
  for (const ticket of input.tickets) {
    const ended = ticket.ended
    if (ended === undefined) continue
    if (ended.outcome !== 'completed' && ended.outcome !== 'merged') continue
    const start = Date.parse(ticket.createdAt)
    const end = Date.parse(ended.at)
    const at = Number.isFinite(end) ? end : start
    const row: InsightEvent = { kind: 'task_done', at: Number.isFinite(at) ? at : input.now }
    const personaId = personaOfTicket(ticket, input.personas)
    if (personaId !== undefined) row.personaId = personaId
    if (Number.isFinite(start) && Number.isFinite(end) && end >= start) row.durationMs = end - start
    out.push(row)
  }
  for (const card of input.approvals) {
    if (card.status !== 'approved' || card.kind === 'attention') continue
    out.push({
      kind: 'proposal_accepted',
      at: input.now,
      personaId: card.personaId,
    })
  }
  return out
}

function personaOfTicket(
  ticket: InsightTicket,
  personas: readonly { id: string; name: string; systemRoles: readonly string[] }[],
): string | undefined {
  const byName = personas.find(persona => persona.name === ticket.execution?.name)
  if (byName !== undefined) return byName.id
  return personas.find(persona => persona.systemRoles.includes('coordination'))?.id
}

function dayKey(at: number): string {
  return new Date(at).toISOString().slice(0, 10)
}
