/**
 * Second-brain host: ACL, citations, folder export. Persistence is {@link BrainRepos}.
 */

import { can, canReadVault, parseVaultRecord, type Actor } from '@deepseek-ai/dsh-persona-core'
import { BrainRepos, type BrainGrant, type BrainPage, type ProductRepos } from '@deepseek-ai/dsh-persona-store'
import type {
  BrainGrantView,
  BrainHomeView,
  BrainPageView,
  BrainVersionView,
  GrantBrainPermissionRequest,
  ListBrainPagesRequest,
  PutBrainPageRequest,
  UseBrainGrantRequest,
} from './types.ts'

/**
 * Host-side Empresa › Segundo cérebro.
 */
export class BrainHost {
  /**
   * @param product - Members.
   * @param brain - Store.
   * @param actorOf - Session actor.
   */
  constructor(
    readonly product: ProductRepos,
    readonly brain: BrainRepos,
    readonly actorOf: (workspaceId: string) => Actor | undefined,
  ) {}

  /**
   * @param request - Page.
   */
  put(request: PutBrainPageRequest): BrainPageView {
    this.assertWrite(request.workspaceId, request.projectId)
    const page = this.brain.putPage({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      kind: request.kind,
      title: request.title,
      body: request.body,
      editorKind: request.editorKind,
      editorId: request.editorId,
      visibility: visibilityOf(request),
      ...(request.sources === undefined ? {} : { sources: request.sources }),
      ...(request.properties === undefined ? {} : { properties: request.properties }),
    })
    return this.toView(request.workspaceId, page)
  }

  /**
   * @param workspaceId - Workspace.
   * @param pageId - Page.
   */
  get(workspaceId: string, pageId: string): BrainPageView {
    const page = this.brain.get(pageId)
    if (page === undefined) throw new Error('not-found')
    if (!this.visible(workspaceId, page)) throw new Error('forbidden')
    return this.toView(workspaceId, page)
  }

  /**
   * @param request - Filter.
   */
  list(request: ListBrainPagesRequest): BrainPageView[] {
    const query = request.query?.trim() ?? ''
    const rows = query === ''
      ? this.brain.list(request.projectId, request.kind)
      : this.brain.search(request.projectId, query, request.kind)
    return rows.filter(page => this.visible(request.workspaceId, page))
      .map(page => this.toView(request.workspaceId, page))
  }

  /**
   * @param workspaceId - Workspace.
   * @param pageId - Page.
   */
  versions(workspaceId: string, pageId: string): BrainVersionView[] {
    const page = this.brain.get(pageId)
    if (page === undefined) throw new Error('not-found')
    if (!this.visible(workspaceId, page)) throw new Error('forbidden')
    return this.brain.listVersions(pageId).map(row => ({
      revision: row.revision,
      title: row.title,
      editorKind: row.editorKind,
      editorId: row.editorId,
      createdAt: row.createdAt,
    }))
  }

  /**
   * Pages edited on the store clock's calendar day.
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   */
  changedToday(workspaceId: string, projectId: string): BrainPageView[] {
    const day = `${this.brain.now().slice(0, 10)}T00:00:00.000Z`
    return this.brain.listChangedSince(projectId, day)
      .filter(page => this.visible(workspaceId, page))
      .map(page => this.toView(workspaceId, page))
  }

  /**
   * Write a prior revision back as a new version (history stays).
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   * @param pageId - Page.
   * @param revision - Existing revision.
   * @param editorId - Who restored.
   */
  restore(
    workspaceId: string,
    projectId: string,
    pageId: string,
    revision: number,
    editorId: string,
  ): BrainPageView {
    this.assertWrite(workspaceId, projectId)
    const page = this.brain.get(pageId)
    if (page === undefined) throw new Error('not-found')
    if (!this.visible(workspaceId, page)) throw new Error('forbidden')
    const version = this.brain.listVersions(pageId).find(row => row.revision === revision)
    if (version === undefined) throw new Error('not-found')
    return this.toView(workspaceId, this.brain.putPage({
      id: page.id,
      workspaceId: page.workspaceId,
      projectId: page.projectId,
      kind: page.kind,
      title: version.title,
      body: version.body,
      editorKind: 'person',
      editorId,
      visibility: page.visibility,
      sources: page.sources,
      slug: page.slug,
    }))
  }

  /**
   * Exact-scope use. Wider/other persona/expired/revoked stays unused.
   * @param request - Grant + claimed action.
   */
  use(request: UseBrainGrantRequest): BrainGrantView {
    this.assertRead(request.workspaceId, request.projectId)
    const used = this.brain.recordUse(request.grantId, request.personaId, request.action, request.target)
    if (used === undefined) throw new Error('forbidden')
    return toGrantView(used)
  }

  /**
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   */
  home(workspaceId: string, projectId: string): BrainHomeView {
    const start = this.brain.ensureStartHere(workspaceId, projectId)
    const day = `${this.brain.now().slice(0, 10)}T00:00:00.000Z`
    const changed = this.brain.listChangedSince(projectId, day).filter(page => this.visible(workspaceId, page))
    const grants = this.brain.listGrants(projectId).filter(row => row.revokedAt === undefined)
    const contradictions = this.brain.list(projectId)
      .filter(page => page.properties.contradiction === 'true' && this.visible(workspaceId, page))
    return {
      startHereId: start.id,
      changedToday: changed.map(page => this.toView(workspaceId, page)),
      activeGrants: grants.map(toGrantView),
      contradictions: contradictions.map(page => this.toView(workspaceId, page)),
    }
  }

  /**
   * @param request - Grant.
   * @param grantorId - Session member.
   */
  grant(request: GrantBrainPermissionRequest, grantorId: string): BrainGrantView {
    this.assertWrite(request.workspaceId, request.projectId)
    return toGrantView(this.brain.grant({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      grantorId,
      personaId: request.personaId,
      action: request.action,
      target: request.target,
      validity: request.validity,
    }))
  }

  /**
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   * @param grantId - Grant.
   */
  revoke(workspaceId: string, projectId: string, grantId: string): BrainGrantView {
    this.assertWrite(workspaceId, projectId)
    return toGrantView(this.brain.revoke(grantId))
  }

  /**
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   */
  listGrants(workspaceId: string, projectId: string): BrainGrantView[] {
    this.assertRead(workspaceId, projectId)
    return this.brain.listGrants(projectId).map(toGrantView)
  }

  /**
   * One-way export. `twoWay` also imports (no duplicate on slug+hash).
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   * @param folderPath - Local folder.
   * @param twoWay - Optional import after export.
   * @param actorId - Importer.
   */
  syncFolder(
    workspaceId: string,
    projectId: string,
    folderPath: string,
    twoWay: boolean,
    actorId: string,
  ): { files: number; created: number; skipped: number; direction: 'export' | 'import' } {
    this.assertWrite(workspaceId, projectId)
    const exported = this.brain.exportFolder(projectId, folderPath)
    if (!twoWay) return { files: exported.files, created: 0, skipped: 0, direction: 'export' }
    const imported = this.brain.importFolder(workspaceId, projectId, folderPath, actorId)
    return { files: exported.files, created: imported.created, skipped: imported.skipped, direction: 'import' }
  }

  private visible(workspaceId: string, page: BrainPage): boolean {
    const actor = this.actorOf(workspaceId)
    if (actor === undefined) return page.visibility.kind === 'workspace'
    return canReadVault(actor, asRecord(page))
  }

  private assertRead(workspaceId: string, projectId: string): void {
    const actor = this.actorOf(workspaceId)
    if (actor === undefined) return
    if (!can(actor, 'read', { type: 'project', workspaceId, projectId })) throw new Error('forbidden')
  }

  private assertWrite(workspaceId: string, projectId: string): void {
    const actor = this.actorOf(workspaceId)
    if (actor === undefined) return
    if (!can(actor, 'write', { type: 'project', workspaceId, projectId })) throw new Error('forbidden')
  }

  private toView(workspaceId: string, page: BrainPage): BrainPageView {
    const versions = this.brain.listVersions(page.id)
    const latest = versions[0]
    return {
      id: page.id,
      kind: page.kind,
      title: page.title,
      body: this.visible(workspaceId, page) ? page.body : '',
      slug: page.slug,
      revision: page.revision,
      links: page.links,
      sources: page.sources,
      editorHint: latest === undefined ? '' : `${latest.editorKind}:${latest.editorId}`,
      updatedAt: page.updatedAt,
      restricted: !this.visible(workspaceId, page),
    }
  }
}

function visibilityOf(request: PutBrainPageRequest): BrainPage['visibility'] {
  if (request.visibility === 'persona' && request.personaId !== undefined && request.personaId !== '') {
    return { kind: 'persona', personaId: request.personaId }
  }
  if (request.visibility === 'members' && request.memberIds !== undefined && request.memberIds.length > 0) {
    return { kind: 'members', memberIds: [...request.memberIds] }
  }
  if (request.visibility === 'project') return { kind: 'project', projectId: request.projectId }
  return { kind: 'workspace' }
}

function asRecord(page: BrainPage) {
  return parseVaultRecord({
    id: page.id,
    workspaceId: page.workspaceId,
    kind: page.kind === 'rule' ? 'constraint' : page.kind === 'decision' ? 'decision' : 'memory',
    body: page.body.slice(0, 32) || 'x',
    status: 'active',
    sourceIds: [],
    authorId: 'x',
    visibility: page.visibility,
    createdAt: page.createdAt,
    revision: page.revision,
  })
}

function toGrantView(row: BrainGrant): BrainGrantView {
  return {
    id: row.id,
    pageId: row.pageId,
    personaId: row.personaId,
    action: row.action,
    target: row.target,
    validity: row.validity,
    useCount: row.useCount,
    ...(row.expiresAt === undefined ? {} : { expiresAt: row.expiresAt }),
    ...(row.revokedAt === undefined ? {} : { revokedAt: row.revokedAt }),
  }
}
