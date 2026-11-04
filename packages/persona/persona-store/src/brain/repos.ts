/**
 * Second brain: markdown pages as source, derived FTS/type/link index (BRIEFING 19).
 */

import { createHash } from 'node:crypto'
import { mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join, relative } from 'node:path'
import { parseVaultRecord, type VaultRecord } from '@deepseek-ai/dsh-persona-core'
import type { DatabaseSync, SQLOutputValue } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { integer, jsonValue, optionalText, run, text } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/** Fixed page types (SECOND-BRAIN.md §1). */
export const BRAIN_KINDS = [
  'company', 'person', 'client', 'project', 'process', 'rule',
  'decision', 'permission', 'tool', 'glossary', 'learning',
] as const

/** One of the twelve page types. */
export type BrainKind = (typeof BRAIN_KINDS)[number]

/** Who wrote a version. */
export type BrainEditorKind = 'person' | 'persona'

/** Grant validity. */
export type BrainValidity = 'once' | '7d' | 'until-revoke'

/** Markdown page. Index fields are derived from `body`. */
export interface BrainPage {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly kind: BrainKind
  readonly title: string
  readonly body: string
  readonly properties: Readonly<Record<string, string>>
  readonly sources: readonly string[]
  readonly visibility: VaultRecord['visibility']
  readonly revision: number
  readonly confirmedAt: string
  readonly slug: string
  readonly status: 'active' | 'superseded'
  readonly links: readonly string[]
  readonly createdAt: string
  readonly updatedAt: string
}

/** Immutable page revision. */
export interface BrainVersion {
  readonly id: string
  readonly pageId: string
  readonly projectId: string
  readonly revision: number
  readonly title: string
  readonly body: string
  readonly editorKind: BrainEditorKind
  readonly editorId: string
  readonly createdAt: string
}

/** Remembered approval (page kind `permission`). */
export interface BrainGrant {
  readonly id: string
  readonly pageId: string
  readonly workspaceId: string
  readonly projectId: string
  readonly grantorId: string
  readonly personaId: string
  readonly action: string
  readonly target: string
  readonly limits: Readonly<Record<string, string>>
  readonly validity: BrainValidity
  readonly expiresAt: string | undefined
  readonly revokedAt: string | undefined
  readonly useCount: number
  readonly lastUsedAt: string | undefined
  readonly createdAt: string
}

/** Create or replace a page (always appends a version). */
export interface PutBrainPageInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly kind: BrainKind
  readonly title: string
  readonly body: string
  readonly editorKind: BrainEditorKind
  readonly editorId: string
  readonly visibility?: VaultRecord['visibility']
  readonly properties?: Readonly<Record<string, string>>
  readonly sources?: readonly string[]
  readonly slug?: string
}

/** New remembered permission. */
export interface GrantBrainInput {
  readonly id: string
  readonly workspaceId: string
  readonly projectId: string
  readonly grantorId: string
  readonly personaId: string
  readonly action: string
  readonly target: string
  readonly limits?: Readonly<Record<string, string>>
  readonly validity: BrainValidity
}

/**
 * Persist second-brain pages. Soft-supersede only; versions stay.
 */
export class BrainRepos {
  readonly store: PersonaStore
  readonly now: () => string

  /**
   * @param store - Open store (schema ≥ 15).
   * @param now - Instant factory.
   */
  constructor(store: PersonaStore, now: () => string = () => new Date().toISOString()) {
    this.store = store
    this.now = now
  }

  /**
   * Create or update. Prior body stays in `brain_version`.
   * @param input - Page + editor.
   */
  putPage(input: PutBrainPageInput): BrainPage {
    if (!BRAIN_KINDS.includes(input.kind)) throw new StoreError('invalid-input', 'kind')
    const title = input.title.trim()
    const body = input.body
    if (title === '') throw new StoreError('invalid-input', 'title')
    const slug = input.slug?.trim() || slugOf(title)
    const current = this.get(input.id) ?? this.bySlug(input.projectId, slug)
    const now = this.now()
    const revision = current === undefined ? 1 : current.revision + 1
    const page: BrainPage = {
      id: current?.id ?? input.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: input.kind,
      title,
      body,
      properties: input.properties ?? current?.properties ?? {},
      sources: input.sources ?? current?.sources ?? [],
      visibility: input.visibility ?? current?.visibility ?? { kind: 'workspace' },
      revision,
      confirmedAt: now,
      slug,
      status: 'active',
      links: extractLinks(body),
      createdAt: current?.createdAt ?? now,
      updatedAt: now,
    }
    this.store.tx((db) => {
      this.writePage(db, page)
      run(db, 'DELETE FROM brain_link WHERE from_id = ?', [page.id])
      for (const toSlug of page.links) {
        run(db, 'INSERT INTO brain_link (from_id, project_id, to_slug) VALUES (?, ?, ?) ON CONFLICT(from_id, to_slug) DO NOTHING', [
          page.id, page.projectId, toSlug,
        ])
      }
      run(db, 'INSERT INTO brain_version (id, page_id, project_id, revision, title, body, editor_kind, editor_id, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)', [
        `${page.id}:v${String(revision)}`, page.id, page.projectId, revision, page.title, page.body,
        input.editorKind, input.editorId, now,
      ])
    })
    return page
  }

  /**
   * @param id - Page.
   */
  get(id: string): BrainPage | undefined {
    const row = this.store.db.prepare('SELECT * FROM brain_page WHERE id = ?').get(id)
    return row === undefined ? undefined : pageFrom(row, this.linksOf(id))
  }

  /**
   * @param projectId - Tenant.
   * @param slug - Unique per project.
   */
  bySlug(projectId: string, slug: string): BrainPage | undefined {
    const row = this.store.db.prepare('SELECT * FROM brain_page WHERE project_id = ? AND slug = ?').get(projectId, slug)
    return row === undefined ? undefined : pageFrom(row, this.linksOf(text(row, 'id')))
  }

  /**
   * @param projectId - Tenant.
   * @param kind - Optional type filter.
   */
  list(projectId: string, kind?: BrainKind): BrainPage[] {
    const rows = kind === undefined
      ? this.store.db.prepare('SELECT * FROM brain_page WHERE project_id = ? AND status = \'active\' ORDER BY kind ASC, title ASC').all(projectId)
      : this.store.db.prepare('SELECT * FROM brain_page WHERE project_id = ? AND kind = ? AND status = \'active\' ORDER BY title ASC').all(projectId, kind)
    return rows.map(row => pageFrom(row, this.linksOf(text(row, 'id'))))
  }

  /**
   * FTS over title/body, optional type. Derived index only.
   * @param projectId - Tenant.
   * @param query - User text.
   * @param kind - Optional type.
   */
  search(projectId: string, query: string, kind?: BrainKind): BrainPage[] {
    if (query.trim() === '') return []
    const rows = kind === undefined
      ? this.store.db.prepare(
        `SELECT brain_page.* FROM brain_page
           JOIN brain_page_fts ON brain_page.rowid = brain_page_fts.rowid
          WHERE brain_page.project_id = ? AND brain_page.status = 'active' AND brain_page_fts MATCH ?
          ORDER BY brain_page.kind, brain_page.title LIMIT 50`,
      ).all(projectId, ftsMatch(query))
      : this.store.db.prepare(
        `SELECT brain_page.* FROM brain_page
           JOIN brain_page_fts ON brain_page.rowid = brain_page_fts.rowid
          WHERE brain_page.project_id = ? AND brain_page.kind = ? AND brain_page.status = 'active' AND brain_page_fts MATCH ?
          ORDER BY brain_page.title LIMIT 50`,
      ).all(projectId, kind, ftsMatch(query))
    return rows.map(row => pageFrom(row, this.linksOf(text(row, 'id'))))
  }

  /**
   * @param pageId - Page.
   */
  listVersions(pageId: string): BrainVersion[] {
    return this.store.db.prepare(
      'SELECT * FROM brain_version WHERE page_id = ? ORDER BY revision DESC',
    ).all(pageId).map(versionFrom)
  }

  /**
   * Pages edited on/after `sinceIso`.
   * @param projectId - Tenant.
   * @param sinceIso - Inclusive instant.
   */
  listChangedSince(projectId: string, sinceIso: string): BrainPage[] {
    return this.store.db.prepare(
      'SELECT * FROM brain_page WHERE project_id = ? AND updated_at >= ? AND status = \'active\' ORDER BY updated_at DESC',
    ).all(projectId, sinceIso).map(row => pageFrom(row, this.linksOf(text(row, 'id'))))
  }

  /**
   * Generated "Comece aqui" index. Idempotent.
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   */
  ensureStartHere(workspaceId: string, projectId: string): BrainPage {
    const others = this.list(projectId).filter(page => page.slug !== 'comece-aqui')
    const lines = ['# Comece aqui', '', 'Índice derivado do Segundo cérebro.', '']
    for (const kind of BRAIN_KINDS) {
      const group = others.filter(page => page.kind === kind)
      if (group.length === 0) continue
      lines.push(`## ${kind}`)
      for (const page of group) lines.push(`- [[${page.slug}|${page.title}]]`)
      lines.push('')
    }
    const body = lines.join('\n')
    const current = this.bySlug(projectId, 'comece-aqui')
    if (current !== undefined && current.body === body) return current
    return this.putPage({
      id: current?.id ?? `brain-start-${projectId}`,
      workspaceId,
      projectId,
      kind: 'company',
      title: 'Comece aqui',
      body,
      editorKind: 'person',
      editorId: 'system',
      slug: 'comece-aqui',
      sources: ['derived-index'],
    })
  }

  /**
   * Remember an approval as a permission page + grant row.
   * @param input - Scope.
   */
  grant(input: GrantBrainInput): BrainGrant {
    const now = this.now()
    const expiresAt = input.validity === '7d' ? plusDays(now, 7) : undefined
    const page = this.putPage({
      id: `perm-${input.id}`,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      kind: 'permission',
      title: `${input.action} · ${input.target}`,
      body: `# Permissão concedida\n\n- Persona: ${input.personaId}\n- Ação: ${input.action}\n- Alvo: ${input.target}\n- Validade: ${input.validity}\n`,
      editorKind: 'person',
      editorId: input.grantorId,
      properties: { personaId: input.personaId, action: input.action, target: input.target },
      sources: [`grant:${input.grantorId}`],
      slug: slugOf(`perm-${input.action}-${input.personaId}-${input.target}`),
    })
    const row: BrainGrant = {
      id: input.id,
      pageId: page.id,
      workspaceId: input.workspaceId,
      projectId: input.projectId,
      grantorId: input.grantorId,
      personaId: input.personaId,
      action: input.action,
      target: input.target,
      limits: input.limits ?? {},
      validity: input.validity,
      expiresAt,
      revokedAt: undefined,
      useCount: 0,
      lastUsedAt: undefined,
      createdAt: now,
    }
    this.writeGrant(row)
    return row
  }

  /**
   * Immediate revoke. Page stays; grant is ignored.
   * @param id - Grant.
   */
  revoke(id: string): BrainGrant {
    const current = this.getGrant(id)
    if (current === undefined) throw new StoreError('not-found', id)
    const next: BrainGrant = { ...current, revokedAt: this.now() }
    this.writeGrant(next)
    return next
  }

  /**
   * @param id - Grant.
   */
  getGrant(id: string): BrainGrant | undefined {
    const row = this.store.db.prepare('SELECT * FROM brain_grant WHERE id = ?').get(id)
    return row === undefined ? undefined : grantFrom(row)
  }

  /**
   * @param projectId - Tenant.
   */
  listGrants(projectId: string): BrainGrant[] {
    return this.store.db.prepare(
      'SELECT * FROM brain_grant WHERE project_id = ? ORDER BY created_at DESC',
    ).all(projectId).map(grantFrom)
  }

  /**
   * Count a use. Expired/revoked/wrong persona stay unused.
   * @param id - Grant.
   * @param personaId - Who is acting.
   * @param action - Exact verb.
   * @param target - Exact target.
   */
  recordUse(id: string, personaId: string, action: string, target: string): BrainGrant | undefined {
    const current = this.getGrant(id)
    if (current === undefined) return undefined
    if (!grantAllows(current, personaId, action, target, this.now())) return undefined
    const next: BrainGrant = {
      ...current,
      useCount: current.useCount + 1,
      lastUsedAt: this.now(),
      revokedAt: current.validity === 'once' ? this.now() : current.revokedAt,
    }
    this.writeGrant(next)
    return next
  }

  /**
   * One-way write of readable markdown into `folderPath`.
   * @param projectId - Tenant.
   * @param folderPath - Destination directory.
   */
  exportFolder(projectId: string, folderPath: string): { files: number } {
    mkdirSync(folderPath, { recursive: true })
    const pages = this.list(projectId)
    for (const page of pages) {
      const dir = join(folderPath, page.kind)
      mkdirSync(dir, { recursive: true })
      writeFileSync(join(dir, `${page.slug}.md`), renderMarkdown(page), 'utf8')
    }
    return { files: pages.length }
  }

  /**
   * Import `.md` from a vault folder. Same slug+hash is a no-op (no duplicate).
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   * @param folderPath - Source directory.
   * @param editorId - Who imported.
   */
  importFolder(workspaceId: string, projectId: string, folderPath: string, editorId: string): { created: number; skipped: number } {
    const files = listMarkdown(folderPath)
    let created = 0
    let skipped = 0
    for (const file of files) {
      const parsed = parseVaultMarkdown(readFileSync(file, 'utf8'))
      const slug = parsed.slug || slugOf(parsed.title || relative(folderPath, file))
      const existing = this.bySlug(projectId, slug)
      const incoming = parsed.body.replace(/^\uFEFF/, '').replace(/^\r?\n/u, '').trimEnd()
      const hash = createHash('sha256').update(incoming).digest('hex')
      if (existing !== undefined && createHash('sha256').update(existing.body.trimEnd()).digest('hex') === hash) {
        skipped += 1
        continue
      }
      this.putPage({
        id: existing?.id ?? `imp-${slug}`,
        workspaceId,
        projectId,
        kind: parsed.kind ?? 'learning',
        title: parsed.title || slug,
        body: incoming,
        editorKind: 'person',
        editorId,
        slug,
        sources: [`vault:${relative(folderPath, file).replaceAll('\\', '/')}`],
      })
      created += 1
    }
    return { created, skipped }
  }

  private linksOf(pageId: string): string[] {
    return this.store.db.prepare('SELECT to_slug AS slug FROM brain_link WHERE from_id = ?').all(pageId)
      .map(row => text(row, 'slug'))
  }

  private writePage(db: DatabaseSync, page: BrainPage): void {
    run(db, 'INSERT INTO brain_page (id, workspace_id, project_id, kind, title, body, properties_json, sources_json, visibility_json, revision, confirmed_at, slug, status, created_at, updated_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET kind = excluded.kind, title = excluded.title, body = excluded.body, properties_json = excluded.properties_json, sources_json = excluded.sources_json, visibility_json = excluded.visibility_json, revision = excluded.revision, confirmed_at = excluded.confirmed_at, slug = excluded.slug, status = excluded.status, updated_at = excluded.updated_at', [
      page.id, page.workspaceId, page.projectId, page.kind, page.title, page.body,
      JSON.stringify(page.properties), JSON.stringify(page.sources), JSON.stringify(page.visibility),
      page.revision, page.confirmedAt, page.slug, page.status, page.createdAt, page.updatedAt,
    ])
  }

  private writeGrant(row: BrainGrant): void {
    this.store.tx((db) => {
      run(db, 'INSERT INTO brain_grant (id, page_id, workspace_id, project_id, grantor_id, persona_id, action, target, limits_json, validity, expires_at, revoked_at, use_count, last_used_at, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET revoked_at = excluded.revoked_at, use_count = excluded.use_count, last_used_at = excluded.last_used_at', [
        row.id, row.pageId, row.workspaceId, row.projectId, row.grantorId, row.personaId,
        row.action, row.target, JSON.stringify(row.limits), row.validity,
        row.expiresAt ?? null, row.revokedAt ?? null, row.useCount, row.lastUsedAt ?? null, row.createdAt,
      ])
    })
  }
}

/**
 * Exact-scope check (never widens).
 * @param grant - Stored grant.
 * @param personaId - Actor persona.
 * @param action - Verb.
 * @param target - Target.
 * @param nowIso - Clock.
 */
export function grantAllows(
  grant: BrainGrant,
  personaId: string,
  action: string,
  target: string,
  nowIso: string,
): boolean {
  if (grant.revokedAt !== undefined) return false
  if (grant.personaId !== personaId) return false
  if (grant.action !== action || grant.target !== target) return false
  if (grant.expiresAt !== undefined && grant.expiresAt <= nowIso) return false
  return true
}

/**
 * @param body - Markdown.
 */
export function extractLinks(body: string): string[] {
  const found = new Set<string>()
  const re = /\[\[([^\]|#]+)(?:[|#][^\]]*)?\]\]/gu
  let match: RegExpExecArray | null
  while ((match = re.exec(body)) !== null) {
    const raw = match[1]?.trim() ?? ''
    if (raw !== '') found.add(slugOf(raw))
  }
  return [...found]
}

function slugOf(value: string): string {
  const slug = value.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase()
    .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
  return slug === '' ? 'pagina' : slug.slice(0, 80)
}

function ftsMatch(query: string): string {
  const tokens = query.trim().split(/\s+/u).filter(token => token.length >= 2).slice(0, 6)
  const quoted = (tokens.length === 0 ? [query.trim()] : tokens).map(token => `"${token.replaceAll('"', '""')}"`)
  return quoted.join(' OR ')
}

function plusDays(iso: string, days: number): string {
  return new Date(Date.parse(iso) + days * 86_400_000).toISOString()
}

function pageFrom(row: Record<string, SQLOutputValue>, links: readonly string[]): BrainPage {
  const kind = text(row, 'kind')
  if (!BRAIN_KINDS.includes(kind as BrainKind)) throw new StoreError('constraint', 'kind')
  const status = text(row, 'status')
  if (status !== 'active' && status !== 'superseded') throw new StoreError('constraint', 'status')
  const propertiesRaw = jsonValue(text(row, 'properties_json'))
  const sourcesRaw = jsonValue(text(row, 'sources_json'))
  return {
    id: text(row, 'id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    kind: kind as BrainKind,
    title: text(row, 'title'),
    body: text(row, 'body'),
    properties: isStringRecord(propertiesRaw) ? propertiesRaw : {},
    sources: Array.isArray(sourcesRaw) ? sourcesRaw.filter((item): item is string => typeof item === 'string') : [],
    visibility: visibilityFrom(row),
    revision: integer(row, 'revision'),
    confirmedAt: text(row, 'confirmed_at'),
    slug: text(row, 'slug'),
    status,
    links,
    createdAt: text(row, 'created_at'),
    updatedAt: text(row, 'updated_at'),
  }
}

function versionFrom(row: Record<string, SQLOutputValue>): BrainVersion {
  const editorKind = text(row, 'editor_kind')
  if (editorKind !== 'person' && editorKind !== 'persona') throw new StoreError('constraint', 'editorKind')
  return {
    id: text(row, 'id'),
    pageId: text(row, 'page_id'),
    projectId: text(row, 'project_id'),
    revision: integer(row, 'revision'),
    title: text(row, 'title'),
    body: text(row, 'body'),
    editorKind,
    editorId: text(row, 'editor_id'),
    createdAt: text(row, 'created_at'),
  }
}

function grantFrom(row: Record<string, SQLOutputValue>): BrainGrant {
  const validity = text(row, 'validity')
  if (validity !== 'once' && validity !== '7d' && validity !== 'until-revoke') throw new StoreError('constraint', 'validity')
  const limitsRaw = jsonValue(text(row, 'limits_json'))
  return {
    id: text(row, 'id'),
    pageId: text(row, 'page_id'),
    workspaceId: text(row, 'workspace_id'),
    projectId: text(row, 'project_id'),
    grantorId: text(row, 'grantor_id'),
    personaId: text(row, 'persona_id'),
    action: text(row, 'action'),
    target: text(row, 'target'),
    limits: isStringRecord(limitsRaw) ? limitsRaw : {},
    validity,
    expiresAt: optionalText(row, 'expires_at'),
    revokedAt: optionalText(row, 'revoked_at'),
    useCount: integer(row, 'use_count'),
    lastUsedAt: optionalText(row, 'last_used_at'),
    createdAt: text(row, 'created_at'),
  }
}

function visibilityFrom(row: Record<string, SQLOutputValue>): VaultRecord['visibility'] {
  return parseVaultRecord({
    id: 'vis',
    workspaceId: optionalText(row, 'workspace_id') ?? 'ws',
    kind: 'brief',
    body: 'x',
    status: 'active',
    sourceIds: [],
    authorId: 'x',
    visibility: jsonValue(text(row, 'visibility_json')),
    createdAt: '2026-11-03T12:00:00Z',
    revision: 1,
  }).visibility
}

function isStringRecord(value: unknown): value is Record<string, string> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  return Object.values(value).every(item => typeof item === 'string')
}

function renderMarkdown(page: BrainPage): string {
  return [
    '---',
    `id: ${page.id}`,
    `kind: ${page.kind}`,
    `title: ${page.title}`,
    `revision: ${String(page.revision)}`,
    `slug: ${page.slug}`,
    '---',
    '',
    page.body.endsWith('\n') ? page.body : `${page.body}\n`,
  ].join('\n')
}

function parseVaultMarkdown(source: string): { kind?: BrainKind; title?: string; slug?: string; body: string } {
  const fence = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/u.exec(source)
  if (fence === null) {
    const heading = /^#\s+(.+)$/mu.exec(source)?.[1]?.trim()
    return heading === undefined ? { body: source } : { title: heading, body: source }
  }
  const meta = fence[1] ?? ''
  const field = (name: string): string | undefined => {
    const line = new RegExp(`^${name}:\\s*(.+)$`, 'mu').exec(meta)
    return line?.[1]?.trim()
  }
  const parsed: { kind?: BrainKind; title?: string; slug?: string; body: string } = { body: fence[2] ?? '' }
  const kind = field('kind')
  if (kind !== undefined && BRAIN_KINDS.includes(kind as BrainKind)) parsed.kind = kind as BrainKind
  const title = field('title')
  if (title !== undefined) parsed.title = title
  const slug = field('slug')
  if (slug !== undefined) parsed.slug = slug
  return parsed
}

function listMarkdown(root: string): string[] {
  const out: string[] = []
  const walk = (dir: string): void => {
    const base = dir.replace(/\\/gu, '/')
    if (/(^|\/)\.obsidian(\/|$)/u.test(base) || /(^|\/)\.trash(\/|$)/u.test(base)) return
    for (const name of readdirSync(dir)) {
      const path = join(dir, name)
      const stat = statSync(path)
      if (stat.isDirectory()) walk(path)
      else if (/\.md$/iu.test(name) && stat.size <= 8 * 1024 * 1024) out.push(path)
    }
  }
  walk(root)
  return out
}
