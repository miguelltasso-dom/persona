/** Walk a user-chosen vault folder for BYC (local .md only). */
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import {
  classifyVaultPath,
  listVaultFolderFiles,
  previewBringVault,
  type BringContextPreview,
  type BringExistingRecord,
  type BringIgnored,
  type BringVaultFile,
} from '@deepseek-ai/dsh-persona-core'
import { MAX_FILE_BYTES, MediaError } from './media-detect.ts'

function assertVaultRoot(rootPath: string): string {
  const abs = resolve(rootPath)
  if (!existsSync(abs)) throw new Error('vault-root-missing')
  const info = statSync(abs)
  if (!info.isDirectory()) throw new Error('vault-root-not-directory')
  return abs
}

function walkFiles(
  root: string,
  dir: string,
  prefix: string,
  acc: BringVaultFile[],
  seen: string[],
): void {
  const entries = readdirSync(dir, { withFileTypes: true })
  for (const entry of entries) {
    const rel = prefix === '' ? entry.name : `${prefix}/${entry.name}`
    const abs = join(dir, entry.name)
    if (entry.isDirectory()) {
      const kind = classifyVaultPath(rel)
      if (kind === 'obsidian' || kind === 'trash') {
        seen.push(`${rel.replace(/\\/g, '/')}/`)
        continue
      }
      walkFiles(root, abs, rel, acc, seen)
      continue
    }
    if (!entry.isFile()) continue
    seen.push(rel.replace(/\\/g, '/'))
    const kind = classifyVaultPath(rel)
    if (kind !== 'keep') continue
    const info = statSync(abs)
    if (info.size > MAX_FILE_BYTES) continue
    const text = readFileSync(abs, 'utf8')
    acc.push({ path: rel.replace(/\\/g, '/'), text })
  }
}

/**
 * @param rootPath - Absolute folder from Electron picker.
 * @param existing - Current Cofre rows (dedup / conflict).
 * @returns Preview proposals + ignored paths.
 */
export function previewBringContextVaultFolder(
  rootPath: string,
  existing: readonly BringExistingRecord[] = [],
): BringContextPreview {
  const root = assertVaultRoot(rootPath)
  const files: BringVaultFile[] = []
  const seen: string[] = []
  try {
    walkFiles(root, root, '', files, seen)
  } catch (error) {
    if (error instanceof MediaError) throw error
    throw error
  }
  const listed = listVaultFolderFiles(seen)
  const extraIgnored: BringIgnored[] = listed.ignored.filter(row =>
    !files.some(file => file.path === row.path.replace(/\\/g, '/')))
  const preview = previewBringVault({ files, prior: [], existing })
  return { ...preview, ignored: [...preview.ignored, ...extraIgnored] }
}
