/**
 * Cofre document ingest: local extract, chunks, FTS, citations, ACL.
 * Remote wrappers: `ingestVaultDocument` / `replace` / `delete` / `list` / `search`.
 */

import { can, canReadVault, parseVaultRecord, type Actor } from '@deepseek-ai/dsh-persona-core'
import {
  VaultDocError,
  VaultRepos,
  type ProductRepos,
  type VaultDocument,
} from '@deepseek-ai/dsh-persona-store'
import type {
  IngestVaultDocumentRequest,
  ReplaceVaultDocumentRequest,
  SearchVaultDocumentsRequest,
  UsedContextRecord,
  VaultChunkHitView,
  VaultDocumentView,
} from './types.ts'

/**
 * Host-side Cofre files. Persistence is {@link VaultRepos}.
 */
export class VaultDocsHost {
  /**
   * @param product - Members and projects.
   * @param vault - Store.
   * @param actorOf - Session actor, or undefined in empty-member tests.
   */
  constructor(
    readonly product: ProductRepos,
    readonly vault: VaultRepos,
    readonly actorOf: (workspaceId: string) => Actor | undefined,
  ) {}

  /**
   * Extract, chunk, and index one upload.
   * @param request - Tenant + base64 bytes.
   * @param authorId - Who uploaded.
   */
  ingest(request: IngestVaultDocumentRequest, authorId: string): VaultDocumentView {
    const bytes = decodeBytes(request.bytesBase64)
    try {
      const doc = this.vault.ingestDocument({
        id: request.id,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        filename: request.name,
        bytes,
        authorId,
        visibility: visibilityOf(request),
      })
      return toView(doc, this.vault.listChunks(doc.id).length)
    } catch (error: unknown) {
      throwVault(error)
    }
  }

  /**
   * Re-extract after a file replace. Old chunks and FTS go away.
   * @param request - Existing document + new bytes.
   * @param authorId - Who replaced.
   */
  replace(request: ReplaceVaultDocumentRequest, authorId: string): VaultDocumentView {
    const current = this.vault.getDocument(request.documentId)
    if (current === undefined || current.projectId !== request.projectId) throw new Error('not-found')
    this.assertRead(request.workspaceId, current)
    const bytes = decodeBytes(request.bytesBase64)
    try {
      const doc = this.vault.replaceDocument(request.documentId, request.name, bytes, authorId)
      return toView(doc, this.vault.listChunks(doc.id).length)
    } catch (error: unknown) {
      throwVault(error)
    }
  }

  /**
   * Drop document, chunks, and indexes.
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   * @param documentId - Document.
   */
  delete(workspaceId: string, projectId: string, documentId: string): boolean {
    const current = this.vault.getDocument(documentId)
    if (current === undefined || current.projectId !== projectId) throw new Error('not-found')
    this.assertRead(workspaceId, current)
    this.vault.deleteDocument(documentId)
    return true
  }

  /**
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   */
  list(workspaceId: string, projectId: string): VaultDocumentView[] {
    return this.vault.listDocuments(projectId)
      .filter(doc => this.visible(workspaceId, doc))
      .map(doc => toView(doc, this.vault.listChunks(doc.id).length))
  }

  /**
   * FTS over chunks. Restricted hits keep locator and hide body.
   * @param request - Tenant + query.
   */
  search(request: SearchVaultDocumentsRequest): VaultChunkHitView[] {
    return this.vault.searchChunks(request.projectId, request.query, 20).map((hit) => {
      const doc = this.vault.getDocument(hit.documentId)
      const allowed = doc !== undefined && this.visible(request.workspaceId, doc)
      return {
        id: hit.id,
        documentId: hit.documentId,
        title: hit.title,
        locator: hit.locator,
        body: allowed ? hit.body : '',
        restricted: !allowed,
      }
    }).filter(hit => !hit.restricted)
  }

  /**
   * Citations for Contexto usado (document + page/section).
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   * @param query - Message text.
   */
  citeUsed(workspaceId: string, projectId: string, query: string): UsedContextRecord[] {
    if (query.trim() === '') return []
    return this.search({ workspaceId, projectId, query }).map(hit => ({
      id: hit.id,
      kind: 'document',
      body: hit.body,
      required: false,
      restricted: hit.restricted,
      title: hit.title,
      locator: hit.locator,
    }))
  }

  private visible(workspaceId: string, doc: VaultDocument): boolean {
    const actor = this.actorOf(workspaceId)
    if (actor === undefined) return doc.visibility.kind === 'workspace'
    return canReadVault(actor, asRecord(doc))
  }

  private assertRead(workspaceId: string, doc: VaultDocument): void {
    const actor = this.actorOf(workspaceId)
    if (actor === undefined) return
    if (!can(actor, 'write', { type: 'project', workspaceId, projectId: doc.projectId })) {
      throw new Error('forbidden')
    }
    if (!this.visible(workspaceId, doc)) throw new Error('forbidden')
  }
}

function visibilityOf(request: IngestVaultDocumentRequest): VaultDocument['visibility'] {
  if (request.visibility === 'persona' && request.personaId !== undefined && request.personaId !== '') {
    return { kind: 'persona', personaId: request.personaId }
  }
  if (request.visibility === 'project') return { kind: 'project', projectId: request.projectId }
  return { kind: 'workspace' }
}

function asRecord(doc: VaultDocument) {
  return parseVaultRecord({
    id: doc.id,
    workspaceId: doc.workspaceId,
    kind: 'memory',
    body: doc.body.slice(0, 32) || 'x',
    status: 'active',
    sourceIds: [],
    authorId: doc.authorId,
    visibility: doc.visibility,
    createdAt: doc.createdAt,
    revision: doc.revision,
  })
}

function toView(doc: VaultDocument, chunks: number): VaultDocumentView {
  return {
    id: doc.id,
    title: doc.title,
    filename: doc.filename,
    mime: doc.mime,
    bytes: doc.bytes,
    revision: doc.revision,
    chunks,
  }
}

function decodeBytes(base64: string): Uint8Array {
  return Buffer.from(base64, 'base64')
}

function throwVault(error: unknown): never {
  if (error instanceof VaultDocError) throw new Error(error.userMessage)
  throw error
}
