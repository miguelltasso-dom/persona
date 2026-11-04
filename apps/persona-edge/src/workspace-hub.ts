/**
 * One Durable Object per workspace: the only sequencer of `seq` per stream.
 * WebSocket hibernation, cursor replay, invite redeem, webhook fan-out.
 */

import type { Actor } from '../../../packages/persona/persona-core/src/domain/acl.ts'
import {
  issueInvite,
  redeemInvite,
  revokeInvite,
  type Grant,
  type Invite,
} from '../../../packages/persona/persona-core/src/domain/invite.ts'
import { DomainError } from '../../../packages/persona/persona-core/src/domain/schemas.ts'
import { commitEnvelope } from '../../../packages/persona/persona-core/src/sync/policy.ts'
import type { SyncEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import { sameWebhookDelivery, webhookEnvelope } from '../../../packages/persona/persona-core/src/sync/webhook.ts'
import type { WebhookEnvelope } from '../../../packages/persona/persona-core/src/sync/types.ts'
import { DoSyncSql } from './do-sql.ts'
import type { Env } from './env.ts'
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
  }

  /**
   * @param request - Workspace-scoped request (`/w/:id/...`).
   */
  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url)
    const parts = url.pathname.split('/').filter(part => part.length > 0)
    const workspaceId = parts[1] ?? ''
    const rest = parts.slice(2)
    if (rest[0] === 'health' || rest.length === 0) {
      return Response.json({ ok: true, workspaceHub: String(this.state.id), workspaceId })
    }
    if (rest[0] === 'sync' && request.headers.get('Upgrade') === 'websocket') {
      const denied = this.denyStream(request, url.searchParams.get('streamId') ?? '')
      if (denied !== undefined) return denied
      return this.acceptSocket(url, request.headers.get('x-persona-actor') ?? '')
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
      if (rest[0] === 'members' && request.method === 'POST' && rest.length === 1) {
        const actor: Actor = await request.json()
        if (actor.workspaceId !== workspaceId) return Response.json({ code: 'WORKSPACE_MISMATCH' }, { status: 403 })
        return this.join(actor)
      }
      if (rest[0] === 'members' && rest[2] === 'revoke' && request.method === 'POST') {
        const denied = this.denyOwner(request)
        if (denied !== undefined) return denied
        return this.revokeMember(rest[1] ?? '')
      }
      if (rest[0] === 'members' && request.method === 'GET' && rest.length === 1) {
        return Response.json({ members: this.listMembers() })
      }
      if (rest[0] === 'invites' && request.method === 'POST' && rest.length === 1) {
        const denied = this.denyOwner(request)
        if (denied !== undefined) return denied
        const input: InviteInput = await request.json()
        return await this.issue(workspaceId, input)
      }
      if (rest[0] === 'invites' && rest[1] === 'redeem' && request.method === 'POST') {
        const input: { token: string; actor: Actor } = await request.json()
        return await this.redeem(workspaceId, input.token, input.actor)
      }
      if (rest[0] === 'invites' && rest[2] === 'redeem' && request.method === 'POST') {
        const actor: Actor = await request.json()
        return await this.redeem(workspaceId, rest[1] ?? '', actor)
      }
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
   * @param ws - Hibernatable socket.
   * @param message - JSON `{ type: resume|append, ... }`.
   */
  webSocketMessage(ws: WebSocket, message: string | ArrayBuffer): void {
    if (typeof message !== 'string') return
    const parsed: unknown = JSON.parse(message)
    if (typeof parsed !== 'object' || parsed === null || !('type' in parsed)) return
    if (parsed.type !== 'resume' && parsed.type !== 'append') return
    if (parsed.type === 'append' && (!('envelope' in parsed) || typeof parsed.envelope !== 'object'
      || parsed.envelope === null || !('streamId' in parsed.envelope) || typeof parsed.envelope.streamId !== 'string')) return
    const body = parsed as WsIn
    const actorId = this.state.getTags(ws).find(tag => tag.startsWith('actor:'))?.slice('actor:'.length) ?? ''
    const streamId = body.type === 'resume' ? body.streamId : body.envelope.streamId
    if (this.denyStream(new Request('http://edge.local/', { headers: { 'x-persona-actor': actorId } }), streamId) !== undefined) {
      ws.close(1008, 'SYNC_REFUSED')
      return
    }
    switch (body.type) {
      case 'resume':
        for (const envelope of this.log.after(body.streamId, body.afterSeq)) {
          ws.send(JSON.stringify({ type: 'envelope', envelope }))
        }
        return
      case 'append':
        ws.send(JSON.stringify(this.commit(body.envelope)))
        return
      default:
        return
    }
  }

  /**
   * @param _ws - Closed socket.
   */
  async webSocketClose(_ws: WebSocket): Promise<void> {}

  /**
   * @param url - Query `streamId` / `deviceId` become hibernation tags.
   * @param actorId - Authenticated desktop member; omitted only before workspace bootstrap.
   */
  acceptSocket(url: URL, actorId: string = ''): Response {
    const pair = new WebSocketPair()
    const tags: string[] = []
    const streamId = url.searchParams.get('streamId')
    const deviceId = url.searchParams.get('deviceId')
    if (streamId !== null && streamId.length > 0) tags.push(`stream:${streamId}`)
    if (deviceId !== null && deviceId.length > 0) tags.push(`device:${deviceId}`)
    if (actorId !== '') tags.push(`actor:${actorId}`)
    this.state.acceptWebSocket(pair[1], tags)
    return new Response(null, { status: 101, webSocket: pair[0] })
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
   * @param envelope - Newly appended event.
   */
  broadcast(envelope: SyncEnvelope): void {
    const payload = JSON.stringify({ type: 'envelope', envelope })
    for (const socket of this.state.getWebSockets(`stream:${envelope.streamId}`)) {
      const actorId = this.state.getTags(socket).find(tag => tag.startsWith('actor:'))?.slice('actor:'.length) ?? ''
      if (this.denyStream(new Request('http://edge.local/', { headers: { 'x-persona-actor': actorId } }), envelope.streamId) !== undefined) {
        socket.close(1008, 'ACCESS_REVOKED')
        continue
      }
      socket.send(payload)
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
    this.putInvite({ ...invite, token: await inviteTokenDigest(invite.token) })
    return Response.json({ invite })
  }

  /**
   * @param workspaceId - Workspace.
   * @param token - One-time token.
   * @param actor - Redeemer.
   */
  async redeem(workspaceId: string, token: string, actor: Actor): Promise<Response> {
    const invite = await this.getInviteByToken(workspaceId, token)
    if (invite === undefined) return Response.json({ error: 'INVITE_INVALID' }, { status: 404 })
    const next = redeemInvite(invite, Date.now(), actor)
    this.putInvite(next.invite)
    this.putMember({ actor: next.actor, joinedAt: Date.now(), inviteId: invite.id })
    return Response.json({ invite: next.invite, actor: next.actor })
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
   * Owner bootstrap (the inviter never redeems their own token).
   * @param actor - Desktop identity.
   */
  join(actor: Actor): Response {
    const existing = this.getMember(actor.id)
    if (existing !== undefined && existing.revokedAt === undefined) {
      return Response.json({ member: existing })
    }
    if (this.hasActiveMembers() || existing?.revokedAt !== undefined || actor.workspaceRole !== 'owner' || actor.kind !== 'user') {
      return Response.json({ status: 'refused', code: 'INVITE_REQUIRED' }, { status: 403 })
    }
    const member: WorkspaceMember = { actor, joinedAt: Date.now() }
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
    return Response.json({ member: next })
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
    for (const socket of this.state.getWebSockets(`device:${hook.ownerDeviceId}`)) {
      socket.send(payload)
    }
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
      for (const socket of this.state.getWebSockets(`actor:${member.actor.id}`)) socket.close(1008, 'ACCESS_REVOKED')
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

/** Redeemed or bootstrapped desktop replica. */
export interface WorkspaceMember {
  readonly actor: Actor
  readonly joinedAt: number
  readonly inviteId?: string
  readonly revokedAt?: number
}

/** POST /invites body. */
export interface InviteInput {
  readonly id: string
  readonly token: string
  readonly grant: Grant
  readonly ttlMs?: number
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

type WsIn =
  | { type: 'resume'; streamId: string; afterSeq: number }
  | { type: 'append'; envelope: SyncEnvelope }

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
