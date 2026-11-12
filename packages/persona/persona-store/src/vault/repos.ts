/**
 * Company vault: typed records, version history, and FTS5 documents (D-045).
 */

import { createHash } from 'node:crypto'
import { parseVaultRecord, type VaultRecord } from '@deepseek-ai/dsh-persona-core'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { SECRET_PURGED_BODY, scrubSecretFacts } from '../secret-scrub.ts'
import { integer, jsonValue, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'
import { chunkExtracted } from './chunk.ts'
import { extractVaultDocument, joinExtracted } from './extract.ts'

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
  readonly mime: string
  readonly filename: string
  readonly hash: string
  readonly bytes: number
}

/** One FTS chunk of an ingested file. */
export interface VaultChunk {
  readonly id: string
  readonly documentId: string
  readonly projectId: string
  readonly index: number
  readonly locator: string
  readonly body: string
}

/** Upload bytes for extract + chunk. */
export interface IngestVaultDocumentInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly filename: string
  readonly bytes: Uint8Array
  readonly authorId: string
  readonly visibility: VaultRecord['visibility']
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
   * Newest active record with this `factKey`, or `undefined`.
   * @param projectId - Tenant.
   * @param factKey - Stable key (Rivet provider, webhook, …).
   */
  findActiveFact(projectId: string, factKey: string): VaultRecord | undefined {
    const row = this.store.db.prepare(
      `SELECT * FROM vault_record
        WHERE project_id = ? AND fact_key = ? AND status = 'active'
        ORDER BY created_at DESC, id DESC LIMIT 1`,
    ).get(projectId, factKey)
    return row === undefined ? undefined : recordFrom(row)
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
   * Erase a record that held a secret: the body becomes a plain marker, the fact key goes away, the record is revoked and every
   * version of it is deleted, so the plaintext stays neither in `vault_record` nor in `vault_version`.
   * @param id - Record id.
   */
  purgeSecret(id: string): void {
    if (this.getRecord(id) === undefined) throw new StoreError('not-found', id)
    this.store.tx((db) => {
      run(db, 'UPDATE vault_record SET body = ?, fact_key = NULL, status = ? WHERE id = ?', [SECRET_PURGED_BODY, 'revoked', id])
      run(db, 'DELETE FROM vault_version WHERE target_kind = ? AND target_id = ?', ['record', id])
    })
  }

  /**
   * Erase every record under one of `factKeys` whatever its status (a rotated token leaves a REVOKED row that keeps its body) and all their versions.
   * @param factKeys - Fact keys that hold secrets.
   * @returns How many records were erased.
   */
  purgeSecretFacts(factKeys: readonly string[]): number {
    return this.store.tx(db => scrubSecretFacts(db, factKeys))
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
      mime: 'text/plain',
      filename: input.title,
      hash: '',
      bytes: Buffer.byteLength(input.body),
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
      bytes: Buffer.byteLength(patch.body ?? current.body),
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
   * Extract bytes, chunk, and index. Replaces an existing id.
   * @param input - Upload.
   */
  ingestDocument(input: IngestVaultDocumentInput): VaultDocument {
    const units = extractVaultDocument(input.bytes, input.filename)
    const chunks = chunkExtracted(units)
    const body = joinExtracted(units)
    const title = titleOf(input.filename, units[0]?.locator ?? input.filename)
    const hash = createHash('sha256').update(input.bytes).digest('hex')
    const current = this.getDocument(input.id)
    const now = this.now()
    const doc: VaultDocument = {
      id: input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      title,
      body,
      visibility: input.visibility,
      authorId: input.authorId,
      createdAt: current?.createdAt ?? now,
      revision: current === undefined ? 1 : current.revision + 1,
      mime: mimeOf(input.filename),
      filename: input.filename,
      hash,
      bytes: input.bytes.byteLength,
    }
    this.store.tx((db) => {
      this.writeDocumentRow(db, doc)
      run(db, 'DELETE FROM vault_chunk WHERE document_id = ?', [doc.id])
      for (const chunk of chunks) {
        run(db, 'INSERT INTO vault_chunk (id, document_id, project_id, chunk_index, locator, body) VALUES (?, ?, ?, ?, ?, ?)', [
          `${doc.id}:${String(chunk.index)}`, doc.id, doc.projectId, chunk.index, chunk.locator, chunk.body,
        ])
      }
    })
    this.addVersion({
      id: `${doc.id}:v${String(doc.revision)}`,
      projectId: doc.projectId,
      targetKind: 'document',
      targetId: doc.id,
      revision: doc.revision,
      body: doc.body,
      authorId: doc.authorId,
      createdAt: now,
    })
    return doc
  }

  /**
   * Re-extract after a file replace. Visibility stays.
   * @param id - Document.
   * @param filename - New name.
   * @param bytes - New bytes.
   * @param authorId - Who replaced.
   */
  replaceDocument(id: string, filename: string, bytes: Uint8Array, authorId: string): VaultDocument {
    const current = this.getDocument(id)
    if (current === undefined) throw new StoreError('not-found', id)
    return this.ingestDocument({
      id,
      workspaceId: current.workspaceId,
      projectId: current.projectId,
      filename,
      bytes,
      authorId,
      visibility: current.visibility,
    })
  }

  /**
   * Drop document, chunks, and FTS rows.
   * @param id - Document.
   */
  deleteDocument(id: string): void {
    if (this.getDocument(id) === undefined) throw new StoreError('not-found', id)
    this.store.tx((db) => {
      run(db, 'DELETE FROM vault_chunk WHERE document_id = ?', [id])
      run(db, 'DELETE FROM vault_document WHERE id = ?', [id])
    })
  }

  /**
   * @param projectId - Tenant.
   */
  listDocuments(projectId: string): VaultDocument[] {
    return this.store.db.prepare(
      'SELECT * FROM vault_document WHERE project_id = ? ORDER BY created_at DESC, id DESC',
    ).all(projectId).map(documentFrom)
  }

  /**
   * @param documentId - Document.
   */
  listChunks(documentId: string): VaultChunk[] {
    return this.store.db.prepare(
      'SELECT * FROM vault_chunk WHERE document_id = ? ORDER BY chunk_index ASC',
    ).all(documentId).map(chunkFrom)
  }

  /**
   * FTS5 over chunks. Hits include locator for Contexto usado.
   * @param projectId - Tenant.
   * @param query - User text (phrase).
   * @param limit - Max rows.
   */
  searchChunks(projectId: string, query: string, limit?: number): Array<VaultChunk & { title: string; visibility: VaultDocument['visibility'] }> {
    const cap = limit ?? 50
    if (query.trim() === '') return []
    if (!Number.isInteger(cap) || cap < 1 || cap > 200) throw new StoreError('invalid-input', 'limit')
    const rows = this.store.db.prepare(
      `SELECT vault_chunk.*, vault_document.title AS title, vault_document.visibility_json AS visibility_json
         FROM vault_chunk
         JOIN vault_chunk_fts ON vault_chunk.rowid = vault_chunk_fts.rowid
         JOIN vault_document ON vault_document.id = vault_chunk.document_id
        WHERE vault_chunk.project_id = ? AND vault_chunk_fts MATCH ?
        ORDER BY vault_chunk.document_id, vault_chunk.chunk_index
        LIMIT ?`,
    ).all(projectId, ftsMatch(query), cap)
    return rows.map((row) => {
      const chunk = chunkFrom(row)
      return { ...chunk, title: text(row, 'title'), visibility: visibilityFrom(row) }
    })
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
      this.writeDocumentRow(db, doc)
    })
  }

  private writeDocumentRow(db: DatabaseSync, doc: VaultDocument): void {
    run(db, 'INSERT INTO vault_document (id, workspace_id, project_id, title, body, visibility_json, author_id, created_at, revision, mime, filename, hash, bytes) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET title = excluded.title, body = excluded.body, visibility_json = excluded.visibility_json, author_id = excluded.author_id, revision = excluded.revision, mime = excluded.mime, filename = excluded.filename, hash = excluded.hash, bytes = excluded.bytes', [
      doc.id, doc.workspaceId, doc.projectId, doc.title, doc.body,
      JSON.stringify(doc.visibility), doc.authorId, doc.createdAt, doc.revision,
      doc.mime, doc.filename, doc.hash, doc.bytes,
    ])
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
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    title: text(row, 'title'),
    body: text(row, 'body'),
    visibility: visibilityFrom(row),
    authorId: text(row, 'author_id'),
    createdAt: text(row, 'created_at'),
    revision: integer(row, 'revision'),
    mime: optionalText(row, 'mime') ?? 'text/plain',
    filename: optionalText(row, 'filename') ?? text(row, 'title'),
    hash: optionalText(row, 'hash') ?? '',
    bytes: row.bytes === null || row.bytes === undefined ? Buffer.byteLength(text(row, 'body')) : integer(row, 'bytes'),
  }
}

function chunkFrom(row: Record<string, SQLOutputValue>): VaultChunk {
  return {
    id: text(row, 'id'),
    documentId: text(row, 'document_id'),
    projectId: text(row, 'project_id'),
    index: integer(row, 'chunk_index'),
    locator: text(row, 'locator'),
    body: text(row, 'body'),
  }
}

function visibilityFrom(row: Record<string, SQLOutputValue>): VaultDocument['visibility'] {
  const visibility = jsonValue(text(row, 'visibility_json'))
  return parseVaultRecord({
    id: 'vis',
    workspaceId: optionalText(row, 'workspace_id') ?? 'ws',
    kind: 'brief',
    body: 'x',
    status: 'active',
    sourceIds: [],
    authorId: 'x',
    visibility,
    createdAt: '2026-11-03T12:00:00Z',
    revision: 1,
  }).visibility
}

function titleOf(filename: string, locator: string): string {
  const base = filename.replace(/\.[^.]+$/u, '').trim()
  if (base !== '') return base
  return locator.replace(/^(página|seção)\s+/iu, '') || filename
}

function mimeOf(filename: string): string {
  if (/\.pdf$/iu.test(filename)) return 'application/pdf'
  if (/\.docx$/iu.test(filename)) return 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  if (/\.md$/iu.test(filename)) return 'text/markdown'
  if (/\.csv$/iu.test(filename)) return 'text/csv'
  return 'text/plain'
}

function ftsMatch(query: string): string {
  const tokens = query.trim().split(/\s+/u).filter(token => token.length >= 3).slice(0, 6)
  const quoted = (tokens.length === 0 ? [query.trim()] : tokens).map(token => `"${token.replaceAll('"', '""')}"`)
  return quoted.join(' OR ')
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
