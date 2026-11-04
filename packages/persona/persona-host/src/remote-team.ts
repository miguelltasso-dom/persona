/** Explicit channel replication between local Persona hosts through the local edge. */
import { randomBytes } from 'node:crypto'
import { z } from 'zod'
import { RemoteFault } from './remote-guard.ts'
import type { Actor, SyncEnvelope } from '@deepseek-ai/dsh-persona-core'
import { HttpTransport, SyncClient, SyncTransportError } from '@deepseek-ai/dsh-persona-sync'
import { SqliteSyncLog, type EventRepos, type PersonaStore, type ScreenRepos, type StoredEvent } from '@deepseek-ai/dsh-persona-store'
import type {
  AcceptRemoteInviteRequest, ConnectRemoteTeamRequest, RemoteTeamState,
  InviteView, IssueInviteRequest, ProjectScopeRequest,
} from './types.ts'

const KIND = 'remote_team'
const PENDING = 'remote_team_pending'
const INVITES = 'remote_team_invite'
const InviteResponse = z.object({ invite: z.object({
  id: z.string(), workspaceId: z.string(), expiresAt: z.number(), usedAt: z.number().optional(), revokedAt: z.number().optional(),
  grant: z.object({ workspaceRole: z.enum(['member', 'guest']), projectIds: z.array(z.string()), channelIds: z.array(z.string()) }),
}) })
const MessagePayload = z.object({
  id: z.string().min(1), body: z.string(), actorId: z.string(), subjectId: z.string(),
  occurredAt: z.iso.datetime({ offset: true }), type: z.string(),
})
const StatePayload = z.object({
  workspaceId: z.string(), projectId: z.string(), edgeUrl: z.url(), actorId: z.string(),
  role: z.enum(['owner', 'member', 'guest']), channelIds: z.array(z.string()),
  status: z.enum(['connected', 'offline', 'revoked', 'vault_unavailable']), cursors: z.record(z.string(), z.number().int().nonnegative()),
  errorCode: z.string(),
})

/** Vault capability supplied by persona-vault; tokens never enter screen documents. */
export interface RemoteTeamVault {
  readonly availability: 'available' | 'unavailable' | 'test'
  sealInviteToken(inviteId: string, token: string): Promise<void>
  dropInviteToken(inviteId: string): Promise<void>
}

/** Host-owned effects and validated deployment settings. */
export interface RemoteTeamOptions {
  readonly store: PersonaStore
  readonly screens: ScreenRepos
  readonly events: EventRepos
  readonly vault: () => RemoteTeamVault | undefined
  readonly topicOf: (projectId: string, channelId: string) => string | undefined
  readonly pollMs: number
  readonly timeoutMs: number
  readonly fetch?: typeof fetch
}

/** Owns its poll timer, pending event references, cursor persistence and imported-event suppression. */
export class RemoteTeamHost {
  private readonly connections = new Map<string, RemoteTeamState>()
  private readonly pending = new Map<string, Set<string>>()
  private readonly stopListening: () => void
  private timer: ReturnType<typeof setInterval> | undefined
  private applying = false
  private work: Promise<void> = Promise.resolve()

  /** @param options - SQLite, event log, vault capability and polling settings. */
  constructor(readonly options: RemoteTeamOptions) {
    if (!Number.isInteger(options.pollMs) || options.pollMs < 0) throw new Error('invalid-remote-team-poll-ms')
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('invalid-remote-team-timeout-ms')
    this.stopListening = options.events.subscribe((event) => { this.enqueue(event) })
  }

  /** @returns Current Cofre capability, including an absent provider. */
  vaultAvailability(): 'available' | 'unavailable' | 'test' {
    return this.options.vault()?.availability ?? 'unavailable'
  }

  /** @returns Writable Cofre or a typed failure before any edge request. */
  requireVault(): RemoteTeamVault {
    const vault = this.options.vault()
    if (vault === undefined || (vault.availability !== 'available' && vault.availability !== 'test')) {
      throw new RemoteFault('vault-unavailable', 'Cofre indisponível.')
    }
    return vault
  }

  /** @param scope - Local project. @returns Last durable state, absent before explicit connection. */
  state(scope: ProjectScopeRequest): RemoteTeamState | undefined {
    const live = this.connections.get(scope.projectId)
    if (live !== undefined) return live
    const stored = this.options.screens.get<unknown>(scope.projectId, KIND, 'connection')
    if (stored === undefined) return undefined
    const state = StatePayload.parse(stored)
    if (state.workspaceId !== scope.workspaceId || state.projectId !== scope.projectId) throw new Error('remote-team-state-scope')
    localEdgeOrigin(state.edgeUrl)
    return state
  }

  /** @param scope - Existing project to resume. */
  resume(scope: ProjectScopeRequest): void {
    const state = this.state(scope)
    if (state === undefined) return
    this.connections.set(scope.projectId, state)
    this.arm()
  }

  /** @param request - Explicit channels. @param actor - Server-resolved owner. @returns Durable connection state. */
  async connect(request: ConnectRemoteTeamRequest, actor: Actor): Promise<RemoteTeamState> {
    if (actor.workspaceRole !== 'owner') throw new Error('forbidden')
    this.requireVault()
    const edgeUrl = localEdgeOrigin(request.edgeUrl)
    const joined = z.object({ member: z.object({ actor: z.object({ workspaceRole: z.enum(['owner', 'member', 'guest']) }) }) })
      .parse(await this.json(edgeUrl, request.workspaceId, actor.id, '/members', { ...actor }))
    if (joined.member.actor.workspaceRole !== 'owner') throw new Error('remote-team-owner-required')
    return this.save({
      workspaceId: request.workspaceId, projectId: request.projectId, edgeUrl, actorId: actor.id,
      role: 'owner', channelIds: [...new Set(request.channelIds)], status: 'connected', cursors: {}, errorCode: '',
    })
  }

  /** @param request - Scoped grant. @returns Transient invite token; only its metadata is persisted. */
  async issue(request: IssueInviteRequest): Promise<InviteView> {
    const state = this.requireOwner(request)
    const token = request.token || randomBytes(24).toString('hex')
    await this.requireVault().sealInviteToken(request.inviteId, token)
    const response = InviteResponse.parse(await this.json(state.edgeUrl, state.workspaceId, state.actorId, '/invites', {
      id: request.inviteId, token,
      grant: { workspaceRole: request.role, projectIds: [state.projectId], channelIds: state.channelIds, dmIds: [] },
    }))
    const invite: InviteView = {
      id: response.invite.id, workspaceId: state.workspaceId, token: '', status: 'open', expiresAt: response.invite.expiresAt,
    }
    this.options.screens.put(state.projectId, INVITES, invite.id, invite)
    return { ...invite, token }
  }

  /** @param request - Transient token. @param actor - Server-resolved local identity. @returns Granted channel state. */
  async accept(request: AcceptRemoteInviteRequest, actor: Actor): Promise<RemoteTeamState> {
    this.requireVault()
    const edgeUrl = localEdgeOrigin(request.edgeUrl)
    const response = InviteResponse.parse(await this.json(edgeUrl, request.workspaceId, actor.id, '/invites/redeem', {
      token: request.token,
      actor: { kind: 'user', id: actor.id, workspaceId: request.workspaceId, workspaceRole: 'guest', projectIds: [] },
    }))
    const { invite } = response
    if (!invite.grant.projectIds.includes(request.projectId)) throw new Error('remote-team-project-not-granted')
    return this.save({
      workspaceId: request.workspaceId, projectId: request.projectId, edgeUrl, actorId: actor.id,
      role: invite.grant.workspaceRole, channelIds: invite.grant.channelIds, status: 'connected', cursors: {}, errorCode: '',
    })
  }

  /** @param scope - Owner project. @param inviteId - Invite whose redeemed member loses access. */
  async revoke(scope: ProjectScopeRequest, inviteId: string): Promise<void> {
    const state = this.requireOwner(scope)
    const vault = this.requireVault()
    await this.json(state.edgeUrl, state.workspaceId, state.actorId, `/invites/${encodeURIComponent(inviteId)}/revoke`, {})
    const invite = this.options.screens.get<InviteView>(state.projectId, INVITES, inviteId)
    if (invite !== undefined) this.options.screens.put(state.projectId, INVITES, inviteId, { ...invite, status: 'revoked' })
    await vault.dropInviteToken(inviteId)
  }

  /** @param scope - Connected project. @returns Metadata-only invite rows, never the sealed token. */
  invites(scope: ProjectScopeRequest): InviteView[] {
    return this.options.screens.list<InviteView>(scope.projectId, INVITES)
  }

  /** @param scope - Connected project. @returns State after serialized push/pull; refusals remain visible and durable. */
  async sync(scope: ProjectScopeRequest): Promise<RemoteTeamState | undefined> {
    const next = this.work.then(() => this.exchange(scope))
    this.work = next.then(() => undefined, () => undefined)
    try {
      await next
    } catch (error) {
      const state = this.state(scope)
      if (state !== undefined) this.save({ ...state, status: 'offline', errorCode: 'SYNC_INVALID_RESPONSE' })
      throw error
    }
    return this.state(scope)
  }

  /** Stop polling/listening and await all SQLite users before host disposal. */
  async dispose(): Promise<void> {
    if (this.timer !== undefined) clearInterval(this.timer)
    this.stopListening()
    await this.work
  }

  private async exchange(scope: ProjectScopeRequest): Promise<void> {
    const state = this.state(scope)
    if (state === undefined || state.status === 'revoked') return
    if (this.vaultAvailability() === 'unavailable') {
      this.save({ ...state, status: 'vault_unavailable', errorCode: 'vault-unavailable' })
      return
    }
    const transport = new HttpTransport(state.edgeUrl, state.workspaceId, this.fetch.bind(this), state.actorId)
    const client = new SyncClient({ log: new SqliteSyncLog(this.options.store), transport })
    client.restoreCursors(state.cursors)
    try {
      for (const channelId of state.channelIds) {
        const streamId = remoteStream(state.projectId, channelId)
        for (const envelope of await client.pull(streamId)) this.apply(state, channelId, envelope, client)
      }
      const pending = this.loadPending(state.projectId)
      for (const eventId of [...pending]) {
        const event = this.options.events.get(eventId)
        if (event === undefined || !this.isAllowed(state, event)) continue
        const ownerId = event.streamId.slice('channel:'.length)
        const streamId = remoteStream(state.projectId, ownerId)
        const idempotencyKey = `${state.workspaceId}:${state.projectId}:${event.id}`
        if (client.log.byIdempotency(idempotencyKey) === undefined) {
          const result = await client.push({
            workspaceId: state.workspaceId, streamId, seq: client.log.head(streamId) + 1,
            idempotencyKey, classification: 'channel', at: event.occurredAt,
            payload: { clear: JSON.stringify({
              id: event.id, body: event.body, actorId: event.actorId, subjectId: event.subjectId,
              occurredAt: event.occurredAt, type: event.type,
            }) },
          })
          if (result.status === 'offline') throw new SyncTransportError('SYNC_UNAVAILABLE', 0)
          if (result.status === 'refused') throw new SyncTransportError(result.code ?? 'SYNC_REFUSED', 403)
        }
        pending.delete(eventId)
        this.options.screens.delete(state.projectId, PENDING, eventId)
      }
      this.save({ ...state, status: 'connected', errorCode: '', cursors: client.cursorSnapshot() })
    } catch (error) {
      if (!(error instanceof SyncTransportError)) throw error
      this.save({
        ...state, status: error.code === 'ACCESS_REVOKED' || error.code === 'NOT_A_MEMBER' ? 'revoked' : 'offline',
        errorCode: error.code,
      })
    }
  }

  private apply(state: RemoteTeamState, channelId: string, envelope: SyncEnvelope, client: SyncClient): void {
    if (envelope.workspaceId !== state.workspaceId || envelope.streamId !== remoteStream(state.projectId, channelId)
      || envelope.classification !== 'channel') throw new Error('remote-team-envelope-scope')
    const message = MessagePayload.parse(JSON.parse(client.open(envelope.payload)))
    if (this.options.events.has(message.id)) return
    const topicId = this.options.topicOf(state.projectId, channelId)
    this.applying = true
    try {
      this.options.events.append({
        ...message, workspaceId: state.workspaceId, projectId: state.projectId,
        streamKind: 'channel', ownerId: channelId,
        ...(topicId === undefined ? {} : { topicId }),
      })
    } finally {
      this.applying = false
    }
  }

  private enqueue(event: StoredEvent): void {
    if (this.applying) return
    const state = this.connections.get(event.projectId)
    if (state === undefined || state.status === 'revoked' || !this.isAllowed(state, event)) return
    this.loadPending(event.projectId).add(event.id)
    this.options.screens.put(event.projectId, PENDING, event.id, { eventId: event.id })
  }

  private isAllowed(state: RemoteTeamState, event: StoredEvent): boolean {
    return event.workspaceId === state.workspaceId && event.projectId === state.projectId
      && event.streamId.startsWith('channel:') && state.channelIds.includes(event.streamId.slice('channel:'.length))
  }

  private loadPending(projectId: string): Set<string> {
    const known = this.pending.get(projectId)
    if (known !== undefined) return known
    const ids = new Set(this.options.screens.list<{ eventId: string }>(projectId, PENDING).map(row => row.eventId))
    this.pending.set(projectId, ids)
    return ids
  }

  private save(state: RemoteTeamState): RemoteTeamState {
    this.options.screens.put(state.projectId, KIND, 'connection', state)
    this.connections.set(state.projectId, state)
    this.arm()
    return state
  }

  private arm(): void {
    if (this.timer !== undefined || this.options.pollMs === 0) return
    this.timer = setInterval(() => {
      for (const state of this.connections.values()) {
        void this.sync(state).catch((error: unknown) => {
          // sync persisted the failure; the next poll can resume the durable cursor.
          void error
        })
      }
    }, this.options.pollMs)
    this.timer.unref()
  }

  private requireOwner(scope: ProjectScopeRequest): RemoteTeamState {
    const state = this.state(scope)
    if (state === undefined || state.status === 'revoked' || state.role !== 'owner') throw new Error('forbidden')
    return state
  }

  private fetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
    return (this.options.fetch ?? fetch)(input, { ...init, signal: AbortSignal.timeout(this.options.timeoutMs) })
  }

  private async json(edgeUrl: string, workspaceId: string, actorId: string, path: string, body: object): Promise<unknown> {
    const response = await this.fetch(`${edgeUrl}/w/${encodeURIComponent(workspaceId)}${path}`, {
      method: 'POST', headers: { 'content-type': 'application/json', 'x-persona-actor': actorId }, body: JSON.stringify(body),
    })
    if (!response.ok) throw new SyncTransportError(response.status === 403 ? 'REMOTE_TEAM_FORBIDDEN' : 'REMOTE_TEAM_REQUEST_FAILED', response.status)
    return response.json()
  }
}

function remoteStream(projectId: string, channelId: string): string {
  return `project:${projectId}:channel:${channelId}`
}

function localEdgeOrigin(input: string): string {
  const url = new URL(input)
  if (url.protocol !== 'http:' || !['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname)
    || url.username !== '' || url.password !== '' || url.search !== '' || url.hash !== '' || url.pathname !== '/') {
    throw new Error('remote-team-local-edge-required')
  }
  return url.origin
}
