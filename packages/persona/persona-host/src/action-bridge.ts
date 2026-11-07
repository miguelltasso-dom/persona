/**
 * HT-9 (D-084), the SEAM between the permission gate (persona-runners, Tally) and the card of an external action (`external-actions.ts`).
 *
 * Life of one external action, as the host runs it:
 *  1. A Task on Claude carries connectors → its runner is opened WITH a gate (`gateFor`): the PreToolUse HTTP hook of the CLI points at it. One gate
 *     per runner, and a Task that carries connectors has a runner of its own (`warmKeySuffix`), so two Tasks never share a gate or its arming.
 *  2. Before each turn the host ARMS the gate (`arm`): the classes the policy lets through without asking, plus the calls the person approved for
 *     THIS Task (each once, by the hash of the real arguments). Everything else the CLI asks for is refused by the hook and remembered.
 *  3. After the turn the host SETTLES it (`settle`): what the gate refused becomes ONE card per call in Aprovações (the preview is the real content),
 *     the Task WAITS for the person, and a call that was approved is marked sent (or failed, honestly).
 *  4. The person answers; `ExternalActions.decide` hands back the approved call, the Task is woken, its next runner carries the approval, and the
 *     cycle starts at 1. A call whose arguments the model rewrote after the approval is NOT the approved one: it comes back as another card.
 *
 * This module owns no rule of safety: the gate decides, the card keeps the states, `connector-policy.ts` says what is pre-allowed. It only composes
 * them, with no model and no network beyond the gate's own 127.0.0.1 server.
 */

import { looksLikeCredential } from '@deepseek-ai/dsh-persona-core'
import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import {
  annotationTable,
  DEFAULT_TOOL_SERVER,
  PermissionGate,
  type PermissionGateOptions,
  type PermissionRequest,
} from '@deepseek-ai/dsh-persona-runners'
import type { StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { unflattenPreview } from './action-input.ts'
import type { ConnectorPorts } from './connector-grants-host.ts'
import type { ActionRequestInput, ExternalActionDoc, ExternalActions } from './external-actions.ts'
import type { HostConnectorGrant } from './runner.ts'
import type { ActionClass, ConnectorRef } from './types.ts'

/** Collaborators. */
export interface ActionBridgeDeps {
  readonly actions: ExternalActions
  /** The host's connector ports: which CLIs can stop a call, which connectors exist, the pre-flight (`mcp_status`) of their tools. */
  readonly ports: () => ConnectorPorts
  /** Tests start the gate with a fixed token; the host leaves it undefined. */
  readonly start?: (options: PermissionGateOptions) => Promise<PermissionGate>
  /** A pending action was recorded: the host writes its card into the thread (idempotent on the action id). */
  readonly announce?: (doc: ExternalActionDoc) => void
}

/** What the host knows about one runner's gate. */
interface Held {
  readonly gate: PermissionGate
  readonly projectId: string
  readonly personaId: string
  readonly cli: string
  readonly connectors: readonly HostConnectorGrant[]
}

/** What `settle` found. */
export interface SettleOutcome {
  /** The turn ended asking for something the person must decide: the Task waits (a card per call). */
  readonly waiting: boolean
  /** The cards opened (or found again) by this turn. */
  readonly cards: number
  /** One sentence for the Task's state ("Esperando você aprovar: enviar pelo Gmail"), when waiting. */
  readonly summary?: string
}

const NAMEKEY = /[^a-z0-9]+/gu
const keyOf = (name: string): string => name.toLowerCase().replace(NAMEKEY, '')
const classOf = (value: PermissionRequest['actionClass']): ActionClass => value === 'pay' || value === 'delete' ? value : 'send'

/** The Task-level glue of the permission gate. */
export class ActionBridge {
  private readonly held = new WeakMap<Runner, Held>()
  private readonly pending = new WeakMap<PermissionGate, Omit<Held, 'gate'>>()
  private readonly open = new Set<PermissionGate>()

  /** @param deps - Host parts. */
  constructor(private readonly deps: ActionBridgeDeps) {}

  /**
   * A gate for the runner about to open, or undefined when this Task cannot ask the person (a CLI that cannot stop a call, no connector).
   * @param input - Where the runner opens and what it carries.
   */
  async gateFor(input: { readonly projectId: string; readonly persona: StoredPersona; readonly cli: string; readonly connectors: readonly HostConnectorGrant[] }): Promise<PermissionGate | undefined> {
    if (input.cli !== 'claude' || input.connectors.length === 0) return undefined
    if (this.deps.ports().permissionRequests?.(input.cli) !== 'blocked-report') return undefined
    const options: PermissionGateOptions = {
      // The pre-flight of the person's connectors, read at decision time (synchronous, local). Without it a tool that is not proven read-only is a `send`.
      annotations: tool => annotationTable(this.deps.ports().mcpStatusOf?.(input.cli) ?? [])(tool),
      isSecret: looksLikeCredential,
      // The product's own tools (board, routines, hire, ask) are behind the host gateway's ACL: the gate gives no opinion on them.
      ownServers: [DEFAULT_TOOL_SERVER],
    }
    const gate = await (this.deps.start?.(options) ?? PermissionGate.start(options))
    this.open.add(gate)
    this.pending.set(gate, { projectId: input.projectId, personaId: input.persona.id, cli: input.cli, connectors: input.connectors })
    return gate
  }

  /**
   * The runner the gate was opened for exists now.
   * @param runner - The runner.
   * @param gate - What {@link gateFor} returned for it.
   */
  adopt(runner: Runner, gate: PermissionGate): void {
    const info = this.pending.get(gate)
    if (info === undefined) return
    this.pending.delete(gate)
    this.held.set(runner, { gate, ...info })
  }

  /**
   * The Task's turn is about to start: let through what the policy allows, plus what the person approved for THIS Task (once each).
   * @param runner - The Task's runner.
   * @param ticketId - The Task.
   */
  arm(runner: Runner, ticketId: string, draftRoot?: string): void {
    const held = this.held.get(runner)
    if (held === undefined) return
    // The gate has classes, not servers: with two connectors on one Task it lets through only what BOTH allow (the stricter wins).
    const lists = held.connectors.map(item => item.preAllow)
    const preAllow = lists.length === 0 ? [] : (lists[0] ?? []).filter(cls => lists.every(list => list.includes(cls)))
    const approved = this.deps.actions.approvedFor(held.projectId, ticketId)
    // D-081/D-083, "a persona never has more access than the person granted": a native task loads EVERY connector of the account, and the class alone cannot
    // say which ones this persona may touch. The mandate is the servers of the connectors THIS Task was given; any other connector tool is denied outright
    // (no card: it is not for the person to approve, it is outside the mandate). A connector whose server name is unknown is not in the mandate.
    const allowedServers = held.connectors
      .map(item => this.deps.ports().mcpServerNameOf?.(held.cli, item.id))
      .filter((name): name is string => name !== undefined && name !== '')
      .map(name => name.replace(/[^a-zA-Z0-9_-]/gu, '_'))
    // P0-1: a file write is allowed only INSIDE the Task draft folder; its directory is the placeholder dot when it has none (then the gate uses the turn cwd).
    const draft = draftRoot !== undefined && draftRoot !== '' && draftRoot !== '.' ? { draftRoot } : {}
    held.gate.arm({ preAllow, approved, allowedServers, ...draft })
    for (const doc of this.deps.actions.approvedDocs(held.projectId, ticketId)) this.deps.actions.markSending(held.projectId, doc.id)
  }

  /**
   * The Task's turn ended: turn what the gate refused into cards and close the books on the approved calls.
   * @param runner - The Task's runner.
   * @param turn - The Task and how the turn ended.
   */
  settle(runner: Runner, turn: { readonly ticketId: string; readonly failed: boolean; readonly stopped?: boolean }): SettleOutcome {
    const held = this.held.get(runner)
    if (held === undefined) return { waiting: false, cards: 0 }
    const asked = held.gate.takeRequests()
    held.gate.takeOutOfMandate() // names only: drained so the next turn starts clean (the gate already refused them; there is nobody to ask)
    const released = held.gate.takeReleased() // the approved calls the gate REALLY let through (tool + hash matched), never a guess
    held.gate.disarm()
    const { actions } = this.deps
    // The calls that were approved and went into this turn: sent when the gate let them through, failed otherwise (never "sent" on a hope).
    for (const doc of actions.sendingDocs(held.projectId, turn.ticketId)) {
      if (released.some(item => item.tool === doc.tool && item.argsHash === doc.argsHash)) actions.markSent(held.projectId, doc.id)
      else {
        const changed = asked.some(item => item.tool === doc.tool) // the model asked for the same tool with OTHER arguments: that is a new card
        actions.markFailed(held.projectId, doc.id, turn.failed ? 'o motor falhou antes de enviar' : changed ? 'o pedido mudou antes de enviar; veja o novo cartão' : 'a persona não chegou a enviar')
      }
    }
    let cards = 0
    let first: ActionRequestInput | undefined
    // A Task the person stopped (Parar) leaves nothing waiting for her: what the gate refused is dropped, not turned into a card.
    for (const item of turn.stopped === true ? [] : asked) {
      const connector = this.connectorOf(held, item.server)
      const basis = held.connectors.find(row => row.id === connector.id)?.basis
      const doc = actions.record({
        projectId: held.projectId, personaId: held.personaId, ticketId: turn.ticketId, connector, tool: item.tool,
        actionClass: classOf(item.actionClass), verb: item.verb, requestedInput: unflattenPreview(item.requestedInput),
        truncated: item.truncated, masked: item.masked, argsHash: item.argsHash, requestedByPerson: basis === 'request' || basis === 'once',
      })
      if (doc === undefined) continue // the limit of attempts: the persona is stopped, not obeyed
      this.deps.announce?.(doc)
      cards += 1
      first ??= doc
    }
    if (cards === 0) return { waiting: false, cards: 0 }
    const verb = first?.actionClass === 'pay' ? 'pagar' : first?.actionClass === 'delete' ? 'apagar' : 'enviar'
    return { waiting: true, cards, summary: `Esperando você aprovar: ${verb} pelo ${first?.connector.name ?? 'conector'}` }
  }

  /**
   * The runner is gone (evicted, ended, app closing): stop listening.
   * @param runner - The runner.
   */
  release(runner: Runner): void {
    const held = this.held.get(runner)
    if (held === undefined) return
    this.held.delete(runner)
    this.open.delete(held.gate)
    void held.gate.close().catch((error: unknown) => { void error })
  }

  /** The app is closing: every gate stops listening. */
  async closeAll(): Promise<void> {
    const all = [...this.open]
    this.open.clear()
    await Promise.all(all.map(gate => gate.close().catch((error: unknown) => { void error })))
  }

  /** How many gates are listening (tests and diagnostics). */
  get listening(): number {
    return this.open.size
  }

  /**
   * Which of the Task's connectors a refused call belongs to. The gate reports the server's NAME in the CLI; the host knows the connectors by id
   * and name. A match by name wins; a Task with ONE connector is unambiguous; anything else gets an empty id, which never earns a permanent permission.
   */
  private connectorOf(held: Held, server: string | undefined): ConnectorRef {
    const available = this.deps.ports().availableConnectors?.(held.cli) ?? []
    const carried = held.connectors.map(item => available.find(row => row.id === item.id) ?? { cli: item.cli, id: item.id, name: item.id })
    const wanted = server === undefined ? '' : keyOf(server)
    const byName = wanted === '' ? undefined : carried.find(row => keyOf(row.name) === wanted || keyOf(row.name).includes(wanted) || wanted.includes(keyOf(row.name)))
    if (byName !== undefined) return byName
    if (carried.length === 1 && carried[0] !== undefined) return carried[0]
    return { cli: held.cli, id: '', name: server ?? 'o conector' }
  }
}
