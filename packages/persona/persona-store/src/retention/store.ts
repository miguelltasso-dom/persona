/**
 * SQLite {@link RetentionStore}: archive ≠ delete; delete drops index, cache and FTS residue.
 */

import {
  applyRetention,
  type RetentionKind,
  type RetentionPolicy,
  type RetentionRecord,
  type RetentionStore,
  type RetentionApplyResult,
} from '@deepseek-ai/dsh-persona-engine'
import type { SQLOutputValue } from 'node:sqlite'
import { run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'
import { SqliteUsageStore } from '../usage/store.ts'

/**
 * Document-per-row retention on an open store (schema ≥ 6).
 */
export class SqliteRetention implements RetentionStore {
  readonly store: PersonaStore

  /**
   * @param store - Open Persona store.
   */
  constructor(store: PersonaStore) {
    this.store = store
  }

  /**
   * @param id - Record id.
   */
  get(id: string): RetentionRecord | undefined {
    const row = this.store.db.prepare('SELECT body FROM retention_record WHERE id = ?').get(id)
    return row === undefined ? undefined : readRecord(row)
  }

  /**
   * All rows, including archived (needed by {@link applyRetention}).
   * @param kind - Optional filter.
   */
  list(kind?: RetentionKind): readonly RetentionRecord[] {
    const rows = kind === undefined
      ? this.store.db.prepare('SELECT body FROM retention_record ORDER BY created_at ASC, id ASC').all()
      : this.store.db.prepare('SELECT body FROM retention_record WHERE kind = ? ORDER BY created_at ASC, id ASC').all(kind)
    return rows.map(readRecord)
  }

  /**
   * Live (not archived) rows.
   * @param kind - Optional filter.
   */
  listLive(kind?: RetentionKind): readonly RetentionRecord[] {
    return this.list(kind).filter(row => row.archivedAt === undefined)
  }

  /**
   * @param record - Row plus index keys.
   */
  save(record: RetentionRecord): void {
    const body = JSON.stringify(record)
    this.store.tx((db) => {
      run(db, `INSERT INTO retention_record (id, kind, created_at, archived_at, body) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, created_at = excluded.created_at, archived_at = excluded.archived_at, body = excluded.body`, [
        record.id, record.kind, record.createdAt, record.archivedAt ?? null, body,
      ])
      run(db, 'DELETE FROM retention_index WHERE record_id = ?', [record.id])
      for (const key of record.indexKeys) {
        run(db, 'INSERT INTO retention_index (key, record_id) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET record_id = excluded.record_id', [
          key, record.id,
        ])
      }
      run(db, 'INSERT INTO retention_cache (record_id) VALUES (?) ON CONFLICT(record_id) DO NOTHING', [record.id])
    })
  }

  /**
   * @param id - Record.
   * @param at - Archive instant (ms).
   */
  archive(id: string, at: number): void {
    const current = this.get(id)
    if (current === undefined || current.archivedAt !== undefined) return
    this.save({ ...current, archivedAt: at })
  }

  /**
   * Irreversible: row, indexes, cache, and event FTS for a message id.
   * @param id - Record.
   */
  delete(id: string): void {
    const current = this.get(id)
    if (current === undefined) return
    this.store.tx((db) => {
      run(db, 'DELETE FROM retention_index WHERE record_id = ?', [id])
      run(db, 'DELETE FROM retention_cache WHERE record_id = ?', [id])
      run(db, 'DELETE FROM retention_record WHERE id = ?', [id])
      if (current.kind === 'message') {
        try {
          run(db, 'UPDATE event SET deleted = 1 WHERE id = ?', [id])
          run(db, "INSERT INTO event_fts(event_fts, rowid) VALUES ('delete', (SELECT rowid FROM event WHERE id = ?))", [id])
        } catch {
          // Event row may not exist when the contract suite uses synthetic ids.
        }
      }
    })
  }

  /**
   * @param key - Index key.
   */
  hasIndex(key: string): boolean {
    return this.store.db.prepare('SELECT 1 AS ok FROM retention_index WHERE key = ?').get(key) !== undefined
  }

  /**
   * @param id - Cache id.
   */
  hasCache(id: string): boolean {
    return this.store.db.prepare('SELECT 1 AS ok FROM retention_cache WHERE record_id = ?').get(id) !== undefined
  }
}

/**
 * Apply the engine policy then VACUUM when anything was deleted.
 * @param store - Open store.
 * @param policy - Windows.
 * @param now - Clock (ms).
 */
export function applySqliteRetention(
  store: PersonaStore,
  policy: RetentionPolicy,
  now: number,
): RetentionApplyResult {
  const result = applyRetention(new SqliteRetention(store), policy, now)
  const usage = policy.windows.find(item => item.kind === 'usage')
  if (usage !== undefined) {
    const cutoff = new Date(now - usage.archiveAfterMs).toISOString()
    new SqliteUsageStore(store).purgeBefore(cutoff)
  }
  if (result.deleted.length > 0) store.db.exec('VACUUM')
  return result
}

function readRecord(row: Record<string, SQLOutputValue>): RetentionRecord {
  const parsed = JSON.parse(text(row, 'body')) as RetentionRecord
  return {
    ...parsed,
    derivativeIds: [...parsed.derivativeIds],
    indexKeys: [...parsed.indexKeys],
  }
}
