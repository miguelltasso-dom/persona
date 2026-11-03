/**
 * `node:sqlite` adapter for {@link SyncSql}. Used by the D1 contract suite
 * (same SQL as the Worker D1 schema) without talking to Cloudflare.
 */

import { DatabaseSync } from 'node:sqlite'
import type { SyncSql, SyncSqlValue } from '../src/sql-log.ts'

/** In-process D1 stand-in. */
export class NodeSyncSql implements SyncSql {
  readonly db: DatabaseSync

  /**
   * @param db - Open `node:sqlite` connection.
   */
  constructor(db: DatabaseSync) {
    this.db = db
  }

  /**
   * @param sql - Statement. Multi-statement DDL is split on `;`.
   * @param params - Bind values.
   */
  exec(sql: string, params: readonly SyncSqlValue[] = []): void {
    if (params.length === 0 && sql.includes(';')) {
      this.db.exec(sql)
      return
    }
    this.db.prepare(sql).run(...params)
  }

  /**
   * @param sql - Query.
   * @param params - Bind values.
   */
  all(sql: string, params: readonly SyncSqlValue[] = []): Array<Record<string, SyncSqlValue>> {
    return this.db.prepare(sql).all(...params) as Array<Record<string, SyncSqlValue>>
  }
}
