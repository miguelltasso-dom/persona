/**
 * Desktop sync client: only shared streams leave the device; optional
 * workspace-key cipher; queued uploads resume after offline.
 */

import {
  IdentityCipher,
  mayUpload,
  type PayloadCipher,
  type SyncEnvelope,
  type SyncLog,
} from '@deepseek-ai/dsh-persona-core'
import type { PushResult, SyncTransport } from './transport.ts'

/** Options for {@link SyncClient}. */
export interface SyncClientOptions {
  readonly log: SyncLog
  readonly transport: SyncTransport
  readonly cipher?: PayloadCipher
  readonly workspaceKeyId?: string
}

/**
 * One desktop replica. `push` refuses DM/private without `shared: true`.
 * `flush` retries the outbox when the transport is back.
 */
export class SyncClient {
  readonly log: SyncLog
  readonly transport: SyncTransport
  readonly cipher: PayloadCipher
  readonly workspaceKeyId: string
  readonly outbox: SyncEnvelope[] = []
  readonly cursors: Map<string, number> = new Map<string, number>()

  /**
   * @param options - Local log, transport, optional cipher.
   */
  constructor(options: SyncClientOptions) {
    this.log = options.log
    this.transport = options.transport
    this.cipher = options.cipher ?? IdentityCipher
    this.workspaceKeyId = options.workspaceKeyId ?? 'wk1'
  }

  /**
   * Seal a clear body when a workspace cipher is configured.
   * @param plaintext - Event body.
   */
  seal(plaintext: string): SyncEnvelope['payload'] {
    return this.cipher.seal(plaintext, this.workspaceKeyId)
  }

  /**
   * Open a sealed (or clear) payload.
   * @param payload - Envelope payload.
   */
  open(payload: SyncEnvelope['payload']): string {
    if ('clear' in payload) return payload.clear
    return this.cipher.open(payload, this.workspaceKeyId)
  }

  /**
   * Queue + attempt upload. Refused DMs never enter the outbox.
   * @param envelope - Candidate (seq already assigned or next expected).
   */
  async push(envelope: SyncEnvelope): Promise<PushResult> {
    if (!mayUpload(envelope) || isLocalOnlyStream(envelope.streamId)) {
      return { status: 'refused', seq: envelope.seq, code: 'PRIVATE_NOT_SHARED' }
    }
    this.outbox.push(envelope)
    return this.flushOne()
  }

  /**
   * Retry queued uploads. Offline items stay in the outbox.
   * @returns Results in outbox order (remaining items stay queued).
   */
  async flush(): Promise<PushResult[]> {
    const results: PushResult[] = []
    while (this.outbox.length > 0) {
      const result = await this.flushOne()
      results.push(result)
      if (result.status === 'offline' || result.status === 'refused') break
    }
    return results
  }

  /**
   * Pull `seq > cursor` and apply locally. Updates the cursor.
   * @param streamId - Stream to resume.
   */
  async pull(streamId: string): Promise<readonly SyncEnvelope[]> {
    const cursor = this.cursors.get(streamId) ?? 0
    const remote = await this.transport.after(streamId, cursor)
    for (const envelope of remote) {
      if (this.log.byIdempotency(envelope.idempotencyKey) === undefined) this.log.append(envelope)
      this.cursors.set(streamId, envelope.seq)
    }
    return remote
  }

  /**
   * Persistable cursor map for offline resume.
   * @returns streamId → last applied seq.
   */
  cursorSnapshot(): Record<string, number> {
    return Object.fromEntries(this.cursors)
  }

  /**
   * @param snapshot - Previously saved {@link cursorSnapshot}.
   */
  restoreCursors(snapshot: Record<string, number>): void {
    this.cursors.clear()
    for (const [streamId, seq] of Object.entries(snapshot)) this.cursors.set(streamId, seq)
  }

  /**
   * @returns Head of the first outbox item after a successful or duplicate push.
   */
  async flushOne(): Promise<PushResult> {
    const next = this.outbox[0]
    if (next === undefined) return { status: 'duplicate', seq: 0 }
    const result = await this.transport.append(next)
    if (result.status === 'appended' || result.status === 'duplicate') {
      this.outbox.shift()
      if (this.log.byIdempotency(next.idempotencyKey) === undefined) this.log.append(next)
      const known = this.cursors.get(next.streamId) ?? 0
      this.cursors.set(next.streamId, Math.max(known, next.seq))
    }
    return result
  }
}

/**
 * Teach recordings and provider home dirs never leave the device (WAVE2).
 * @param streamId - Envelope stream.
 */
export function isLocalOnlyStream(streamId: string): boolean {
  return streamId.startsWith('teach:') || streamId.startsWith('account:')
}
