/**
 * P0-1 ("a arte vira arquivo"): a persona may SAVE files, but only inside the draft of its Task (nothing reaches the person's real folder before Revisar/Aplicar; D-081/D-083: never more
 * access than the person granted). The CLI's `acceptEdits` already confines edits to the working directory; this is the second, independent check the permission gate runs on every
 * built-in file-writing tool call. Pure path logic plus `realpath` of what exists: no I/O beyond that, no model.
 */

import { existsSync, realpathSync } from 'node:fs'
import { basename, dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'

/** The built-in tools of the Claude CLI that write a file (their input names the target). */
export const FILE_WRITE_TOOLS: ReadonlySet<string> = new Set(['Write', 'Edit', 'MultiEdit', 'NotebookEdit'])

/** The path a file-writing tool call targets (`file_path`, or `notebook_path` for a notebook), or undefined when the input names none. */
export function targetOfFileTool(input: unknown): string | undefined {
  if (input === null || typeof input !== 'object') return undefined
  const record = input as Record<string, unknown>
  for (const key of ['file_path', 'notebook_path', 'path']) {
    const value = record[key]
    if (typeof value === 'string' && value.trim() !== '') return value
  }
  return undefined
}

/** The real path of `path` even when the file does not exist yet: the deepest existing ancestor is resolved through symlinks/junctions, the rest is appended as written. */
function realOf(path: string): string {
  let current = resolve(path)
  const rest: string[] = []
  while (!existsSync(current)) {
    const parent = dirname(current)
    if (parent === current) break
    rest.unshift(basename(current))
    current = parent
  }
  let real = current
  try { real = realpathSync.native(current) } catch (error) { void error }
  return join(real, ...rest)
}

/**
 * True when `target` is `root` or lies inside it. A relative target is read from `cwd`; `..`, another drive and a symlink/junction that leaves the root are all OUTSIDE.
 * @param root - The draft directory.
 * @param target - The path the tool call names.
 * @param cwd - Where the CLI resolves a relative path (the worker's working directory).
 */
export function insideRoot(root: string, target: string, cwd: string = root): boolean {
  const base = realOf(root)
  const absolute = realOf(isAbsolute(target) ? target : resolve(cwd, target))
  const way = relative(base, absolute)
  if (way === '') return true
  if (isAbsolute(way)) return false // another drive: `relative` gives back the absolute target
  return way !== '..' && !way.startsWith(`..${sep}`)
}
