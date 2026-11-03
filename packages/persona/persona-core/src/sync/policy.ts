/**
 * Upload and conflict rules. The Durable Object assigns `seq`; clients never
 * invent an order and never silently upload dm/private content.
 */

import { DomainError } from '../domain/schemas.ts'
import type { SyncClassification, SyncEnvelope, SyncLog } from './types.ts'

const SHARED_ONLY: ReadonlySet<SyncClassification> = new Set(['dm', 'private'])

/**
 * Whether this envelope may leave the device.
 * DM/private require an explicit `shared: true` grant (D-034).
 * @param envelope - Candidate upload.
 */
export function mayUpload(envelope: SyncEnvelope): boolean {
  if (!SHARED_ONLY.has(envelope.classification)) return true
  return envelope.shared === true
}

/**
 * @param envelope - Candidate upload.
 * @throws DomainError SYNC_REFUSED when dm/private is not explicitly shared.
 */
export function assertMayUpload(envelope: SyncEnvelope): void {
  if (!mayUpload(envelope)) throw new DomainError('SYNC_REFUSED', 'PRIVATE_NOT_SHARED')
}

/**
 * Append if the idempotency key is new. The Durable Object is the only sequencer:
 * `seq` must be `head + 1`. A replay of the same key is a no-op.
 * @param log - Sync log.
 * @param envelope - Envelope whose `seq` the DO already assigned.
 */
export function commitEnvelope(log: SyncLog, envelope: SyncEnvelope): 'appended' | 'duplicate' {
  assertMayUpload(envelope)
  const existing = log.byIdempotency(envelope.idempotencyKey)
  if (existing !== undefined) return 'duplicate'
  const head = log.head(envelope.streamId)
  if (envelope.seq !== head + 1) throw new DomainError('SYNC_REFUSED', 'SEQ_GAP')
  log.append(envelope)
  return 'appended'
}

/**
 * Events a disconnected device must apply to catch up.
 * @param log - Authoritative stream.
 * @param streamId - Stream.
 * @param cursorSeq - Last applied seq (0 if none).
 */
export function resumeFromCursor(log: SyncLog, streamId: string, cursorSeq: number): readonly SyncEnvelope[] {
  return log.after(streamId, cursorSeq)
}

/**
 * Identity cipher for tests and for payloads the user chose to leave clear.
 */
export const IdentityCipher = {
  seal(plaintext: string, workspaceKeyId: string): { alg: 'workspace'; workspaceKeyId: string; ciphertext: string } {
    return { alg: 'workspace', workspaceKeyId, ciphertext: plaintext }
  },
  open(sealed: { ciphertext: string }, _workspaceKeyId: string): string {
    return sealed.ciphertext
  },
}
