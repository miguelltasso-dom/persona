/**
 * One-way (default) markdown export of second-brain pages. Reimport uses
 * path + content hash (BYC) so the same file does not duplicate.
 */

import { contentHash, type BringVaultFile } from '../import/bring-context.ts'
import { DomainError } from './schemas.ts'
import { BRAIN_PAGE_KINDS, startHereLinks, type BrainPage, type BrainPageKind, type BrainVisibility } from './brain.ts'

function fence(body: string): string {
  return body.replace(/\r\n/g, '\n').trimEnd()
}

const RESERVED_FRONT = new Set([
  'id', 'kind', 'title', 'revision', 'status', 'workspace', 'visibility', 'required',
])

function visibilityLine(visibility: BrainVisibility): string {
  if (visibility.kind === 'workspace') return 'workspace'
  if (visibility.kind === 'project') return `project:${visibility.projectId}`
  return `members:${visibility.memberIds.join(',')}`
}

function parseVisibility(raw: string): BrainVisibility {
  if (raw.startsWith('project:')) return { kind: 'project', projectId: raw.slice('project:'.length) }
  if (raw.startsWith('members:')) {
    const memberIds = raw.slice('members:'.length).split(',').map(id => id.trim()).filter(id => id !== '')
    return { kind: 'members', memberIds }
  }
  return { kind: 'workspace' }
}

function parseProperties(front: string): Readonly<Record<string, string>> {
  const properties: Record<string, string> = {}
  for (const line of front.split('\n')) {
    const cut = line.indexOf(':')
    if (cut <= 0) continue
    const key = line.slice(0, cut).trim()
    if (RESERVED_FRONT.has(key)) continue
    properties[key] = line.slice(cut + 1).trim()
  }
  return properties
}

/**
 * Readable Obsidian-style page. Links stay as `[[id]]`.
 * @param page - Source page.
 */
export function brainPageToMarkdown(page: BrainPage): string {
  const links = page.links.map(id => `[[${id}]]`).join(' ')
  const props = Object.entries(page.properties).map(([key, value]) => `${key}: ${value}`)
  const lines = [
    '---',
    `id: ${page.id}`,
    `kind: ${page.kind}`,
    `title: ${page.title}`,
    `revision: ${String(page.revision)}`,
    `status: ${page.status}`,
    `workspace: ${page.workspaceId}`,
    `visibility: ${visibilityLine(page.visibility)}`,
    `required: ${page.required ? 'true' : 'false'}`,
    ...props,
    '---',
    '',
    fence(page.body),
    '',
  ]
  if (links !== '') {
    lines.push(`Links: ${links}`, '')
  }
  return lines.join('\n')
}

/** Fields the one-way pack writes and two-way reimports. */
export interface BrainPageMarkdown {
  readonly id: string
  readonly kind: BrainPageKind
  readonly title: string
  readonly revision: number
  readonly status: BrainPage['status']
  readonly workspaceId: string
  readonly body: string
  readonly required: boolean
  readonly links: readonly string[]
  readonly visibility: BrainVisibility
  readonly properties: Readonly<Record<string, string>>
}

/**
 * @param markdown - Document produced by {@link brainPageToMarkdown}.
 * @returns Page fields including visibility and extra frontmatter properties.
 */
export function markdownToBrainPage(markdown: string): BrainPageMarkdown {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (match === null) throw new DomainError('INVALID_BRAIN', 'MARKDOWN')
  const front = match[1] ?? ''
  const rest = (match[2] ?? '').trim()
  const field = (name: string): string => {
    const row = front.split('\n').find(line => line.startsWith(`${name}:`))
    return row === undefined ? '' : row.slice(name.length + 1).trim()
  }
  const kind = field('kind')
  if (!(BRAIN_PAGE_KINDS as readonly string[]).includes(kind)) {
    throw new DomainError('INVALID_BRAIN', 'KIND')
  }
  const linkBlock = rest.match(/Links:\s*((?:\[\[\S+?\]\]\s*)+)/)
  const links = linkBlock === null
    ? []
    : [...linkBlock[1]!.matchAll(/\[\[(.+?)\]\]/g)].map(hit => hit[1]!).filter(id => id !== '')
  const body = rest.replace(/\nLinks:\s*(?:\[\[\S+?\]\]\s*)+$/u, '').trim()
  return {
    id: field('id'),
    kind: kind as BrainPageKind,
    title: field('title'),
    revision: Number(field('revision')),
    status: field('status') as BrainPage['status'],
    workspaceId: field('workspace'),
    body,
    required: field('required') === 'true',
    links,
    visibility: parseVisibility(field('visibility')),
    properties: parseProperties(front),
  }
}

/**
 * Two-way dest file that is not our pack (plain Obsidian note).
 * @param markdown - Dest body.
 * @returns Parsed page, or null when the file is not a brain page.
 */
export function tryParseBrainPageMarkdown(markdown: string): BrainPageMarkdown | null {
  try {
    return markdownToBrainPage(markdown)
  } catch (error) {
    if (error instanceof DomainError && error.code === 'INVALID_BRAIN') return null
    throw error
  }
}

export interface BrainVaultFile {
  readonly path: string
  readonly body: string
  readonly hash: string
}

export interface BrainVaultExport {
  readonly mode: 'one_way'
  readonly files: readonly BrainVaultFile[]
}

/**
 * One-way Obsidian pack: one markdown file per active page plus `Comece aqui.md`.
 * Reimport skips a file whose {@link contentHash} already exists (BYC).
 * @param pages - Workspace pages.
 */
export function exportBrainVault(pages: readonly BrainPage[]): BrainVaultExport {
  const active = pages.filter(page => page.status === 'active')
  const files: BrainVaultFile[] = active.map((page) => {
    const body = brainPageToMarkdown(page)
    return { path: `${page.kind}/${page.id}.md`, body, hash: contentHash(body) }
  })
  const links = startHereLinks(active).map(id => `- [[${id}]]`).join('\n')
  const index = ['# Comece aqui', '', links === '' ? 'Vault vazio.' : links, ''].join('\n')
  files.unshift({ path: 'Comece aqui.md', body: index, hash: contentHash(index) })
  return { mode: 'one_way', files }
}

/**
 * @param existingHashes - Hashes already in the Cofre / brain.
 * @param file - Candidate from a folder.
 * @returns True when this file would create a new page.
 */
export function shouldImportVaultFile(
  existingHashes: ReadonlySet<string>,
  file: Pick<BrainVaultFile, 'hash'>,
): boolean {
  return !existingHashes.has(file.hash)
}

/**
 * Dest markdown the one-way export did not write. Never deleted.
 * @param destRels - Relative paths already in the dest vault.
 * @param exportedRels - Paths this run wrote or skipped as same-hash.
 * @returns Dest extras (no `..`).
 */
export function leftoverDestFiles(
  destRels: readonly string[],
  exportedRels: readonly string[],
): readonly string[] {
  const kept = new Set(exportedRels.filter(rel => rel.endsWith('.md') && !rel.includes('..')))
  return destRels.filter(rel => rel.endsWith('.md') && !rel.includes('..') && !kept.has(rel))
}

export interface BrainVaultExportPlan {
  readonly pack: BrainVaultExport
  readonly leftover: readonly string[]
}

/**
 * One-way pack plus dest extras that stay (never deleted).
 * @param pages - Workspace pages.
 * @param destRels - Relative paths already in the dest vault.
 * @returns Pack and leftover dest files.
 */
export function planBrainVaultExport(
  pages: readonly BrainPage[],
  destRels: readonly string[] = [],
): BrainVaultExportPlan {
  const pack = exportBrainVault(pages)
  return { pack, leftover: leftoverDestFiles(destRels, pack.files.map(file => file.path)) }
}

export interface BrainVaultApply {
  readonly write: readonly BrainVaultFile[]
  readonly skip: readonly string[]
  readonly leftover: readonly string[]
}

/**
 * Apply a one-way pack: write new/changed files, skip same-hash, never delete leftovers.
 * @param plan - {@link planBrainVaultExport} result.
 * @param destHashes - Dest path → content hash.
 * @returns Files to write, skipped paths, leftover dest extras.
 */
export function applyBrainVaultExport(
  plan: BrainVaultExportPlan,
  destHashes: Readonly<Record<string, string>> = {},
): BrainVaultApply {
  const write: BrainVaultFile[] = []
  const skip: string[] = []
  for (const file of plan.pack.files) {
    if (file.path.includes('..') || !file.path.endsWith('.md')) continue
    if (destHashes[file.path] === file.hash) skip.push(file.path)
    else write.push(file)
  }
  return { write, skip, leftover: plan.leftover }
}

export type BrainVaultMode = 'one_way' | 'two_way'

export interface BrainVaultSyncPlan {
  readonly mode: BrainVaultMode
  readonly export: BrainVaultApply
  readonly importFiles: readonly BrainVaultFile[]
}

/**
 * One-way default: write/skip export, import nothing. Two-way also pulls dest
 * files whose hash is not already in the brain (never deletes leftovers).
 * @param input - Pages, dest files, optional mode and existing hashes.
 * @returns Export apply plus dest files to import when two-way.
 */
export function planBrainVaultSync(input: {
  readonly pages: readonly BrainPage[]
  readonly dest?: readonly BrainVaultFile[]
  readonly mode?: BrainVaultMode
  readonly existingHashes?: ReadonlySet<string>
}): BrainVaultSyncPlan {
  const dest = input.dest ?? []
  const destRels = dest.map(file => file.path)
  const destHashes = Object.fromEntries(dest.map(file => [file.path, file.hash]))
  const applied = applyBrainVaultExport(planBrainVaultExport(input.pages, destRels), destHashes)
  const mode = input.mode ?? 'one_way'
  if (mode === 'one_way') return { mode, export: applied, importFiles: [] }
  const existing = input.existingHashes ?? new Set(input.pages.map(page => contentHash(brainPageToMarkdown(page))))
  const justWrote = new Set(applied.write.map(file => file.hash))
  const importFiles = dest.filter(file =>
    !file.path.includes('..')
    && file.path.endsWith('.md')
    && !justWrote.has(file.hash)
    && shouldImportVaultFile(existing, file))
  return { mode, export: applied, importFiles }
}

export interface BrainVaultPageImport {
  readonly kind: 'page'
  readonly path: string
  readonly hash: string
  readonly page: BrainPageMarkdown
}

export interface BrainVaultForeignImport {
  readonly kind: 'foreign'
  readonly path: string
  readonly hash: string
  readonly body: string
}

export type BrainVaultImportItem = BrainVaultPageImport | BrainVaultForeignImport

export interface BrainVaultSyncApply {
  readonly mode: BrainVaultMode
  readonly export: BrainVaultApply
  readonly imports: readonly BrainVaultImportItem[]
}

/**
 * Persist helper for Anvil/Rivet: write/skip from export; two-way dest files
 * become a brain page when they have our frontmatter, otherwise stay foreign
 * for the BYC markdown path. Never deletes leftovers.
 * @param plan - {@link planBrainVaultSync} result.
 * @returns Export apply plus classified dest imports.
 */
export function applyBrainVaultSync(plan: BrainVaultSyncPlan): BrainVaultSyncApply {
  const imports: BrainVaultImportItem[] = plan.importFiles.map((file) => {
    const page = tryParseBrainPageMarkdown(file.body)
    if (page === null) {
      return { kind: 'foreign', path: file.path, hash: file.hash, body: file.body }
    }
    return { kind: 'page', path: file.path, hash: file.hash, page }
  })
  return { mode: plan.mode, export: plan.export, imports }
}

/**
 * Dest notes that are not our pack — feed {@link previewBringVault} / markdown.
 * @param imports - {@link applyBrainVaultSync} imports.
 * @returns Files for the BYC vault preview (`path` + `text`).
 */
export function foreignVaultToBringFiles(
  imports: readonly BrainVaultImportItem[],
): readonly BringVaultFile[] {
  return imports
    .filter((row): row is BrainVaultForeignImport => row.kind === 'foreign')
    .map(row => ({ path: row.path, text: row.body }))
}
