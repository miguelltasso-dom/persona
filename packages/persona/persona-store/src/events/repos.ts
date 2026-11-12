/**
 * Per-stream event log: monotonic seq, FTS5 search, ACL, zoned recall.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, optionalText, run, text } from '../sql.ts'
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
  readonly replyToId?: string
  readonly editedAt?: string
  readonly topicId?: string
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
  readonly replyToId?: string
  readonly topicId?: string
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
  readonly #changeListeners = new Set<(event: StoredEvent) => void>()

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
   * Which project a conversation belongs to (`undefined` when the stream does not exist yet).
   * @param streamId - `<kind>:<ownerId>`.
   */
  streamProjectOf(streamId: string): string | undefined {
    return this.getStream(streamId)?.projectId
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
      run(db, 'INSERT INTO event (id, stream_id, workspace_id, project_id, seq, type, body, actor_id, subject_id, occurred_at, occurred_at_utc, deleted, reply_to_id, edited_at, topic_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, ?, NULL, ?)', [
        input.id, stream.id, input.workspaceId, input.projectId, seq, input.type, input.body,
        input.actorId, input.subjectId, input.occurredAt, occurredAtUtc, input.replyToId ?? null,
        input.topicId ?? null,
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
        ...(input.replyToId === undefined || input.replyToId === '' ? {} : { replyToId: input.replyToId }),
        ...(input.topicId === undefined || input.topicId === '' ? {} : { topicId: input.topicId }),
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
   * Page events after `afterSeq`. ACL applied. Missing stream → empty page
   * (a channel with zero messages is not `forbidden`).
   * @param streamId - Stream.
   * @param actor - Reader.
   * @param afterSeq - Exclusive cursor; 0 starts at the beginning.
   * @param limit - Max rows (1–200).
   * @returns Authorized events and the next cursor.
   */
  list(streamId: string, actor: EventActor, afterSeq?: number, limit?: number): EventPage {
    const start = afterSeq ?? 0
    const cap = clampLimit(limit ?? 50)
    if (this.getStream(streamId) === undefined) return { events: [], nextSeq: start }
    this.assertRead(streamId, actor)
    const rows = this.store.db.prepare(
      'SELECT * FROM event WHERE stream_id = ? AND seq > ? AND deleted = 0 ORDER BY seq ASC LIMIT ?',
    ).all(streamId, start, cap)
    const events = rows.map(readEvent)
    return { events, nextSeq: events.at(-1)?.seq ?? start }
  }

  /**
   * Page events of one topic after `afterSeq`.
   * @param streamId - Stream.
   * @param actor - Reader.
   * @param topicId - Topic.
   * @param afterSeq - Exclusive cursor.
   * @param limit - Max rows.
   */
  listTopic(
    streamId: string,
    actor: EventActor,
    topicId: string,
    afterSeq?: number,
    limit?: number,
  ): EventPage {
    const start = afterSeq ?? 0
    const cap = clampLimit(limit ?? 50)
    if (this.getStream(streamId) === undefined) return { events: [], nextSeq: start }
    this.assertRead(streamId, actor)
    const rows = this.store.db.prepare(
      'SELECT * FROM event WHERE stream_id = ? AND topic_id = ? AND seq > ? AND deleted = 0 ORDER BY seq ASC LIMIT ?',
    ).all(streamId, topicId, start, cap)
    const events = rows.map(readEvent)
    return { events, nextSeq: events.at(-1)?.seq ?? start }
  }

  /**
   * All live events in a project, oldest first. Host-internal after ACL.
   * @param projectId - Tenant.
   */
  listProject(projectId: string): StoredEvent[] {
    const rows = this.store.db.prepare(
      'SELECT * FROM event WHERE project_id = ? AND deleted = 0 ORDER BY occurred_at_utc ASC, seq ASC',
    ).all(projectId)
    return rows.map(readEvent)
  }

  /**
   * FTS5 search restricted to streams the actor may read.
   * @param projectId - Tenant.
   * @param actor - Reader.
   * @param query - User text (matched as a phrase).
   * @param limit - Max rows.
   * @returns Authorized hits, newest first.
   */
  search(projectId: string, actor: EventActor, query: string, limit?: number, topicId?: string): StoredEvent[] {
    const allowed = this.readableStreamIds(projectId, actor)
    if (allowed.length === 0 || query.trim() === '') return []
    const cap = clampLimit(limit ?? 50)
    const placeholders = allowed.map(() => '?').join(', ')
    const topicClause = topicId === undefined || topicId === '' ? '' : ' AND event.topic_id = ?'
    const params: Array<string | number> = [...allowed, phrase(query)]
    if (topicId !== undefined && topicId !== '') params.push(topicId)
    params.push(cap)
    const rows = this.store.db.prepare(
      `SELECT event.* FROM event JOIN event_fts ON event.rowid = event_fts.rowid WHERE event.deleted = 0 AND event.stream_id IN (${placeholders}) AND event_fts MATCH ?${topicClause} ORDER BY event.occurred_at_utc DESC, event.id DESC LIMIT ?`,
    ).all(...params)
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
    topicId?: string
  }): EventPage {
    const afterSeq = input.afterSeq ?? 0
    const cap = clampLimit(input.limit ?? 50)
    if (this.getStream(input.streamId) === undefined) return { events: [], nextSeq: afterSeq }
    this.assertRead(input.streamId, input.actor)
    const from = input.since === undefined ? 0 : zonedUtcMs(input.since, input.timeZone, 'start')
    const to = input.until === undefined ? Number.MAX_SAFE_INTEGER : zonedUtcMs(input.until, input.timeZone, 'end')
    if (from > to) throw new StoreError('invalid-input', 'range')
    const topicClause = input.topicId === undefined || input.topicId === '' ? '' : ' AND topic_id = ?'
    const params: Array<string | number> = [input.streamId, afterSeq, input.subjectId, from, to]
    if (input.topicId !== undefined && input.topicId !== '') params.push(input.topicId)
    params.push(cap)
    const rows = this.store.db.prepare(
      `SELECT * FROM event WHERE stream_id = ? AND seq > ? AND deleted = 0 AND subject_id = ? AND occurred_at_utc >= ? AND occurred_at_utc <= ?${topicClause} ORDER BY seq ASC LIMIT ?`,
    ).all(...params)
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

  /**
   * Subscribe to events whose body or type changed after they were appended (a reply that is still being written).
   * The listener gets the event as it is now.
   * @param listener - Synchronous observer; must not throw.
   * @returns Disposer.
   */
  subscribeChanges(listener: (event: StoredEvent) => void): () => void {
    this.#changeListeners.add(listener)
    return () => {
      this.#changeListeners.delete(listener)
    }
  }

  /**
   * Streaming: grow the body of a reply that is still being written. It is not an edit by a person, so `edited_at` stays
   * empty. Followers of the stream are told.
   * @param id - Event (type `partial`).
   * @param body - Text so far.
   * @returns false when the event is missing, deleted or no longer `partial`.
   */
  updatePartial(id: string, body: string): boolean {
    const changed = this.store.tx(db => db.prepare("UPDATE event SET body = ? WHERE id = ? AND deleted = 0 AND type = 'partial'").run(body, id).changes)
    return this.announce(Number(changed) > 0, id)
  }

  /**
   * Streaming: the reply is written. Sets its final body and type (it is no longer `partial`). Idempotent: a reply that
   * already settled is left alone.
   * @param id - Event (type `partial`).
   * @param body - Final text.
   * @param type - Final type (`message` or `runner`).
   * @returns false when there was nothing partial to settle.
   */
  settlePartial(id: string, body: string, type: string): boolean {
    const changed = this.store.tx(db => db.prepare("UPDATE event SET body = ?, type = ? WHERE id = ? AND deleted = 0 AND type = 'partial'").run(body, type, id).changes)
    return this.announce(Number(changed) > 0, id)
  }

  /**
   * Tell the followers of the stream that a message CHANGED without its stored body changing (a card whose state is computed when it is read):
   * they get the same message again, as an upsert of the same id.
   * @param id - Event.
   * @returns false when the event is missing.
   */
  touch(id: string): boolean {
    return this.announce(true, id)
  }

  private announce(changed: boolean, id: string): boolean {
    if (!changed) return false
    const event = this.get(id)
    if (event !== undefined) for (const listener of this.#changeListeners) listener(event)
    return true
  }

  /**
   * Replace the body and stamp `edited_at`.
   * @param id - Event.
   * @param body - New text.
   * @param editedAt - Instant.
   */
  edit(id: string, body: string, editedAt: string): void {
    this.store.tx((db) => {
      run(db, 'UPDATE event SET body = ?, edited_at = ? WHERE id = ? AND deleted = 0', [body, editedAt, id])
    })
  }

  /**
   * @param id - Event.
   */
  get(id: string): StoredEvent | undefined {
    const row = this.store.db.prepare('SELECT * FROM event WHERE id = ?').get(id)
    return row === undefined ? undefined : readEvent(row)
  }

  /**
   * Add a sticker reaction (idempotent). Followers of the stream are told when the reaction is new, so a reaction made
   * outside a request (a persona reacting on its own) shows up live instead of only after a reload.
   * @param input - Event, actor, sticker.
   */
  addReaction(input: { eventId: string; actorId: string; stickerId: string; projectId: string }): void {
    const changed = this.store.tx(db => db.prepare(`INSERT INTO event_reaction (event_id, actor_id, sticker_id, project_id, created_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(event_id, actor_id, sticker_id) DO NOTHING`).run(
      input.eventId, input.actorId, input.stickerId, input.projectId, this.now(),
    ).changes)
    this.announce(Number(changed) > 0, input.eventId)
  }

  /**
   * Remove a sticker reaction; followers are told when a reaction was actually removed.
   * @param input - Event, actor, sticker.
   */
  removeReaction(input: { eventId: string; actorId: string; stickerId: string }): void {
    const changed = this.store.tx(db => db.prepare('DELETE FROM event_reaction WHERE event_id = ? AND actor_id = ? AND sticker_id = ?').run(
      input.eventId, input.actorId, input.stickerId,
    ).changes)
    this.announce(Number(changed) > 0, input.eventId)
  }

  /**
   * @param eventId - Event.
   */
  listReactions(eventId: string): Array<{ stickerId: string; actorId: string }> {
    return this.store.db.prepare(
      'SELECT sticker_id AS stickerId, actor_id AS actorId FROM event_reaction WHERE event_id = ? ORDER BY created_at ASC',
    ).all(eventId).map(row => ({ stickerId: text(row, 'stickerId'), actorId: text(row, 'actorId') }))
  }

  /**
   * Pin a message on its stream.
   * @param input - Pin.
   */
  pin(input: { streamId: string; eventId: string; projectId: string; pinnedBy: string }): void {
    this.store.tx((db) => {
      run(db, `INSERT INTO stream_pin (stream_id, event_id, project_id, pinned_by, pinned_at)
        VALUES (?, ?, ?, ?, ?) ON CONFLICT(stream_id, event_id) DO UPDATE SET pinned_by = excluded.pinned_by, pinned_at = excluded.pinned_at`, [
        input.streamId, input.eventId, input.projectId, input.pinnedBy, this.now(),
      ])
    })
  }

  /**
   * @param streamId - Stream.
   * @param eventId - Event.
   */
  unpin(streamId: string, eventId: string): void {
    this.store.tx((db) => {
      run(db, 'DELETE FROM stream_pin WHERE stream_id = ? AND event_id = ?', [streamId, eventId])
    })
  }

  /**
   * @param streamId - Stream.
   */
  listPins(streamId: string): string[] {
    return this.store.db.prepare(
      'SELECT event_id AS eventId FROM stream_pin WHERE stream_id = ? ORDER BY pinned_at DESC',
    ).all(streamId).map(row => text(row, 'eventId'))
  }

  /**
   * @param eventId - Event.
   */
  isPinned(eventId: string): boolean {
    return this.store.db.prepare('SELECT 1 AS ok FROM stream_pin WHERE event_id = ?').get(eventId) !== undefined
  }

  /**
   * @param input - Audit row.
   */
  addAudit(input: { id: string; eventId: string; projectId: string; actorId: string; action: string; detail: string }): void {
    this.store.tx((db) => {
      run(db, 'INSERT INTO event_audit (id, event_id, project_id, actor_id, action, at, detail) VALUES (?, ?, ?, ?, ?, ?, ?)', [
        input.id, input.eventId, input.projectId, input.actorId, input.action, this.now(), input.detail,
      ])
    })
  }

  /**
   * @param eventId - Event.
   */
  listAudit(eventId: string): Array<{ id: string; actorId: string; action: string; at: string; detail: string }> {
    return this.store.db.prepare(
      'SELECT id, actor_id AS actorId, action, at, detail FROM event_audit WHERE event_id = ? ORDER BY at DESC',
    ).all(eventId).map(row => ({
      id: text(row, 'id'),
      actorId: text(row, 'actorId'),
      action: text(row, 'action'),
      at: text(row, 'at'),
      detail: text(row, 'detail'),
    }))
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
  const replyToId = optionalText(row, 'reply_to_id')
  const editedAt = optionalText(row, 'edited_at')
  const topicId = optionalText(row, 'topic_id')
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
    ...(replyToId === undefined || replyToId === '' ? {} : { replyToId }),
    ...(editedAt === undefined || editedAt === '' ? {} : { editedAt }),
    ...(topicId === undefined || topicId === '' ? {} : { topicId }),
  }
}
