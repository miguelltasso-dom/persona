/** File operations for isolated drafts; private metadata never enters a source folder. */
import { constants } from 'node:fs'
import { copyFile, lstat, mkdir, readdir } from 'node:fs/promises'
import { dirname, relative, resolve } from 'node:path'
import { confinePath, confineSegment } from '../executor/confine.ts'

/** Stable failures the host can present without exposing subprocess diagnostics. */
export type HistoryReviewFailure = 'git_unavailable' | 'git_failed' | 'git_timeout' | 'copy_limit' | 'unsafe_path' | 'history_invalid' | 'file_unavailable'
  | 'history_busy' | 'apply_failed' | 'recovery_required' | 'restore_expired'
  | 'conflicts_changed'
  | 'invalid_restore_point'

/** Actionable draft failure; the source folder is untouched when preparation fails. */
export class HistoryReviewError extends Error {
  /**
   * @param code - Machine-readable failure category.
   * @param message - Safe Portuguese recovery guidance.
   * @param cause - Original failure retained for local diagnostics.
   */
  constructor(readonly code: HistoryReviewFailure, message: string, cause?: unknown) {
    super(message, { cause })
    this.name = 'HistoryReviewError'
  }
}

/** A copy must remain independent when the draft is edited; shared writable hardlinks are forbidden. */
export interface HistoryFileOps {
  /**
   * Copy bytes, hydrating an online-only source when needed; reject when the source cannot be read safely.
   * @param source - Validated source filename.
   * @param destination - Validated independent copy filename.
   * @returns Completion after all bytes are available at the destination.
   */
  copyFile(source: string, destination: string): Promise<void>
}

/** Default copy uses copy-on-write when available, with an independent-byte copy otherwise. */
export const historyFileOps: HistoryFileOps = {
  copyFile: (source, destination) => copyFile(source, destination, constants.COPYFILE_FICLONE),
}

/** One regular file admitted to a draft or restoration snapshot. */
export interface HistoryFile { path: string; bytes: number; mode: '100644' | '100755' }

/**
 * Parse durable private metadata with a structured failure instead of treating damaged state as an empty history.
 * @param body - Stored JSON text.
 * @returns Parsed value, requiring the owning record reader to validate its fields.
 */
export function parseHistoryJson(body: string): unknown {
  try { return JSON.parse(body) }
  catch (error) { throw new HistoryReviewError('history_invalid', 'O histórico desta pasta está incompleto. Preserve os arquivos e peça ajuda antes de continuar.', error) }
}

/**
 * Validate an opaque project or ticket identifier before using it as a directory or ref name.
 * @param value - Project or ticket id.
 * @returns The same validated identifier.
 */
export function historySegment(value: string): string {
  confineSegment(value)
  if (!/^[\w-]+$/u.test(value)) throw new HistoryReviewError('unsafe_path', 'O identificador desta tarefa não permite criar um rascunho seguro.')
  return value
}

/**
 * Enumerate regular source files without following links, excluding private data and transient Office/Windows metadata.
 * @param root - Folder whose bytes may be read.
 * @param excludedRoots - Private directories that may be nested inside the selected folder.
 * @param limit - Maximum sum of logical file sizes.
 * @returns Stable relative file names and byte counts.
 */
export async function historyFiles(root: string, excludedRoots: readonly string[], limit: number): Promise<HistoryFile[]> {
  const files: HistoryFile[] = []
  const key = (path: string): string => process.platform === 'win32' ? resolve(path).toLowerCase() : resolve(path)
  const excluded = new Set(excludedRoots.map(key))
  let bytes = 0
  const walk = async (directory: string): Promise<void> => {
    const entries = await readdir(directory, { withFileTypes: true })
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      const lower = entry.name.toLowerCase()
      if (lower === '.git' || lower === 'thumbs.db' || lower === 'desktop.ini' || lower.endsWith('.tmp') || lower.startsWith('~$')) continue
      const absolute = resolve(directory, entry.name)
      if (excluded.has(key(absolute))) continue
      if (entry.isSymbolicLink()) throw new HistoryReviewError('unsafe_path', 'Esta pasta contém um atalho para outra pasta. Escolha os arquivos diretamente para criar o rascunho.')
      if (entry.isDirectory()) { await walk(absolute); continue }
      if (!entry.isFile()) continue
      const stat = await lstat(absolute)
      bytes += stat.size
      if (bytes > limit) throw new HistoryReviewError('copy_limit', `Os arquivos ultrapassam o limite de ${limit} bytes deste rascunho. Escolha uma pasta menor ou aumente o limite nas configurações.`)
      files.push({ path: relative(root, absolute).replaceAll('\\', '/'), bytes: stat.size, mode: stat.mode & 0o111 ? '100755' : '100644' })
    }
  }
  await walk(root)
  return files
}

/**
 * Copy admitted files to a private draft without sharing writable file contents.
 * @param source - Original folder.
 * @param destination - Private draft folder.
 * @param files - Validated relative names.
 * @param operations - Platform copy implementation.
 */
export async function copyHistoryFiles(source: string, destination: string, files: readonly HistoryFile[], operations: HistoryFileOps): Promise<void> {
  for (const file of files) {
    const target = confinePath(destination, file.path)
    await mkdir(dirname(target), { recursive: true })
    try { await operations.copyFile(confinePath(source, file.path), target) }
    catch (error) {
      // The platform layer already knows WHY (a file another program holds, an online-only OneDrive file, a long path) and says
      // what to do with the file name: that line is the one the person must read, not the generic one below.
      if (error instanceof HistoryReviewError) throw error
      throw new HistoryReviewError('file_unavailable', `Não conseguimos copiar “${file.path}”. Feche o arquivo, confirme que ele está disponível neste computador e tente de novo.`, error)
    }
  }
}
