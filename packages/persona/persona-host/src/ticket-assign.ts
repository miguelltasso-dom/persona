/**
 * Marco Dogfood M2: the rule behind `Orchestration.assignTicket(projectId, ticketId, personaId)` — "distribui para quem é da equipe". A card is bound to its owner by `ticket.execution.name` (the Executor chose it when the card
 * was born); giving it to a persona of the project is allowed while the Task has NOT started (no turn ran: nothing is orphaned) or has no owner at all. The same owner again changes nothing (idempotent), a persona of another
 * project is refused (the fence), an ended or unknown card is refused. The orchestrator only saves what this returns, then `driveTicket` runs the card as its new owner. Pure.
 */

export interface AssignTicket {
  readonly id: string
  readonly title: string
  readonly ended?: unknown
  readonly execution?: { readonly name: string; readonly directory: string; readonly assignment: string }
  readonly assignments: readonly { readonly state: string; readonly startedAt?: string }[]
}

export type AssignVerdict =
  | { readonly ok: true; readonly changed: boolean; readonly execution: { readonly name: string; readonly directory: string; readonly assignment: string } }
  | { readonly ok: false; readonly code: 'ticket-not-found' | 'ticket-ended' | 'persona-not-in-project' | 'ticket-started' }

/**
 * @param input - The card (or undefined), the persona (or undefined) and the project the caller works in.
 * @returns The new execution to save, or the stable code of the refusal.
 */
export function assignVerdict(input: {
  readonly ticket: AssignTicket | undefined
  readonly persona: { readonly name: string; readonly projectId: string } | undefined
  readonly projectId: string
}): AssignVerdict {
  const { ticket, persona, projectId } = input
  if (persona === undefined || persona.projectId !== projectId) return { ok: false, code: 'persona-not-in-project' }
  if (ticket === undefined) return { ok: false, code: 'ticket-not-found' }
  if (ticket.ended !== undefined) return { ok: false, code: 'ticket-ended' }
  const current = ticket.execution
  if (current?.name === persona.name) return { ok: true, changed: false, execution: current }
  if (current !== undefined && ticket.assignments.some(assignment => assignment.startedAt !== undefined)) return { ok: false, code: 'ticket-started' }
  return { ok: true, changed: true, execution: { name: persona.name, directory: current?.directory ?? '', assignment: current?.assignment ?? ticket.title } }
}
