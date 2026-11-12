/**
 * ISO-2 (D-081): the person gives ONE persona a connector of their own CLI, by name; without a grant nothing enters her calls.
 * The host stores a POINTER with a level (never a command, URL or token), refuses what could never take effect instead of
 * recording a control that does not exist, and hands the runner the grants of the persona it is opening — fresh at every
 * request, never cached. Contract: persona-spec/contracts/connector-grants.md.
 */

import {
  MAX_CONNECTOR_GRANTS_PER_PERSONA, StoreError,
  type ConnectorAccess, type ConnectorGrantRepos, type EventRepos, type ProductRepos, type StoredConnectorGrant, type StoredPersona,
  type TicketConnectorAuth, type TicketConnectorAuthRepos,
} from '@deepseek-ai/dsh-persona-store'
import { normalizeToolName } from './connector-catalog.ts'
import { grantLineIdOf } from './connector-handle.ts'
import { humanAuthoredRequests, preAllowFor, type AuthoredEvent, type ConnectorAutonomy, type PermissionGate } from './connector-policy.ts'
import type { Orchestration } from './orchestration.ts'
import { RemoteFault } from './remote-guard.ts'
import type { HostConnectorGrant } from './runner.ts'
import type { ConnectorGrantCostView, ConnectorGrantView, ConnectorRef } from './types.ts'

export type { HostConnectorGrant }
export { auditBodyForReader, connectorHandleOf } from './connector-handle.ts'

/**
 * How a connector can reach the persona. `local`: a definition the runner can copy from the CLI's config here. `account`: a connector of the
 * person's ACCOUNT (claude.ai), grantable by an allow-listed URL without copying any credential (ISO-5; its id is the proxy URL).
 * `remote`: exists only in the cloud/plugin and cannot be granted. `missing`: not found.
 */
export type ConnectorDefinition = 'local' | 'account' | 'remote' | 'missing'
/** How well a CLI separates the persona's calls from the person's own environment. */
export type CliIsolation = 'full' | 'partial' | 'none'

/**
 * Read-only ports the runner provides (persona-spec/contracts/cli-isolation.md §4). They never log env or secrets and never return
 * a definition. An absent port refuses: a control the host cannot verify is not recorded.
 */
export interface ConnectorPorts {
  /** Synchronous, only asked at grant time. `source` is the bridge's label hint: it may refine `missing` to `remote`, never promote to `local`. */
  readonly connectorDefinitionOf?: (cli: string, id: string, source?: string) => ConnectorDefinition
  readonly cliIsolation?: (cli: string) => CliIsolation
  /** Whether the CLI stops a call and hands back the request (`blocked`). `none` (or absent) ⇒ the connector is loaded read-only: fail closed. */
  readonly permissionRequests?: (cli: string) => PermissionGate
  /** The connectors the person has on this CLI, as the bridge lists them. */
  readonly availableConnectors?: (cli: string) => readonly ConnectorRef[]
  /**
   * Which of the `available` connectors a request needs. PURE and deterministic, no model (dry routing); only ever called with text the PERSON wrote.
   * The host keeps only what is in `available`.
   */
  readonly connectorsNeededBy?: (text: string, available: readonly ConnectorRef[]) => readonly ConnectorRef[]
  /** Control-only pre-flight (~5 s, zero model): what the connector adds to EVERY call. `undefined` = not measured. */
  readonly connectorCostOf?: (cli: string, id: string) => Promise<ConnectorCost | undefined>
  /** HT-9: the pre-flight (`mcp_status.mcpServers`) of this CLI, with each tool's annotations. The gate calls a tool `read` only if a server proved it; without this, fail closed. */
  readonly mcpStatusOf?: (cli: string) => readonly unknown[] | undefined
  /**
   * D-081/D-083: the name the CLI gives a connector as an MCP server (`claude.ai Gmail`), so the gate can tell which servers a Task was GIVEN. Without an answer
   * a connector's tools are not in the mandate: fail closed.
   */
  readonly mcpServerNameOf?: (cli: string, id: string) => string | undefined
}

/** Measured cost of a connector per call. */
export interface ConnectorCost {
  readonly extraTokens: number
  readonly percent: number
  readonly basisTokens: number
}

/** The waivers a caller may ask for (every class not named stays `ask`). */
type ConfirmPolicyInput = Partial<StoredConnectorGrant['confirm']>

/** Collaborators of {@link ConnectorGrantsHost}. */
export interface ConnectorGrantsDeps {
  readonly grants: ConnectorGrantRepos
  /** The authorization of a connector for ONE Task, from the person's own words. */
  readonly auth: TicketConnectorAuthRepos
  readonly product: ProductRepos
  /** The events that carry what a Task was asked: its origin trigger and the person's follow-ups that entered it. Absent Task ⇒ undefined. */
  readonly ticketTriggers: (projectId: string, ticketId: string) => readonly string[] | undefined
  readonly eventOf: (eventId: string) => AuthoredEvent | undefined
  /** Whether an author is a human member of the workspace right now (a persona, the system and a removed member are not). */
  readonly isHuman: (workspaceId: string, actorId: string) => boolean
  readonly autonomyOf: (projectId: string, personaId: string) => ConnectorAutonomy
  readonly events: EventRepos
  readonly orchestration: Orchestration
  /** The #geral of a project (created when missing). */
  readonly geralOf: (workspaceId: string, projectId: string) => string
  /** The ports at this moment (the desktop bridge installs them after the host is built). */
  readonly ports: () => ConnectorPorts
  /** Governance audit (Membros › Atividade). */
  readonly audit: (workspaceId: string, actorId: string, action: string, detail: Record<string, string>) => void
  /** HT-9: the calls the person approved for a Task (each once, by the hash of its real arguments), with the connector each belongs to. */
  readonly approvedFor?: (projectId: string, ticketId: string) => ReadonlyArray<{ readonly connectorId: string; readonly tool: string; readonly argsHash: string }>
  readonly now: () => string
}

const SCOPE_LABEL: Readonly<Record<ConnectorAccess, string>> = { read: 'só leitura', write: 'leitura e escrita' }

/** Host side of the connector grants. */
export class ConnectorGrantsHost {
  constructor(private readonly deps: ConnectorGrantsDeps) {}

  /**
   * @param workspaceId - Tenant.
   * @param personaId - One persona; omitted lists the workspace. Names and levels only.
   */
  list(workspaceId: string, personaId?: string): ConnectorGrantView[] {
    return this.deps.grants.list(workspaceId, personaId).map(grant => this.viewOf(grant))
  }

  /**
   * Give a persona a connector (or change the level). Refusals write nothing: no row, no log, no audit, no line.
   * @param request - Who, which connector, which level.
   * @param actorId - The workspace owner doing it.
   */
  grant(
    request: { readonly workspaceId: string; readonly projectId: string; readonly personaId: string; readonly connector: ConnectorRef; readonly access: ConnectorAccess; readonly confirm?: ConfirmPolicyInput },
    actorId: string,
  ): ConnectorGrantView {
    const { connector } = request
    const level: string = request.access // from the wire: not trusted to be one of the two
    if (connector.cli === '' || connector.id === '' || (level !== 'read' && level !== 'write')) {
      throw new RemoteFault('invalid-payload', 'Informe o conector e o nível de acesso.')
    }
    const persona = this.personaOf(request.workspaceId, request.personaId)
    // D-084: the permission is the HOST's policy about the persona's own initiative, so it is recorded whatever the CLI loads (Codex too).
    // Only a connector that could NEVER be used (it exists only in the cloud or a plugin) is refused. An absent port knows nothing: not a refusal.
    if (this.deps.ports().connectorDefinitionOf?.(connector.cli, connector.id, connector.source) === 'remote') {
      throw new RemoteFault('not-grantable', 'Este conector não dá para entregar à persona.')
    }
    let change: ReturnType<ConnectorGrantRepos['put']>
    try {
      change = this.deps.grants.put({
        workspaceId: request.workspaceId, personaId: persona.id, cli: connector.cli, connectorId: connector.id,
        name: connector.name, access: request.access, ...(request.confirm === undefined ? {} : { confirm: request.confirm }), grantedBy: actorId,
      })
    } catch (error: unknown) {
      if (error instanceof StoreError && error.code === 'constraint') {
        if (error.detail === 'connector-limit') {
          throw new RemoteFault('limit-reached', `Esta persona já usa o máximo de conectores (${String(MAX_CONNECTOR_GRANTS_PER_PERSONA)}).`)
        }
        throw new RemoteFault('invalid-payload', 'O conector ou o nível de acesso não é válido.')
      }
      throw error
    }
    if (change.action === 'unchanged') return this.viewOf(change.grant)
    this.deps.audit(request.workspaceId, actorId, change.action === 'grant' ? 'connector.grant' : 'connector.change', {
      personaId: persona.id, cli: connector.cli, connectorId: connector.id, name: change.grant.name, access: request.access,
      confirmSend: change.grant.confirm.send, confirmPay: change.grant.confirm.pay, confirmDelete: change.grant.confirm.delete,
    })
    // A warm session already loaded (or never saw) this connector: drop it so the next call is built from the grants as they are now.
    this.deps.orchestration.evictWarmRunners(persona.projectId, persona.id)
    this.announce(request.workspaceId, request.projectId, persona, change.grant)
    return this.viewOf(change.grant)
  }

  /**
   * Item 26 (contracts/connector-grant-by-name.md): give a persona a tool of the catalog BY ITS NAME. The host resolves it among the connectors of the persona's OWN
   * CLI with the catalog's matching rule (an exact name beats a partial one), so the connector's id (the proxy URL of an account connector) never goes through the
   * screen. Then it is exactly {@link grant}: same refusals, same audit, nothing waived.
   * @param request - Who, which tool (by name) and the level (default: read).
   * @param actorId - The workspace owner doing it.
   */
  grantByName(
    request: { readonly workspaceId: string; readonly projectId: string; readonly personaId: string; readonly name: string; readonly access?: ConnectorAccess },
    actorId: string,
  ): ConnectorGrantView {
    const persona = this.personaOf(request.workspaceId, request.personaId)
    const wanted = normalizeToolName(request.name)
    if (wanted === '') throw new RemoteFault('invalid-payload', 'Informe qual ferramenta.')
    const cli = persona.runner.kind === 'cli' ? persona.runner.cli : ''
    const available = cli === '' ? [] : this.deps.ports().availableConnectors?.(cli) ?? []
    const partial = available.filter((item) => {
      const own = normalizeToolName(item.name)
      // Whole WORDS, one way only: the card's name inside the connector's ("Gmail" -> "claude.ai Gmail"). Never the connector's inside the card's ("Gmail" is not "Mail") nor inside a word (CONN-2).
      return own !== '' && ` ${own} `.includes(` ${wanted} `)
    })
    const exact = partial.filter(item => normalizeToolName(item.name) === wanted)
    const pool = exact.length > 0 ? exact : partial
    const chosen = pool[0]
    if (chosen === undefined) {
      throw new RemoteFault('not-found', `A conta ainda não tem ${request.name.trim()}: ligue pelo botão Conectar.`, { reason: 'connector-not-available' })
    }
    if (pool.length > 1) throw new RemoteFault('conflict', 'Achei mais de um com esse nome. Escolha pelo nome inteiro.', { reason: 'connector-ambiguous' })
    return this.grant({ workspaceId: request.workspaceId, projectId: request.projectId, personaId: persona.id, connector: chosen, access: request.access ?? 'read' }, actorId)
  }

  /**
   * Take a connector back. Idempotent; takes effect on the next call (a turn already open ends with what it had).
   * @param request - Who and which connector.
   * @param actorId - The workspace owner doing it.
   * @returns Whether there was a grant to remove.
   */
  revoke(
    request: { readonly workspaceId: string; readonly personaId: string; readonly cli: string; readonly connectorId: string },
    actorId: string,
  ): boolean {
    const persona = this.personaOf(request.workspaceId, request.personaId)
    const removed = this.deps.grants.revoke(request.workspaceId, persona.id, request.cli, request.connectorId, actorId)
    if (removed === undefined) return false
    this.deps.audit(request.workspaceId, actorId, 'connector.revoke', {
      personaId: persona.id, cli: removed.cli, connectorId: removed.connectorId, name: removed.name,
    })
    this.deps.orchestration.evictWarmRunners(persona.projectId, persona.id)
    return true
  }

  /**
   * What a runner request carries for one Task: the connectors THAT Task may use, with why and what is let through. Sorted by `(cli, id)`.
   * - With a Task: the connectors the PERSON's own words asked for (derived from human-authored events only, then kept for that Task), plus
   *   the persona's permanent permissions when nobody asked (a routine, her own initiative). Another Task inherits nothing from this one.
   * - Without a Task: nothing was authorized by anyone, so only reading is let through (fail closed).
   * @param persona - The persona the runner opens for.
   * @param cli - The CLI that will answer.
   * @param ticketId - The Task the runner opens for, when known.
   * @returns `undefined` when nothing is authorized (the runner then builds a config with no MCP at all).
   */
  forRunner(persona: StoredPersona, cli: string, ticketId?: string): readonly HostConnectorGrant[] | undefined {
    const grants = this.deps.grants.list(persona.workspaceId, persona.id).filter(row => row.cli === cli)
    const autonomy = this.deps.autonomyOf(persona.projectId, persona.id)
    const gate = this.deps.ports().permissionRequests?.(cli) ?? 'none'
    const out = new Map<string, HostConnectorGrant>()
    const permanentOf = (id: string): StoredConnectorGrant | undefined => grants.find(row => row.connectorId === id)
    if (ticketId === undefined) {
      for (const grant of grants) out.set(grant.connectorId, { cli, id: grant.connectorId, access: grant.access, basis: 'permanent', preAllow: ['read'] })
    } else {
      const { authorized, humanRequests } = this.authorizeTicket(persona, cli, ticketId)
      for (const row of authorized) {
        const grant = permanentOf(row.connectorId)
        out.set(row.connectorId, {
          cli, id: row.connectorId, access: grant?.access ?? 'write', basis: row.source,
          preAllow: preAllowFor({ origin: row.source, autonomy, gate, ...(grant === undefined ? {} : { grant: { access: grant.access, confirm: grant.confirm } }) }),
        })
      }
      // Nobody asked (a routine, her own initiative): only what she is permanently allowed, and only if that lets something through.
      if (humanRequests === 0) {
        for (const grant of grants) {
          if (out.has(grant.connectorId)) continue
          const preAllow = preAllowFor({ origin: 'initiative', autonomy, gate, grant: { access: grant.access, confirm: grant.confirm } })
          if (preAllow.length > 0) out.set(grant.connectorId, { cli, id: grant.connectorId, access: grant.access, basis: 'permanent', preAllow })
        }
      }
    }
    // HT-9: what the person approved for THIS Task travels with the connector it belongs to (and only if that connector is still authorized).
    // It is part of the request, so the Task's runner after an approval is not the one it had before; nothing is added when nothing was approved.
    const approved = ticketId === undefined ? [] : this.deps.approvedFor?.(persona.projectId, ticketId) ?? []
    const list = [...out.values()]
      .map((item) => {
        const mine = approved.filter(row => row.connectorId === item.id).map(row => ({ tool: row.tool, argsHash: row.argsHash }))
        return mine.length === 0 ? item : { ...item, approved: mine }
      })
      .sort((a, b) => a.cli.localeCompare(b.cli) || a.id.localeCompare(b.id))
    return list.length === 0 ? undefined : list
  }

  /**
   * Authorize, for THIS Task, the connectors the person's own words need. Only human-authored events count (the Keel guardrail): what the
   * persona read — an email, a page, a tool result — is never a request. Idempotent: the first authority of a connector stays.
   */
  private authorizeTicket(persona: StoredPersona, cli: string, ticketId: string): { readonly authorized: readonly TicketConnectorAuth[]; readonly humanRequests: number } {
    const ids = this.deps.ticketTriggers(persona.projectId, ticketId) ?? []
    const requests = humanAuthoredRequests(ids, id => this.deps.eventOf(id), actor => this.deps.isHuman(persona.workspaceId, actor))
    const ports = this.deps.ports()
    if (requests.length > 0 && ports.connectorsNeededBy !== undefined) {
      const available = ports.availableConnectors?.(cli) ?? []
      for (const request of requests) {
        for (const needed of ports.connectorsNeededBy(request.text, available)) {
          // Only what exists on this CLI: a port that names something else (or something not available) authorizes nothing.
          if (needed.cli !== cli || !available.some(item => item.cli === needed.cli && item.id === needed.id)) continue
          this.deps.auth.put({ ticketId, cli, connectorId: needed.id, source: 'request', messageId: request.messageId })
        }
      }
    }
    return { authorized: this.deps.auth.list(ticketId).filter(row => row.cli === cli), humanRequests: requests.length }
  }

  /**
   * TEAM-3: the first connector the PERSON's own request needs that this persona may not use yet. Read from the human-authored words of the
   * Task the chain started from (never from what anyone read), only what exists on her CLI.
   * @param persona - The colleague who would receive the request.
   * @param rootTicketId - The Task the person's request started.
   * @returns The missing connector (read level), or undefined when nothing is missing or nothing can be told.
   */
  gapFor(persona: StoredPersona, rootTicketId: string): { readonly connector: ConnectorRef; readonly access: 'read' } | undefined {
    const cli = persona.runner.kind === 'cli' ? persona.runner.cli : undefined
    const ports = this.deps.ports()
    if (cli === undefined || ports.connectorsNeededBy === undefined) return undefined
    const ids = this.deps.ticketTriggers(persona.projectId, rootTicketId) ?? []
    const requests = humanAuthoredRequests(ids, id => this.deps.eventOf(id), actor => this.deps.isHuman(persona.workspaceId, actor))
    const available = ports.availableConnectors?.(cli) ?? []
    const granted = new Set(this.deps.grants.list(persona.workspaceId, persona.id).filter(row => row.cli === cli).map(row => row.connectorId))
    for (const request of requests) {
      for (const needed of ports.connectorsNeededBy(request.text, available)) {
        const known = available.find(item => item.cli === cli && item.id === needed.id)
        if (needed.cli !== cli || known === undefined || granted.has(needed.id)) continue
        return { connector: { cli, id: known.id, name: known.name }, access: 'read' }
      }
    }
    return undefined
  }

  /**
   * The person let a connector through for ONE Task ("só desta vez"). The first authority of a connector for a Task stays.
   * @param persona - Who runs the Task.
   * @param connector - Which connector.
   * @param ticketId - The Task.
   * @param messageId - The card the person answered (the authority).
   */
  authorizeOnce(persona: StoredPersona, connector: ConnectorRef, ticketId: string, messageId: string): void {
    this.deps.auth.put({ ticketId, cli: connector.cli, connectorId: connector.id, source: 'once', messageId })
    this.deps.orchestration.evictWarmRunners(persona.projectId, persona.id)
  }

  /**
   * What the connector would add to every call of the persona, so the person sees it BEFORE confirming. Never writes.
   * @param request - Persona and connector.
   * @returns `unknown` when the port is absent or measured nothing: the screen then writes no number.
   */
  async costOf(request: { readonly workspaceId: string; readonly personaId: string; readonly connector: ConnectorRef }): Promise<ConnectorGrantCostView> {
    this.personaOf(request.workspaceId, request.personaId)
    const cost = await this.deps.ports().connectorCostOf?.(request.connector.cli, request.connector.id)
    return cost === undefined ? { status: 'unknown' } : { status: 'measured', ...cost }
  }

  /** The view of one permission; `loadedAlways` is read from the port NOW (a CLI that does not isolate loads every connector already). */
  private viewOf(grant: StoredConnectorGrant): ConnectorGrantView {
    return {
      personaId: grant.personaId, cli: grant.cli, connectorId: grant.connectorId, name: grant.name,
      access: grant.access, confirm: grant.confirm, loadedAlways: (this.deps.ports().cliIsolation?.(grant.cli) ?? 'none') !== 'full',
      grantedBy: grant.grantedBy, grantedAt: grant.grantedAt,
    }
  }

  private personaOf(workspaceId: string, personaId: string): StoredPersona {
    const persona = this.deps.product.getPersona(personaId)
    if (persona === undefined || persona.workspaceId !== workspaceId) throw new RemoteFault('not-found', 'Não achei essa persona.')
    return persona
  }

  /** One line in the #geral of the project where the person did it (Muse §2). Revoking posts nothing there, only Atividade. */
  private announce(workspaceId: string, projectId: string, persona: StoredPersona, grant: StoredConnectorGrant): void {
    // CONN-3: the line's id never carries the connector's id (an account connector's is the proxy URL, key included): a stable handle instead. A line written before this (the old id) still counts as written.
    const id = grantLineIdOf(persona.id, grant.cli, grant.connectorId, grant.grantedAt)
    if (this.deps.events.has(id) || this.deps.events.has(`connector-grant:${persona.id}:${grant.cli}:${grant.connectorId}:${grant.grantedAt}`)) return
    const speaker = this.deps.product.listPersonas(projectId).find(row => row.systemRoles.includes('coordination')) ?? persona
    this.deps.events.append({
      id, workspaceId, projectId, streamKind: 'channel', ownerId: this.deps.geralOf(workspaceId, projectId), type: 'message',
      body: `Você deu à ${persona.name} permissão de usar o ${grant.name} (${SCOPE_LABEL[grant.access]}${grant.confirm.send === 'never' ? ', sem perguntar antes de enviar' : ''}).`,
      actorId: speaker.id, subjectId: '', occurredAt: this.deps.now(),
    })
  }
}
