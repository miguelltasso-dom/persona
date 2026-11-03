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
      return this.acceptSocket(url)
    }
    try {
      if (rest[0] === 'sync' && rest[1] === 'append' && request.method === 'POST') {
        const envelope: SyncEnvelope = await request.json()
        return this.append(envelope)
      }
      if (rest[0] === 'sync' && rest[1] === 'after' && request.method === 'GET') {
        const streamId = url.searchParams.get('streamId') ?? ''
        const afterSeq = Number(url.searchParams.get('afterSeq') ?? '0')
        return Response.json({ envelopes: this.log.after(streamId, afterSeq) })
      }
      if (rest[0] === 'invites' && request.method === 'POST' && rest.length === 1) {
        const input: InviteInput = await request.json()
        return this.issue(workspaceId, input)
      }
      if (rest[0] === 'invites' && rest[2] === 'redeem' && request.method === 'POST') {
        const actor: Actor = await request.json()
        return this.redeem(workspaceId, rest[1] ?? '', actor)
      }
      if (rest[0] === 'invites' && rest[2] === 'revoke' && request.method === 'POST') {
        return this.revoke(rest[1] ?? '')
      }
      if (rest[0] === 'invites' && rest.length === 2 && request.method === 'GET') {
        const invite = this.getInviteByToken(workspaceId, rest[1] ?? '')
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
    const body = parsed as WsIn
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
   */
  acceptSocket(url: URL): Response {
    const pair = new WebSocketPair()
    const tags: string[] = []
    const streamId = url.searchParams.get('streamId')
    const deviceId = url.searchParams.get('deviceId')
    if (streamId !== null && streamId.length > 0) tags.push(`stream:${streamId}`)
    if (deviceId !== null && deviceId.length > 0) tags.push(`device:${deviceId}`)
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
      socket.send(payload)
    }
  }

  /**
   * @param workspaceId - Workspace.
   * @param input - Issue body.
   */
  issue(workspaceId: string, input: InviteInput): Response {
    const invite = issueInvite(input.now ?? Date.now(), {
      id: input.id,
      workspaceId,
      token: input.token,
      grant: input.grant,
      ...(input.ttlMs === undefined ? {} : { ttlMs: input.ttlMs }),
    })
    this.putInvite(invite)
    return Response.json({ invite })
  }

  /**
   * @param workspaceId - Workspace.
   * @param token - One-time token.
   * @param actor - Redeemer.
   */
  redeem(workspaceId: string, token: string, actor: Actor): Response {
    const invite = this.getInviteByToken(workspaceId, token)
    if (invite === undefined) return Response.json({ error: 'INVITE_INVALID' }, { status: 404 })
    const next = redeemInvite(invite, Date.now(), actor)
    this.putInvite(next.invite)
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
    return Response.json({ invite: this.getInvite(id) })
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
  getInviteByToken(workspaceId: string, token: string): Invite | undefined {
    const body = firstBody(this.sql.all(
      'SELECT body FROM invite WHERE workspace_id = ? AND token = ?',
      [workspaceId, token],
    ))
    return body === undefined ? undefined : JSON.parse(body) as Invite
  }
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
