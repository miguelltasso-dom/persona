/**
 * How a desktop replica talks to the workspace Durable Object.
 */

import {
  DomainError,
  commitEnvelope,
  type SyncEnvelope,
  type SyncLog,
} from '@deepseek-ai/dsh-persona-core'

/** Result of one upload. */
export interface PushResult {
  readonly status: 'appended' | 'duplicate' | 'refused' | 'offline'
  readonly seq: number
  readonly code?: string
}

/** Edge (or a test double) that sequences envelopes. */
export interface SyncTransport {
  /**
   * @param envelope - Already filtered by `mayUpload`.
   */
  append(envelope: SyncEnvelope): Promise<PushResult>
  /**
   * @param streamId - Stream.
   * @param afterSeq - Exclusive cursor.
   */
  after(streamId: string, afterSeq: number): Promise<readonly SyncEnvelope[]>
}

/**
 * In-process Durable Object stand-in. Two {@link SyncClient}s share one of these.
 */
export class MemoryTransport implements SyncTransport {
  readonly log: SyncLog
  online: boolean

  /**
   * @param log - Shared cloud replica.
   * @param online - When false, append/after throw-equivalent as `offline`.
   */
  constructor(log: SyncLog, online: boolean = true) {
    this.log = log
    this.online = online
  }

  /**
   * @param envelope - Candidate upload.
   */
  append(envelope: SyncEnvelope): Promise<PushResult> {
    if (!this.online) return Promise.resolve({ status: 'offline', seq: this.log.head(envelope.streamId) })
    try {
      const status = commitEnvelope(this.log, envelope)
      return Promise.resolve({ status, seq: envelope.seq })
    } catch (error: unknown) {
      const code = error instanceof DomainError ? (error.detail ?? error.code) : 'SYNC_REFUSED'
      return Promise.resolve({ status: 'refused', seq: this.log.head(envelope.streamId), code })
    }
  }

  /**
   * @param streamId - Stream.
   * @param afterSeq - Exclusive cursor.
   */
  after(streamId: string, afterSeq: number): Promise<readonly SyncEnvelope[]> {
    if (!this.online) return Promise.resolve([])
    return Promise.resolve(this.log.after(streamId, afterSeq))
  }
}

/**
 * HTTP client for `apps/persona-edge` (`POST /w/:id/sync/append`, `GET .../after`).
 */
export class HttpTransport implements SyncTransport {
  readonly baseUrl: string
  readonly workspaceId: string
  readonly fetchImpl: typeof fetch
  readonly actorId?: string

  /**
   * @param baseUrl - Worker origin, no trailing slash.
   * @param workspaceId - Workspace.
   * @param fetchImpl - Injected fetch (tests).
   * @param actorId - Desktop member; sent as `x-persona-actor` so revoke can cut sync.
   */
  constructor(baseUrl: string, workspaceId: string, fetchImpl: typeof fetch = fetch, actorId?: string) {
    this.baseUrl = baseUrl
    this.workspaceId = workspaceId
    this.fetchImpl = fetchImpl
    if (actorId !== undefined) this.actorId = actorId
  }

  /**
   * @param extra - Request headers to merge.
   */
  headers(extra: Record<string, string> = {}): Record<string, string> {
    return this.actorId === undefined
      ? extra
      : { ...extra, 'x-persona-actor': this.actorId }
  }

  /**
   * @param envelope - Candidate upload.
   */
  async append(envelope: SyncEnvelope): Promise<PushResult> {
    try {
      const response = await this.fetchImpl(`${this.baseUrl}/w/${this.workspaceId}/sync/append`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }),
        body: JSON.stringify(envelope),
      })
      const body: unknown = await response.json()
      if (typeof body !== 'object' || body === null) return { status: 'offline', seq: 0 }
      const row = body as PushResult
      return { status: row.status, seq: row.seq, ...(row.code === undefined ? {} : { code: row.code }) }
    } catch {
      return { status: 'offline', seq: 0 }
    }
  }

  /**
   * @param streamId - Stream.
   * @param afterSeq - Exclusive cursor.
   */
  async after(streamId: string, afterSeq: number): Promise<readonly SyncEnvelope[]> {
    try {
      const response = await this.fetchImpl(
        `${this.baseUrl}/w/${this.workspaceId}/sync/after?streamId=${encodeURIComponent(streamId)}&afterSeq=${afterSeq}`,
        { headers: this.headers() },
      )
      const body: unknown = await response.json()
      if (typeof body !== 'object' || body === null || !('envelopes' in body)) return []
      return (body as { envelopes: SyncEnvelope[] }).envelopes
    } catch {
      return []
    }
  }
}
