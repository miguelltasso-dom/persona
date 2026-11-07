/**
 * CV-6 (contracts/team-channels.md): what a channel is beyond `{id, name, topic}` — its KIND (the automatic #geral, a team's channel, the
 * #diretoria, or one the person made), where it came from (`source_id`: the sector of a team channel), whether it is archived and why,
 * whether the person renamed it (then the organogram does not rename it back), who is in a channel the person made, and who pinned what.
 *
 * DRAFT — written during the host freeze (Keel, 05/11 03:58): NOT yet under persona-store/src. It goes there with migration v24
 * (`V24_TEAM_CHANNELS` in migrations.ts) when the second host window opens.
 */

import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

export type ChannelKind = 'general' | 'team' | 'directorate' | 'custom'
export type ArchiveReason = 'team-gone' | 'directorate-gone' | 'by-person'

/** A channel with the CV-6 columns. */
export interface TeamChannel {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly name: string
  readonly topic: string
  readonly createdAt: string
  readonly kind: ChannelKind
  /** `team`: the id of the sector. */
  readonly sourceId?: string
  readonly archivedAt?: string
  readonly archivedReason?: ArchiveReason
  /** The person renamed it: the organogram never renames it back. */
  readonly nameLocked: boolean
}

/** A member the person put in a channel of their own (team/directorate channels derive theirs from the organogram). */
export interface ChannelMember {
  readonly kind: 'persona' | 'human'
  readonly id: string
}

const SELECT = `SELECT id, workspace_id AS workspaceId, project_id AS projectId, name, topic, created_at AS createdAt, kind,
  source_id AS sourceId, archived_at AS archivedAt, archived_reason AS archivedReason, name_locked AS nameLocked FROM channel`

export class ChannelRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 24).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /** @param id - Channel id. @returns The channel, archived or not. */
  get(id: string): TeamChannel | undefined {
    const row = this.store.db.prepare(`${SELECT} WHERE id = ?`).get(id)
    return row === undefined ? undefined : read(row)
  }

  /** @param projectId - Tenant project. @returns Every channel (archived too), newest first; the caller orders for the screen. */
  list(projectId: string): TeamChannel[] {
    return this.store.db.prepare(`${SELECT} WHERE project_id = ? ORDER BY created_at DESC, id DESC`).all(projectId).map(read)
  }

  /** @param projectId - Tenant project. @param sourceId - Sector id. @returns The team channel of that sector in the project. */
  bySource(projectId: string, sourceId: string): TeamChannel | undefined {
    const row = this.store.db.prepare(`${SELECT} WHERE project_id = ? AND source_id = ?`).get(projectId, sourceId)
    return row === undefined ? undefined : read(row)
  }

  /** @param projectId - Tenant project. @param kind - Kind. @returns The channels of that kind. */
  byKind(projectId: string, kind: ChannelKind): TeamChannel[] {
    return this.store.db.prepare(`${SELECT} WHERE project_id = ? AND kind = ? ORDER BY created_at, id`).all(projectId, kind).map(read)
  }

  /**
   * Insert a channel with its kind. A name already taken in the project is a conflict the caller words (`duplicate-name`).
   * @param input - Channel fields.
   * @returns The inserted channel.
   */
  create(input: {
    readonly id: string
    readonly workspaceId: string
    readonly projectId: string
    readonly name: string
    readonly topic?: string
    readonly kind: ChannelKind
    readonly sourceId?: string
  }): TeamChannel {
    if (this.nameTaken(input.projectId, input.name)) throw new StoreError('conflict', 'duplicate-name')
    const createdAt = this.now()
    this.store.tx((db) => {
      run(
        db,
        'INSERT INTO channel (id, workspace_id, project_id, name, topic, created_at, kind, source_id) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
        [input.id, input.workspaceId, input.projectId, input.name, input.topic ?? '', createdAt, input.kind, input.sourceId ?? null],
      )
    })
    return { id: input.id, workspaceId: input.workspaceId, projectId: input.projectId, name: input.name, topic: input.topic ?? '', createdAt, kind: input.kind, ...(input.sourceId === undefined ? {} : { sourceId: input.sourceId }), nameLocked: false }
  }

  /**
   * Rename. `locked` is true when the PERSON renamed it (the organogram will not rename it back).
   * @param id - Channel id.
   * @param name - New name (validated by the caller).
   * @param locked - Whether to lock the name.
   */
  rename(id: string, name: string, locked: boolean): TeamChannel {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    if (current.name === name) return locked && !current.nameLocked ? this.lock(current) : current
    if (this.nameTaken(current.projectId, name, id)) throw new StoreError('conflict', 'duplicate-name')
    this.store.tx((db) => {
      run(db, 'UPDATE channel SET name = ?, name_locked = ? WHERE id = ?', [name, locked ? 1 : current.nameLocked ? 1 : 0, id])
    })
    return { ...current, name, nameLocked: locked || current.nameLocked }
  }

  /**
   * Archive (never delete). Idempotent: archiving an archived channel keeps its first reason and instant.
   * @param id - Channel id.
   * @param reason - Why.
   */
  archive(id: string, reason: ArchiveReason): TeamChannel {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    if (current.archivedAt !== undefined) return current
    const archivedAt = this.now()
    this.store.tx((db) => {
      run(db, 'UPDATE channel SET archived_at = ?, archived_reason = ? WHERE id = ?', [archivedAt, reason, id])
    })
    return { ...current, archivedAt, archivedReason: reason }
  }

  /** @param id - Channel id. @returns The channel, active again (history untouched). */
  unarchive(id: string): TeamChannel {
    const current = this.get(id)
    if (current === undefined) throw new StoreError('not-found', id)
    if (current.archivedAt === undefined) return current
    this.store.tx((db) => {
      run(db, 'UPDATE channel SET archived_at = NULL, archived_reason = NULL WHERE id = ?', [id])
    })
    const { archivedAt: _at, archivedReason: _reason, ...rest } = current
    return rest
  }

  /** @param channelId - Channel. @returns The members the person put in it. */
  members(channelId: string): ChannelMember[] {
    return this.store.db.prepare('SELECT member_kind, member_id FROM channel_member WHERE channel_id = ? ORDER BY member_kind, member_id').all(channelId)
      .map(row => ({ kind: text(row, 'member_kind') === 'human' ? 'human' as const : 'persona' as const, id: text(row, 'member_id') }))
  }

  /**
   * Replace the members of a channel the person made.
   * @param channelId - Channel.
   * @param members - The new list (deduplicated here).
   */
  setMembers(channelId: string, members: readonly ChannelMember[]): void {
    if (this.get(channelId) === undefined) throw new StoreError('not-found', channelId)
    const now = this.now()
    this.store.tx((db) => {
      run(db, 'DELETE FROM channel_member WHERE channel_id = ?', [channelId])
      for (const member of new Map(members.map(item => [`${item.kind}:${item.id}`, item])).values()) {
        run(db, 'INSERT INTO channel_member (channel_id, member_kind, member_id, added_at) VALUES (?, ?, ?, ?)', [channelId, member.kind, member.id, now])
      }
    })
  }

  /** @param memberId - Who asks. @returns The ids of the channels this person pinned. */
  pinnedBy(memberId: string): Set<string> {
    return new Set(this.store.db.prepare('SELECT channel_id FROM channel_pin WHERE member_id = ?').all(memberId).map(row => text(row, 'channel_id')))
  }

  /**
   * Pin or unpin for ONE person (pinning is theirs).
   * @param channelId - Channel.
   * @param memberId - Who pins.
   * @param pinned - On or off.
   */
  setPinned(channelId: string, memberId: string, pinned: boolean): void {
    if (this.get(channelId) === undefined) throw new StoreError('not-found', channelId)
    this.store.tx((db) => {
      if (pinned) run(db, 'INSERT OR IGNORE INTO channel_pin (channel_id, member_id, pinned_at) VALUES (?, ?, ?)', [channelId, memberId, this.now()])
      else run(db, 'DELETE FROM channel_pin WHERE channel_id = ? AND member_id = ?', [channelId, memberId])
    })
  }

  private lock(channel: TeamChannel): TeamChannel {
    this.store.tx((db) => { run(db, 'UPDATE channel SET name_locked = 1 WHERE id = ?', [channel.id]) })
    return { ...channel, nameLocked: true }
  }

  private nameTaken(projectId: string, name: string, exceptId?: string): boolean {
    const row = this.store.db.prepare('SELECT id FROM channel WHERE project_id = ? AND name = ?').get(projectId, name)
    return row !== undefined && text(row, 'id') !== exceptId
  }
}

function read(row: Record<string, SQLOutputValue>): TeamChannel {
  const sourceId = row.sourceId
  const archivedAt = row.archivedAt
  const reason = row.archivedReason
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    projectId: text(row, 'projectId'),
    name: text(row, 'name'),
    topic: text(row, 'topic'),
    createdAt: text(row, 'createdAt'),
    kind: text(row, 'kind') as ChannelKind,
    ...(typeof sourceId === 'string' ? { sourceId } : {}),
    ...(typeof archivedAt === 'string' ? { archivedAt } : {}),
    ...(typeof reason === 'string' ? { archivedReason: reason as ArchiveReason } : {}),
    nameLocked: integer(row, 'nameLocked') === 1,
  }
}
