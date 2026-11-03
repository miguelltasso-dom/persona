/**
 * Keep worktree, persona-files, and skill paths inside a trusted root.
 * Rejects `..`, absolute paths, NUL, and symlink/junction escapes.
 */

import { existsSync, realpathSync } from 'node:fs'
import { isAbsolute, normalize, resolve, sep } from 'node:path'

/** Path escaped the trusted root. */
export class PathEscapeError extends Error {
  readonly code = 'PATH_ESCAPE'
  /**
   * @param requested - Path the caller asked for.
   */
  constructor(readonly requested: string) {
    super(`PATH_ESCAPE:${requested}`)
    this.name = 'PathEscapeError'
  }
}

function underRoot(rootAbs: string, destAbs: string): boolean {
  const prefix = rootAbs.endsWith(sep) ? rootAbs : rootAbs + sep
  return destAbs === rootAbs || destAbs.startsWith(prefix)
}

function assertResolvedInside(rootAbs: string, destAbs: string, requested: string): void {
  if (!underRoot(rootAbs, destAbs)) throw new PathEscapeError(requested)
  if (!existsSync(destAbs)) return
  if (!underRoot(rootAbs, realpathSync(destAbs))) throw new PathEscapeError(requested)
}

/**
 * Ticket / file name: no separators, `..`, or absolute form.
 * @param segment - Single path component.
 */
export function confineSegment(segment: string): string {
  if (segment.includes('\0') || segment.includes('/') || segment.includes('\\')
    || segment === '..' || segment === '.' || isAbsolute(segment) || segment === '') {
    throw new PathEscapeError(segment)
  }
  return segment
}

/**
 * Resolve `requested` under `root`. Relative only; `..` and absolute forms fail.
 * @param root - Trusted parent (worktrees, persona-files, or skills).
 * @param requested - Caller-supplied relative path.
 */
export function confinePath(root: string, requested: string): string {
  if (requested.includes('\0')) throw new PathEscapeError(requested)
  if (requested === '' || isAbsolute(requested)) throw new PathEscapeError(requested)
  const collapsed = normalize(requested)
  if (collapsed.split(/[/\\]/).includes('..')) throw new PathEscapeError(requested)
  const rootAbs = resolve(root)
  const dest = resolve(rootAbs, collapsed)
  assertResolvedInside(rootAbs, dest, requested)
  return dest
}

/**
 * Admit an already-absolute dest only when it stays under `root` after resolve.
 * @param root - Trusted parent.
 * @param requested - Absolute path (Windows drive or UNC included).
 */
export function confineAbsolute(root: string, requested: string): string {
  if (requested.includes('\0') || !isAbsolute(requested)) throw new PathEscapeError(requested)
  const rootAbs = resolve(root)
  const dest = resolve(requested)
  assertResolvedInside(rootAbs, dest, requested)
  return dest
}
