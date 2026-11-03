/**
 * Durable Object `storage.sql` adapter for {@link SyncSql}.
 */

import type { SyncSql, SyncSqlValue } from './sql-log.ts'

/** Synchronous SQL over the hibernatable DO sqlite store. */
export class DoSyncSql implements SyncSql {
  readonly storage: SqlStorage

  /**
   * @param storage - `state.storage.sql`.
   */
  constructor(storage: SqlStorage) {
    this.storage = storage
  }

  /**
   * @param sql - Statement. Multi-statement DDL is split on `;`.
   * @param params - Bind values.
   */
  exec(sql: string, params: readonly SyncSqlValue[] = []): void {
    if (params.length === 0 && sql.includes(';')) {
      for (const part of sql.split(';')) {
        const trimmed = part.trim()
        if (trimmed.length > 0) this.storage.exec(trimmed)
      }
      return
    }
    this.storage.exec(sql, ...params)
  }

  /**
   * @param sql - Query.
   * @param params - Bind values.
   */
  all(sql: string, params: readonly SyncSqlValue[] = []): Array<Record<string, SyncSqlValue>> {
    return [...this.storage.exec(sql, ...params)] as Array<Record<string, SyncSqlValue>>
  }
}
