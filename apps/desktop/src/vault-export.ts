/**
 * SB-6 one-way Obsidian export. Writes markdown; never deletes dest extras.
 * Reimport skip is hash equality (Forge/Anvil).
 */

import { createHash } from 'node:crypto'

/** One page to copy out. */
export interface VaultExportPage {
  readonly rel: string
  readonly body: string
}

/**
 * Copy pages into a vault folder. Same path+hash is skipped. Dest files we
 * did not write stay (mão única).
 * @param pages - Markdown pages (relative paths).
 * @param write - Dest write.
 * @param existingHash - Optional current dest hash (hex sha256).
 */
export function exportMarkdownOneWay(
  pages: readonly VaultExportPage[],
  write: (rel: string, body: string) => void,
  existingHash?: (rel: string) => string | undefined,
): { written: number; skipped: number } {
  let written = 0
  let skipped = 0
  for (const page of pages) {
    if (!page.rel.endsWith('.md') || page.rel.includes('..')) continue
    const hash = createHash('sha256').update(page.body).digest('hex')
    if (existingHash?.(page.rel) === hash) {
      skipped += 1
      continue
    }
    write(page.rel, page.body)
    written += 1
  }
  return { written, skipped }
}

/**
 * Dest markdown that the export did not write. Never deleted (mão única).
 * @param destRels - Relative paths already in the vault.
 * @param exportedRels - Paths this run wrote or skipped as same-hash.
 */
export function leftoverDestFiles(
  destRels: readonly string[],
  exportedRels: readonly string[],
): readonly string[] {
  const kept = new Set(exportedRels.filter(rel => rel.endsWith('.md') && !rel.includes('..')))
  return destRels.filter(rel => rel.endsWith('.md') && !rel.includes('..') && !kept.has(rel))
}

/** Dry-run of a one-way export. Dest leftovers are listed, never deleted. */
export interface VaultExportPlan {
  readonly written: number
  readonly skipped: number
  readonly leftover: readonly string[]
}

/**
 * Plan a one-way export without deleting dest extras.
 * @param pages - Markdown pages.
 * @param destRels - Paths already in the dest vault.
 * @param existingHash - Optional dest hash (hex sha256).
 */
export function planVaultExport(
  pages: readonly VaultExportPage[],
  destRels: readonly string[],
  existingHash?: (rel: string) => string | undefined,
): VaultExportPlan {
  return applyVaultExport(pages, destRels, () => undefined, existingHash)
}

/**
 * Write a one-way export. Dest leftovers are listed, never deleted.
 * @param pages - Markdown pages.
 * @param destRels - Paths already in the dest vault.
 * @param write - Dest write.
 * @param existingHash - Optional dest hash (hex sha256).
 */
export function applyVaultExport(
  pages: readonly VaultExportPage[],
  destRels: readonly string[],
  write: (rel: string, body: string) => void,
  existingHash?: (rel: string) => string | undefined,
): VaultExportPlan {
  const exported: string[] = []
  const counts = exportMarkdownOneWay(pages, (rel, body) => {
    exported.push(rel)
    write(rel, body)
  }, existingHash)
  return {
    written: counts.written,
    skipped: counts.skipped,
    leftover: leftoverDestFiles(destRels, [...exported, ...pages.map(page => page.rel)]),
  }
}
