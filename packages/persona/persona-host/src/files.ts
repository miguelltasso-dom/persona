/** Confine project file paths to the stored root (D-020). */
import { existsSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { isAbsolute, relative, resolve } from 'node:path'
import { MAX_FILE_BYTES, MediaError, fileTooLargeMessage } from './media-detect.ts'
import type { ProjectFileEntry, ProjectFileListing, ProjectFileStat, ProjectFileText } from './types.ts'

/**
 * Resolve `rel` under `rootPath`. Rejects absolute paths, NUL, and `..` escapes.
 * @param rootPath - Absolute project root from the store.
 * @param rel - Workspace-relative path; empty or `.` is the root.
 * @returns Absolute path inside the root.
 */
export function resolveProjectPath(rootPath: string, rel: string): string {
  if (rootPath === '') throw new Error('project-root-missing')
  const normalized = rel.replaceAll('\\', '/')
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized) || normalized.includes('\0')) {
    throw new Error('path-outside-root')
  }
  const rootAbs = resolve(rootPath)
  const target = normalized === '' || normalized === '.' ? rootAbs : resolve(rootAbs, normalized)
  assertInside(rootAbs, target)
  return target
}

/**
 * List direct children of a confined directory.
 * @param rootPath - Project root.
 * @param rel - Relative directory.
 * @returns Listing with the requested relative path.
 */
export function listProjectFiles(rootPath: string, rel: string): ProjectFileListing {
  const target = resolveExisting(rootPath, rel)
  const info = statSync(target)
  if (!info.isDirectory()) throw new Error('not-directory')
  const entries = readdirSync(target, { withFileTypes: true })
    .filter(entry => entry.isFile() || entry.isDirectory())
    .map((entry): ProjectFileEntry => ({
      name: entry.name,
      kind: entry.isDirectory() ? 'directory' : 'file',
    }))
    .sort((left, right) => left.name.localeCompare(right.name))
  return { status: 'ok', path: rel, entries, message: '' }
}

/**
 * Stat one confined file or directory.
 * @param rootPath - Project root.
 * @param rel - Relative path.
 * @returns Kind and size.
 */
export function statProjectFile(rootPath: string, rel: string): ProjectFileStat {
  const target = resolveExisting(rootPath, rel)
  const info = statSync(target)
  if (!info.isFile() && !info.isDirectory()) throw new Error('not-regular')
  return {
    status: 'ok',
    path: rel,
    kind: info.isDirectory() ? 'directory' : 'file',
    bytes: info.isFile() ? info.size : 0,
    message: '',
  }
}

/**
 * Read a confined UTF-8 file.
 * @param rootPath - Project root.
 * @param rel - Relative file.
 * @returns Text and byte length.
 */
export function readProjectFile(rootPath: string, rel: string): ProjectFileText {
  const target = resolveExisting(rootPath, rel)
  const info = statSync(target)
  if (!info.isFile()) throw new Error('not-regular')
  if (info.size > MAX_FILE_BYTES) {
    throw new MediaError(
      'file-too-large',
      fileTooLargeMessage(info.size, MAX_FILE_BYTES, 'Este arquivo'),
    )
  }
  const text = readFileSync(target, 'utf8')
  if (text.includes('\0')) throw new Error('not-text')
  return { status: 'ok', path: rel, text, bytes: info.size, message: '' }
}

function resolveExisting(rootPath: string, rel: string): string {
  const target = resolveProjectPath(rootPath, rel)
  if (!existsSync(target)) throw new Error('file-not-found')
  const rootReal = realpathSync(resolve(rootPath))
  const targetReal = realpathSync(target)
  assertInside(rootReal, targetReal)
  return targetReal
}

function assertInside(rootAbs: string, target: string): void {
  const out = relative(rootAbs, target)
  if (out.startsWith('..') || isAbsolute(out)) throw new Error('path-outside-root')
}
