/**
 * One Durable Object per workspace: the only sequencer of `seq` per stream.
 * WebSocket hibernation, cursor replay, invite redeem, webhook fan-out.
 */

import type { Actor } from '../../../packages/persona/persona-core/src/domain/acl.ts'
import {
  inviteStatus,
  issueInvite,
  redeemInvite,
  revokeInvite,
  type Grant,
  type Invite,
} from '../../../packages/persona/persona-core/src/domain/invite.ts'
import { verifyRequest, type ReplayStore } from '../../../packages/persona/persona-sync/src/request-auth.ts'
import { base64UrlOfBytes, bytesOfBase64Url, verifySealedSignature } from '../../../packages/persona/persona-sync/src/signature-web.ts'
import { DomainError } from '../../../packages/persona/persona-core/src/domain/schemas.ts'
import { commitEnvelope, mayUpload } from '../../../packages/persona/persona-core/src/sync/policy.ts'
import type { ChannelSealedPayload, SyncClassification, SyncEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import { sameWebhookDelivery, webhookEnvelope } from '../../../packages/persona/persona-core/src/sync/webhook.ts'
import type { WebhookEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import { DoSyncSql } from './do-sql.ts'
import type { Env } from './env.ts'
import { internalTagOf } from './internal-tag.ts'
import { EDGE_STATEMENTS } from './schema.ts'
import { SqlSyncLog } from './sql-log.ts'

/**
 * Workspace hub. `seq` is assigned only here; clients that send `seq !== head+1`
 * get `SEQ_GAP`.
 */
export class WorkspaceHub implements DurableObject {
  readonly state: DurableObjectState
  readonly env: Env
  readonly log: SqlSyncLog
  readonly sql: DoSyncSql

  /**
   * @param state - Cloudflare DO state (sqlite + hibernation).
   * @param env - Worker bindings.
   */
  constructor(state: DurableObjectState, env: Env) {
    this.state = state
    this.env = env
    this.sql = new DoSyncSql(state.storage.sql)
    this.log = new SqlSyncLog(this.sql)
    for (const sql of EDGE_STATEMENTS) this.sql.exec(sql)
    state.setWebSocketAutoResponse(new WebSocketRequestResponsePair('ping', 'pong')) // F3: the heartbeat never wakes the object
  }

  /**
   * @param request - Workspace-scoped request (`/w/:id/...`).
   */
  async fetch(incoming: Request): Promise<Response> {
    const url = new URL(incoming.url)
    const parts = url.pathname.split('/').filter(part => part.length > 0)
    const workspaceId = parts[1] ?? ''
    const rest = parts.slice(2)
    // A channel id may carry a colon ("geral:shared"): it travels percent-encoded in the path and means the DECODED id.
    if (rest[0] === 'channels' && rest[1] !== undefined) rest[1] = safeDecode(rest[1])
    if (rest[0] === 'health' || rest.length === 0) {
      return Response.json({ ok: true, workspaceHub: String(this.state.id), workspaceId })
    }
    // F2: who is calling is PROVEN by a signature, never claimed by a header (see `authenticate`). There is no switch that turns this off.
    const gate = await this.authenticate(incoming, url, rest)
    if (gate instanceof Response) return gate
    const request = gate
    if (rest[0] === 'sync' && request.headers.get('Upgrade') === 'websocket') {
      const denied = this.denyActor(request)
      if (denied !== undefined) return denied
      const actorId = request.headers.get('x-persona-actor') ?? ''
      if (actorId === '') return this.refuse('AUTH_MISSING')
      return this.acceptSocket(url, actorId)
    }
    try {
      if (rest[0] === 'sync' && rest[1] === 'append' && request.method === 'POST') {
        const denied = this.denyActor(request)
        if (denied !== undefined) return denied
        const envelope: SyncEnvelope = await request.json()
        if (envelope.workspaceId !== workspaceId) {
          return Response.json({ status: 'refused', code: 'WORKSPACE_MISMATCH', seq: 0 }, { status: 403 })
        }
        const streamDenied = this.denyStream(request, envelope.streamId)
        if (streamDenied !== undefined) return streamDenied
        const unsealed = await this.checkSealed(workspaceId, envelope, request.headers.get('x-persona-actor') ?? '')
        if (unsealed !== undefined) return unsealed
        return this.append(envelope)
      }
      if (rest[0] === 'sync' && rest[1] === 'after' && request.method === 'GET') {
        const denied = this.denyActor(request)
        if (denied !== undefined) return denied
        const streamId = url.searchParams.get('streamId') ?? ''
        const streamDenied = this.denyStream(request, streamId)
        if (streamDenied !== undefined) return streamDenied
        const afterSeq = Number(url.searchParams.get('afterSeq') ?? '0')
        return Response.json({ envelopes: this.log.after(streamId, afterSeq) })
      }
      if (rest[0] === 'sync' && rest[1] === 'head' && request.method === 'GET') {
        const streamId = url.searchParams.get('streamId') ?? ''
        const denied = this.denyStream(request, streamId)
        if (denied !== undefined) return denied
        return Response.json({ head: this.log.head(streamId) })
      }
      if (rest[0] === 'members' && request.method === 'POST' && rest.length === 1) {
        const actor: Actor & { keys?: unknown } = await request.json()
        if (actor.workspaceId !== workspaceId) return Response.json({ code: 'WORKSPACE_MISMATCH' }, { status: 403 })
        return this.join(actor)
      }
      if (rest[0] === 'members' && rest[2] === 'revoke' && request.method === 'POST') {
        const denied = this.denyOwner(request)
        if (denied !== undefined) return denied
        return this.revokeMember(rest[1] ?? '')
      }
      if (rest[0] === 'members' && request.method === 'GET' && rest.length === 1) {
        const denied = this.denyActor(request)
        if (denied !== undefined) return denied
        const caller = this.getMember(request.headers.get('x-persona-actor') ?? '')
        const projectId = url.searchParams.get('projectId') ?? ''
        if (caller === undefined || (caller.actor.workspaceRole !== 'owner' && !caller.actor.projectIds.includes(projectId))) {
          return Response.json({ code: 'PROJECT_NOT_GRANTED' }, { status: 403 })
        }
        return Response.json({ members: this.listMembers().filter(member => projectId === ''
          || member.actor.workspaceRole === 'owner' || member.actor.projectIds.includes(projectId)) })
      }
      if (rest[0] === 'invites' && request.method === 'POST' && rest.length === 1) {
        const denied = this.denyOwner(request)
        if (denied !== undefined) return denied
        const input: InviteInput = await request.json()
        return await this.issue(workspaceId, input)
      }
      if (rest[0] === 'invites' && rest[2] === 'request' && rest.length === 3 && request.method === 'POST') {
        const input: JoinRequestInput = await request.json()
        return await this.requestJoin(workspaceId, rest[1] ?? '', input)
      }
      if (rest[0] === 'join-requests' && rest[1] === 'mine' && rest.length === 2 && request.method === 'GET') {
        return this.myJoinRequest(request.headers.get('x-persona-actor') ?? '')
      }
      if (rest[0] === 'join-requests' && rest[1] === 'mine' && rest[2] === 'cancel' && rest.length === 3 && request.method === 'POST') {
        return this.cancelMyJoinRequest(request.headers.get('x-persona-actor') ?? '')
      }
      if (rest[0] === 'join-requests' && rest.length === 1 && request.method === 'GET') {
        const denied = this.denyOwner(request)
        if (denied !== undefined) return denied
        return Response.json({ requests: this.pendingJoinRequests() })
      }
      if (rest[0] === 'join-requests' && rest[2] === 'approve' && rest.length === 3 && request.method === 'POST') {
        const denied = this.denyOwner(request)
        if (denied !== undefined) return denied
        const input: { wraps?: StoredWrap[] } = await request.json()
        return this.approve(workspaceId, rest[1] ?? '', request.headers.get('x-persona-actor') ?? '', input)
      }
      if (rest[0] === 'join-requests' && rest[2] === 'deny' && rest.length === 3 && request.method === 'POST') {
        const denied = this.denyOwner(request)
        if (denied !== undefined) return denied
        return this.denyJoin(rest[1] ?? '')
      }
      if (rest[0] === 'channels' && rest[2] === 'key-wraps' && rest.length === 3 && request.method === 'GET') {
        const denied = this.denyStream(request, `channel:${rest[1] ?? ''}`)
        if (denied !== undefined) return denied
        return this.ownWraps(rest[1] ?? '', request.headers.get('x-persona-actor') ?? '')
      }
      if (rest[0] === 'channels' && rest[2] === 'epoch' && rest.length === 3 && request.method === 'GET') {
        const denied = this.denyStream(request, `channel:${rest[1] ?? ''}`)
        if (denied !== undefined) return denied
        return Response.json({ epoch: this.currentEpoch(rest[1] ?? '') ?? 0 })
      }
      if (rest[0] === 'channels' && rest[2] === 'rotate' && rest.length === 3 && request.method === 'POST') {
        const denied = this.denyOwner(request)
        if (denied !== undefined) return denied
        const input: { epoch?: number; wraps?: StoredWrap[] } = await request.json()
        return this.rotate(workspaceId, rest[1] ?? '', request.headers.get('x-persona-actor') ?? '', input)
      }
      if (rest[0] === 'blobs' && rest.length >= 2) return await this.blob(request, workspaceId, rest.slice(1).join('/'))
      if (rest[0] === 'invites' && rest[2] === 'revoke' && request.method === 'POST') {
        const denied = this.denyOwner(request)
        if (denied !== undefined) return denied
        return this.revoke(rest[1] ?? '')
      }
      if (rest[0] === 'invites' && rest.length === 2 && request.method === 'GET') {
        const invite = await this.getInviteByToken(workspaceId, rest[1] ?? '')
        return invite === undefined
          ? Response.json({ error: 'INVITE_INVALID' }, { status: 404 })
          : Response.json({ invite })
      }
      if (rest[0] === 'webhooks' && rest[1] === 'github' && request.method === 'POST') {
        const input: WebhookInput = await request.json()
        return this.storeWebhook(workspaceId, input)
      }
      if (rest[0] === 'webhooks' && rest[1] === 'github' && request.method === 'GET') {
        return Response.json({ deliveries: this.listWebhooks() })
      }
      return new Response('not found', { status: 404 })
    } catch (error: unknown) {
      return domainResponse(error)
    }
  }

  /**
   * F3: ONE socket per device, multiplexed. Every envelope of every stream the member may READ is pushed on it (no per-stream subscription: access decides, so there is
   * no subscription state to lose when the Durable Object hibernates), the member's presence travels on it, and a text `ping` is answered by the runtime itself, so an idle
   * team keeps hibernating.
   *   client -> hub:  { type: 'resume', streamId, afterSeq } | { type: 'append', envelope } | { type: 'presence', state, machine? }   (each may carry a `requestId`)
   *   hub -> client:  { type: 'hello', actor, roster } | { type: 'envelope', envelope } | { type: 'resumed', streamId, head } | { type: 'ack', status, seq, code? }
   *                   | { type: 'refused', streamId?, code } | { type: 'roster', roster }
   * A refused stream answers `refused` and the socket stays: one denied channel never cuts the others.
   * @param ws - Hibernatable socket.
   * @param message - JSON text frame.
   */
  async webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): Promise<void> {
    if (typeof message !== 'string') return
    let parsed: unknown
    try {
      parsed = JSON.parse(message)
    }
    catch {
      return
    }
    if (typeof parsed !== 'object' || parsed === null) return
    const body = parsed as WsIn
    const who = this.socketInfo(ws)
    if (who === undefined) {
      ws.close(1008, 'ACCESS_REVOKED')
      return
    }
    const requestId = typeof body.requestId === 'string' ? body.requestId.slice(0, 64) : undefined
    const reply = (value: object): void => { ws.send(JSON.stringify({ ...value, ...(requestId === undefined ? {} : { requestId }) })) }
    const refusal = async (streamId: string): Promise<string | undefined> => {
      const denied = this.denyStream(this.asActor(who.actor), streamId)
      return denied === undefined ? undefined : String(((await denied.json()) as { code?: string }).code ?? 'SYNC_REFUSED')
    }
    switch (body.type) {
      case 'resume': {
        if (typeof body.streamId !== 'string' || !Number.isInteger(body.afterSeq) || body.afterSeq < 0) return reply({ type: 'refused', code: 'BAD_REQUEST' })
        const code = await refusal(body.streamId)
        if (code !== undefined) return reply({ type: 'refused', streamId: body.streamId, code })
        for (const envelope of this.log.after(body.streamId, body.afterSeq)) ws.send(JSON.stringify({ type: 'envelope', envelope }))
        return reply({ type: 'resumed', streamId: body.streamId, head: this.log.head(body.streamId) })
      }
      case 'append': {
        const envelope = body.envelope
        if (typeof envelope !== 'object' || envelope === null || typeof envelope.streamId !== 'string') return reply({ type: 'refused', code: 'BAD_REQUEST' })
        const code = await refusal(envelope.streamId)
        if (code !== undefined) return reply({ type: 'refused', streamId: envelope.streamId, code })
        const unsealed = await this.checkSealed(envelope.workspaceId, envelope, who.actor)
        if (unsealed !== undefined) return reply({ type: 'ack', ...(await unsealed.json() as object) })
        return reply({ type: 'ack', ...this.commit(envelope) })
      }
      case 'presence': {
        if (!PRESENCE_STATES.includes(body.state)) return reply({ type: 'refused', code: 'BAD_REQUEST' })
        const machine = typeof body.machine === 'string' && body.machine !== '' ? body.machine.slice(0, 64) : undefined
        const next: SocketInfo = { actor: who.actor, device: who.device, state: body.state, since: Date.now(), ...(machine === undefined ? {} : { machine }) }
        ws.serializeAttachment(next)
        this.broadcastRoster()
        return
      }
      default:
        return reply({ type: 'refused', code: 'UNKNOWN_MESSAGE' })
    }
  }

  /** A device left: everybody else is told. The close handshake is completed with a code the protocol allows. */
  webSocketClose(ws: WebSocket, code: number, reason: string): void {
    try {
      ws.close(code >= 1000 && code <= 4999 && code !== 1005 && code !== 1006 ? code : 1000, reason.slice(0, 120))
    }
    catch {
      // already closed
    }
    this.broadcastRoster(ws)
  }

  webSocketError(ws: WebSocket): void {
    this.broadcastRoster(ws)
  }

  /**
   * @param url - Query `deviceId` names this machine.
   * @param actorId - The member, PROVEN by the signed upgrade request (see `authenticate`).
   */
  acceptSocket(url: URL, actorId: string): Response {
    const pair = new WebSocketPair()
    const client = pair[0]
    const server = pair[1]
    const device = (url.searchParams.get('deviceId') ?? '').slice(0, 64)
    this.state.acceptWebSocket(server, [`actor:${actorId}`, ...(device === '' ? [] : [`device:${device}`])])
    // Presence lives in the socket's own attachment: it survives hibernation, there is no RAM to rebuild.
    const info: SocketInfo = { actor: actorId, device, state: 'online', since: Date.now() }
    server.serializeAttachment(info)
    server.send(JSON.stringify({ type: 'hello', actor: actorId, roster: this.roster() }))
    this.broadcastRoster() // everybody, the newcomer included: the roster lists the new socket (only a CLOSING socket is left out of its own roster)
    return new Response(null, { status: 101, webSocket: client })
  }

  /** @returns What this socket remembers about itself (`undefined` when it carries nothing: it is closed). */
  private socketInfo(ws: WebSocket): SocketInfo | undefined {
    const value: unknown = ws.deserializeAttachment()
    if (typeof value !== 'object' || value === null) return undefined
    const actor: unknown = Reflect.get(value, 'actor')
    const device: unknown = Reflect.get(value, 'device')
    const state: unknown = Reflect.get(value, 'state')
    const since: unknown = Reflect.get(value, 'since')
    const machine: unknown = Reflect.get(value, 'machine')
    if (typeof actor !== 'string' || typeof device !== 'string' || typeof since !== 'number' || !PRESENCE_STATES.includes(state as PresenceState)) return undefined
    return { actor, device, state: state as PresenceState, since, ...(typeof machine === 'string' ? { machine } : {}) }
  }

  /** A request that carries only the verified actor, for the access checks that read the trusted header. */
  private asActor(actorId: string): Request {
    return new Request('http://edge.local/', { headers: { 'x-persona-actor': actorId } })
  }

  /** @returns Who is connected right now, one row per device. Derived from the live sockets (never stored), so it is right after a hibernation too. */
  roster(except?: WebSocket): PresenceRow[] {
    return this.state.getWebSockets().filter(socket => socket !== except).flatMap((socket) => {
      const info = this.socketInfo(socket)
      if (info === undefined) return []
      const seen = this.state.getWebSocketAutoResponseTimestamp(socket)
      return [{ actor: info.actor, device: info.device, state: info.state, since: info.since, ...(info.machine === undefined ? {} : { machine: info.machine }), ...(seen === null ? {} : { lastSeen: seen.getTime() }) }]
    }).sort((a, b) => a.actor.localeCompare(b.actor) || a.device.localeCompare(b.device))
  }

  /** Tell every connected device who is here (the closing socket excepted). */
  broadcastRoster(except?: WebSocket): void {
    const payload = JSON.stringify({ type: 'roster', roster: this.roster(except) })
    for (const socket of this.state.getWebSockets()) if (socket !== except) this.push(socket, payload)
  }

  /**
   * @param envelope - Client envelope; `seq` must be `head+1`.
   */
  append(envelope: SyncEnvelope): Response {
    const result = this.commit(envelope)
    const status = result.status === 'refused' ? 403 : 200
    return Response.json(result, { status })
  }

  /**
   * @param envelope - Candidate.
   */
  commit(envelope: SyncEnvelope): CommitResult {
    try {
      const status = commitEnvelope(this.log, envelope)
      if (status === 'appended') this.broadcast(envelope)
      return { status, seq: envelope.seq }
    } catch (error: unknown) {
      if (error instanceof DomainError && error.detail === 'SEQ_GAP') {
        return { status: 'refused', code: 'SEQ_GAP', seq: this.log.head(envelope.streamId) }
      }
      if (error instanceof DomainError) {
        return { status: 'refused', code: error.code, seq: this.log.head(envelope.streamId) }
      }
      throw error
    }
  }

  /**
   * Push a newly appended event to every device whose member may read the stream. A member who lost access (revoked) is cut here too.
   * @param envelope - Newly appended event.
   */
  broadcast(envelope: SyncEnvelope): void {
    const payload = JSON.stringify({ type: 'envelope', envelope })
    for (const socket of this.state.getWebSockets()) {
      const info = this.socketInfo(socket)
      if (info === undefined) continue
      if (this.denyStream(this.asActor(info.actor), envelope.streamId) !== undefined) {
        if (this.denyActor(this.asActor(info.actor)) !== undefined) this.cutRevoked(socket)
        continue
      }
      this.push(socket, payload)
    }
  }

  /** The member was removed: tell the device (`revoked`, so it does not depend on the close event) and close the socket with the policy code. */
  private cutRevoked(socket: WebSocket): void {
    this.push(socket, JSON.stringify({ type: 'revoked' }))
    try {
      socket.close(1008, 'ACCESS_REVOKED')
    }
    catch (error) {
      void error
    }
  }

  /** Send to one socket. A socket that is closing throws on `send`; its own close event takes it out of the roster, so the push to the others must not stop here. */
  private push(socket: WebSocket, payload: string): void {
    try {
      socket.send(payload)
    }
    catch (error) {
      void error
    }
  }

  /**
   * @param workspaceId - Workspace.
   * @param input - Issue body.
   */
  async issue(workspaceId: string, input: InviteInput): Promise<Response> {
    const invite = issueInvite(input.now ?? Date.now(), {
      id: input.id,
      workspaceId,
      token: input.token,
      grant: input.grant,
      ...(input.ttlMs === undefined ? {} : { ttlMs: input.ttlMs }),
    })
    // F4: the team's name rides with the invite (a plain extra field of the stored body: `Invite` itself is the domain's and does not know it).
    const teamName = cleanTeamName(input.teamName)
    const stored: Invite & { teamName?: string } = { ...invite, token: await inviteTokenDigest(invite.token), ...(teamName === undefined ? {} : { teamName }) }
    this.putInvite(stored)
    return Response.json({ invite: { ...invite, ...(teamName === undefined ? {} : { teamName }) } })
  }

  /**
   * F2: a person followed an invite link and ASKS to join. They are not a member (no sync, no channel, no wrap) until the owner approves. The request is signed
   * with the very key being registered (proof that the person holds it) and carries the public keys the owner will wrap the channel keys for.
   * @param workspaceId - Workspace.
   * @param token - The invite's one-time token.
   * @param input - Who asks, and their PUBLIC keys.
   */
  async requestJoin(workspaceId: string, token: string, input: JoinRequestInput): Promise<Response> {
    const invite = await this.getInviteByToken(workspaceId, token)
    if (invite === undefined) return Response.json({ error: 'INVITE_INVALID' }, { status: 404 })
    const keys = keysOf(input.keys)
    if (typeof input.actorId !== 'string' || input.actorId === '' || keys === undefined) return Response.json({ code: 'KEYS_REQUIRED' }, { status: 400 })
    const status = inviteStatus(invite, Date.now())
    if (status !== 'open') return Response.json({ error: 'INVITE_INVALID', detail: status.toUpperCase() }, { status: 410 })
    const current = this.getMember(input.actorId)
    if (current !== undefined && current.revokedAt === undefined) return Response.json({ code: 'ALREADY_A_MEMBER' }, { status: 409 })
    const open = this.joinRequestsOf(invite.id).filter(item => item.decidedAt === undefined)
    const same = open.find(item => item.actorId === input.actorId)
    if (same !== undefined) return Response.json({ request: same }) // the same person asking again: nothing new
    if (open.length >= MAX_OPEN_REQUESTS_PER_INVITE) return Response.json({ code: 'TOO_MANY_REQUESTS' }, { status: 429 })
    const displayName = memberName(input)
    const created: JoinRequest = {
      id: `jr-${randomToken()}`, workspaceId, inviteId: invite.id, actorId: input.actorId, keys, requestedAt: Date.now(),
      ...(displayName === undefined ? {} : { displayName }),
    }
    this.putJoinRequest(created)
    return Response.json({ request: created })
  }

  /** @returns The requests the owner has not decided yet, oldest first. */
  pendingJoinRequests(): JoinRequest[] {
    return this.sql.all('SELECT body FROM join_request WHERE decided_at IS NULL ORDER BY rowid ASC').flatMap((row) => {
      const body = firstBody([row])
      return body === undefined ? [] : [JSON.parse(body) as JoinRequest]
    })
  }

  /**
   * The owner approves: the person becomes a member (with the grant of the invite) and the channel keys the owner's device wrapped for them are stored.
   * The hub never opens a wrap: it only checks WHO it is for, who wrapped it and that the channel is one the invite grants.
   * @param workspaceId - Workspace.
   * @param id - Request id.
   * @param ownerId - The authenticated owner.
   * @param input - The wraps (one per channel and epoch the person may read).
   */
  approve(workspaceId: string, id: string, ownerId: string, input: { wraps?: StoredWrap[] }): Response {
    const request = this.getJoinRequest(id)
    if (request === undefined) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 })
    if (request.decidedAt !== undefined) return Response.json({ code: 'ALREADY_DECIDED' }, { status: 409 })
    const invite = this.getInvite(request.inviteId)
    if (invite === undefined) return Response.json({ error: 'INVITE_INVALID' }, { status: 404 })
    const wraps = Array.isArray(input.wraps) ? input.wraps : []
    for (const wrap of wraps) {
      const current = this.currentEpoch(wrap.channelId)
      const mine = wrap.recipientId === request.actorId && wrap.wrap.by === ownerId && invite.grant.channelIds.includes(wrap.channelId)
      if (!mine || current === undefined || !Number.isInteger(wrap.epoch) || wrap.epoch < 1 || wrap.epoch > current || wrap.wrap.epoch !== wrap.epoch) {
        return Response.json({ code: 'WRAP_REFUSED', channelId: wrap.channelId }, { status: 400 })
      }
    }
    const redeemer: Actor = { kind: 'user', id: request.actorId, workspaceId, workspaceRole: 'guest', projectIds: [] }
    let redeemed: { invite: Invite; actor: Actor }
    try {
      // The invite is judged when the person ASKED: the owner may approve it the next morning. A revoked invite fails anyway.
      redeemed = redeemInvite(invite, request.requestedAt, redeemer)
    }
    catch (error: unknown) {
      return domainResponse(error)
    }
    this.putInvite(redeemed.invite)
    this.putMember({
      actor: redeemed.actor, keys: request.keys, joinedAt: Date.now(), inviteId: invite.id,
      ...(request.displayName === undefined ? {} : { displayName: request.displayName }),
    })
    for (const wrap of wraps) this.putWrap(workspaceId, wrap)
    this.decide(request, 'approved')
    // One invite is one person: anyone else who asked with the same link is told no.
    for (const other of this.joinRequestsOf(invite.id)) if (other.decidedAt === undefined && other.id !== request.id) this.decide(other, 'denied')
    return Response.json({ member: this.getMember(request.actorId), actor: redeemed.actor })
  }

  /** @param id - Request id. */
  denyJoin(id: string): Response {
    const request = this.getJoinRequest(id)
    if (request === undefined) return Response.json({ error: 'REQUEST_NOT_FOUND' }, { status: 404 })
    if (request.decidedAt !== undefined) return Response.json({ code: 'ALREADY_DECIDED' }, { status: 409 })
    this.decide(request, 'denied')
    return Response.json({ request: this.getJoinRequest(id) })
  }

  /** @returns The wraps meant for THIS member on a channel (every epoch they hold), and the channel's current epoch. Nobody sees another member's wrap. */
  ownWraps(channelId: string, actorId: string): Response {
    const wraps = this.sql.all(
      'SELECT body FROM key_wrap WHERE channel_id = ? AND recipient_id = ? ORDER BY epoch ASC', [channelId, actorId],
    ).flatMap((row) => {
      const body = firstBody([row])
      return body === undefined ? [] : [JSON.parse(body) as StoredWrap]
    })
    return Response.json({ wraps, epoch: this.currentEpoch(channelId) ?? 0 })
  }

  /**
   * The owner's device starts (epoch 1) or rotates (epoch + 1) a channel's key and wraps it for the members who stay. A revoked member, or one the channel was
   * never granted to, cannot be wrapped for: that is what keeps a person who left from reading what comes next.
   */
  rotate(workspaceId: string, channelId: string, ownerId: string, input: { epoch?: number; wraps?: StoredWrap[] }): Response {
    const current = this.currentEpoch(channelId) ?? 0
    if (input.epoch !== current + 1) return Response.json({ code: 'EPOCH_CONFLICT', epoch: current }, { status: 409 })
    const wraps = Array.isArray(input.wraps) ? input.wraps : []
    for (const wrap of wraps) {
      const member = this.getMember(wrap.recipientId)
      const allowed = member !== undefined && member.revokedAt === undefined && this.memberMayReadChannel(member, channelId)
      if (wrap.channelId !== channelId || wrap.epoch !== input.epoch || wrap.wrap.epoch !== input.epoch || wrap.wrap.by !== ownerId || !allowed) {
        return Response.json({ code: 'WRAP_REFUSED', recipientId: wrap.recipientId }, { status: 400 })
      }
    }
    this.sql.exec(
      `INSERT INTO channel_epoch (workspace_id, channel_id, epoch, rotated_by, rotated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, channel_id) DO UPDATE SET epoch = excluded.epoch, rotated_by = excluded.rotated_by, rotated_at = excluded.rotated_at`,
      [workspaceId, channelId, input.epoch, ownerId, Date.now()],
    )
    for (const wrap of wraps) this.putWrap(workspaceId, wrap)
    return Response.json({ epoch: input.epoch })
  }

  /** @returns The channel's current key epoch (`undefined` when it has no key yet: not an E2EE channel). */
  currentEpoch(channelId: string): number | undefined {
    const row = this.sql.all('SELECT epoch FROM channel_epoch WHERE channel_id = ?', [channelId])[0]
    return typeof row?.epoch === 'number' ? row.epoch : undefined
  }

  /** @returns Every channel that has a key (the ones to rotate when somebody leaves). */
  epochChannels(): string[] {
    return this.sql.all('SELECT channel_id FROM channel_epoch ORDER BY channel_id ASC').flatMap(row => (typeof row.channel_id === 'string' ? [row.channel_id] : []))
  }

  /** @param member - A member. @param channelId - Channel id. @returns Whether the owner or the invite's grant covers the channel. */
  memberMayReadChannel(member: WorkspaceMember, channelId: string): boolean {
    if (member.actor.workspaceRole === 'owner') return true
    const invite = member.inviteId === undefined ? undefined : this.getInvite(member.inviteId)
    return invite?.grant.channelIds.includes(channelId) === true
  }

  /**
   * A sealed message is accepted only from the member who wrote it, signed by THEIR key, under the channel's current epoch. The hub still reads no word of it.
   * Once a channel has a key (an epoch), nothing but a sealed message is accepted there.
   * @returns The refusal, or `undefined` when the envelope may go on to the log.
   */
  async checkSealed(workspaceId: string, envelope: SyncEnvelope, actorId: string): Promise<Response | undefined> {
    const payload: unknown = envelope.payload
    const sealed = typeof payload === 'object' && payload !== null && Reflect.get(payload, 'alg') === 'channel'
    const channelId = channelOfStream(envelope.streamId)
    const epoch = channelId === undefined ? undefined : this.currentEpoch(channelId)
    const refused = (code: string, status: number): Response => Response.json({ status: 'refused', code, seq: this.log.head(envelope.streamId), ...(epoch === undefined ? {} : { epoch }) }, { status })
    if (epoch !== undefined && !sealed) return refused('E2EE_REQUIRED', 403)
    if (!sealed) return undefined
    const channel = payload as ChannelSealedPayload
    if (channel.authorId !== actorId) return refused('AUTHOR_MISMATCH', 403)
    if (epoch !== undefined && channel.epoch !== epoch) return refused('STALE_EPOCH', 409)
    const signingKey = this.getMember(actorId)?.keys?.signing
    if (signingKey === undefined || !(await verifySealedSignature(channel, { workspaceId, streamId: envelope.streamId }, signingKey))) return refused('BAD_SIGNATURE', 403)
    return undefined
  }

  /**
   * Attachments (ciphertext) live in R2 under `<workspace>/<key>`, served by the hub only AFTER the caller proved who they are and that they belong to the channel
   * named in `x-stream-id`. The quota per team (no automatic deletion: the owner cleans) is the next slice, on this same door.
   */
  async blob(request: Request, workspaceId: string, key: string): Promise<Response> {
    const streamId = request.headers.get('x-stream-id') ?? ''
    const denied = this.denyStream(request, streamId)
    if (denied !== undefined) return denied
    if (key === '' || key.split('/').some(part => part === '' || part === '.' || part === '..')) return Response.json({ code: 'BAD_KEY' }, { status: 400 })
    const objectKey = `${workspaceId}/${key}`
    if (request.method === 'GET') {
      const object = await this.env.BLOBS.get(objectKey)
      if (object === null) return new Response('not found', { status: 404 })
      return new Response(object.body, { headers: { 'content-type': object.httpMetadata?.contentType ?? 'application/octet-stream' } })
    }
    if (request.method === 'PUT') {
      // A private attachment never goes to the cloud: the same rule an envelope obeys (`mayUpload`), and an unknown classification is refused, not guessed.
      const classification = request.headers.get('x-classification') ?? 'channel'
      if (!isClassification(classification)) return Response.json({ error: 'SYNC_REFUSED' }, { status: 403 })
      const shared = request.headers.get('x-shared') === 'true'
      if (!mayUpload({
        workspaceId, streamId: streamId === '' ? `blob:${key}` : streamId, seq: 1, idempotencyKey: `blob:${key}`, classification, at: new Date().toISOString(),
        payload: { clear: '' }, ...(shared ? { shared: true } : {}),
      })) return Response.json({ error: 'SYNC_REFUSED' }, { status: 403 })
      const bytes = await request.arrayBuffer()
      if (bytes.byteLength > MAX_BLOB_BYTES) return Response.json({ code: 'TOO_LARGE', max: MAX_BLOB_BYTES }, { status: 413 })
      await this.env.BLOBS.put(objectKey, bytes, { httpMetadata: { contentType: request.headers.get('content-type') ?? 'application/octet-stream' } })
      return Response.json({ ok: true, key: objectKey })
    }
    return new Response('method', { status: 405 })
  }

  /**
   * F2: who is calling is PROVEN by an Ed25519 signature over the request (method, path + query, timestamp, SHA-256 of the body). A client-sent `x-persona-actor`
   * is always dropped; the trusted one is set here, from the verified signature. Nothing the client sends can switch this off.
   *   - public: the invite lookup by token, and the webhook delivery the WORKER already checked (GitHub's HMAC) and tagged with a value only it can compute;
   *   - self-certified (the key being registered signs the request): the owner's first bootstrap and a join request.
   * @returns The request with the trusted actor, or the refusal (401).
   */
  private async authenticate(incoming: Request, url: URL, rest: readonly string[]): Promise<Request | Response> {
    const headers = new Headers(incoming.headers)
    headers.delete('x-persona-actor')
    const method = incoming.method.toUpperCase()
    const bytes = method === 'GET' || method === 'HEAD' ? new Uint8Array() : new Uint8Array(await incoming.arrayBuffer())
    if (bytes.length > MAX_BODY_BYTES) return Response.json({ status: 'refused', code: 'TOO_LARGE', seq: 0 }, { status: 413 })
    const rebuilt = (): Request => new Request(incoming.url, { method, headers, ...(bytes.length === 0 ? {} : { body: bytes }) })
    if (method === 'GET' && rest[0] === 'invites' && rest.length === 2) return rebuilt()
    if (rest[0] === 'webhooks' && rest[1] === 'github') {
      // Anything under /webhooks/github (trailing slash and all) is the Worker's: it carries the internal tag only the Worker can compute, or it is refused.
      const tag = await this.internalTag()
      const given = headers.get('x-persona-internal')
      headers.delete('x-persona-internal')
      if (method === 'POST' && tag !== '' && given === tag) return rebuilt()
      if (method === 'POST') return this.refuse('AUTH_NOT_INTERNAL')
    }
    headers.delete('x-persona-internal')
    // F4: a person who has only ASKED (not a member yet) reads, and may cancel, THEIR OWN request: signed with the key they asked with, which is the only key the hub knows for them.
    const mine = rest[0] === 'join-requests' && rest[1] === 'mine' && (method === 'GET' ? rest.length === 2 : method === 'POST' && rest[2] === 'cancel' && rest.length === 3)
    const selfCertified = (method === 'POST' && rest[0] === 'members' && rest.length === 1 && !this.hasActiveMembers())
      || (method === 'POST' && rest[0] === 'invites' && rest[2] === 'request' && rest.length === 3)
    const proof = selfCertified ? proofOf(bytes) : undefined
    if (selfCertified && proof === undefined) return this.refuse('AUTH_MALFORMED')
    const result = await verifyRequest(
      { method, target: `${url.pathname}${url.search}`, authorization: headers.get('authorization'), body: bytes },
      actor => (proof === undefined
        ? this.getMember(actor)?.keys?.signing ?? (mine ? this.latestJoinRequestOf(actor)?.keys.signing : undefined)
        : actor === proof.actor ? proof.signing : undefined),
      new SqlReplayStore(this.sql),
      Date.now(),
    )
    if (!result.ok) return this.refuse(`AUTH_${result.code}`)
    headers.set('x-persona-actor', result.actor)
    headers.delete('authorization')
    return rebuilt()
  }

  /** @returns The tag the Worker puts on a webhook it verified (`''` when the secret is not configured: then nothing is internal). */
  private async internalTag(): Promise<string> {
    return await internalTagOf(this.env.GITHUB_WEBHOOK_SECRET)
  }

  private refuse(code: string): Response {
    return Response.json({ status: 'refused', code, seq: 0 }, { status: 401 })
  }

  private putJoinRequest(request: JoinRequest): void {
    this.sql.exec(
      `INSERT INTO join_request (id, workspace_id, invite_id, actor_id, decided_at, body) VALUES (?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET decided_at = excluded.decided_at, body = excluded.body`,
      [request.id, request.workspaceId, request.inviteId, request.actorId, request.decidedAt ?? null, JSON.stringify(request)],
    )
  }

  /** @returns The newest request this person made (the key they asked with is in it), or `undefined`. */
  private latestJoinRequestOf(actorId: string): JoinRequest | undefined {
    const body = firstBody(this.sql.all('SELECT body FROM join_request WHERE actor_id = ? ORDER BY rowid DESC LIMIT 1', [actorId]))
    return body === undefined ? undefined : JSON.parse(body) as JoinRequest
  }

  /**
   * F4: where THEIR request stands (`pending`, `approved`, `denied` or `cancelled`). The call is signed with the key they asked with, so a person reads only their own.
   * @param actorId - The verified caller.
   */
  myJoinRequest(actorId: string): Response {
    const mine = this.latestJoinRequestOf(actorId)
    if (mine === undefined) return Response.json({ code: 'NO_REQUEST' }, { status: 404 })
    return Response.json({ request: { id: mine.id, status: mine.decision ?? 'pending', requestedAt: mine.requestedAt, ...(mine.decidedAt === undefined ? {} : { decidedAt: mine.decidedAt }) } })
  }

  /**
   * F4: "Cancelar pedido". Only a request nobody decided yet can be withdrawn; it leaves the owner's list.
   * @param actorId - The verified caller.
   */
  cancelMyJoinRequest(actorId: string): Response {
    const mine = this.latestJoinRequestOf(actorId)
    if (mine === undefined) return Response.json({ code: 'NO_REQUEST' }, { status: 404 })
    if (mine.decidedAt !== undefined) return Response.json({ code: 'ALREADY_DECIDED', status: mine.decision }, { status: 409 })
    this.decide(mine, 'cancelled')
    return Response.json({ request: { id: mine.id, status: 'cancelled' } })
  }

  private getJoinRequest(id: string): JoinRequest | undefined {
    const body = firstBody(this.sql.all('SELECT body FROM join_request WHERE id = ?', [id]))
    return body === undefined ? undefined : JSON.parse(body) as JoinRequest
  }

  private joinRequestsOf(inviteId: string): JoinRequest[] {
    return this.sql.all('SELECT body FROM join_request WHERE invite_id = ? ORDER BY rowid ASC', [inviteId]).flatMap((row) => {
      const body = firstBody([row])
      return body === undefined ? [] : [JSON.parse(body) as JoinRequest]
    })
  }

  private decide(request: JoinRequest, decision: 'approved' | 'denied' | 'cancelled'): void {
    this.putJoinRequest({ ...request, decidedAt: Date.now(), decision })
  }

  private putWrap(workspaceId: string, wrap: StoredWrap): void {
    this.sql.exec(
      `INSERT INTO key_wrap (workspace_id, channel_id, epoch, recipient_id, body) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(workspace_id, channel_id, epoch, recipient_id) DO UPDATE SET body = excluded.body`,
      [workspaceId, wrap.channelId, wrap.epoch, wrap.recipientId, JSON.stringify(wrap)],
    )
  }

  /**
   * @param id - Invite id.
   */
  revoke(id: string): Response {
    const body = firstBody(this.sql.all('SELECT body FROM invite WHERE id = ?', [id]))
    if (body === undefined) {
      return Response.json({ error: 'INVITE_INVALID' }, { status: 404 })
    }
    const invite = JSON.parse(body) as Invite
    this.putInvite(revokeInvite(invite, Date.now()))
    this.revokeMembersByInvite(id)
    return Response.json({ invite: this.getInvite(id) })
  }

  /**
   * Owner bootstrap (the inviter never joins by invite). The first request registers the owner AND their public keys; the request is signed with that very key.
   * @param actor - Desktop identity, with `keys` (the public half of its device identity).
   */
  join(actor: Actor & { keys?: unknown }): Response {
    const keys = keysOf(actor.keys)
    const plain = Object.fromEntries(Object.entries(actor).filter(([name]) => name !== 'keys')) as unknown as Actor
    const existing = this.getMember(actor.id)
    if (existing !== undefined && existing.revokedAt === undefined) {
      // The same person again: the keys never change silently (that would be somebody else taking the place).
      if (keys !== undefined && existing.keys !== undefined && (existing.keys.signing !== keys.signing || existing.keys.agreement !== keys.agreement)) {
        return Response.json({ status: 'refused', code: 'KEY_CHANGED' }, { status: 409 })
      }
      const displayName = memberName(actor)
      const member = displayName === undefined ? existing : { ...existing, displayName }
      this.putMember(member)
      return Response.json({ member })
    }
    if (this.hasActiveMembers() || existing?.revokedAt !== undefined || actor.workspaceRole !== 'owner' || actor.kind !== 'user') {
      return Response.json({ status: 'refused', code: 'INVITE_REQUIRED' }, { status: 403 })
    }
    if (keys === undefined) return Response.json({ status: 'refused', code: 'KEYS_REQUIRED' }, { status: 400 })
    const displayName = memberName(actor)
    const member: WorkspaceMember = { actor: plain, keys, joinedAt: Date.now(), ...(displayName === undefined ? {} : { displayName }) }
    this.putMember(member)
    return Response.json({ member })
  }

  /**
   * @param actorId - Member to cut.
   */
  revokeMember(actorId: string): Response {
    const member = this.getMember(actorId)
    if (member === undefined) return Response.json({ error: 'NOT_A_MEMBER' }, { status: 404 })
    if (member.revokedAt !== undefined) return Response.json({ member })
    const next: WorkspaceMember = { ...member, revokedAt: Date.now() }
    this.putMember(next)
    // F3: the one who left is cut NOW, not at the next push: their sockets are closed (the close event tells the others who is still here).
    for (const socket of this.state.getWebSockets()) {
      if (this.socketInfo(socket)?.actor !== actorId) continue
      this.cutRevoked(socket)
    }
    // The owner's device must now rotate every channel that has keys: the one who left cannot read the next epoch.
    return Response.json({ member: next, rotateChannels: this.epochChannels() })
  }

  /**
   * @param workspaceId - Workspace.
   * @param input - Verified webhook (Worker already checked HMAC).
   */
  storeWebhook(workspaceId: string, input: WebhookInput): Response {
    const hook = webhookEnvelope({
      source: 'github',
      deliveryId: input.deliveryId,
      receivedAt: input.receivedAt,
      ownerDeviceId: input.ownerDeviceId,
      payload: input.payload,
    })
    const existing = firstBody(this.sql.all(
      'SELECT body FROM webhook_delivery WHERE source = ? AND delivery_id = ?',
      [hook.source, hook.deliveryId],
    ))
    if (existing !== undefined) {
      const prior = JSON.parse(existing) as WebhookEnvelope
      if (sameWebhookDelivery(prior, hook)) {
        return Response.json({ status: 'duplicate', envelope: prior })
      }
    }
    this.sql.exec(
      `INSERT INTO webhook_delivery (source, delivery_id, workspace_id, owner_device_id, received_at, body)
        VALUES (?, ?, ?, ?, ?, ?)`,
      [hook.source, hook.deliveryId, workspaceId, hook.ownerDeviceId, hook.receivedAt, JSON.stringify(hook)],
    )
    const payload = JSON.stringify({ type: 'webhook', envelope: hook })
    for (const socket of this.state.getWebSockets(`device:${hook.ownerDeviceId}`)) this.push(socket, payload)
    return Response.json({ status: 'accepted', envelope: hook })
  }

  /** @returns Stored webhook envelopes. */
  listWebhooks(): WebhookEnvelope[] {
    return this.sql.all('SELECT body FROM webhook_delivery ORDER BY rowid ASC').map((row) => {
      const body = firstBody([row])
      if (body === undefined) throw new Error('webhook')
      return JSON.parse(body) as WebhookEnvelope
    })
  }

  /**
   * @param invite - Issued/redeemed/revoked invite.
   */
  putInvite(invite: Invite): void {
    this.sql.exec(
      `INSERT INTO invite (id, workspace_id, token, expires_at, used_at, revoked_at, body)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          token = excluded.token,
          expires_at = excluded.expires_at,
          used_at = excluded.used_at,
          revoked_at = excluded.revoked_at,
          body = excluded.body`,
      [
        invite.id,
        invite.workspaceId,
        invite.token,
        invite.expiresAt,
        invite.usedAt ?? null,
        invite.revokedAt ?? null,
        JSON.stringify(invite),
      ],
    )
  }

  /**
   * @param id - Invite id.
   */
  getInvite(id: string): Invite | undefined {
    const body = firstBody(this.sql.all('SELECT body FROM invite WHERE id = ?', [id]))
    return body === undefined ? undefined : JSON.parse(body) as Invite
  }

  /**
   * @param workspaceId - Workspace.
   * @param token - Token.
   */
  async getInviteByToken(workspaceId: string, token: string): Promise<Invite | undefined> {
    const body = firstBody(this.sql.all(
      'SELECT body FROM invite WHERE workspace_id = ? AND token = ?',
      [workspaceId, await inviteTokenDigest(token)],
    ))
    return body === undefined ? undefined : JSON.parse(body) as Invite
  }

  /**
   * @param request - Caller identity is `x-persona-actor`. Missing header keeps
   *   the open bootstrap path used by older tests.
   */
  denyActor(request: Request): Response | undefined {
    const actorId = request.headers.get('x-persona-actor')
    if (actorId === null || actorId.length === 0) {
      return this.hasActiveMembers()
        ? Response.json({ status: 'refused', code: 'NOT_A_MEMBER', seq: 0 }, { status: 403 })
        : undefined
    }
    const member = this.getMember(actorId)
    if (member !== undefined && member.revokedAt !== undefined) {
      return Response.json({ status: 'refused', code: 'ACCESS_REVOKED', seq: 0 }, { status: 403 })
    }
    if (member === undefined && this.hasActiveMembers()) {
      return Response.json({ status: 'refused', code: 'NOT_A_MEMBER', seq: 0 }, { status: 403 })
    }
    return undefined
  }

  /** @param request - Management caller; a redeemed member cannot mint or revoke grants. */
  denyOwner(request: Request): Response | undefined {
    const denied = this.denyActor(request)
    if (denied !== undefined) return denied
    if (!this.hasActiveMembers()) return undefined
    const actorId = request.headers.get('x-persona-actor')
    if (actorId !== null && this.getMember(actorId)?.actor.workspaceRole === 'owner') return undefined
    return Response.json({ status: 'refused', code: 'OWNER_REQUIRED', seq: 0 }, { status: 403 })
  }

  /** @param request - Member identity. @param streamId - Exact channel stream requested. */
  denyStream(request: Request, streamId: string): Response | undefined {
    const denied = this.denyActor(request)
    if (denied !== undefined) return denied
    if (!this.hasActiveMembers()) return undefined
    const member = this.getMember(request.headers.get('x-persona-actor') ?? '')
    if (member?.actor.workspaceRole === 'owner') return undefined
    const invite = member?.inviteId === undefined ? undefined : this.getInvite(member.inviteId)
    const grant = invite?.grant
    if (grant !== undefined && grant.channelIds.some(channelId =>
      streamId === `channel:${channelId}` || grant.projectIds.some(projectId => streamId === `project:${projectId}:channel:${channelId}`),
    )) return undefined
    return Response.json({ status: 'refused', code: 'CHANNEL_NOT_GRANTED', seq: 0 }, { status: 403 })
  }

  /**
   * @param member - Redeemed or bootstrapped desktop.
   */
  putMember(member: WorkspaceMember): void {
    if (member.revokedAt !== undefined) {
      for (const socket of this.state.getWebSockets(`actor:${member.actor.id}`)) this.cutRevoked(socket)
    }
    this.sql.exec(
      `INSERT INTO member (actor_id, workspace_id, invite_id, revoked_at, body)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(actor_id) DO UPDATE SET
          invite_id = excluded.invite_id,
          revoked_at = excluded.revoked_at,
          body = excluded.body`,
      [
        member.actor.id,
        member.actor.workspaceId,
        member.inviteId ?? null,
        member.revokedAt ?? null,
        JSON.stringify(member),
      ],
    )
  }

  /**
   * @param actorId - Desktop id.
   */
  getMember(actorId: string): WorkspaceMember | undefined {
    const body = firstBody(this.sql.all('SELECT body FROM member WHERE actor_id = ?', [actorId]))
    return body === undefined ? undefined : JSON.parse(body) as WorkspaceMember
  }

  /**
   * @param inviteId - Invite whose redeemer must lose sync.
   */
  revokeMembersByInvite(inviteId: string): void {
    const now = Date.now()
    for (const row of this.sql.all('SELECT body FROM member WHERE invite_id = ?', [inviteId])) {
      const body = firstBody([row])
      if (body === undefined) continue
      const member = JSON.parse(body) as WorkspaceMember
      if (member.revokedAt === undefined) this.putMember({ ...member, revokedAt: now })
    }
  }

  /** @returns Every stored member, including revoked. */
  listMembers(): WorkspaceMember[] {
    return this.sql.all('SELECT body FROM member ORDER BY actor_id ASC').map((row) => {
      const body = firstBody([row])
      if (body === undefined) throw new Error('member')
      return JSON.parse(body) as WorkspaceMember
    })
  }

  /** @returns Whether anyone still has sync rights. */
  hasActiveMembers(): boolean {
    return this.sql.all('SELECT actor_id FROM member WHERE revoked_at IS NULL LIMIT 1').length > 0
  }
}

/** The PUBLIC half of a device identity, base64url (32 bytes each). */
export interface MemberKeys {
  readonly signing: string
  readonly agreement: string
}

/** A person who followed an invite link and waits for the owner: NOT a member until `approve`. */
export interface JoinRequest {
  readonly id: string
  readonly workspaceId: string
  readonly inviteId: string
  readonly actorId: string
  readonly displayName?: string
  readonly keys: MemberKeys
  readonly requestedAt: number
  readonly decidedAt?: number
  readonly decision?: 'approved' | 'denied' | 'cancelled'
}

/** One channel key sealed for one member (see `persona-sync/channel-crypto.ts#KeyWrap`). Opaque to the hub. */
export interface StoredWrap {
  readonly channelId: string
  readonly epoch: number
  readonly recipientId: string
  readonly wrap: { readonly epoch: number; readonly by: string; readonly epk: string; readonly ct: string; readonly sig: string }
}

/** Redeemed or bootstrapped desktop replica. */
export interface WorkspaceMember {
  readonly actor: Actor
  /** Public keys the member registered at join (Ed25519 signs requests and messages; X25519 receives channel keys). Never a secret. */
  readonly keys?: MemberKeys
  readonly displayName?: string
  readonly joinedAt: number
  readonly inviteId?: string
  readonly revokedAt?: number
}

function memberName(input: object): string | undefined {
  const value: unknown = Reflect.get(input, 'displayName')
  if (typeof value !== 'string') return undefined
  const name = value.replace(/\s+/gu, ' ').trim()
  return name === '' ? undefined : name.slice(0, 160)
}

/** A person's request to join, as the invite page sends it (the keys are PUBLIC). */
export interface JoinRequestInput {
  readonly actorId: string
  readonly displayName?: string
  readonly keys: unknown
}

/** Largest request body the hub reads into memory (a 50 MB attachment plus its envelope). */
const MAX_BODY_BYTES = 53_000_000
/** Largest attachment (ciphertext) the hub stores. */
const MAX_BLOB_BYTES = 50 * 1024 * 1024
/** Requests waiting on ONE invite link (a link that leaks cannot flood the owner). */
const MAX_OPEN_REQUESTS_PER_INVITE = 5

/** Signatures already seen, kept in the hub's own SQLite so a hibernation never makes a replay work. */
class SqlReplayStore implements ReplayStore {
  constructor(private readonly sql: DoSyncSql) {}

  firstSight(sig: string, expiresAt: number, now: number): boolean {
    this.sql.exec('DELETE FROM seen_sig WHERE expires_at <= ?', [now])
    if (this.sql.all('SELECT sig FROM seen_sig WHERE sig = ?', [sig]).length > 0) return false
    this.sql.exec('INSERT INTO seen_sig (sig, expires_at) VALUES (?, ?)', [sig, expiresAt])
    return true
  }
}

/**
 * @param value - A team name from the owner's device.
 * @returns It without control or invisible characters, on one line, at most 80 long; `undefined` when nothing is left.
 */
function cleanTeamName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined
  const spaced = [...value].map((char) => {
    const code = char.codePointAt(0) ?? 0
    return code < 32 || (code >= 127 && code <= 159) || (code >= 0x200b && code <= 0x200f) || (code >= 0x2028 && code <= 0x202e) ? ' ' : char
  }).join('')
  const cleaned = spaced.replace(/\s+/gu, ' ').trim().slice(0, 80).trim()
  return cleaned === '' ? undefined : cleaned
}

/** @returns 128 random bits as base64url (the id of a join request). `crypto.randomUUID` is restricted by the repo lint, and this needs nothing beyond the Worker runtime. */
function randomToken(): string {
  return base64UrlOfBytes(crypto.getRandomValues(new Uint8Array(16)))
}

/** @param input - Anything that should be `{ signing, agreement }` (base64url, 32 bytes each). @returns The keys, or `undefined`. */
function keysOf(input: unknown): MemberKeys | undefined {
  if (typeof input !== 'object' || input === null) return undefined
  const signing: unknown = Reflect.get(input, 'signing')
  const agreement: unknown = Reflect.get(input, 'agreement')
  const valid = (value: unknown): value is string => typeof value === 'string' && value.length === 43 && bytesOfBase64Url(value)?.length === 32
  return valid(signing) && valid(agreement) ? { signing, agreement } : undefined
}

/** @param bytes - The body of a self-certified request. @returns Who it says it is and the signing key it registers (it must have signed with it). */
function proofOf(bytes: Uint8Array): { actor: string; signing: string } | undefined {
  try {
    const parsed: unknown = JSON.parse(new TextDecoder().decode(bytes))
    if (typeof parsed !== 'object' || parsed === null) return undefined
    const id: unknown = Reflect.get(parsed, 'id') ?? Reflect.get(parsed, 'actorId')
    const keys = keysOf(Reflect.get(parsed, 'keys'))
    return typeof id === 'string' && id !== '' && keys !== undefined ? { actor: id, signing: keys.signing } : undefined
  }
  catch {
    return undefined
  }
}

const CLASSIFICATIONS: readonly SyncClassification[] = ['workspace', 'project', 'channel', 'dm', 'private']

/** @param value - A header value. @returns Whether it is one of the sync classifications. */
function isClassification(value: string): value is SyncClassification {
  return (CLASSIFICATIONS as readonly string[]).includes(value)
}

/** @param segment - A path segment. @returns It decoded (the segment itself when it is not valid percent-encoding). */
function safeDecode(segment: string): string {
  try {
    return decodeURIComponent(segment)
  }
  catch {
    return segment
  }
}

/** @param streamId - `channel:<id>` or `project:<p>:channel:<id>`. @returns The channel id (`undefined` for any other stream). */
function channelOfStream(streamId: string): string | undefined {
  const match = /^(?:project:[^:]+:)?channel:(.+)$/u.exec(streamId)
  return match?.[1]
}

/** POST /invites body. */
export interface InviteInput {
  readonly id: string
  readonly token: string
  readonly grant: Grant
  readonly ttlMs?: number
  /** The team's name, shown by the screen a link opens (cleaned and capped here; absent is fine). */
  readonly teamName?: string
  readonly now?: number
}

/** Verified GitHub delivery. */
export interface WebhookInput {
  readonly deliveryId: string
  readonly receivedAt: string
  readonly ownerDeviceId: string
  readonly payload: unknown
}

/** Result of {@link WorkspaceHub.commit}. */
export interface CommitResult {
  readonly status: 'appended' | 'duplicate' | 'refused'
  readonly seq: number
  readonly code?: string
}

const PRESENCE_STATES: readonly string[] = ['online', 'busy', 'away', 'out']
type PresenceState = 'online' | 'busy' | 'away' | 'out'

/** What a socket remembers about itself (its attachment: small, survives hibernation). */
interface SocketInfo {
  readonly actor: string
  readonly device: string
  readonly state: PresenceState
  readonly since: number
  readonly machine?: string
}

/** One connected device, as every member sees it. */
export interface PresenceRow {
  readonly actor: string
  readonly device: string
  readonly state: PresenceState
  readonly since: number
  readonly machine?: string
  /** The last heartbeat the runtime answered (ms), when there was one. */
  readonly lastSeen?: number
}

type WsIn =
  | { type: 'resume'; streamId: string; afterSeq: number; requestId?: string }
  | { type: 'append'; envelope: SyncEnvelope; requestId?: string }
  | { type: 'presence'; state: PresenceState; machine?: string; requestId?: string }

/**
 * @param rows - Query result.
 * @returns First `body` column when it is text.
 */
function firstBody(rows: Array<Record<string, string | number | null>>): string | undefined {
  if (rows.length === 0) return undefined
  const body = rows[0].body
  return typeof body === 'string' ? body : undefined
}

async function inviteTokenDigest(token: string): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(token))
  return [...new Uint8Array(digest)].map(byte => byte.toString(16).padStart(2, '0')).join('')
}

/**
 * @param error - Thrown from Forge functions.
 */
function domainResponse(error: unknown): Response {
  if (error instanceof DomainError) {
    const status = error.code === 'SYNC_REFUSED' ? 403 : 409
    return Response.json({ error: error.code, detail: error.detail }, { status })
  }
  const message = error instanceof Error ? error.message : 'error'
  return Response.json({ error: message }, { status: 500 })
}
