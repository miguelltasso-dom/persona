/**
 * D1 DDL applied one statement at a time (D1 `exec` splits on newlines).
 */

import { SYNC_LOG_SCHEMA } from './sql-log.ts'

/** Invite + webhook tables for DO sqlite and D1. Single-line — D1 rejects newline-split DDL. */
export const EDGE_STATEMENTS: readonly string[] = [
  'CREATE TABLE IF NOT EXISTS invite (id TEXT PRIMARY KEY, workspace_id TEXT NOT NULL, token TEXT NOT NULL, expires_at INTEGER NOT NULL, used_at INTEGER, revoked_at INTEGER, body TEXT NOT NULL)',
  'CREATE UNIQUE INDEX IF NOT EXISTS invite_token ON invite (workspace_id, token)',
  'CREATE TABLE IF NOT EXISTS webhook_delivery (source TEXT NOT NULL, delivery_id TEXT NOT NULL, workspace_id TEXT NOT NULL, owner_device_id TEXT NOT NULL, received_at TEXT NOT NULL, body TEXT NOT NULL, PRIMARY KEY (source, delivery_id))',
]

/**
 * @param sql - Possibly multi-statement DDL.
 * @returns Individual statements.
 */
export function splitSql(sql: string): string[] {
  return sql.split(';').map(part => part.trim()).filter(part => part.length > 0)
}

/**
 * @param db - D1 binding.
 */
export async function ensureEdgeSchema(db: D1Database): Promise<void> {
  for (const sql of [...splitSql(SYNC_LOG_SCHEMA), ...EDGE_STATEMENTS]) {
    await db.prepare(sql).run()
  }
}
