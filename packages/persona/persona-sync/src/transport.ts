/**
 * How a desktop replica talks to the workspace Durable Object.
 */

import {
  DomainError,
  commitEnvelope,
  type SyncEnvelope,
  type SyncLog,
} from '@deepseek-ai/dsh-persona-core'
import type { RequestSigner } from './request-sign.ts'

/** Result of one upload. */
export interface PushResult {
  readonly status: 'appended' | 'duplicate' | 'refused' | 'offline'
  readonly seq: number
  readonly code?: string
}

/** A replay was refused or unavailable; an empty successful replay has a different meaning. */
export class SyncTransportError extends Error {
  /** @param code - Stable refusal or transport failure. @param status - HTTP status, zero for network failure. */
  constructor(readonly code: string, readonly status: number) {
    super(code)
    this.name = 'SyncTransportError'
  }
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
  /** Signs every request (Ed25519): the hub knows who calls by this proof, never by a header the caller sets. */
  readonly signer?: RequestSigner

  /**
   * @param baseUrl - Worker origin, no trailing slash.
   * @param workspaceId - Workspace.
   * @param fetchImpl - Injected fetch (tests).
   * @param signer - This device's signer (the member's id and Ed25519 seed). Without one every call to a hub is refused with 401.
   */
  constructor(baseUrl: string, workspaceId: string, fetchImpl: typeof fetch = fetch, signer?: RequestSigner) {
    this.baseUrl = baseUrl
    this.workspaceId = workspaceId
    this.fetchImpl = fetchImpl
    if (signer !== undefined) this.signer = signer
  }

  /**
   * @param extra - Request headers to merge.
   * @param request - What is about to be sent (the signature covers it).
   */
  headers(extra: Record<string, string> = {}, request?: { readonly method: string; readonly target: string; readonly body?: string | Uint8Array }): Record<string, string> {
    return this.signer === undefined || request === undefined ? extra : { ...extra, authorization: this.signer.authorize(request) }
  }

  /**
   * @param envelope - Candidate upload.
   */
  async append(envelope: SyncEnvelope): Promise<PushResult> {
    try {
      const target = `/w/${this.workspaceId}/sync/append`
      const sent = JSON.stringify(envelope)
      const response = await this.fetchImpl(`${this.baseUrl}${target}`, {
        method: 'POST',
        headers: this.headers({ 'content-type': 'application/json' }, { method: 'POST', target, body: sent }),
        body: sent,
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
      const target = `/w/${this.workspaceId}/sync/after?streamId=${encodeURIComponent(streamId)}&afterSeq=${afterSeq}`
      const response = await this.fetchImpl(`${this.baseUrl}${target}`, { headers: this.headers({}, { method: 'GET', target }) })
      const body: unknown = await response.json()
      if (!response.ok) {
        const code = typeof body === 'object' && body !== null && 'code' in body && typeof body.code === 'string'
          ? body.code : 'SYNC_REFUSED'
        throw new SyncTransportError(code, response.status)
      }
      if (typeof body !== 'object' || body === null || !('envelopes' in body) || !Array.isArray(body.envelopes)) {
        throw new SyncTransportError('SYNC_INVALID_RESPONSE', response.status)
      }
      return (body as { envelopes: SyncEnvelope[] }).envelopes
    } catch (error) {
      if (error instanceof SyncTransportError) throw error
      throw new SyncTransportError('SYNC_UNAVAILABLE', 0)
    }
  }
}
