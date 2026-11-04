/**
 * Colored conversation topics (WAVE2 §1). Seven colors per channel/DM.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** One topic on a channel or DM. */
export interface ConversationTopic {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly colorIndex: number
  readonly name: string
  readonly archived: boolean
  readonly createdAt: string
}

/** Default names for the seven Maestri colors. */
export const DEFAULT_TOPIC_NAMES: readonly string[] = [
  'Geral', 'UI', 'Funcionalidades', 'Financeiro', 'Pessoas', 'Operação', 'Arquivo',
]

/**
 * Persist topics and unread cursors for one conversation.
 */
export class TopicRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 14).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * Ensure the seven default topics exist. Idempotent.
   * @param input - Conversation identity.
   */
  ensureDefaults(input: {
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
  }): ConversationTopic[] {
    const existing = this.list(input.projectId, input.streamKind, input.ownerId)
    if (existing.length >= 7) return existing
    const used = new Set(existing.map(item => item.colorIndex))
    const now = this.now()
    this.store.tx((db) => {
      for (let color = 0; color <= 6; color += 1) {
        if (used.has(color)) continue
        const id = `${input.streamKind}:${input.ownerId}:t${String(color)}`
        run(db, 'INSERT INTO conversation_topic (id, workspace_id, project_id, stream_kind, owner_id, color_index, name, archived, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?) ON CONFLICT(id) DO NOTHING', [
          id, input.workspaceId, input.projectId, input.streamKind, input.ownerId, color,
          DEFAULT_TOPIC_NAMES[color] ?? `Assunto ${String(color + 1)}`, now,
        ])
      }
    })
    return this.list(input.projectId, input.streamKind, input.ownerId)
  }

  /**
   * @param projectId - Tenant.
   * @param streamKind - Channel or DM.
   * @param ownerId - Conversation owner.
   * @param includeArchived - When true, archived stay in the list.
   */
  list(
    projectId: string,
    streamKind: 'channel' | 'dm',
    ownerId: string,
    includeArchived: boolean = false,
  ): ConversationTopic[] {
    const rows = this.store.db.prepare(
      includeArchived
        ? 'SELECT * FROM conversation_topic WHERE project_id = ? AND stream_kind = ? AND owner_id = ? ORDER BY color_index ASC'
        : 'SELECT * FROM conversation_topic WHERE project_id = ? AND stream_kind = ? AND owner_id = ? AND archived = 0 ORDER BY color_index ASC',
    ).all(projectId, streamKind, ownerId)
    return rows.map(topicFrom)
  }

  /**
   * @param id - Topic.
   */
  get(id: string): ConversationTopic | undefined {
    const row = this.store.db.prepare('SELECT * FROM conversation_topic WHERE id = ?').get(id)
    return row === undefined ? undefined : topicFrom(row)
  }

  /**
   * Create one extra topic on a free color, or reuse an archived slot.
   * @param input - Topic fields.
   */
  create(input: {
    id: string
    workspaceId: string
    projectId: string
    streamKind: 'channel' | 'dm'
    ownerId: string
    colorIndex: number
    name: string
  }): ConversationTopic {
    if (!Number.isInteger(input.colorIndex) || input.colorIndex < 0 || input.colorIndex > 6) {
      throw new StoreError('invalid-input', 'colorIndex')
    }
    const name = input.name.trim()
    if (name === '') throw new StoreError('invalid-input', 'name')
    const now = this.now()
    this.store.tx((db) => {
      run(db, 'INSERT INTO conversation_topic (id, workspace_id, project_id, stream_kind, owner_id, color_index, name, archived, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)', [
        input.id, input.workspaceId, input.projectId, input.streamKind, input.ownerId,
        input.colorIndex, name, now,
      ])
    })
    const created = this.get(input.id)
    if (created === undefined) throw new StoreError('not-found', input.id)
    return created
  }

  /**
   * @param id - Topic.
   * @param name - New name (never color-only).
   */
  rename(id: string, name: string): ConversationTopic {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const next = name.trim()
    if (next === '') throw new StoreError('invalid-input', 'name')
    this.store.tx((db) => {
      run(db, 'UPDATE conversation_topic SET name = ? WHERE id = ?', [next, id])
    })
    return { ...current, name: next }
  }

  /**
   * @param id - Topic.
   * @param archived - Archive flag.
   */
  archive(id: string, archived: boolean): ConversationTopic {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    this.store.tx((db) => {
      run(db, 'UPDATE conversation_topic SET archived = ? WHERE id = ?', [archived ? 1 : 0, id])
    })
    return { ...current, archived }
  }

  /**
   * Move a message onto another topic of the same conversation.
   * @param eventId - Message.
   * @param topicId - Destination.
   */
  moveEvent(eventId: string, topicId: string): void {
    const topic = this.get(topicId)
    if (topic === undefined) throw new StoreError('not-found', topicId)
    const event = this.store.db.prepare('SELECT stream_id AS streamId FROM event WHERE id = ?').get(eventId)
    if (event === undefined) throw new StoreError('not-found', eventId)
    const expected = `${topic.streamKind}:${topic.ownerId}`
    if (text(event, 'streamId') !== expected) throw new StoreError('constraint', 'topic-stream')
    this.store.tx((db) => {
      run(db, 'UPDATE event SET topic_id = ? WHERE id = ?', [topicId, eventId])
    })
  }

  /**
   * Unread count for one actor (seq after last read).
   * @param topicId - Topic.
   * @param actorId - Reader.
   */
  unreadCount(topicId: string, actorId: string): number {
    const topic = this.get(topicId)
    if (topic === undefined) throw new StoreError('not-found', topicId)
    const read = this.store.db.prepare(
      'SELECT last_seq AS lastSeq FROM topic_read WHERE topic_id = ? AND actor_id = ?',
    ).get(topicId, actorId)
    const after = read === undefined ? 0 : integer(read, 'lastSeq')
    const row = this.store.db.prepare(
      'SELECT COUNT(*) AS n FROM event WHERE stream_id = ? AND deleted = 0 AND topic_id = ? AND seq > ?',
    ).get(`${topic.streamKind}:${topic.ownerId}`, topicId, after)
    return row === undefined ? 0 : integer(row, 'n')
  }

  /**
   * Mark a topic read up to `seq`.
   * @param topicId - Topic.
   * @param actorId - Reader.
   * @param seq - Last seen seq.
   */
  markRead(topicId: string, actorId: string, seq: number): void {
    if (!Number.isInteger(seq) || seq < 0) throw new StoreError('invalid-input', 'seq')
    this.store.tx((db) => {
      run(db, 'INSERT INTO topic_read (topic_id, actor_id, last_seq) VALUES (?, ?, ?) ON CONFLICT(topic_id, actor_id) DO UPDATE SET last_seq = MAX(topic_read.last_seq, excluded.last_seq)', [
        topicId, actorId, seq,
      ])
    })
  }
}

function topicFrom(row: Record<string, SQLOutputValue>): ConversationTopic {
  const streamKind = text(row, 'stream_kind')
  if (streamKind !== 'channel' && streamKind !== 'dm') throw new StoreError('constraint', 'stream_kind')
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    streamKind,
    ownerId: text(row, 'owner_id'),
    colorIndex: integer(row, 'color_index'),
    name: text(row, 'name'),
    archived: integer(row, 'archived') === 1,
    createdAt: text(row, 'created_at'),
  }
}
