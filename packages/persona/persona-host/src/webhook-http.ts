/**
 * Local GitHub webhook: HMAC SHA-256, replay window, body cap. Secret lives
 * in the vault (or PERSONA_GITHUB_WEBHOOK_SECRET in tests). Never logged.
 */

import { createHmac, timingSafeEqual } from 'node:crypto'
import type { IncomingMessage, ServerResponse } from 'node:http'
import type { GithubIngestView } from './types.ts'

const MAX_BODY = 256 * 1024
const REPLAY_MS = 5 * 60_000

/** One admitted delivery. */
export interface WebhookDelivery {
  readonly id: string
  readonly at: number
}

/** Host slice the route needs. */
export interface GithubWebhookSink {
  secretOf(projectId: string): string
  ingest(projectId: string, event: string, action: string, repository: string, deliveryId: string, payload: Record<string, unknown>): GithubIngestView
  now(): number
}

/**
 * Remember delivery ids so a replay in the window is refused.
 */
export class WebhookReplayGuard {
  private readonly seen = new Map<string, number>()

  /**
   * @param id - GitHub delivery id.
   * @param now - Epoch ms.
   * @returns true when this id is new (or the previous one expired).
   */
  admit(id: string, now: number): boolean {
    const previous = this.seen.get(id)
    if (previous !== undefined && now - previous < REPLAY_MS) return false
    this.seen.set(id, now)
    for (const [key, at] of this.seen) {
      if (now - at >= REPLAY_MS) this.seen.delete(key)
    }
    return true
  }
}

/**
 * @param secret - Vault/env secret. Empty refuses every request.
 * @param header - `sha256=<hex>` from X-Hub-Signature-256.
 * @param body - Raw bytes.
 */
export function verifyGithubSignature(secret: string, header: string, body: Buffer): boolean {
  if (secret === '' || !header.startsWith('sha256=')) return false
  const expected = createHmac('sha256', secret).update(body).digest()
  const got = Buffer.from(header.slice('sha256='.length), 'hex')
  if (got.length !== expected.length) return false
  return timingSafeEqual(got, expected)
}

/**
 * Sign a test payload the same way GitHub does.
 * @param secret - Shared secret.
 * @param body - Raw body.
 */
export function signGithubBody(secret: string, body: Buffer): string {
  return `sha256=${createHmac('sha256', secret).update(body).digest('hex')}`
}

/**
 * Node HTTP handler for `POST /api/persona/webhooks/github`.
 * @param sink - Host ingest + secret.
 * @param guard - Replay window.
 */
export function githubWebhookHandler(
  sink: GithubWebhookSink,
  guard: WebhookReplayGuard = new WebhookReplayGuard(),
): (req: IncomingMessage, res: ServerResponse) => Promise<void> {
  return async (req, res) => {
    if (req.method !== 'POST') {
      res.writeHead(405).end()
      return
    }
    const url = new URL(req.url ?? '/', 'http://persona.local')
    const projectId = url.searchParams.get('projectId') ?? ''
    if (projectId === '') {
      res.writeHead(400, { 'content-type': 'application/json' }).end(JSON.stringify({ error: 'projectId' }))
      return
    }
    const chunks: Buffer<ArrayBufferLike>[] = []
    let size = 0
    for await (const chunk of req) {
      const part = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk)
      size += part.length
      if (size > MAX_BODY) {
        res.writeHead(413).end()
        return
      }
      chunks.push(part)
    }
    const body = Buffer.concat(chunks)
    const secret = sink.secretOf(projectId)
    const signature = headerOf(req, 'x-hub-signature-256')
    if (!verifyGithubSignature(secret, signature, body)) {
      res.writeHead(401).end()
      return
    }
    const deliveryId = headerOf(req, 'x-github-delivery')
    const event = headerOf(req, 'x-github-event')
    if (deliveryId === '' || event === '') {
      res.writeHead(400).end()
      return
    }
    if (!guard.admit(deliveryId, sink.now())) {
      res.writeHead(200, { 'content-type': 'application/json' }).end(JSON.stringify({ kind: 'duplicate' }))
      return
    }
    let payload: Record<string, unknown>
    try {
      payload = JSON.parse(body.toString('utf8')) as Record<string, unknown>
    } catch {
      res.writeHead(400).end()
      return
    }
    const action = typeof payload.action === 'string' ? payload.action : ''
    const repository = repositoryOf(payload)
    res.writeHead(202, { 'content-type': 'application/json' }).end(JSON.stringify({ ok: true, deliveryId }))
    queueMicrotask(() => {
      try {
        sink.ingest(projectId, event, action, repository, deliveryId, payload)
      } catch {
        // HMAC already accepted; ingest errors stay out of the HTTP path and never log the secret.
      }
    })
  }
}

function headerOf(req: IncomingMessage, name: string): string {
  const value = req.headers[name]
  return typeof value === 'string' ? value : ''
}

function repositoryOf(payload: Record<string, unknown>): string {
  const repo = payload.repository
  if (repo !== null && typeof repo === 'object' && 'full_name' in repo && typeof repo.full_name === 'string') {
    return repo.full_name
  }
  return ''
}
