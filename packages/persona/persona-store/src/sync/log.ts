/**
 * SQLite {@link SyncLog}. The Durable Object assigns `seq`; this table stores
 * the ordered envelopes the host already accepted.
 */

import type { SyncEnvelope, SyncLog } from '@deepseek-ai/dsh-persona-core'
import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/**
 * Device-local replica of the workspace sync log (schema ≥ 3).
 * `byIdempotency` is global, matching {@link import('@deepseek-ai/dsh-persona-core').MemorySyncLog}.
 */
export class SqliteSyncLog implements SyncLog {
  readonly store: PersonaStore

  /**
   * @param store - Open store (schema ≥ 3).
   */
  constructor(store: PersonaStore) {
    this.store = store
  }

  /**
   * @param envelope - Already authorized by `mayUpload` / `commitEnvelope`.
   */
  append(envelope: SyncEnvelope): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO sync_envelope
        (workspace_id, stream_id, seq, idempotency_key, classification, at, shared, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`, [
        envelope.workspaceId,
        envelope.streamId,
        envelope.seq,
        envelope.idempotencyKey,
        envelope.classification,
        envelope.at,
        envelope.shared === true ? 1 : 0,
        JSON.stringify(envelope),
      ])
    })
  }

  /**
   * @param streamId - Stream to read.
   * @param afterSeq - Exclusive cursor.
   */
  after(streamId: string, afterSeq: number): readonly SyncEnvelope[] {
    const rows = this.store.db.prepare(
      'SELECT body FROM sync_envelope WHERE stream_id = ? AND seq > ? ORDER BY seq ASC',
    ).all(streamId, afterSeq)
    return rows.map(readEnvelope)
  }

  /**
   * @param key - Idempotency key.
   */
  byIdempotency(key: string): SyncEnvelope | undefined {
    const row = this.store.db.prepare(
      'SELECT body FROM sync_envelope WHERE idempotency_key = ?',
    ).get(key)
    return row === undefined ? undefined : readEnvelope(row)
  }

  /**
   * @param streamId - Stream.
   */
  head(streamId: string): number {
    const row = this.store.db.prepare(
      'SELECT MAX(seq) AS head FROM sync_envelope WHERE stream_id = ?',
    ).get(streamId)
    if (row === undefined) return 0
    const value = row.head
    if (value === null || value === undefined) return 0
    if (typeof value !== 'number' || !Number.isInteger(value)) throw new StoreError('constraint', 'head')
    return value
  }

  /**
   * Insertion-order snapshot for replica-convergence tests.
   * @returns Every stored envelope.
   */
  snapshot(): readonly SyncEnvelope[] {
    const rows = this.store.db.prepare(
      'SELECT body FROM sync_envelope ORDER BY rowid ASC',
    ).all()
    return rows.map(readEnvelope)
  }
}

function readEnvelope(row: Record<string, SQLOutputValue>): SyncEnvelope {
  return structuredClone(JSON.parse(text(row, 'body')) as SyncEnvelope)
}
