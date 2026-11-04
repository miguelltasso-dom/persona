/**
 * Document store for host UI remotes (schema ≥ 5): rules, proposals, skills.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** JSON document keyed by tenant + kind + id. */
export class ScreenRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 5).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * @param projectId - Tenant.
   * @param kind - Document kind.
   * @param id - Document id.
   * @param body - JSON value.
   */
  put(projectId: string, kind: string, id: string, body: unknown): void {
    const updatedAt = this.now()
    this.store.tx((db) => {
      run(db, `INSERT INTO screen_doc (project_id, kind, id, body, updated_at) VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(project_id, kind, id) DO UPDATE SET body = excluded.body, updated_at = excluded.updated_at`, [
        projectId, kind, id, JSON.stringify(body), updatedAt,
      ])
    })
  }

  /**
   * @param projectId - Tenant.
   * @param kind - Document kind.
   * @param id - Document id.
   */
  get<T>(projectId: string, kind: string, id: string): T | undefined {
    const row = this.store.db.prepare(
      'SELECT body FROM screen_doc WHERE project_id = ? AND kind = ? AND id = ?',
    ).get(projectId, kind, id)
    return row === undefined ? undefined : readBody(row) as T
  }

  /**
   * Newest first.
   * @param projectId - Tenant.
   * @param kind - Document kind.
   */
  list<T>(projectId: string, kind: string): T[] {
    return this.store.db.prepare(
      'SELECT body FROM screen_doc WHERE project_id = ? AND kind = ? ORDER BY updated_at DESC, id DESC',
    ).all(projectId, kind).map(row => readBody(row) as T)
  }

  /**
   * @param projectId - Tenant.
   * @param kind - Document kind.
   * @param id - Document id.
   */
  delete(projectId: string, kind: string, id: string): void {
    this.store.tx((db) => {
      run(db, 'DELETE FROM screen_doc WHERE project_id = ? AND kind = ? AND id = ?', [projectId, kind, id])
    })
  }
}

function readBody(row: Record<string, SQLOutputValue>): unknown {
  return structuredClone(JSON.parse(text(row, 'body')))
}
