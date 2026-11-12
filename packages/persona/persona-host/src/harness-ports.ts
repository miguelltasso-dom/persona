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

/** Item 15: the six-digit request a persona opens for the owner. The digits never come back through this port. */
export interface VaultCodePort {
  /**
   * @param who - The run's identity (the request belongs to her project and persona).
   * @param input - Why the code is needed, the login it is for and the Task that asked.
   * @returns The pending request, or a typed refusal with the sentence the model reads.
   */
  open(who: HarnessIdentity, input: { readonly reason: string; readonly login?: string; readonly ticketId?: string }):
  { readonly ok: true; readonly requestId: string; readonly expiresAt: string } | { readonly ok: false; readonly code: string; readonly message: string }
}

/** COLHEITA 15b: type a Cofre password into the page of its own site, without the value reaching the model. */
export interface BrowserLoginPort {
  /**
   * @param who - The run's identity (the login belongs to her project).
   * @param input - The Cofre login as the person named it, and the Task that asked.
   * @returns Whether it was typed, with the sentence the model reads; never the password, never the page.
   */
  open(who: HarnessIdentity, input: { readonly login: string; readonly ticketId: string; readonly code?: boolean }):
  Promise<{ readonly ok: true; readonly typed: boolean; readonly message: string } | { readonly ok: false; readonly code: string; readonly message: string }>
}

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
  /** Item 15: the 2FA card. Absent = the tool is not announced. */
  readonly vaultCode?: VaultCodePort
  /** COLHEITA 15b: the Cofre login typed into the page. Absent = the tool is not announced. */
  readonly browserLogin?: BrowserLoginPort
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
  readonly vaultCode: VaultCodePort | undefined
  readonly browserLogin: BrowserLoginPort | undefined
  private readonly deps: HarnessPortsDeps

  /** @param deps - Host parts. */
  constructor(deps: HarnessPortsDeps) {
    this.deps = deps
    this.boards = deps.boards
    this.routines = deps.routines
    this.hiring = deps.hiring
    this.vaultCode = deps.vaultCode
    this.browserLogin = deps.browserLogin
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
