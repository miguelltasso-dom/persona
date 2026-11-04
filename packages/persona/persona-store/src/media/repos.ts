/**
 * Attachment and avatar blob metadata (schema ≥ 9).
 */

import type { SQLOutputValue } from 'node:sqlite'
import { integer, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** One stored upload row. */
export interface StoredAttachment {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly messageId?: string
  readonly hash: string
  readonly name: string
  readonly mime: string
  readonly bytes: number
  readonly credentialWarning: boolean
  readonly createdAt: string
}

/** One content-addressed blob. */
export interface StoredBlob {
  readonly hash: string
  readonly bytes: number
  readonly mime: string
  readonly kind: 'attachment' | 'avatar'
  readonly createdAt: string
}

/** Insert one attachment (blob must already exist). */
export interface InsertAttachmentInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly streamKind: 'channel' | 'dm'
  readonly ownerId: string
  readonly hash: string
  readonly name: string
  readonly credentialWarning: boolean
  readonly createdAt: string
}

/**
 * SQLite attachment rows and blob_object ledger.
 */
export class SqliteMediaRepos {
  readonly store: PersonaStore

  /**
   * @param store - Open store (schema ≥ 9).
   */
  constructor(store: PersonaStore) {
    this.store = store
  }

  /**
   * @param blob - Content-addressed object.
   */
  putBlob(blob: StoredBlob): void {
    run(
      this.store.db,
      `INSERT INTO blob_object (hash, bytes, mime, kind, created_at)
       VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(hash) DO NOTHING`,
      [blob.hash, blob.bytes, blob.mime, blob.kind, blob.createdAt],
    )
  }

  /**
   * @param hash - SHA-256 hex.
   */
  getBlob(hash: string): StoredBlob | undefined {
    const row = this.store.db.prepare(
      'SELECT hash, bytes, mime, kind, created_at AS createdAt FROM blob_object WHERE hash = ?',
    ).get(hash)
    return row === undefined ? undefined : readBlob(row)
  }

  /**
   * @param hash - SHA-256 hex.
   */
  deleteBlob(hash: string): void {
    run(this.store.db, 'DELETE FROM blob_object WHERE hash = ?', [hash])
  }

  /**
   * @param hash - SHA-256 hex.
   * @returns How many attachment rows still point at the blob.
   */
  attachmentRefs(hash: string): number {
    const row = this.store.db.prepare(
      'SELECT COUNT(*) AS n FROM attachment WHERE hash = ?',
    ).get(hash)
    return row === undefined ? 0 : integer(row, 'n')
  }

  /**
   * Sum of unique attachment blob sizes in a project.
   * @param projectId - Tenant.
   */
  projectBytes(projectId: string): number {
    const row = this.store.db.prepare(
      `SELECT COALESCE(SUM(b.bytes), 0) AS n
         FROM blob_object b
        WHERE b.hash IN (SELECT DISTINCT hash FROM attachment WHERE project_id = ?)`,
    ).get(projectId)
    return row === undefined ? 0 : integer(row, 'n')
  }

  /**
   * @param input - New attachment (message unbound).
   */
  insert(input: InsertAttachmentInput): StoredAttachment {
    const blob = this.getBlob(input.hash)
    if (blob === undefined) throw new Error('blob-not-found')
    this.store.tx((db) => {
      run(
        db,
        `INSERT INTO attachment
          (id, workspace_id, project_id, stream_kind, owner_id, message_id, hash, name, credential_warning, created_at)
         VALUES (?, ?, ?, ?, ?, NULL, ?, ?, ?, ?)`,
        [
          input.id, input.workspaceId, input.projectId, input.streamKind, input.ownerId,
          input.hash, input.name, input.credentialWarning ? 1 : 0, input.createdAt,
        ],
      )
    })
    const stored = this.get(input.id)
    if (stored === undefined) throw new Error('attachment-not-found')
    return stored
  }

  /**
   * Bind uploaded files to a posted message.
   * @param messageId - Event id.
   * @param ids - Attachment ids.
   */
  bind(messageId: string, ids: readonly string[]): void {
    if (ids.length === 0) return
    this.store.tx((db) => {
      for (const id of ids) {
        run(db, 'UPDATE attachment SET message_id = ? WHERE id = ? AND message_id IS NULL', [messageId, id])
      }
    })
  }

  /**
   * @param id - Attachment id.
   */
  get(id: string): StoredAttachment | undefined {
    const row = this.store.db.prepare(
      `SELECT a.id, a.workspace_id AS workspaceId, a.project_id AS projectId,
              a.stream_kind AS streamKind, a.owner_id AS ownerId, a.message_id AS messageId,
              a.hash, a.name, a.credential_warning AS credentialWarning, a.created_at AS createdAt,
              b.mime, b.bytes
         FROM attachment a JOIN blob_object b ON b.hash = a.hash
        WHERE a.id = ?`,
    ).get(id)
    return row === undefined ? undefined : readAttachment(row)
  }

  /**
   * @param messageId - Event id.
   */
  listByMessage(messageId: string): StoredAttachment[] {
    return this.store.db.prepare(
      `SELECT a.id, a.workspace_id AS workspaceId, a.project_id AS projectId,
              a.stream_kind AS streamKind, a.owner_id AS ownerId, a.message_id AS messageId,
              a.hash, a.name, a.credential_warning AS credentialWarning, a.created_at AS createdAt,
              b.mime, b.bytes
         FROM attachment a JOIN blob_object b ON b.hash = a.hash
        WHERE a.message_id = ?
        ORDER BY a.created_at ASC, a.id ASC`,
    ).all(messageId).map(readAttachment)
  }

  /**
   * @param projectId - Tenant.
   * @param streamKind - Channel or DM.
   * @param ownerId - Stream owner.
   */
  listByStream(projectId: string, streamKind: 'channel' | 'dm', ownerId: string): StoredAttachment[] {
    return this.store.db.prepare(
      `SELECT a.id, a.workspace_id AS workspaceId, a.project_id AS projectId,
              a.stream_kind AS streamKind, a.owner_id AS ownerId, a.message_id AS messageId,
              a.hash, a.name, a.credential_warning AS credentialWarning, a.created_at AS createdAt,
              b.mime, b.bytes
         FROM attachment a JOIN blob_object b ON b.hash = a.hash
        WHERE a.project_id = ? AND a.stream_kind = ? AND a.owner_id = ?
        ORDER BY a.created_at ASC, a.id ASC`,
    ).all(projectId, streamKind, ownerId).map(readAttachment)
  }
}

function readBlob(row: Record<string, SQLOutputValue>): StoredBlob {
  const kind = text(row, 'kind')
  if (kind !== 'attachment' && kind !== 'avatar') throw new Error('blob-kind')
  return {
    hash: text(row, 'hash'),
    bytes: integer(row, 'bytes'),
    mime: text(row, 'mime'),
    kind,
    createdAt: text(row, 'createdAt'),
  }
}

function readAttachment(row: Record<string, SQLOutputValue>): StoredAttachment {
  const streamKind = text(row, 'streamKind')
  if (streamKind !== 'channel' && streamKind !== 'dm') throw new Error('stream-kind')
  const messageId = optionalText(row, 'messageId')
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspaceId'),
    projectId: text(row, 'projectId'),
    streamKind,
    ownerId: text(row, 'ownerId'),
    ...(messageId === undefined ? {} : { messageId }),
    hash: text(row, 'hash'),
    name: text(row, 'name'),
    mime: text(row, 'mime'),
    bytes: integer(row, 'bytes'),
    credentialWarning: integer(row, 'credentialWarning') === 1,
    createdAt: text(row, 'createdAt'),
  }
}
