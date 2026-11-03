/**
 * Company vault: typed records, version history, and FTS5 documents (D-045).
 */

import { parseVaultRecord, type VaultRecord } from '@deepseek-ai/dsh-persona-core'
import type { SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, jsonValue, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Indexed attachment in the vault. */
export interface VaultDocument {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly title: string
  readonly body: string
  readonly visibility: VaultRecord['visibility']
  readonly authorId: string
  readonly createdAt: string
  readonly revision: number
}

/** One historical body for a record or document. */
export interface VaultVersion {
  readonly id: string
  readonly projectId: string
  readonly targetKind: 'record' | 'document'
  readonly targetId: string
  readonly revision: number
  readonly body: string
  readonly authorId: string
  readonly createdAt: string
}

/** New vault record (revision starts at 1). */
export interface CreateVaultRecordInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly kind: VaultRecord['kind']
  readonly body: string
  readonly authorId: string
  readonly visibility: VaultRecord['visibility']
  readonly sourceIds?: readonly string[]
  readonly factKey?: string
}

/** New indexed document. */
export interface CreateVaultDocumentInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly title: string
  readonly body: string
  readonly authorId: string
  readonly visibility: VaultRecord['visibility']
}

/**
 * Persist and query the company vault for one project tenant.
 */
export class VaultRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store.
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * Insert an active record and revision 1.
   * @param input - Record fields.
   * @returns The validated record.
   */
  createRecord(input: CreateVaultRecordInput): VaultRecord {
    const now = this.now()
    const record = parseVaultRecord({
      id: input.id,
      workspaceId: input.workspaceId,
      kind: input.kind,
      body: input.body,
      status: 'active',
      sourceIds: input.sourceIds === undefined ? [] : [...input.sourceIds],
      authorId: input.authorId,
      visibility: input.visibility,
      createdAt: now,
      revision: 1,
      ...(input.factKey === undefined ? {} : { factKey: input.factKey }),
    })
    this.writeRecord(record, input.projectId)
    this.addVersion({
      id: `${record.id}:v1`,
      projectId: input.projectId,
      targetKind: 'record',
      targetId: record.id,
      revision: 1,
      body: record.body,
      authorId: record.authorId,
      createdAt: now,
    })
    return record
  }

  /**
   * @param id - Record id.
   * @returns The record or `undefined`.
   */
  getRecord(id: string): VaultRecord | undefined {
    const row = this.store.db.prepare('SELECT * FROM vault_record WHERE id = ?').get(id)
    return row === undefined ? undefined : recordFrom(row)
  }

  /**
   * @param projectId - Tenant.
   * @returns Active and revoked records, newest first.
   */
  listRecords(projectId: string): VaultRecord[] {
    return this.store.db.prepare(
      'SELECT * FROM vault_record WHERE project_id = ? ORDER BY created_at DESC, id DESC',
    ).all(projectId).map(recordFrom)
  }

  /**
   * Active constraints and decisions (mandatory context).
   * @param projectId - Tenant.
   * @returns Required records, newest first.
   */
  requiredRecords(projectId: string): VaultRecord[] {
    return this.store.db.prepare(
      'SELECT * FROM vault_record WHERE project_id = ? AND status = \'active\' AND kind IN (\'constraint\', \'decision\') ORDER BY created_at DESC, id DESC',
    ).all(projectId).map(recordFrom)
  }

  /**
   * Write a new revision and keep the previous body in `vault_version`.
   * @param id - Record id.
   * @param body - New body.
   * @param authorId - Who edited.
   * @returns The new revision.
   */
  updateRecord(id: string, body: string, authorId: string): VaultRecord {
    const current = this.getRecord(id)
    if (current === undefined) throw new StoreError('not-found', id)
    if (current.status === 'revoked') throw new StoreError('constraint', 'revoked')
    const projectId = this.recordProject(id)
    const revision = current.revision + 1
    const next = parseVaultRecord({ ...current, body, authorId, revision })
    this.writeRecord(next, projectId)
    this.addVersion({
      id: `${id}:v${revision}`,
      projectId,
      targetKind: 'record',
      targetId: id,
      revision,
      body,
      authorId,
      createdAt: this.now(),
    })
    return next
  }

  /**
   * Revoke a record. Derivatives stay in version history.
   * @param id - Record id.
   * @returns The revoked record.
   */
  revokeRecord(id: string): VaultRecord {
    const current = this.getRecord(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const projectId = this.recordProject(id)
    const next = parseVaultRecord({ ...current, status: 'revoked' })
    this.writeRecord(next, projectId)
    return next
  }

  /**
   * Insert a document and revision 1.
   * @param input - Document fields.
   * @returns The document.
   */
  createDocument(input: CreateVaultDocumentInput): VaultDocument {
    const now = this.now()
    const doc: VaultDocument = {
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      title: input.title,
      body: input.body,
      visibility: input.visibility,
      authorId: input.authorId,
      createdAt: now,
      revision: 1,
    }
    this.writeDocument(doc)
    this.addVersion({
      id: `${doc.id}:v1`,
      projectId: doc.projectId,
      targetKind: 'document',
      targetId: doc.id,
      revision: 1,
      body: doc.body,
      authorId: doc.authorId,
      createdAt: now,
    })
    return doc
  }

  /**
   * @param id - Document id.
   * @returns The document or `undefined`.
   */
  getDocument(id: string): VaultDocument | undefined {
    const row = this.store.db.prepare('SELECT * FROM vault_document WHERE id = ?').get(id)
    return row === undefined ? undefined : documentFrom(row)
  }

  /**
   * Replace document body/title and bump revision.
   * @param id - Document id.
   * @param patch - Title and/or body.
   * @param authorId - Who edited.
   * @returns The new revision.
   */
  updateDocument(id: string, patch: { title?: string; body?: string }, authorId: string): VaultDocument {
    const current = this.getDocument(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const revision = current.revision + 1
    const next: VaultDocument = {
      ...current,
      title: patch.title ?? current.title,
      body: patch.body ?? current.body,
      authorId,
      revision,
    }
    this.writeDocument(next)
    this.addVersion({
      id: `${id}:v${revision}`,
      projectId: current.projectId,
      targetKind: 'document',
      targetId: id,
      revision,
      body: next.body,
      authorId,
      createdAt: this.now(),
    })
    return next
  }

  /**
   * FTS5 search over document title and body in one project.
   * @param projectId - Tenant.
   * @param query - User text (phrase).
   * @param limit - Max rows.
   * @returns Hits, newest first.
   */
  searchDocuments(projectId: string, query: string, limit?: number): VaultDocument[] {
    const cap = limit ?? 50
    if (query.trim() === '') return []
    if (!Number.isInteger(cap) || cap < 1 || cap > 200) throw new StoreError('invalid-input', 'limit')
    const rows = this.store.db.prepare(
      'SELECT vault_document.* FROM vault_document JOIN vault_document_fts ON vault_document.rowid = vault_document_fts.rowid WHERE vault_document.project_id = ? AND vault_document_fts MATCH ? ORDER BY vault_document.created_at DESC, vault_document.id DESC LIMIT ?',
    ).all(projectId, `"${query.replaceAll('"', '""')}"`, cap)
    return rows.map(documentFrom)
  }

  /**
   * @param targetKind - Record or document.
   * @param targetId - Target id.
   * @returns Versions, newest first.
   */
  listVersions(targetKind: VaultVersion['targetKind'], targetId: string): VaultVersion[] {
    return this.store.db.prepare(
      'SELECT id, project_id AS projectId, target_kind AS targetKind, target_id AS targetId, revision, body, author_id AS authorId, created_at AS createdAt FROM vault_version WHERE target_kind = ? AND target_id = ? ORDER BY revision DESC',
    ).all(targetKind, targetId).map(versionFrom)
  }

  private recordProject(id: string): string {
    const row = this.store.db.prepare('SELECT project_id AS projectId FROM vault_record WHERE id = ?').get(id)
    if (row === undefined) throw new StoreError('not-found', id)
    return text(row, 'projectId')
  }

  private writeRecord(record: VaultRecord, projectId: string): void {
    this.store.tx((db) => {
      run(db, 'INSERT INTO vault_record (id, workspace_id, project_id, kind, body, fact_key, status, source_ids_json, author_id, visibility_json, created_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET body = excluded.body, fact_key = excluded.fact_key, status = excluded.status, source_ids_json = excluded.source_ids_json, author_id = excluded.author_id, visibility_json = excluded.visibility_json, revision = excluded.revision', [
        record.id, record.workspaceId, projectId, record.kind, record.body,
        record.factKey ?? null, record.status, JSON.stringify(record.sourceIds),
        record.authorId, JSON.stringify(record.visibility), record.createdAt, record.revision,
      ])
    })
  }

  private writeDocument(doc: VaultDocument): void {
    this.store.tx((db) => {
      run(db, 'INSERT INTO vault_document (id, workspace_id, project_id, title, body, visibility_json, author_id, created_at, revision) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body, visibility_json = excluded.visibility_json, author_id = excluded.author_id, revision = excluded.revision', [
        doc.id, doc.workspaceId, doc.projectId, doc.title, doc.body,
        JSON.stringify(doc.visibility), doc.authorId, doc.createdAt, doc.revision,
      ])
    })
  }

  private addVersion(version: VaultVersion): void {
    this.store.tx((db) => {
      run(db, 'INSERT INTO vault_version (id, project_id, target_kind, target_id, revision, body, author_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)', [
        version.id, version.projectId, version.targetKind, version.targetId,
        version.revision, version.body, version.authorId, version.createdAt,
      ])
    })
  }
}

function recordFrom(row: Record<string, SQLOutputValue>): VaultRecord {
  const factKey = optionalText(row, 'fact_key')
  return parseVaultRecord({
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    kind: text(row, 'kind'),
    body: text(row, 'body'),
    status: text(row, 'status'),
    sourceIds: jsonValue(text(row, 'source_ids_json')),
    authorId: text(row, 'author_id'),
    visibility: jsonValue(text(row, 'visibility_json')),
    createdAt: text(row, 'created_at'),
    revision: integer(row, 'revision'),
    ...(factKey === undefined ? {} : { factKey }),
  })
}

function documentFrom(row: Record<string, SQLOutputValue>): VaultDocument {
  const visibility = jsonValue(text(row, 'visibility_json'))
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    title: text(row, 'title'),
    body: text(row, 'body'),
    visibility: parseVaultRecord({
      id: 'vis',
      workspaceId: text(row, 'workspace_id'),
      kind: 'brief',
      body: 'x',
      status: 'active',
      sourceIds: [],
      authorId: 'x',
      visibility,
      createdAt: '2026-11-03T12:00:00Z',
      revision: 1,
    }).visibility,
    authorId: text(row, 'author_id'),
    createdAt: text(row, 'created_at'),
    revision: integer(row, 'revision'),
  }
}

function versionFrom(row: Record<string, SQLOutputValue>): VaultVersion {
  const targetKind = text(row, 'targetKind')
  if (targetKind !== 'record' && targetKind !== 'document') throw new StoreError('constraint', 'targetKind')
  return {
    id: text(row, 'id'),
    projectId: text(row, 'projectId'),
    targetKind,
    targetId: text(row, 'targetId'),
    revision: integer(row, 'revision'),
    body: text(row, 'body'),
    authorId: text(row, 'authorId'),
    createdAt: text(row, 'createdAt'),
  }
}
