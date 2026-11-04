/**
 * One-way (default) markdown export of second-brain pages. Reimport uses
 * path + content hash (BYC) so the same file does not duplicate.
 */

import { contentHash } from '../import/bring-context.ts'
import { DomainError } from './schemas.ts'
import { BRAIN_PAGE_KINDS, startHereLinks, type BrainPage, type BrainPageKind, type BrainVisibility } from './brain.ts'

function fence(body: string): string {
  return body.replace(/\r\n/g, '\n').trimEnd()
}

function visibilityLine(visibility: BrainVisibility): string {
  if (visibility.kind === 'workspace') return 'workspace'
  if (visibility.kind === 'project') return `project:${visibility.projectId}`
  return `members:${visibility.memberIds.join(',')}`
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

/**
 * @param markdown - Document produced by {@link brainPageToMarkdown}.
 */
export function markdownToBrainPage(markdown: string): Pick<
  BrainPage,
  'id' | 'kind' | 'title' | 'revision' | 'status' | 'workspaceId' | 'body' | 'required' | 'links'
> {
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
