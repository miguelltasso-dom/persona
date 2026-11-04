/**
 * Token-opt persistence: subject summaries, librarian/initiative cursors, limit pools.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Incremental subject fold (OPT-4 host). */
export interface TopicSummary {
  readonly topicId: string
  readonly workspaceId: string
  readonly projectId: string
  readonly summary: string
  readonly lastSeq: number
  readonly messageCount: number
  readonly updatedAt: string
}

/** Last librarian / initiative pass. */
export interface BatchCursor {
  readonly id: string
  readonly projectId: string
  readonly kind: 'librarian' | 'initiative'
  readonly lastAt: string
  readonly lastSeq: number
}

/** Persisted Rivet pool fold (JSON). */
export interface StoredLimitPool {
  readonly projectId: string
  readonly provider: string
  readonly body: unknown
  readonly updatedAt: string
}

/**
 * OPT store: summaries, batch cursors, provider limit pools.
 */
export class OptRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 17).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * @param topicId - Subject.
   */
  getSummary(topicId: string): TopicSummary | undefined {
    const row = this.store.db.prepare('SELECT * FROM topic_summary WHERE topic_id = ?').get(topicId)
    return row === undefined ? undefined : summaryFrom(row)
  }

  /**
   * @param row - Summary.
   */
  putSummary(row: Omit<TopicSummary, 'updatedAt'>): TopicSummary {
    const updatedAt = this.now()
    this.store.tx((db) => {
      run(db, `INSERT INTO topic_summary
        (topic_id, workspace_id, project_id, summary, last_seq, message_count, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(topic_id) DO UPDATE SET
          summary = excluded.summary,
          last_seq = excluded.last_seq,
          message_count = excluded.message_count,
          updated_at = excluded.updated_at`, [
        row.topicId, row.workspaceId, row.projectId, row.summary,
        row.lastSeq, row.messageCount, updatedAt,
      ])
    })
    return { ...row, updatedAt }
  }

  /**
   * @param kind - Batch.
   * @param projectId - Tenant.
   */
  getCursor(kind: BatchCursor['kind'], projectId: string): BatchCursor | undefined {
    const id = `${kind}:${projectId}`
    const row = this.store.db.prepare('SELECT * FROM batch_cursor WHERE id = ?').get(id)
    return row === undefined ? undefined : cursorFrom(row)
  }

  /**
   * @param kind - Batch.
   * @param projectId - Tenant.
   * @param lastAt - Exclusive lower bound for the next pass.
   * @param lastSeq - Optional event seq.
   */
  putCursor(kind: BatchCursor['kind'], projectId: string, lastAt: string, lastSeq: number = 0): BatchCursor {
    const id = `${kind}:${projectId}`
    this.store.tx((db) => {
      run(db, `INSERT INTO batch_cursor (id, project_id, kind, last_at, last_seq)
        VALUES (?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET last_at = excluded.last_at, last_seq = excluded.last_seq`, [
        id, projectId, kind, lastAt, lastSeq,
      ])
    })
    return { id, projectId, kind, lastAt, lastSeq }
  }

  /**
   * @param projectId - Tenant.
   * @param provider - Engine.
   * @param body - Folded pool.
   */
  putPool(projectId: string, provider: string, body: unknown): StoredLimitPool {
    const updatedAt = this.now()
    this.store.tx((db) => {
      run(db, `INSERT INTO provider_limit_pool (project_id, provider, body_json, updated_at)
        VALUES (?, ?, ?, ?)
        ON CONFLICT(project_id, provider) DO UPDATE SET
          body_json = excluded.body_json, updated_at = excluded.updated_at`, [
        projectId, provider, JSON.stringify(body), updatedAt,
      ])
    })
    return { projectId, provider, body, updatedAt }
  }

  /**
   * @param projectId - Tenant.
   * @param provider - Optional filter.
   */
  listPools(projectId: string, provider?: string): StoredLimitPool[] {
    const rows = provider === undefined
      ? this.store.db.prepare(
        'SELECT * FROM provider_limit_pool WHERE project_id = ? ORDER BY provider',
      ).all(projectId)
      : this.store.db.prepare(
        'SELECT * FROM provider_limit_pool WHERE project_id = ? AND provider = ?',
      ).all(projectId, provider)
    return rows.map(poolFrom)
  }
}

function summaryFrom(row: Record<string, SQLOutputValue>): TopicSummary {
  return {
    topicId: text(row, 'topic_id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    summary: text(row, 'summary'),
    lastSeq: integer(row, 'last_seq'),
    messageCount: integer(row, 'message_count'),
    updatedAt: text(row, 'updated_at'),
  }
}

function cursorFrom(row: Record<string, SQLOutputValue>): BatchCursor {
  const kind = text(row, 'kind')
  if (kind !== 'librarian' && kind !== 'initiative') throw new StoreError('constraint', 'kind')
  return {
    id: text(row, 'id'),
    projectId: text(row, 'project_id'),
    kind,
    lastAt: text(row, 'last_at'),
    lastSeq: integer(row, 'last_seq'),
  }
}

function poolFrom(row: Record<string, SQLOutputValue>): StoredLimitPool {
  return {
    projectId: text(row, 'project_id'),
    provider: text(row, 'provider'),
    body: JSON.parse(text(row, 'body_json')) as unknown,
    updatedAt: text(row, 'updated_at'),
  }
}
