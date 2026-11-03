/**
 * Per-stream event log: monotonic seq, FTS5 search, ACL, zoned recall.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'
import { zonedUtcMs } from './timezone.ts'

/** Stream kinds stored in schema v1. */
export type StreamKind = 'channel' | 'dm' | 'thread' | 'routine'

/** One persisted event. */
export interface StoredEvent {
  readonly id: string
  readonly streamId: string
  readonly workspaceId: string
  readonly projectId: string
  readonly seq: number
  readonly type: string
  readonly body: string
  readonly actorId: string
  readonly subjectId: string
  readonly occurredAt: string
  readonly deleted: boolean
}

/** Stream identity. */
export interface StreamRecord {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly kind: StreamKind
  readonly ownerId: string
  readonly createdAt: string
}

/** Reader used for ACL (member or persona id). */
export interface EventActor {
  readonly id: string
}

/** Append payload. `occurredAt` must be an offset ISO instant. */
export interface AppendEventInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: StreamKind
  readonly ownerId: string
  readonly type: string
  readonly body: string
  readonly actorId: string
  readonly subjectId: string
  readonly occurredAt: string
}

/** Cursor page. */
export interface EventPage {
  readonly events: StoredEvent[]
  readonly nextSeq: number
}

/**
 * Event log. Seq is assigned inside `BEGIN IMMEDIATE` from `stream_cursor`.
 */
export class EventRepos {
  readonly store: PersonaStore
  readonly now: () => string
  readonly #listeners = new Set<(event: StoredEvent) => void>()

  /**
   * @param store - Open store.
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * Get or create the stream for `(project, kind, owner)`.
   * @param input - Stream identity.
   * @returns The stream.
   */
  ensureStream(input: {
    workspaceId: string
    projectId: string
    kind: StreamKind
    ownerId: string
  }): StreamRecord {
    const existing = this.findStream(input.projectId, input.kind, input.ownerId)
    if (existing !== undefined) return existing
    const id = `${input.kind}:${input.ownerId}`
    const createdAt = this.now()
    this.store.tx((db) => {
      run(db, 'INSERT INTO stream (id, workspace_id, project_id, kind, owner_id, created_at) VALUES (?, ?, ?, ?, ?, ?) ON CONFLICT(project_id, kind, owner_id) DO NOTHING', [id, input.workspaceId, input.projectId, input.kind, input.ownerId, createdAt])
      const row = db.prepare('SELECT id FROM stream WHERE project_id = ? AND kind = ? AND owner_id = ?').get(input.projectId, input.kind, input.ownerId)
      if (row === undefined) throw new StoreError('not-found', 'stream')
      const streamId = text(row, 'id')
      run(db, 'INSERT INTO stream_cursor (stream_id, last_seq) VALUES (?, 0) ON CONFLICT(stream_id) DO NOTHING', [streamId])
    })
    const created = this.findStream(input.projectId, input.kind, input.ownerId)
    if (created === undefined) throw new StoreError('not-found', 'stream')
    return created
  }

  /**
   * Whether an event id is already stored (idempotent channel posts).
   * @param id - Event id.
   */
  has(id: string): boolean {
    return this.store.db.prepare('SELECT 1 AS ok FROM event WHERE id = ?').get(id) !== undefined
  }

  /**
   * Append one event; seq is last_seq+1 under IMMEDIATE.
   * @param input - Event fields.
   * @returns The stored event.
   */
  append(input: AppendEventInput): StoredEvent {
    if (!/(Z|[+-]\d{2}:\d{2})$/.test(input.occurredAt) || !Number.isFinite(Date.parse(input.occurredAt))) {
      throw new StoreError('invalid-input', 'occurredAt')
    }
    const stream = this.ensureStream({
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: input.streamKind,
      ownerId: input.ownerId,
    })
    const occurredAtUtc = Date.parse(input.occurredAt)
    const stored = this.store.tx((db) => {
      const cursor = db.prepare('SELECT last_seq AS lastSeq FROM stream_cursor WHERE stream_id = ?').get(stream.id)
      if (cursor === undefined) throw new StoreError('not-found', stream.id)
      const seq = integer(cursor, 'lastSeq') + 1
      run(db, 'UPDATE stream_cursor SET last_seq = ? WHERE stream_id = ?', [seq, stream.id])
      run(db, 'INSERT INTO event (id, stream_id, workspace_id, project_id, seq, type, body, actor_id, subject_id, occurred_at, occurred_at_utc, deleted) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)', [
        input.id, stream.id, input.workspaceId, input.projectId, seq, input.type, input.body,
        input.actorId, input.subjectId, input.occurredAt, occurredAtUtc,
      ])
      return {
        id: input.id,
        streamId: stream.id,
        workspaceId: input.workspaceId,
        projectId: input.projectId,
        seq,
        type: input.type,
        body: input.body,
        actorId: input.actorId,
        subjectId: input.subjectId,
        occurredAt: input.occurredAt,
        deleted: false,
      }
    })
    for (const listener of this.#listeners) listener(stored)
    return stored
  }

  /**
   * Subscribe to events committed after this call. Used by the host message stream.
   * @param listener - Synchronous observer; must not throw.
   * @returns Disposer.
   */
  subscribe(listener: (event: StoredEvent) => void): () => void {
    this.#listeners.add(listener)
    return () => {
      this.#listeners.delete(listener)
    }
  }

  /**
   * Page events after `afterSeq`. ACL applied.
   * @param streamId - Stream.
   * @param actor - Reader.
   * @param afterSeq - Exclusive cursor; 0 starts at the beginning.
   * @param limit - Max rows (1–200).
   * @returns Authorized events and the next cursor.
   */
  list(streamId: string, actor: EventActor, afterSeq?: number, limit?: number): EventPage {
    this.assertRead(streamId, actor)
    const start = afterSeq ?? 0
    const cap = clampLimit(limit ?? 50)
    const rows = this.store.db.prepare(
      'SELECT * FROM event WHERE stream_id = ? AND seq > ? AND deleted = 0 ORDER BY seq ASC LIMIT ?',
    ).all(streamId, start, cap)
    const events = rows.map(readEvent)
    return { events, nextSeq: events.at(-1)?.seq ?? start }
  }

  /**
   * FTS5 search restricted to streams the actor may read.
   * @param projectId - Tenant.
   * @param actor - Reader.
   * @param query - User text (matched as a phrase).
   * @param limit - Max rows.
   * @returns Authorized hits, newest first.
   */
  search(projectId: string, actor: EventActor, query: string, limit?: number): StoredEvent[] {
    const allowed = this.readableStreamIds(projectId, actor)
    if (allowed.length === 0 || query.trim() === '') return []
    const cap = clampLimit(limit ?? 50)
    const placeholders = allowed.map(() => '?').join(', ')
    const rows = this.store.db.prepare(
      `SELECT event.* FROM event JOIN event_fts ON event.rowid = event_fts.rowid WHERE event.deleted = 0 AND event.stream_id IN (${placeholders}) AND event_fts MATCH ? ORDER BY event.occurred_at_utc DESC, event.id DESC LIMIT ?`,
    ).all(...allowed, phrase(query), cap)
    return rows.map(readEvent)
  }

  /**
   * Recall by subject and a civil interval in `timeZone`.
   * @param input - Stream, subject, optional local bounds, cursor, actor.
   * @returns Authorized events in seq order and the next cursor.
   */
  recall(input: {
    streamId: string
    actor: EventActor
    subjectId: string
    timeZone: string
    since?: string
    until?: string
    afterSeq?: number
    limit?: number
  }): EventPage {
    this.assertRead(input.streamId, input.actor)
    const afterSeq = input.afterSeq ?? 0
    const cap = clampLimit(input.limit ?? 50)
    const from = input.since === undefined ? 0 : zonedUtcMs(input.since, input.timeZone, 'start')
    const to = input.until === undefined ? Number.MAX_SAFE_INTEGER : zonedUtcMs(input.until, input.timeZone, 'end')
    if (from > to) throw new StoreError('invalid-input', 'range')
    const rows = this.store.db.prepare(
      'SELECT * FROM event WHERE stream_id = ? AND seq > ? AND deleted = 0 AND subject_id = ? AND occurred_at_utc >= ? AND occurred_at_utc <= ? ORDER BY seq ASC LIMIT ?',
    ).all(input.streamId, afterSeq, input.subjectId, from, to, cap)
    const events = rows.map(readEvent)
    return { events, nextSeq: events.at(-1)?.seq ?? afterSeq }
  }

  /**
   * Soft-delete one event (FTS follows the update trigger).
   * @param id - Event id.
   */
  tombstone(id: string): void {
    this.store.tx((db) => {
      run(db, 'UPDATE event SET deleted = 1, body = \'\' WHERE id = ?', [id])
    })
  }

  private findStream(projectId: string, kind: StreamKind, ownerId: string): StreamRecord | undefined {
    const row = this.store.db.prepare(
      'SELECT id, workspace_id AS workspaceId, project_id AS projectId, kind, owner_id AS ownerId, created_at AS createdAt FROM stream WHERE project_id = ? AND kind = ? AND owner_id = ?',
    ).get(projectId, kind, ownerId)
    return row === undefined ? undefined : readStream(row)
  }

  private assertRead(streamId: string, actor: EventActor): void {
    if (!this.canRead(streamId, actor)) throw new StoreError('forbidden', streamId)
  }

  private canRead(streamId: string, actor: EventActor): boolean {
    const stream = this.getStream(streamId)
    if (stream === undefined) return false
    if (stream.kind === 'dm') {
      const dm = this.store.db.prepare(
        'SELECT participant_a AS a, participant_b AS b FROM dm WHERE id = ?',
      ).get(stream.ownerId)
      if (dm === undefined) return false
      return text(dm, 'a') === actor.id || text(dm, 'b') === actor.id
    }
    if (this.isWorkspaceMember(stream.workspaceId, actor.id)) return true
    if (stream.kind === 'channel') {
      const row = this.store.db.prepare(
        'SELECT 1 AS ok FROM participation WHERE persona_id = ? AND kind = \'channel\' AND target_id = ?',
      ).get(actor.id, stream.ownerId)
      return row !== undefined
    }
    return false
  }

  private readableStreamIds(projectId: string, actor: EventActor): string[] {
    const streams = this.store.db.prepare(
      'SELECT id, workspace_id AS workspaceId, project_id AS projectId, kind, owner_id AS ownerId, created_at AS createdAt FROM stream WHERE project_id = ?',
    ).all(projectId)
    return streams.map(readStream).filter(stream => this.canRead(stream.id, actor)).map(stream => stream.id)
  }

  private getStream(id: string): StreamRecord | undefined {
    const row = this.store.db.prepare(
      'SELECT id, workspace_id AS workspaceId, project_id AS projectId, kind, owner_id AS ownerId, created_at AS createdAt FROM stream WHERE id = ?',
    ).get(id)
    return row === undefined ? undefined : readStream(row)
  }

  private isWorkspaceMember(workspaceId: string, actorId: string): boolean {
    const member = this.store.db.prepare('SELECT 1 AS ok FROM member WHERE workspace_id = ? AND id = ?').get(workspaceId, actorId)
    return member !== undefined
  }
}

function clampLimit(limit: number): number {
  if (!Number.isInteger(limit) || limit < 1 || limit > 200) throw new StoreError('invalid-input', 'limit')
  return limit
}

function phrase(query: string): string {
  return `"${query.replaceAll('"', '""')}"`
}

function readStream(row: Record<string, SQLOutputValue>): StreamRecord {
  const kind = text(row, 'kind')
  if (kind !== 'channel' && kind !== 'dm' && kind !== 'thread' && kind !== 'routine') {
    throw new StoreError('constraint', 'kind')
  }
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    projectId: text(row, 'projectId'),
    kind,
    ownerId: text(row, 'ownerId'),
    createdAt: text(row, 'createdAt'),
  }
}

function readEvent(row: Record<string, SQLOutputValue>): StoredEvent {
  return {
    id: text(row, 'id'),
    streamId: text(row, 'stream_id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    seq: integer(row, 'seq'),
    type: text(row, 'type'),
    body: text(row, 'body'),
    actorId: text(row, 'actor_id'),
    subjectId: text(row, 'subject_id'),
    occurredAt: text(row, 'occurred_at'),
    deleted: integer(row, 'deleted') === 1,
  }
}
