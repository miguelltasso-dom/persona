/**
 * Sync {@link SyncLog} over a tiny SQL face. The Durable Object uses
 * `storage.sql`; Node tests and the D1 shim use `node:sqlite`.
 */

import type { SyncEnvelope, SyncLog } from '../../../packages/persona/persona-core/src/sync/types.ts'

/** Bind values the log writes. */
export type SyncSqlValue = string | number | null

/** Synchronous SQL used by {@link SqlSyncLog}. */
export interface SyncSql {
  /**
   * @param sql - Statement.
   * @param params - Bind values.
   */
  exec(sql: string, params?: readonly SyncSqlValue[]): void
  /**
   * @param sql - Query.
   * @param params - Bind values.
   */
  all(sql: string, params?: readonly SyncSqlValue[]): Array<Record<string, SyncSqlValue>>
}

/** DDL shared by DO sqlite and D1. Single-line statements — D1 rejects newline-split DDL. */
export const SYNC_LOG_SCHEMA = [
  'CREATE TABLE IF NOT EXISTS sync_envelope (workspace_id TEXT NOT NULL, stream_id TEXT NOT NULL, seq INTEGER NOT NULL, idempotency_key TEXT NOT NULL, classification TEXT NOT NULL, at TEXT NOT NULL, shared INTEGER NOT NULL DEFAULT 0, body TEXT NOT NULL, PRIMARY KEY (workspace_id, stream_id, seq))',
  'CREATE UNIQUE INDEX IF NOT EXISTS sync_envelope_idem ON sync_envelope (idempotency_key)',
  'CREATE INDEX IF NOT EXISTS sync_envelope_stream ON sync_envelope (stream_id, seq)',
].join(';\n')

/**
 * {@link SyncLog} backed by {@link SyncSql}. Same methods as Memory/SQLite.
 */
export class SqlSyncLog implements SyncLog {
  readonly sql: SyncSql

  /**
   * @param sql - Synchronous SQL.
   */
  constructor(sql: SyncSql) {
    this.sql = sql
    this.sql.exec(SYNC_LOG_SCHEMA)
  }

  /**
   * @param envelope - Already authorized by `commitEnvelope`.
   */
  append(envelope: SyncEnvelope): void {
    this.sql.exec(
      `INSERT INTO sync_envelope
        (workspace_id, stream_id, seq, idempotency_key, classification, at, shared, body)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        envelope.workspaceId,
        envelope.streamId,
        envelope.seq,
        envelope.idempotencyKey,
        envelope.classification,
        envelope.at,
        envelope.shared === true ? 1 : 0,
        JSON.stringify(envelope),
      ],
    )
  }

  /**
   * @param streamId - Stream to read.
   * @param afterSeq - Exclusive cursor.
   */
  after(streamId: string, afterSeq: number): readonly SyncEnvelope[] {
    return this.sql.all(
      'SELECT body FROM sync_envelope WHERE stream_id = ? AND seq > ? ORDER BY seq ASC',
      [streamId, afterSeq],
    ).map(readEnvelope)
  }

  /**
   * @param key - Idempotency key.
   */
  byIdempotency(key: string): SyncEnvelope | undefined {
    const rows = this.sql.all(
      'SELECT body FROM sync_envelope WHERE idempotency_key = ?',
      [key],
    )
    if (rows.length === 0) return undefined
    return readEnvelope(rows[0])
  }

  /**
   * @param streamId - Stream.
   */
  head(streamId: string): number {
    const rows = this.sql.all(
      'SELECT MAX(seq) AS head FROM sync_envelope WHERE stream_id = ?',
      [streamId],
    )
    if (rows.length === 0) return 0
    const value = rows[0].head
    return typeof value === 'number' && Number.isInteger(value) ? value : 0
  }

  /**
   * Insertion-order snapshot for the Forge convergence case.
   * @returns Every stored envelope.
   */
  snapshot(): readonly SyncEnvelope[] {
    return this.sql.all('SELECT body FROM sync_envelope ORDER BY rowid ASC').map(readEnvelope)
  }
}

function readEnvelope(row: Record<string, SyncSqlValue>): SyncEnvelope {
  const body = row.body
  if (typeof body !== 'string') throw new Error('envelope')
  return JSON.parse(body) as SyncEnvelope
}
