/**
 * D-084 / HT-8: what a persona may do with a connector of the person's CLI, decided by PURE functions (no store, no clock, no model),
 * so the rule is the same everywhere and a test can walk the whole table. Contract: persona-spec/contracts/connector-grants.md.
 *
 * Three things authorize a use: the person's own REQUEST (that Task only), a "Permitir desta vez" (that Task only), or a PERMANENT
 * permission ("Sempre permitir para a Nina"). Nothing else does — least of all text the persona READ (an email, a page, a tool
 * result): that is her own initiative, never the person's request (the Keel guardrail).
 */

import { createHash } from 'node:crypto'
import type { ConfirmPolicy, ConnectorAccess } from '@deepseek-ai/dsh-persona-store'
import type { HostConnectorGrant } from './runner.ts'

/** What a tool call does. Strictest wins when a tool could be two: delete > pay > send > change > read (the runner classifies). */
export type ActionClass = 'read' | 'change' | 'send' | 'pay' | 'delete'
/** The persona's autonomy ("Só quando pedido" · "Sugere e espera" · "Age dentro de limites"). */
export type ConnectorAutonomy = 'asked' | 'propose' | 'act'
/** How the Task came to need the connector. `initiative`: the persona decided so by herself. */
export type ConnectorOrigin = 'request' | 'once' | 'initiative'

/** What the host does with one call. */
export type ConnectorDecision =
  | 'run' // go ahead, nothing to say
  | 'run-and-report' // go ahead and show in the thread what was done
  | 'preview' // stop: the card with what is about to leave, and wait for the person
  | 'ask-permission' // not authorized: ask ("Permitir desta vez" · "Sempre permitir" · "Agora não")
  | 'refuse' // she may not do this on her own at this autonomy

/** The permanent permission of this persona for this connector, when there is one. */
export interface PermanentGrant {
  readonly access: ConnectorAccess
  readonly confirm: ConfirmPolicy
}

/** Input of {@link decideConnectorUse}. */
export interface ConnectorUseInput {
  readonly origin: ConnectorOrigin
  readonly autonomy: ConnectorAutonomy
  readonly grant?: PermanentGrant
  readonly actionClass: ActionClass
}

/**
 * The decision table. Pay and delete ALWAYS preview — at any autonomy, even when the person asked, and with ANY permission (HT-9, Keel 05/11:
 * one truth with the gate, which never pre-allows them). The `confirm.pay` / `confirm.delete` columns of a stored grant no longer waive anything:
 * they are kept so an older install reads, and ignored here.
 * @param input - Origin, autonomy, the permanent permission (if any) and the class of the call.
 */
export function decideConnectorUse(input: ConnectorUseInput): ConnectorDecision {
  const { origin, autonomy, grant, actionClass } = input
  if (origin === 'initiative') {
    // Her own initiative needs a permanent permission, and a persona that only acts when asked has no initiative at all.
    if (grant === undefined) return 'ask-permission'
    if (autonomy === 'asked') return 'refuse'
  }
  if (actionClass === 'read') return 'run'
  // A `read` permission covers reading on her own initiative; anything that changes or sends needs `write` (a request needs no grant).
  if (origin === 'initiative' && grant?.access !== 'write') return 'ask-permission'
  // Carbon P0-09: "só leitura" is a CEILING the owner set for her, not a default: a chat request cannot lift it. Only a "Permitir desta vez" (`once`) can,
  // because that is the person's explicit yes for that Task.
  if (origin === 'request' && grant?.access === 'read') return 'ask-permission'
  if (actionClass === 'change') return 'run-and-report'
  if (actionClass === 'send') {
    if (autonomy === 'act' || grant?.confirm.send === 'never') return 'run-and-report'
    return 'preview'
  }
  // pay · delete: the person sees it first, always.
  return 'preview'
}

/** Whether the runner can stop a call and hand the host the request (`blocked`), as reported by the runner's port. */
export type PermissionGate = 'blocked-report' | 'none'

const CLASSES: readonly ActionClass[] = ['read', 'change', 'send', 'pay', 'delete']

/**
 * The classes the runner may let through at launch, without asking. Everything else the CLI asks for and the turn ends `blocked`.
 * When the CLI cannot stop a call (`none`) nothing can be asked, so only reading is let through: the connector is loaded read-only.
 * @param input - Origin, autonomy, permission and the runner's gate.
 */
export function preAllowFor(input: Omit<ConnectorUseInput, 'actionClass'> & { readonly gate: PermissionGate }): readonly ActionClass[] {
  if (input.gate === 'none') return ['read']
  return CLASSES.filter((actionClass) => {
    const decision = decideConnectorUse({ origin: input.origin, autonomy: input.autonomy, actionClass, ...(input.grant === undefined ? {} : { grant: input.grant }) })
    return decision === 'run' || decision === 'run-and-report'
  })
}

/**
 * A stable fingerprint of what a runner request carries (CLI, id, level, basis and pre-allowed classes, sorted): two requests with the same
 * fingerprint can share a warm session, two with different ones never do. 16 hex characters of a SHA-256.
 * @param connectors - The connectors of the request.
 */
export function connectorsFingerprint(connectors: readonly HostConnectorGrant[]): string {
  const rows = connectors
    .map(item => [item.cli, item.id, item.access, item.basis, [...item.preAllow].sort(), [...(item.approved ?? [])].map(row => [row.tool, row.argsHash]).sort()])
    .sort((a, b) => JSON.stringify(a).localeCompare(JSON.stringify(b)))
  return createHash('sha256').update(JSON.stringify(rows)).digest('hex').slice(0, 16)
}

/**
 * The suffix a Task's warm-runner key gets when it carries connectors: `:<ticketId>:<fingerprint>`, empty without connectors (the old key,
 * nothing changes). The Task id is in it because the authorization comes from THAT Task's human words: a warm session opened for Task A with a
 * connector let through must never serve Task B. A request that carries a per-Task authorization but has no Task id fails closed (its own key).
 * @param connectors - The connectors of the request.
 * @param ticketId - The Task the runner opens for.
 */
export function warmKeySuffix(connectors: readonly HostConnectorGrant[] | undefined, ticketId: string | undefined): string {
  if (connectors === undefined || connectors.length === 0) return ''
  return `:${ticketId ?? 'no-task'}:${connectorsFingerprint(connectors)}`
}

/** One event of the Task's conversation, as far as authorship goes. */
export interface AuthoredEvent {
  readonly id: string
  readonly actorId: string
  readonly body: string
  readonly deleted?: boolean
}

/**
 * The words the PERSON wrote for a Task: the events of its conversation whose author is a human member of the workspace. A persona's
 * line, a system line, a removed member and — above all — anything the persona READ (an incoming email, a document, a page, a tool
 * result, an attachment) never count: those are not requests, they are content (the Keel guardrail, HT-8).
 * @param eventIds - The origin trigger and the person's follow-ups that entered the Task.
 * @param eventOf - Looks an event up (absent ⇒ ignored).
 * @param isHuman - Whether an author is a human member of the workspace right now.
 * @returns The texts, in the order of `eventIds`, with the id of the message that carries each.
 */
export function humanAuthoredRequests(
  eventIds: readonly string[],
  eventOf: (id: string) => AuthoredEvent | undefined,
  isHuman: (actorId: string) => boolean,
): readonly { readonly messageId: string; readonly text: string }[] {
  const seen = new Set<string>()
  const out: { messageId: string; text: string }[] = []
  for (const id of eventIds) {
    if (seen.has(id)) continue
    seen.add(id)
    const event = eventOf(id)
    if (event === undefined || event.deleted === true || !isHuman(event.actorId) || event.body.trim() === '') continue
    out.push({ messageId: event.id, text: event.body })
  }
  return out
}
