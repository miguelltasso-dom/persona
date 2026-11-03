/**
 * SQLite {@link EffectPersistence} for one project (P3b).
 */

import type { EffectKind, EffectPersistence, EffectRecord } from '@deepseek-ai/dsh-persona-engine'
import type { SQLOutputValue } from 'node:sqlite'
import { integer, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/**
 * Effect rows keyed by `(project_id, kind, key)`. Upsert coalesces payload and
 * bumps `generation`; `seq` is kept. `Later` is handled by {@link import('@deepseek-ai/dsh-persona-engine').EffectQueue}.
 */
export class SqliteEffectPersistence implements EffectPersistence {
  readonly store: PersonaStore
  readonly projectId: string

  /**
   * @param store - Open store (schema ≥ 2).
   * @param projectId - Tenant.
   */
  constructor(store: PersonaStore, projectId: string) {
    this.store = store
    this.projectId = projectId
  }

  nextSeq(): number {
    return this.store.tx((db) => {
      const row = db.prepare('SELECT last_seq AS lastSeq FROM engine_effect_seq WHERE project_id = ?').get(this.projectId)
      const next = (row === undefined ? 0 : integer(row, 'lastSeq')) + 1
      run(db, 'INSERT INTO engine_effect_seq (project_id, last_seq) VALUES (?, ?) ON CONFLICT(project_id) DO UPDATE SET last_seq = excluded.last_seq', [
        this.projectId, next,
      ])
      return next
    })
  }

  upsert(kind: EffectKind, key: string, payload: string, seq: number, due: number): void {
    this.store.tx((db) => {
      const existing = db.prepare(
        'SELECT generation AS generation FROM engine_effect WHERE project_id = ? AND kind = ? AND key = ?',
      ).get(this.projectId, kind, key)
      if (existing === undefined) {
        run(db, 'INSERT INTO engine_effect (project_id, kind, key, payload, seq, generation, attempts, due) VALUES (?, ?, ?, ?, ?, 0, 0, ?)', [
          this.projectId, kind, key, payload, seq, due,
        ])
        return
      }
      run(db, 'UPDATE engine_effect SET payload = ?, generation = generation + 1, attempts = 0, due = ? WHERE project_id = ? AND kind = ? AND key = ?', [
        payload, due, this.projectId, kind, key,
      ])
    })
  }

  delete(kind: EffectKind, key: string): void {
    this.store.tx((db) => {
      run(db, 'DELETE FROM engine_effect WHERE project_id = ? AND kind = ? AND key = ?', [this.projectId, kind, key])
    })
  }

  get(kind: EffectKind, key: string): EffectRecord | undefined {
    const row = this.store.db.prepare(
      'SELECT kind, key, payload, seq, generation, attempts, due FROM engine_effect WHERE project_id = ? AND kind = ? AND key = ?',
    ).get(this.projectId, kind, key)
    return row === undefined ? undefined : readEffect(row)
  }

  due(kind: EffectKind, now: number, limit: number): EffectRecord[] {
    const rows = this.store.db.prepare(
      'SELECT kind, key, payload, seq, generation, attempts, due FROM engine_effect WHERE project_id = ? AND kind = ? AND due <= ? ORDER BY seq ASC LIMIT ?',
    ).all(this.projectId, kind, now, limit)
    return rows.map(readEffect)
  }

  oldest(kind: EffectKind): EffectRecord | undefined {
    const row = this.store.db.prepare(
      'SELECT kind, key, payload, seq, generation, attempts, due FROM engine_effect WHERE project_id = ? AND kind = ? ORDER BY seq ASC LIMIT 1',
    ).get(this.projectId, kind)
    return row === undefined ? undefined : readEffect(row)
  }

  pending(kind: EffectKind, key?: string): boolean {
    if (key !== undefined) {
      return this.store.db.prepare(
        'SELECT 1 AS ok FROM engine_effect WHERE project_id = ? AND kind = ? AND key = ?',
      ).get(this.projectId, kind, key) !== undefined
    }
    return this.store.db.prepare(
      'SELECT 1 AS ok FROM engine_effect WHERE project_id = ? AND kind = ? LIMIT 1',
    ).get(this.projectId, kind) !== undefined
  }

  markAttempt(kind: EffectKind, key: string, attempts: number, due: number): void {
    this.store.tx((db) => {
      run(db, 'UPDATE engine_effect SET attempts = ?, due = ? WHERE project_id = ? AND kind = ? AND key = ?', [
        attempts, due, this.projectId, kind, key,
      ])
    })
  }
}

function readEffect(row: Record<string, SQLOutputValue>): EffectRecord {
  const kind = text(row, 'kind')
  return {
    kind: asKind(kind),
    key: text(row, 'key'),
    payload: text(row, 'payload'),
    seq: integer(row, 'seq'),
    generation: integer(row, 'generation'),
    attempts: integer(row, 'attempts'),
    due: integer(row, 'due'),
  }
}

function asKind(value: string): EffectKind {
  if (value === 'assessment' || value === 'launch' || value === 'delivery' || value === 'relay' || value === 'notice' || value === 'reply') {
    return value
  }
  throw new Error(`unknown effect kind ${value}`)
}
