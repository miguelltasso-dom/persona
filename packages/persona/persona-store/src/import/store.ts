/**
 * SQLite {@link ImportStore}. Applied batches stay so rollback can mark them
 * and a later apply of the same `externalId` is a no-op until then.
 */

import type { ImportBatch, ImportStore } from '@deepseek-ai/dsh-persona-core'
import type { SQLOutputValue } from 'node:sqlite'
import { run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Device-local import batches (schema ≥ 3). */
export class SqliteImportStore implements ImportStore {
  readonly store: PersonaStore

  /**
   * @param store - Open store (schema ≥ 3).
   */
  constructor(store: PersonaStore) {
    this.store = store
  }

  /**
   * @param externalId - Stable id from the source export.
   */
  hasExternalId(externalId: string): boolean {
    const rows = this.store.db.prepare('SELECT body FROM import_batch').all()
    for (const row of rows) {
      const batch = readBatch(row)
      if (batch.rolledBack) continue
      if (batch.applied.some(item => item.externalId === externalId)) return true
    }
    return false
  }

  /**
   * @param batch - Applied proposals (or a rolled-back copy).
   */
  saveBatch(batch: ImportBatch): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO import_batch (id, adapter_id, rolled_back, body) VALUES (?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET adapter_id = excluded.adapter_id, rolled_back = excluded.rolled_back, body = excluded.body`, [
        batch.id,
        batch.adapterId,
        batch.rolledBack ? 1 : 0,
        JSON.stringify(batch),
      ])
    })
  }

  /**
   * @param batchId - Batch to load.
   */
  getBatch(batchId: string): ImportBatch | undefined {
    const row = this.store.db.prepare('SELECT body FROM import_batch WHERE id = ?').get(batchId)
    return row === undefined ? undefined : readBatch(row)
  }
}

function readBatch(row: Record<string, SQLOutputValue>): ImportBatch {
  return structuredClone(JSON.parse(text(row, 'body')) as ImportBatch)
}
