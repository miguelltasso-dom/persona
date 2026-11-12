/** Explicit channel replication between local Persona hosts through the local edge. */
import { randomBytes } from 'node:crypto'
import { isTechnicalAuthor } from './thread-authors.ts'
import { z } from 'zod'
import { RemoteFault } from './remote-guard.ts'
import type { Actor, ChannelSealedPayload, SyncEnvelope } from '@deepseek-ai/dsh-persona-core'
import {
  ChannelCryptoError, ChannelKeyring, HttpTransport, MemoryIdentityStore, SyncClient, SyncTransportError, createRequestSigner, fingerprint, inviteLinkOf, loadOrCreateIdentity,
  newChannelKey, openChannel, parseInviteLink, publicIdentity, sealChannel, unwrapChannelKey, wrapChannelKey,
  type Identity, type RequestSigner,
} from '@deepseek-ai/dsh-persona-sync'
import { SqliteSyncLog, type EventRepos, type PersonaStore, type ScreenRepos, type StoredEvent } from '@deepseek-ai/dsh-persona-store'
import type {
  AcceptRemoteInviteRequest, ConnectRemoteTeamRequest, RemoteTeamState,
  InviteLinkView, InvitePreview, InviteView, IssueInviteRequest, JoinStatus, ProjectScopeRequest,
  RemoteMemberView,
} from './types.ts'

const KIND = 'remote_team'
const PENDING = 'remote_team_pending'
const INVITES = 'remote_team_invite'
/** An invitation link is good for one person and 7 days ("Vale por 7 dias, para 1 pessoa."). */
const INVITE_TTL_MS = 7 * 24 * 60 * 60 * 1000
const InviteResponse = z.object({ invite: z.object({
  id: z.string(), workspaceId: z.string(), expiresAt: z.number(), usedAt: z.number().optional(), revokedAt: z.number().optional(), teamName: z.string().optional(),
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
  syncedAt: z.iso.datetime().optional(),
  behindBy: z.number().int().nonnegative().optional(),
  remoteHeads: z.record(z.string(), z.number().int().nonnegative()).optional(),
})
const HubEpoch = z.object({ epoch: z.number().int().nonnegative() })
const KeyWraps = z.object({ epoch: z.number().int().nonnegative(), wraps: z.array(z.object({
  channelId: z.string(), epoch: z.number().int().positive(), recipientId: z.string(),
  wrap: z.object({ epoch: z.number().int().positive(), by: z.string(), epk: z.string(), ct: z.string(), sig: z.string() }),
})) })

/** One person of the project at the hub, with the PUBLIC keys they registered. */
interface RosterRow {
  readonly actorId: string
  readonly active: boolean
  readonly keys?: { readonly signing: string; readonly agreement: string }
}
const JoinRequests = z.object({ requests: z.array(z.object({
  id: z.string(), actorId: z.string(), displayName: z.string().optional(), requestedAt: z.number(),
  keys: z.object({ signing: z.string(), agreement: z.string() }),
})) })
const MyJoinRequest = z.object({ request: z.object({ status: z.enum(['pending', 'approved', 'denied', 'cancelled']) }) })
const RemoteMembers = z.object({ members: z.array(z.object({
  actor: z.object({ id: z.string(), workspaceId: z.string(), workspaceRole: z.enum(['owner', 'member', 'guest']) }),
  displayName: z.string().optional(), joinedAt: z.number(), revokedAt: z.number().optional(), inviteId: z.string().optional(),
  keys: z.object({ signing: z.string(), agreement: z.string() }).optional(),
})) })

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
  /** This device's identity (the Cofre's sealed slot in the app). Absent = one in memory for this host only (tests): the keys do not survive a restart. */
  readonly identity?: () => Promise<Identity>
}

/** Somebody who followed an invite link and waits for the owner, with the code the owner confirms with them before approving. */
export interface RemoteJoinRequest {
  readonly id: string
  readonly actorId: string
  readonly displayName?: string
  readonly requestedAt: string
  readonly keys: { readonly signing: string; readonly agreement: string }
  /** SHA-256 of both public keys in groups of four: the owner and the person compare it out loud. */
  readonly securityCode: string
}

/** Owns its poll timer, pending event references, cursor persistence and imported-event suppression. */
export class RemoteTeamHost {
  private readonly connections = new Map<string, RemoteTeamState>()
  private readonly pending = new Map<string, Set<string>>()
  private readonly stopListening: () => void
  private timer: ReturnType<typeof setInterval> | undefined
  private applying = false
  private work: Promise<void> = Promise.resolve()
  private identityPromise: Promise<Identity> | undefined
  private readonly memoryIdentity = new MemoryIdentityStore()
  private readonly signers = new Map<string, RequestSigner>()
  /** The channel keys THIS device holds, per project. In memory only: after a restart they are opened again from the wraps the hub holds. */
  private readonly keyrings = new Map<string, ChannelKeyring>()
  private readonly rosters = new Map<string, RosterRow[]>()
  private readonly epochs = new Map<string, number>()

  /** @param options - SQLite, event log, vault capability and polling settings. */
  constructor(readonly options: RemoteTeamOptions) {
    if (!Number.isInteger(options.pollMs) || options.pollMs < 0) throw new Error('invalid-remote-team-poll-ms')
    if (!Number.isInteger(options.timeoutMs) || options.timeoutMs <= 0) throw new Error('invalid-remote-team-timeout-ms')
    // A reply that is still streaming is not shared; it goes out once, when it settles into its final text.
    const stopAppends = options.events.subscribe((event) => { if (event.type !== 'partial') this.enqueue(event) })
    const stopChanges = options.events.subscribeChanges((event) => { if (event.type !== 'partial') this.enqueue(event) })
    this.stopListening = () => { stopAppends(); stopChanges() }
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
    if (live !== undefined) return this.withLag(live)
    const stored = this.options.screens.get<unknown>(scope.projectId, KIND, 'connection')
    if (stored === undefined) return undefined
    const { syncedAt, behindBy, remoteHeads, ...base } = StatePayload.parse(stored)
    const state: RemoteTeamState = { ...base,
      ...(syncedAt === undefined ? {} : { syncedAt }),
      ...(behindBy === undefined ? {} : { behindBy }),
      ...(remoteHeads === undefined ? {} : { remoteHeads }),
    }
    if (state.workspaceId !== scope.workspaceId || state.projectId !== scope.projectId) throw new Error('remote-team-state-scope')
    localEdgeOrigin(state.edgeUrl)
    return this.withLag(state)
  }

  /** @param scope - Existing project to resume. */
  resume(scope: ProjectScopeRequest): void {
    const state = this.state(scope)
    if (state === undefined) return
    this.connections.set(scope.projectId, state)
    this.arm()
  }

  /** @param request - Explicit channels. @param actor - Server-resolved owner. @returns Durable connection state. */
  async connect(request: ConnectRemoteTeamRequest, actor: Actor, displayName: string): Promise<RemoteTeamState> {
    if (actor.workspaceRole !== 'owner') throw new Error('forbidden')
    this.requireVault()
    const edgeUrl = localEdgeOrigin(request.edgeUrl)
    const identity = await this.identityOf()
    // The owner registers the PUBLIC half of this device's identity; the call itself is signed with the private half (nobody can claim the workspace in their name).
    const joined = z.object({ member: z.object({ actor: z.object({ workspaceRole: z.enum(['owner', 'member', 'guest']) }) }) })
      .parse(await this.json(edgeUrl, request.workspaceId, actor.id, '/members', { ...actor, displayName, keys: publicIdentity(identity) }))
    if (joined.member.actor.workspaceRole !== 'owner') throw new Error('remote-team-owner-required')
    const saved = this.save({
      workspaceId: request.workspaceId, projectId: request.projectId, edgeUrl, actorId: actor.id,
      role: 'owner', channelIds: [...new Set(request.channelIds)], status: 'connected', cursors: {}, errorCode: '',
    })
    await this.startChannelKeys(saved) // every channel gets its key now: nothing is ever sent in the clear
    return saved
  }

  /** @param request - Scoped grant. @returns Transient invite token; only its metadata is persisted. */
  async issue(request: IssueInviteRequest): Promise<InviteView> {
    const state = this.requireOwner(request)
    const token = request.token || randomBytes(24).toString('hex')
    await this.requireVault().sealInviteToken(request.inviteId, token)
    const response = InviteResponse.parse(await this.json(state.edgeUrl, state.workspaceId, state.actorId, '/invites', {
      id: request.inviteId, token, ttlMs: INVITE_TTL_MS, ...(request.teamName === undefined ? {} : { teamName: request.teamName }),
      grant: { workspaceRole: request.role, projectIds: [state.projectId], channelIds: state.channelIds, dmIds: [] },
    }))
    const invite: InviteView = {
      id: response.invite.id, workspaceId: state.workspaceId, token: '', status: 'open', expiresAt: response.invite.expiresAt,
    }
    this.options.screens.put(state.projectId, INVITES, invite.id, invite)
    return { ...invite, token }
  }

  /**
   * F4: the link of an invite this host just issued. The team id is the hub's workspace id; a workspace id that the strict link parser would refuse (upper case, an
   * underscore) cannot be put in a link, and that is an error of the product's configuration, never something the link quietly changes.
   * @param scope - Owner project. @param invite - The invite from {@link issue} (it carries the one-time token). @returns The link and when it stops working.
   */
  linkOf(scope: ProjectScopeRequest, invite: InviteView): InviteLinkView {
    const state = this.requireOwner(scope)
    return { inviteId: invite.id, link: inviteLinkOf({ teamId: state.workspaceId, token: invite.token }), expiresAt: invite.expiresAt }
  }

  /**
   * F4: what the screen a link opens shows before anybody asks to join. Strict link first (anything else is "link inválido"), then the hub's public answer for that token.
   * @param link - The raw link. @param edgeUrl - The hub's address from the product's configuration (a local origin; never taken from the link).
   */
  async preview(link: string, edgeUrl: string): Promise<InvitePreview> {
    const parsed = parseInviteLink(link)
    if (parsed === undefined) return { ok: false, error: 'LINK_INVALIDO' }
    let edge: string
    try {
      edge = localEdgeOrigin(edgeUrl)
    } catch (error) {
      void error
      return { ok: false, error: 'SEM_CONEXAO' }
    }
    let found: z.infer<typeof InviteResponse>
    try {
      found = InviteResponse.parse(await this.getPublic(edge, parsed.teamId, `/invites/${encodeURIComponent(parsed.token)}`))
    } catch (error) {
      return { ok: false, error: error instanceof SyncTransportError && error.status >= 400 && error.status < 500 ? 'LINK_INVALIDO' : 'SEM_CONEXAO' }
    }
    const { invite } = found
    if (invite.revokedAt !== undefined) return { ok: false, error: 'CONVITE_REVOGADO' }
    if (invite.usedAt !== undefined) return { ok: false, error: 'CONVITE_USADO' }
    if (invite.expiresAt <= Date.now()) return { ok: false, error: 'CONVITE_VENCIDO' }
    const projectId = invite.grant.projectIds[0]
    if (projectId === undefined) return { ok: false, error: 'LINK_INVALIDO' }
    return { ok: true, teamId: parsed.teamId, teamName: invite.teamName ?? null, projectId, expiresAt: invite.expiresAt }
  }

  /**
   * F4: where the guest's request stands. A connected member (or the owner) is "aceito"; one that has only asked reads the hub's own answer for THEIR request.
   * "aceito" from the hub means the owner decided: the screen then syncs, and the channel keys arrive with it.
   * @param scope - The guest's local project.
   */
  async joinStatus(scope: ProjectScopeRequest): Promise<JoinStatus> {
    const state = this.state(scope)
    if (state === undefined) return 'sem_pedido'
    if (state.role === 'owner' || state.status === 'connected') return 'aceito'
    if (state.status === 'revoked') return 'removido'
    try {
      const answer = MyJoinRequest.parse(await this.getJson(state, '/join-requests/mine'))
      return answer.request.status === 'pending' ? 'esperando_dono' : answer.request.status === 'approved' ? 'aceito'
        : answer.request.status === 'denied' ? 'recusado' : 'sem_pedido'
    } catch (error) {
      void error
      return 'sem_conexao'
    }
  }

  /**
   * F4: "Cancelar pedido". Withdraws a request nobody decided yet (it leaves the owner's list) and forgets the pending connection on this device.
   * @param scope - The guest's local project.
   */
  async cancelJoinRequest(scope: ProjectScopeRequest): Promise<void> {
    const state = this.state(scope)
    if (state === undefined || state.role === 'owner' || state.status === 'connected') throw new Error('remote-team-nothing-to-cancel')
    await this.json(state.edgeUrl, state.workspaceId, state.actorId, '/join-requests/mine/cancel', {})
    this.connections.delete(scope.projectId)
    this.options.screens.delete(scope.projectId, KIND, 'connection')
  }

  /** @param request - Transient token. @param actor - Server-resolved local identity. @returns Granted channel state. */
  async accept(request: AcceptRemoteInviteRequest, actor: Actor, displayName: string): Promise<RemoteTeamState> {
    this.requireVault()
    const edgeUrl = localEdgeOrigin(request.edgeUrl)
    const identity = await this.identityOf()
    const token = encodeURIComponent(request.token)
    const { invite } = InviteResponse.parse(await this.getPublic(edgeUrl, request.workspaceId, `/invites/${token}`))
    if (!invite.grant.projectIds.includes(request.projectId)) throw new Error('remote-team-project-not-granted')
    // Following the link only ASKS: the person is a member after the owner approves (until then the hub answers 401 and the state stays "offline" with PENDING_APPROVAL).
    await this.json(edgeUrl, request.workspaceId, actor.id, `/invites/${token}/request`, { actorId: actor.id, displayName, keys: publicIdentity(identity) })
    return this.save({
      workspaceId: request.workspaceId, projectId: request.projectId, edgeUrl, actorId: actor.id,
      role: invite.grant.workspaceRole, channelIds: invite.grant.channelIds, status: 'offline', cursors: {}, errorCode: 'PENDING_APPROVAL',
    })
  }

  /** @param scope - Owner project. @param inviteId - Invite whose redeemed member loses access. */
  async revoke(scope: ProjectScopeRequest, inviteId: string): Promise<void> {
    const state = this.requireOwner(scope)
    const vault = this.requireVault()
    await this.json(state.edgeUrl, state.workspaceId, state.actorId, `/invites/${encodeURIComponent(inviteId)}/revoke`, {})
    await this.rotateChannels(state) // the person who left cannot read what is said from now on
    const invite = this.options.screens.get<InviteView>(state.projectId, INVITES, inviteId)
    if (invite !== undefined) this.options.screens.put(state.projectId, INVITES, inviteId, { ...invite, status: 'revoked' })
    const members = this.options.screens.get<RemoteMemberView[]>(state.projectId, 'remote_team_members', 'current')
    if (members !== undefined) this.options.screens.put(state.projectId, 'remote_team_members', 'current',
      members.map(row => row.inviteId === inviteId ? { ...row, status: 'revoked' } : row))
    await vault.dropInviteToken(inviteId)
  }

  /** @param scope - Owner project. @returns The people waiting for you, each with the security code to confirm with them. */
  async joinRequests(scope: ProjectScopeRequest): Promise<RemoteJoinRequest[]> {
    const state = this.requireOwner(scope)
    return JoinRequests.parse(await this.getJson(state, '/join-requests')).requests.map(row => ({
      id: row.id, actorId: row.actorId, ...(row.displayName === undefined ? {} : { displayName: row.displayName }),
      requestedAt: new Date(row.requestedAt).toISOString(), keys: row.keys, securityCode: fingerprint(row.keys),
    }))
  }

  /**
   * Let the person in. The hub makes them a member with the grant of the invite; the channel keys are wrapped here in the next slice (F4), so today nothing is wrapped.
   * @param scope - Owner project.
   * @param requestId - A request from {@link joinRequests}.
   * @returns What the hub answered (the member and the actor with the capped grant).
   */
  async approveJoinRequest(scope: ProjectScopeRequest, requestId: string): Promise<unknown> {
    const state = this.requireOwner(scope)
    const identity = await this.identityOf()
    const ring = this.keyringOf(state.projectId)
    const waiting = (await this.joinRequests(scope)).find(row => row.id === requestId)
    if (waiting === undefined) throw new Error('remote-team-request-not-found')
    // The channel keys of EVERY epoch, wrapped for the newcomer with the key THEY registered: the history is theirs too. A key nobody can use raises a typed error here.
    const wraps: Array<{ channelId: string; epoch: number; recipientId: string; wrap: unknown }> = []
    for (const channelId of state.channelIds) {
      if (ring.latest(channelId) === undefined) await this.loadKeys(state, channelId)
      for (const epoch of ring.epochsOf(channelId)) {
        const key = ring.get(channelId, epoch)
        if (key === undefined) continue
        wraps.push({
          channelId, epoch, recipientId: waiting.actorId,
          wrap: wrapChannelKey({ workspaceId: state.workspaceId, channelId, epoch, recipientId: waiting.actorId, by: state.actorId }, { key, recipientAgreementPublic: waiting.keys.agreement, signingSeed: identity.signing.seed }),
        })
      }
    }
    return await this.json(state.edgeUrl, state.workspaceId, state.actorId, `/join-requests/${encodeURIComponent(requestId)}/approve`, { wraps })
  }

  /** @param scope - Owner project. @param requestId - A request from {@link joinRequests}. */
  async denyJoinRequest(scope: ProjectScopeRequest, requestId: string): Promise<void> {
    const state = this.requireOwner(scope)
    await this.json(state.edgeUrl, state.workspaceId, state.actorId, `/join-requests/${encodeURIComponent(requestId)}/deny`, {})
  }

  /** @param scope - Connected project. @returns Metadata-only invite rows, never the sealed token. */
  invites(scope: ProjectScopeRequest): InviteView[] {
    return this.options.screens.list<InviteView>(scope.projectId, INVITES)
  }

  /**
   * Refresh accepted member metadata, retaining the last cache while offline or revoked.
   * @param scope - Authorized connected project.
   * @returns Names and roles with invite ids for revocation, never sealed tokens or other project grants.
   */
  async members(scope: ProjectScopeRequest): Promise<RemoteMemberView[]> {
    const cached = this.options.screens.get<RemoteMemberView[]>(scope.projectId, 'remote_team_members', 'current') ?? []
    const state = this.state(scope)
    if (state === undefined || state.status === 'revoked' || state.status === 'vault_unavailable') return cached
    try {
      const result = RemoteMembers.parse(await this.getJson(state, `/members?projectId=${encodeURIComponent(scope.projectId)}`))
      const members = result.members.filter(row => row.actor.workspaceId === scope.workspaceId).map(row => ({
        actorId: row.actor.id, displayName: row.displayName ?? row.actor.id, role: row.actor.workspaceRole,
        status: row.revokedAt === undefined ? 'active' as const : 'revoked' as const,
        joinedAt: new Date(row.joinedAt).toISOString(), inviteId: row.inviteId ?? '',
      }))
      this.options.screens.put(scope.projectId, 'remote_team_members', 'current', members)
      return members
    } catch (error: unknown) {
      if (!(error instanceof SyncTransportError)) throw error
      this.save({ ...state, status: error.code === 'ACCESS_REVOKED' ? 'revoked' : 'offline', errorCode: error.code })
      return cached
    }
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
    this.rosters.delete(state.projectId)
    this.epochs.clear()
    if (this.vaultAvailability() === 'unavailable') {
      this.save({ ...state, status: 'vault_unavailable', errorCode: 'vault-unavailable' })
      return
    }
    const transport = new HttpTransport(state.edgeUrl, state.workspaceId, this.fetch.bind(this), await this.signerFor(state.actorId))
    const client = new SyncClient({ log: new SqliteSyncLog(this.options.store), transport })
    client.restoreCursors(state.cursors)
    try {
      // A device that holds no key for a channel yet asks for its wrap (the owner starts it): a person approved a moment ago picks theirs up here.
      for (const channelId of state.channelIds) {
        if (this.keyringOf(state.projectId).latest(channelId) !== undefined) continue
        if (state.role === 'owner') await this.startChannelKeys(state)
        else await this.loadKeys(state, channelId)
      }
      for (const channelId of state.channelIds) {
        const streamId = remoteStream(state.projectId, channelId)
        for (const envelope of await client.pull(streamId)) await this.apply(state, channelId, envelope, client)
      }
      const pending = this.loadPending(state.projectId)
      for (const eventId of [...pending]) {
        const event = this.options.events.get(eventId)
        if (event === undefined || !this.isAllowed(state, event)) continue
        const ownerId = event.streamId.slice('channel:'.length)
        const streamId = remoteStream(state.projectId, ownerId)
        const idempotencyKey = `${state.workspaceId}:${state.projectId}:${event.id}`
        if (client.log.byIdempotency(idempotencyKey) === undefined) {
          // Sealed under the channel's current key and signed by this device: the edge never holds a word of it in the clear.
          const current = await this.currentKey(state, ownerId)
          const identity = await this.identityOf()
          const result = await client.push({
            workspaceId: state.workspaceId, streamId, seq: client.log.head(streamId) + 1,
            idempotencyKey, classification: 'channel', at: event.occurredAt,
            payload: sealChannel({
              workspaceId: state.workspaceId, streamId, epoch: current.epoch, authorId: state.actorId, key: current.key, signingSeed: identity.signing.seed,
              plaintext: JSON.stringify({
                id: event.id, body: event.body, actorId: event.actorId, subjectId: event.subjectId,
                occurredAt: event.occurredAt, type: event.type,
              }),
            }),
          })
          if (result.status === 'offline') throw new SyncTransportError('SYNC_UNAVAILABLE', 0)
          if (result.status === 'refused') throw new SyncTransportError(result.code ?? 'SYNC_REFUSED', 403)
        }
        pending.delete(eventId)
        this.options.screens.delete(state.projectId, PENDING, eventId)
      }
      const remoteHeads: Record<string, number> = {}
      for (const channelId of state.channelIds) {
        const streamId = remoteStream(state.projectId, channelId)
        const result = z.object({ head: z.number().int().nonnegative() })
          .parse(await this.getJson(state, `/sync/head?streamId=${encodeURIComponent(streamId)}`))
        remoteHeads[streamId] = result.head
      }
      this.save({ ...state, status: 'connected', errorCode: '', cursors: client.cursorSnapshot(), remoteHeads,
        syncedAt: new Date().toISOString() })
    } catch (error) {
      if (!(error instanceof SyncTransportError)) throw error
      this.save({
        ...state, status: error.code === 'ACCESS_REVOKED' || error.code === 'NOT_A_MEMBER' ? 'revoked' : 'offline',
        errorCode: error.code,
      })
    }
  }

  private async apply(state: RemoteTeamState, channelId: string, envelope: SyncEnvelope, client: SyncClient): Promise<void> {
    if (envelope.workspaceId !== state.workspaceId || envelope.streamId !== remoteStream(state.projectId, channelId)
      || envelope.classification !== 'channel') throw new Error('remote-team-envelope-scope')
    const payload = envelope.payload
    // A sealed message is opened with the channel key; a clear one can only exist on a channel that never had a key.
    const plaintext = 'alg' in payload && payload.alg === 'channel' ? await this.openSealed(state, channelId, envelope.streamId, payload) : client.open(payload)
    if (plaintext === undefined) return // it does not verify (forged or damaged): dropped, the stream goes on
    const message = MessagePayload.parse(JSON.parse(plaintext))
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
    return event.workspaceId === state.workspaceId && event.projectId === state.projectId && !isTechnicalAuthor(event.actorId)
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
    return this.withLag(state)
  }

  private withLag(state: RemoteTeamState): RemoteTeamState {
    if (state.remoteHeads === undefined) return state
    const log = new SqliteSyncLog(this.options.store)
    const incoming = Object.entries(state.remoteHeads).reduce((sum, [stream, head]) => sum + Math.max(0, head - log.head(stream)), 0)
    return { ...state, behindBy: this.loadPending(state.projectId).size + incoming }
  }

  // ---- E2EE (Carbon P0-14): the channel keys, wrapped for each member; the edge holds only what it cannot read -----------------------------------------------

  private keyringOf(projectId: string): ChannelKeyring {
    const known = this.keyrings.get(projectId)
    if (known !== undefined) return known
    const created = new ChannelKeyring()
    this.keyrings.set(projectId, created)
    return created
  }

  private channelPath(channelId: string, tail: string): string {
    return `/channels/${encodeURIComponent(channelId)}/${tail}`
  }

  /** The people of this project with their PUBLIC keys. Cached for one exchange; `fresh` asks the hub again (a new member, a removal). */
  private async rosterOf(state: RemoteTeamState, fresh = false): Promise<RosterRow[]> {
    const cached = this.rosters.get(state.projectId)
    if (cached !== undefined && !fresh) return cached
    const result = RemoteMembers.parse(await this.getJson(state, `/members?projectId=${encodeURIComponent(state.projectId)}`))
    const rows = result.members.map(row => ({ actorId: row.actor.id, active: row.revokedAt === undefined, ...(row.keys === undefined ? {} : { keys: row.keys }) }))
    this.rosters.set(state.projectId, rows)
    return rows
  }

  private async hubEpoch(state: RemoteTeamState, channelId: string, fresh = false): Promise<number> {
    const slot = `${state.projectId}/${channelId}`
    const cached = this.epochs.get(slot)
    if (cached !== undefined && !fresh) return cached
    const epoch = HubEpoch.parse(await this.getJson(state, this.channelPath(channelId, 'epoch'))).epoch
    this.epochs.set(slot, epoch)
    return epoch
  }

  /** The wraps meant for THIS device on a channel, opened into the keyring. A wrap that does not open is skipped: it is not ours to read. */
  private async loadKeys(state: RemoteTeamState, channelId: string): Promise<void> {
    const identity = await this.identityOf()
    const ring = this.keyringOf(state.projectId)
    const found = KeyWraps.parse(await this.getJson(state, this.channelPath(channelId, 'key-wraps')))
    for (const item of found.wraps) {
      if (ring.get(channelId, item.epoch) !== undefined) continue
      const signingPublic = item.wrap.by === state.actorId
        ? identity.signing.publicKey
        : (await this.rosterOf(state)).find(row => row.actorId === item.wrap.by)?.keys?.signing ?? (await this.rosterOf(state, true)).find(row => row.actorId === item.wrap.by)?.keys?.signing
      if (signingPublic === undefined) continue
      try {
        ring.put(channelId, item.epoch, unwrapChannelKey(item.wrap, { workspaceId: state.workspaceId, channelId, epoch: item.epoch, recipientId: state.actorId, by: item.wrap.by }, {
          agreementSecret: identity.agreement.secret, agreementPublic: identity.agreement.publicKey, wrapperSigningPublic: signingPublic,
        }))
      }
      catch (error: unknown) {
        if (!(error instanceof ChannelCryptoError)) throw error
      }
    }
  }

  /** The owner starts the key of every channel that has none (epoch 1, wrapped for herself); one that already has a key is just loaded. */
  private async startChannelKeys(state: RemoteTeamState): Promise<void> {
    const identity = await this.identityOf()
    const ring = this.keyringOf(state.projectId)
    for (const channelId of state.channelIds) {
      if (ring.latest(channelId) !== undefined) continue
      if (await this.hubEpoch(state, channelId, true) > 0) {
        await this.loadKeys(state, channelId)
        continue
      }
      const key = newChannelKey()
      const wrap = wrapChannelKey(
        { workspaceId: state.workspaceId, channelId, epoch: 1, recipientId: state.actorId, by: state.actorId },
        { key, recipientAgreementPublic: identity.agreement.publicKey, signingSeed: identity.signing.seed },
      )
      await this.json(state.edgeUrl, state.workspaceId, state.actorId, this.channelPath(channelId, 'rotate'), { epoch: 1, wraps: [{ channelId, epoch: 1, recipientId: state.actorId, wrap }] })
      ring.put(channelId, 1, key)
      this.epochs.set(`${state.projectId}/${channelId}`, 1)
    }
  }

  /** The owner moves every channel to the next epoch and wraps the new key ONLY for who stays: a person who left cannot read what comes next. */
  private async rotateChannels(state: RemoteTeamState): Promise<void> {
    const identity = await this.identityOf()
    const ring = this.keyringOf(state.projectId)
    const staying = (await this.rosterOf(state, true)).flatMap(row => (row.active && row.keys !== undefined ? [{ actorId: row.actorId, agreement: row.keys.agreement }] : []))
    for (const channelId of state.channelIds) {
      const next = await this.hubEpoch(state, channelId, true) + 1
      const key = newChannelKey()
      const wraps = staying.flatMap((person) => {
        try {
          const wrap = wrapChannelKey(
            { workspaceId: state.workspaceId, channelId, epoch: next, recipientId: person.actorId, by: state.actorId },
            { key, recipientAgreementPublic: person.agreement, signingSeed: identity.signing.seed },
          )
          return [{ channelId, epoch: next, recipientId: person.actorId, wrap }]
        }
        catch (error: unknown) {
          if (error instanceof ChannelCryptoError) return [] // a key nobody can use never blocks the others
          throw error
        }
      })
      await this.json(state.edgeUrl, state.workspaceId, state.actorId, this.channelPath(channelId, 'rotate'), { epoch: next, wraps })
      ring.put(channelId, next, key)
      this.epochs.set(`${state.projectId}/${channelId}`, next)
    }
  }

  /** The key to seal the next message with: the channel's CURRENT epoch (a member who was left behind by a rotation fetches the new wrap first). */
  private async currentKey(state: RemoteTeamState, channelId: string): Promise<{ readonly epoch: number; readonly key: Uint8Array }> {
    const ring = this.keyringOf(state.projectId)
    const epoch = await this.hubEpoch(state, channelId)
    if (epoch === 0) throw new SyncTransportError('E2EE_NOT_STARTED', 0)
    if (ring.get(channelId, epoch) === undefined) await this.loadKeys(state, channelId)
    const key = ring.get(channelId, epoch)
    if (key === undefined) throw new SyncTransportError('E2EE_KEY_MISSING', 0)
    return { epoch, key }
  }

  /** Open a sealed message. A key that has not reached this device yet is a retry (the cursor does not move); a message that does not verify is dropped, never a stuck stream. */
  private async openSealed(state: RemoteTeamState, channelId: string, streamId: string, payload: ChannelSealedPayload): Promise<string | undefined> {
    const ring = this.keyringOf(state.projectId)
    if (ring.get(channelId, payload.epoch) === undefined) await this.loadKeys(state, channelId)
    const key = ring.get(channelId, payload.epoch)
    if (key === undefined) throw new SyncTransportError('E2EE_KEY_MISSING', 0)
    const author = (await this.rosterOf(state)).find(row => row.actorId === payload.authorId)?.keys?.signing
      ?? (await this.rosterOf(state, true)).find(row => row.actorId === payload.authorId)?.keys?.signing
    if (author === undefined) return undefined
    try {
      return openChannel(payload, { workspaceId: state.workspaceId, streamId, key, authorSigningPublic: author })
    }
    catch (error: unknown) {
      if (error instanceof ChannelCryptoError) return undefined
      throw error
    }
  }

  private async getJson(state: RemoteTeamState, path: string): Promise<unknown> {
    let response: Response
    const target = `/w/${encodeURIComponent(state.workspaceId)}${path}`
    const signer = await this.signerFor(state.actorId)
    try {
      response = await this.fetch(`${state.edgeUrl}${target}`, {
        headers: { authorization: signer.authorize({ method: 'GET', target }) },
      })
    } catch (error: unknown) {
      void error
      throw new SyncTransportError('SYNC_UNAVAILABLE', 0)
    }
    if (!response.ok) {
      const body: unknown = await response.json()
      const code = z.object({ code: z.string().optional() }).safeParse(body)
      throw new SyncTransportError(code.success ? code.data.code ?? 'REMOTE_TEAM_REQUEST_FAILED' : 'REMOTE_TEAM_REQUEST_FAILED', response.status)
    }
    return response.json()
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

  /** A POST signed with this device's key (the hub knows who calls by that proof, never by a header). */
  private async json(edgeUrl: string, workspaceId: string, actorId: string, path: string, body: object): Promise<unknown> {
    const target = `/w/${encodeURIComponent(workspaceId)}${path}`
    const sent = JSON.stringify(body)
    const signer = await this.signerFor(actorId)
    const response = await this.fetch(`${edgeUrl}${target}`, {
      method: 'POST', headers: { 'content-type': 'application/json', authorization: signer.authorize({ method: 'POST', target, body: sent }) }, body: sent,
    })
    if (!response.ok) {
      throw new SyncTransportError(response.status === 403 ? 'REMOTE_TEAM_FORBIDDEN' : response.status === 401 ? 'REMOTE_TEAM_UNAUTHORIZED' : 'REMOTE_TEAM_REQUEST_FAILED', response.status)
    }
    return response.json()
  }

  /** A read the hub answers to anybody (the invite lookup by its token). */
  private async getPublic(edgeUrl: string, workspaceId: string, path: string): Promise<unknown> {
    const response = await this.fetch(`${edgeUrl}/w/${encodeURIComponent(workspaceId)}${path}`)
    if (!response.ok) throw new SyncTransportError('REMOTE_TEAM_REQUEST_FAILED', response.status)
    return response.json()
  }

  /** This device's identity: the Cofre's slot in the app, one in memory for a bare host. Loaded once. */
  private identityOf(): Promise<Identity> {
    if (this.identityPromise === undefined) {
      const load = this.options.identity ?? (() => loadOrCreateIdentity(this.memoryIdentity))
      this.identityPromise = load().catch((error: unknown) => { this.identityPromise = undefined; throw error })
    }
    return this.identityPromise
  }

  /** One signer per member id: its timestamps only go up, so two calls in the same millisecond never look like a replay. */
  private async signerFor(actorId: string): Promise<RequestSigner> {
    const known = this.signers.get(actorId)
    if (known !== undefined) return known
    const signer = createRequestSigner(actorId, (await this.identityOf()).signing.seed)
    this.signers.set(actorId, signer)
    return signer
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
