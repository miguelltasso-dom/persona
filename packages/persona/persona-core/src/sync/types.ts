/**
 * Local-first sync protocol (D-034). The Durable Object is the only sequencer.
 * Anvil persists; this package owns the envelope and the invariants.
 */

/** Who may see the event once it leaves the device. */
export type SyncClassification = 'workspace' | 'project' | 'channel' | 'dm' | 'private'

/** Routing metadata the cloud may store in the clear. */
export interface SyncRouting {
  workspaceId: string
  streamId: string
  seq: number
  idempotencyKey: string
  classification: SyncClassification
}

/** Sealed body; the Durable Object never opens it. */
export interface SealedPayload {
  alg: 'workspace'
  workspaceKeyId: string
  ciphertext: string
}

/** Optional workspace-key cipher. The host holds the key; the server does not. */
export interface PayloadCipher {
  /**
   * @param plaintext - Event body.
   * @param workspaceKeyId - Key id known only to workspace members.
   */
  seal(plaintext: string, workspaceKeyId: string): SealedPayload
  /**
   * @param sealed - Ciphertext from {@link seal}.
   * @param workspaceKeyId - Same key id.
   */
  open(sealed: SealedPayload, workspaceKeyId: string): string
}

/**
 * One ordered event. `shared` is the explicit share grant for dm/private.
 * Without it those classifications must not leave the device.
 */
export interface SyncEnvelope extends SyncRouting {
  at: string
  payload: SealedPayload | { clear: string }
  shared?: true
}

export interface SyncCursor {
  streamId: string
  seq: number
}

export interface SyncAck {
  streamId: string
  seq: number
  deviceId: string
}

/** Persistence port. Anvil implements this with the same contract suite. */
export interface SyncLog {
  /**
   * @param envelope - Already authorized by {@link mayUpload}.
   */
  append(envelope: SyncEnvelope): void
  /**
   * @param streamId - Stream to read.
   * @param afterSeq - Exclusive cursor.
   */
  after(streamId: string, afterSeq: number): readonly SyncEnvelope[]
  /**
   * @param key - Idempotency key.
   */
  byIdempotency(key: string): SyncEnvelope | undefined
  /**
   * @param streamId - Stream.
   */
  head(streamId: string): number
}

/** GitHub (and later others) webhook the Worker forwards to the owner desktop. */
export interface WebhookEnvelope {
  source: 'github'
  deliveryId: string
  receivedAt: string
  ownerDeviceId: string
  payload: unknown
}
