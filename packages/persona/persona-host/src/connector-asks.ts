/**
 * D-084 / TEAM-3: "a persona needs a connector she cannot use yet" is ONE card in Aprovações, whoever opens it:
 *  - `colleague`: "Bia pediu a Teo «Arte dos posts», mas o Teo não pode usar o Gmail" (the request waits; "Liberar para Teo");
 *  - `initiative`: "a Nina quer usar o Drive para buscar o contrato" (her own initiative).
 * The person answers once: `once` (only that Task runs with the connector), `always` (a permanent READ permission for that persona; writing
 * stays in Configurações, and pay/delete keep asking) or `not-now` (the Task stays blocked, with the reason — never refused in silence).
 * The card is opened only by the host, from what the PERSON said and the persona's own title: never from content the persona read.
 * Stored as screen documents (`connector_ask`), no migration; listed in Aprovações through `ScreensHost.extraApprovals`.
 */

import type { ProductRepos, ScreenRepos } from '@deepseek-ai/dsh-persona-store'
import type { ConnectorGrantsHost } from './connector-grants-host.ts'
import { RemoteFault } from './remote-guard.ts'
import type { ApprovalView, ConnectorAskChoice, ConnectorAskView, ConnectorDecisionView, ConnectorRef } from './types.ts'

const KIND = 'connector_ask'
const NAME_MAX = 80
const CHOICES: readonly ConnectorAskChoice[] = ['once', 'always', 'not-now']

/** One request for a connector, as stored. */
export interface ConnectorAskDoc {
  readonly id: string
  readonly projectId: string
  readonly reason: 'colleague' | 'initiative'
  /** Who needs the connector (the colleague asked, or the persona acting on her own initiative). */
  readonly personaId: string
  readonly connector: ConnectorRef
  readonly access: 'read' | 'write'
  /** `colleague`: the persona who asked. */
  readonly requestedByPersonaId?: string
  /** `colleague`: the handoff request that waits for the answer. */
  readonly handoffId?: string
  /** The Task the connector is for (`colleague`: the colleague's Task once it exists; `initiative`: the persona's current one). */
  readonly taskId?: string
  readonly taskTitle?: string
  /** `initiative`: the human sentence that says why. */
  readonly purpose?: string
  readonly status: 'pending' | 'approved' | 'rejected'
  readonly choice?: ConnectorAskChoice
  readonly createdAt: string
  readonly decidedBy?: string
  readonly decidedAt?: string
}

/** What opens a request. */
export interface OpenConnectorAsk {
  readonly id: string
  readonly projectId: string
  readonly reason: 'colleague' | 'initiative'
  readonly personaId: string
  readonly connector: ConnectorRef
  readonly access?: 'read' | 'write'
  readonly requestedByPersonaId?: string
  readonly handoffId?: string
  readonly taskId?: string
  readonly taskTitle?: string
  readonly purpose?: string
}

/** Collaborators. */
export interface ConnectorAsksDeps {
  readonly screens: ScreenRepos
  readonly product: Pick<ProductRepos, 'getPersona'>
  readonly grants: Pick<ConnectorGrantsHost, 'grant' | 'list' | 'authorizeOnce'>
  /**
   * What the answer sets in motion for a request of a colleague: `once`/`always` open the colleague's Task, `not-now` ends the wait honestly.
   * @returns The id of the Task that was opened (for `once` to authorize it), when there is one.
   */
  readonly release: (ask: ConnectorAskDoc, choice: ConnectorAskChoice) => string | undefined
  readonly now: () => string
}

const clip = (text: string, max: number): string => {
  const flat = text.replace(/\s+/gu, ' ').trim()
  return flat.length <= max ? flat : `${flat.slice(0, max - 1).trimEnd()}…`
}

/** The cards of "a persona needs a connector". */
export class ConnectorAsks {
  /** @param deps - Host parts. */
  constructor(private readonly deps: ConnectorAsksDeps) {}

  /**
   * Open a request (idempotent on the id: asking again returns the one that exists, answered or not).
   * @param input - Who needs which connector, why.
   */
  open(input: OpenConnectorAsk): ConnectorAskDoc {
    const existing = this.get(input.projectId, input.id)
    if (existing !== undefined) return existing
    const doc: ConnectorAskDoc = {
      id: input.id, projectId: input.projectId, reason: input.reason, personaId: input.personaId,
      connector: { cli: input.connector.cli, id: input.connector.id, name: clip(input.connector.name, NAME_MAX), ...(input.connector.source === undefined ? {} : { source: input.connector.source }) },
      access: input.access ?? 'read', status: 'pending', createdAt: this.deps.now(),
      ...(input.requestedByPersonaId === undefined ? {} : { requestedByPersonaId: input.requestedByPersonaId }),
      ...(input.handoffId === undefined ? {} : { handoffId: input.handoffId }),
      ...(input.taskId === undefined ? {} : { taskId: input.taskId }),
      ...(input.taskTitle === undefined ? {} : { taskTitle: clip(input.taskTitle, 120) }),
      ...(input.purpose === undefined ? {} : { purpose: clip(input.purpose, 200) }),
    }
    this.deps.screens.put(input.projectId, KIND, input.id, doc)
    return doc
  }

  /** @param projectId - Tenant. @param id - The request. */
  get(projectId: string, id: string): ConnectorAskDoc | undefined {
    return this.deps.screens.get<ConnectorAskDoc>(projectId, KIND, id)
  }

  /** @param projectId - Tenant. @returns The cards for Aprovações, oldest first. */
  approvals(projectId: string): ApprovalView[] {
    return this.deps.screens.list<ConnectorAskDoc>(projectId, KIND)
      .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))
      .map(doc => this.cardOf(doc))
  }

  /**
   * The person answers. A card already answered is returned as it is (idempotent); an answer that cannot be carried out changes nothing.
   * @param request - The request and the choice.
   * @param actorId - The member answering.
   */
  decide(request: { readonly workspaceId: string; readonly projectId: string; readonly id: string; readonly choice: ConnectorAskChoice }, actorId: string): { card: ApprovalView; decision: ConnectorDecisionView } {
    const ask = this.get(request.projectId, request.id)
    if (ask === undefined) throw new Error('approval-not-found')
    if (ask.status !== 'pending') return { card: this.cardOf(ask), decision: { ...(ask.choice === undefined ? {} : { choice: ask.choice }) } }
    const choice: string = request.choice // a wire value
    if (!CHOICES.some(item => item === choice)) throw new RemoteFault('invalid-payload', 'Escolha liberar só desta vez, sempre permitir ou agora não.')
    const persona = this.deps.product.getPersona(ask.personaId)
    if (persona === undefined) throw new RemoteFault('not-found', 'Essa persona não existe mais.')
    let grant: ConnectorDecisionView['grant']
    if (request.choice === 'always') {
      const has = this.deps.grants.list(request.workspaceId, persona.id).some(row => row.cli === ask.connector.cli && row.connectorId === ask.connector.id)
      if (!has) {
        // Permanent and READ ONLY: the persona's own initiative may look, never write; writing is a choice made in Configurações.
        this.deps.grants.grant({ workspaceId: request.workspaceId, projectId: request.projectId, personaId: persona.id, connector: ask.connector, access: 'read' }, actorId)
        grant = { personaId: persona.id, cli: ask.connector.cli, connectorId: ask.connector.id }
      }
    }
    const opened = this.deps.release(ask, request.choice)
    if (request.choice === 'once') {
      const taskId = opened ?? ask.taskId
      if (taskId === undefined) throw new RemoteFault('invalid-payload', 'Não há uma tarefa para liberar só desta vez.')
      this.deps.grants.authorizeOnce(persona, ask.connector, taskId, ask.id)
    }
    const decided: ConnectorAskDoc = {
      ...ask, status: request.choice === 'not-now' ? 'rejected' : 'approved', choice: request.choice, decidedBy: actorId, decidedAt: this.deps.now(),
      ...(opened === undefined ? {} : { taskId: opened }),
    }
    this.deps.screens.put(request.projectId, KIND, ask.id, decided)
    return { card: this.cardOf(decided), decision: { choice: request.choice, ...(grant === undefined ? {} : { grant }) } }
  }

  private cardOf(doc: ConnectorAskDoc): ApprovalView {
    const persona = this.deps.product.getPersona(doc.personaId)
    const name = persona?.name ?? 'a persona'
    const asker = doc.requestedByPersonaId === undefined ? undefined : this.deps.product.getPersona(doc.requestedByPersonaId)
    const connector: ConnectorAskView = {
      reason: doc.reason, connectorName: doc.connector.name, cli: doc.connector.cli, connectorId: doc.connector.id, access: doc.access,
      options: CHOICES,
      ...(doc.requestedByPersonaId === undefined ? {} : { requestedByPersonaId: doc.requestedByPersonaId }),
      ...(asker === undefined ? {} : { requestedByPersonaName: asker.name }),
      ...(doc.taskId === undefined ? {} : { taskId: doc.taskId }),
      ...(doc.taskTitle === undefined ? {} : { taskTitle: doc.taskTitle }),
      ...(doc.purpose === undefined ? {} : { purpose: doc.purpose }),
    }
    const question = doc.reason === 'colleague'
      ? `${asker?.name ?? 'Uma colega'} pediu a ${name}${doc.taskTitle === undefined ? '' : ` “${doc.taskTitle}”`}, mas ${name} não pode usar o ${doc.connector.name}.`
      : `${name} quer usar o ${doc.connector.name}${doc.purpose === undefined ? '' : `: ${doc.purpose}`}.`
    return {
      id: doc.id, kind: 'connector', title: `Liberar o ${doc.connector.name} para ${name}`, question, status: doc.status,
      personaId: doc.personaId, personaName: name, connector,
      permissionAction: 'connector.release', permissionTarget: `${doc.connector.cli}:${doc.connector.id}`,
    }
  }
}
