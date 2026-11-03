/** Backup / restore of PERSONA_HOME. Never deletes without confirmation. Vault plaintext stays out of the zip. */

import { existsSync } from 'node:fs'
import { mkdir, readFile, readdir, rename, writeFile } from 'node:fs/promises'
import { dirname, join, sep } from 'node:path'
import { gunzipSync, gzipSync } from 'node:zlib'

const SKIP_DIR_NAMES = new Set(['node_modules', '.git'])
const SKIP_FILE_NAMES = new Set(['.env', 'credentials.json', 'secrets.json'])

/**
 * Paths that must not enter a backup zip (plaintext secrets).
 * Sealed DPAPI vault blobs may stay; they only open on the same Windows account.
 * @param rel - Path relative to PERSONA_HOME, posix or win separators.
 */
export function shouldSkipBackupPath(rel: string): boolean {
  const norm = rel.replaceAll('\\', '/').replace(/^\/+/u, '')
  const parts = norm.split('/')
  if (parts.some(part => SKIP_DIR_NAMES.has(part))) return true
  const base = parts.at(-1) ?? ''
  if (SKIP_FILE_NAMES.has(base)) return true
  if (base.startsWith('.env.')) return true
  if (/\.(pem|key)$/iu.test(base)) return true
  if (/(?:^|\/)(?:plaintext|secret|cofre-plain)/iu.test(norm)) return true
  if (/(?:^|\/)vault\/plain(?:text)?(?:\/|$)/iu.test(norm)) return true
  return false
}

export interface BackupArchive {
  pack(files: readonly { readonly rel: string; readonly abs: string }[], dest: string): Promise<void>
  unpack(archive: string, dest: string): Promise<void>
}

async function walk(root: string, rel = ''): Promise<{ rel: string; abs: string }[]> {
  const abs = rel === '' ? root : join(root, rel)
  const entries = await readdir(abs, { withFileTypes: true })
  const out: { rel: string; abs: string }[] = []
  for (const entry of entries) {
    const childRel = rel === '' ? entry.name : join(rel, entry.name)
    if (shouldSkipBackupPath(childRel)) continue
    if (entry.isDirectory()) {
      out.push(...await walk(root, childRel))
      continue
    }
    if (entry.isFile()) out.push({ rel: childRel.split(sep).join('/'), abs: join(root, childRel) })
  }
  return out
}

/**
 * Default archive: gzip of `path\\nsize\\n` records plus file bytes.
 * Extension stays `.zip` as the product command name (no extra dependency).
 */
export const gzipBackupArchive: BackupArchive = {
  async pack(files, dest) {
    const chunks: Buffer[] = []
    for (const file of files) {
      const data = await readFile(file.abs)
      chunks.push(Buffer.from(`${file.rel}\n${String(data.length)}\n`, 'utf8'), data)
    }
    await mkdir(dirname(dest), { recursive: true })
    await writeFile(dest, gzipSync(Buffer.concat(chunks)))
  },
  async unpack(archive, dest) {
    await mkdir(dest, { recursive: true })
    const raw = gunzipSync(await readFile(archive))
    let offset = 0
    while (offset < raw.length) {
      const nl1 = raw.indexOf(0x0a, offset)
      if (nl1 < 0) break
      const rel = raw.subarray(offset, nl1).toString('utf8')
      const nl2 = raw.indexOf(0x0a, nl1 + 1)
      if (nl2 < 0) break
      const size = Number(raw.subarray(nl1 + 1, nl2).toString('utf8'))
      offset = nl2 + 1
      if (!Number.isInteger(size) || size < 0) break
      const body = raw.subarray(offset, offset + size)
      offset += size
      if (shouldSkipBackupPath(rel)) continue
      const target = join(dest, ...rel.split('/'))
      await mkdir(dirname(target), { recursive: true })
      await writeFile(target, body)
    }
  },
}

export interface BackupNowResult {
  readonly path: string
}

/**
 * Zip PERSONA_HOME without plaintext vault secrets.
 * @param home - PERSONA_HOME.
 * @param destZip - Destination file.
 * @param archive - Injected packer (tests).
 */
export async function backupPersonaHome(
  home: string,
  destZip: string,
  archive: BackupArchive = gzipBackupArchive,
): Promise<BackupNowResult> {
  if (!existsSync(home)) throw new Error('persona home missing')
  await archive.pack(await walk(home), destZip)
  return { path: destZip }
}

export interface RestoreBackupOptions {
  readonly home: string
  readonly archivePath: string
  readonly confirmed: boolean
  readonly now?: () => Date
  readonly archive?: BackupArchive
}

export interface RestoreBackupResult {
  readonly safetyCopy: string
}

/**
 * Restore a backup after an explicit confirm, keeping a safety copy of current data.
 * @param options - Home, archive, confirmation.
 */
export async function restorePersonaBackup(options: RestoreBackupOptions): Promise<RestoreBackupResult> {
  if (options.confirmed !== true) throw new Error('restore requires confirmation')
  const now = options.now ?? (() => new Date())
  const stamp = now().toISOString().replaceAll(':', '').replaceAll('.', '')
  const safetyCopy = `${options.home}.safety-${stamp}`
  if (existsSync(options.home)) await rename(options.home, safetyCopy)
  await mkdir(options.home, { recursive: true })
  await (options.archive ?? gzipBackupArchive).unpack(options.archivePath, options.home)
  return { safetyCopy }
}
