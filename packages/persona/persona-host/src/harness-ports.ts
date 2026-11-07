/**
 * HT-0, the host's half (contracts/harness-tools.md §11): what the product tools of a persona need to run on the host. The tools
 * (served to the CLI by the transport, Rivet's half) hand in WHO is calling as the RUN — persona, Ticket, Assignment — never as an
 * argument; this turns the run into the identity every port takes, and holds the ports:
 *   - `persona`  = the run's persona, in her own project (a Ticket of another project is a forged run → no identity);
 *   - `initiator` = `person-request` when the Ticket was started by a message of a person of the workspace, `persona-initiative`
 *     when the scheduler started it (initiative, routine, plan: system authors) — the person's request authorizes the verb, the
 *     persona's own initiative follows her autonomy (D-084; the same "author verified" rule as the connector guardrail, HT-8);
 *   - `autonomy`  = what the person set for that persona in that project (`asked | propose | act`).
 */

import type { Ticket } from '@deepseek-ai/dsh-persona-engine'
import type { ProductRepos } from '@deepseek-ai/dsh-persona-store'
import type { BoardPorts } from './harness-boards.ts'
import type { HiringPorts } from './harness-hiring.ts'
import type { HarnessIdentity, RoutinePorts } from './harness-routines.ts'

/** The run that opened the turn: the identity of the caller. */
export interface HarnessRun {
  readonly personaId: string
  readonly ticketId: string
  readonly assignmentId: string
}

export interface HarnessPortsDeps {
  readonly product: Pick<ProductRepos, 'getPersona' | 'getProject' | 'getMember'>
  readonly ticketOf: (projectId: string, ticketId: string) => Ticket | undefined
  /** The author of a stored event (the message that started the Ticket). */
  readonly eventActorOf: (eventId: string) => string | undefined
  readonly autonomyOf: (projectId: string, personaId: string) => HarnessIdentity['autonomy']
  readonly boards: BoardPorts
  readonly routines?: RoutinePorts
  readonly hiring?: HiringPorts
}

/** Ids the scheduler gives the messages it writes for the team: never a person's request, whatever the author field says. */
const SYSTEM_MESSAGE = /^(?:initiative|routine-run|plan):/u
/**
 * Triggers the host writes for the TEAM on behalf of a person: a part of a request split by function (TEAM-13) and a request to a
 * colleague (TEAM-2/3). The line is the team's, but the Task carries the mandate of the PERSON whose request it is, so her request is
 * what authorizes the verb (never more than hers).
 */
const DELEGATED_TRIGGER = /^(?:split|handoff):/u

/** The ports a persona's tools call, and the identity they take. */
export class HarnessPorts {
  readonly boards: BoardPorts
  readonly routines: RoutinePorts | undefined
  readonly hiring: HiringPorts | undefined
  private readonly deps: HarnessPortsDeps

  /** @param deps - Host parts. */
  constructor(deps: HarnessPortsDeps) {
    this.deps = deps
    this.boards = deps.boards
    this.routines = deps.routines
    this.hiring = deps.hiring
  }

  /**
   * The identity of one tool call of a run.
   * @param run - Who opened the turn (from the gateway, never from the tool's arguments).
   * @param callId - Idempotency key of THIS call (the same id twice = the same answer, never the action twice).
   * @returns The identity, or undefined when the run is not a real one (unknown persona, a Ticket of another project): no tool runs.
   */
  identityOf(run: HarnessRun, callId: string): HarnessIdentity | undefined {
    const { product } = this.deps
    const persona = product.getPersona(run.personaId)
    if (persona === undefined) return undefined
    const project = product.getProject(persona.projectId)
    if (project === undefined) return undefined
    const ticket = this.deps.ticketOf(persona.projectId, run.ticketId)
    if (ticket === undefined) return undefined
    const trigger = ticket.origin.triggerId
    const author = SYSTEM_MESSAGE.test(trigger)
      ? undefined
      : DELEGATED_TRIGGER.test(trigger) ? ticket.mandate.actor.id : this.deps.eventActorOf(trigger)
    const person = author !== undefined && product.getMember(author)?.workspaceId === project.workspaceId
    return {
      workspaceId: project.workspaceId,
      projectId: persona.projectId,
      personaId: persona.id,
      ...(person ? { requestId: trigger } : {}),
      initiator: person ? 'person-request' : 'persona-initiative',
      autonomy: this.deps.autonomyOf(persona.projectId, persona.id),
      callId,
    }
  }
}
