/**
 * P0-C2 (Atlas 07/11, EQUIPE-REAL-SPEC §(e)): the files a persona SAVES in the draft of a Task become part of the thread. This module is the host's side of it (the
 * count of changed files for the "agora" strip is `draft-files.ts`, another thing):
 *
 *   - {@link readDraftFile}: read ONE file of a draft by its relative path, never outside the draft (no `..`, no absolute path, no symlink out). The opinion tool uses it to
 *     show the team the art the asker saved.
 *   - {@link changedSince}: the files a turn wrote (the draft is a copy/worktree made BEFORE the turn, so what is newer than the turn's start was written by it).
 *   - {@link thumbOf}: a small PNG data URL (192 px, falling to 96 px) for the line of the thread, so the picture survives Aplicar and Descartar.
 *   - {@link draftFilesOfTurn}: the list of `DraftFileView` of one turn, with the PNG sibling of every SVG the persona saved (the team SEES the PNG).
 *   - {@link filesSavedBody}: the fallback sentence of the typed line.
 *
 * Pure reading of the draft (the PNG siblings are the only thing written). Nothing here throws on a bad file: it is left out.
 */

import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { checkSvg, loadSharp, renderSvgSiblings, type SharpFactory } from './svg-to-png.ts'
import type { DraftFileView } from './types.ts'

/** A thumbnail is a data URL of at most this many characters (24 KB of text), so a typed line stays small. */
export const DRAFT_THUMB_MAX_CHARS = 24 * 1024
/** A line names at most this many files (the rest is left out of the line, not of the draft). */
export const DRAFT_FILES_MAX = 12
/** Only the first files of a line get a thumbnail (the screen shows 3 and a "+n"). */
export const DRAFT_THUMBS_MAX = 4
/** A file bigger than this is not read into memory. */
export const DRAFT_READ_MAX_BYTES = 25 * 1024 * 1024
/** An image bigger than this is not decoded for a thumbnail. */
const THUMB_SOURCE_MAX_BYTES = 10 * 1024 * 1024
/** The clock of the file system and the clock of the process can differ by a few milliseconds. */
const CLOCK_SLACK_MS = 250

const MIME: Readonly<Record<string, string>> = {
  svg: 'image/svg+xml', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp',
  pdf: 'application/pdf', txt: 'text/plain', md: 'text/markdown', html: 'text/html', htm: 'text/html', css: 'text/css',
  js: 'text/javascript', json: 'application/json', csv: 'text/csv', xml: 'application/xml',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
}

/** @returns The media type of a file by its name (`application/octet-stream` when unknown). */
export function mimeOfFile(name: string): string {
  const dot = name.lastIndexOf('.')
  return (dot === -1 ? undefined : MIME[name.slice(dot + 1).toLowerCase()]) ?? 'application/octet-stream'
}

export type ReadDraftFileResult =
  | { readonly ok: true; readonly bytes: Buffer; readonly mime: string; readonly name: string; readonly path: string }
  | { readonly ok: false; readonly reason: 'outside' | 'not_found' | 'not_file' | 'too_big' }

/**
 * Read one file of a draft by its relative path.
 * @param root - The root of the draft.
 * @param path - Relative path (`/` or `\`). Absolute paths, `..` and symlinks that leave the draft are refused.
 * @param options - `maxBytes` (default 25 MB).
 */
export function readDraftFile(root: string, path: string, options: { readonly maxBytes?: number } = {}): ReadDraftFileResult {
  const wanted = path.trim().replace(/\\/gu, '/')
  if (wanted === '' || wanted.includes('\0') || isAbsolute(wanted) || /^[a-z]:/iu.test(wanted) || wanted.split('/').includes('..')) return { ok: false, reason: 'outside' }
  try {
    const base = realpathSync(resolve(root))
    const full = resolve(base, wanted)
    if (lstatSync(full).isSymbolicLink()) return { ok: false, reason: 'outside' }
    const real = realpathSync(full)
    const inside = relative(base, real)
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return { ok: false, reason: 'outside' }
    const info = statSync(real)
    if (!info.isFile()) return { ok: false, reason: 'not_file' }
    if (info.size > (options.maxBytes ?? DRAFT_READ_MAX_BYTES)) return { ok: false, reason: 'too_big' }
    const name = basename(real)
    return { ok: true, bytes: readFileSync(real), mime: mimeOfFile(name), name, path: inside.split(sep).join('/') }
  } catch (error) {
    void error
    return { ok: false, reason: 'not_found' }
  }
}

function walkFiles(root: string, dir: string, out: { path: string; mtimeMs: number }[], since: number, depth: number): void {
  if (depth > 8 || out.length >= 2000) return
  let names: string[]
  try {
    names = readdirSync(dir)
  } catch {
    return
  }
  for (const name of names) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const full = join(dir, name)
    try {
      const info = lstatSync(full)
      if (info.isSymbolicLink()) continue
      if (info.isDirectory()) walkFiles(root, full, out, since, depth + 1)
      else if (info.isFile() && info.mtimeMs >= since) out.push({ path: relative(root, full).split(sep).join('/'), mtimeMs: info.mtimeMs })
    } catch {
      continue
    }
  }
}

/**
 * The files of a draft written at or after a moment (hidden folders and `node_modules` are not looked into).
 * @param root - The root of the draft.
 * @param sinceMs - Epoch milliseconds (the start of the turn).
 * @returns Relative paths with `/`, oldest write first.
 */
export function changedSince(root: string, sinceMs: number): string[] {
  const out: { path: string; mtimeMs: number }[] = []
  walkFiles(resolve(root), resolve(root), out, sinceMs - CLOCK_SLACK_MS, 0)
  return out.sort((a, b) => a.mtimeMs - b.mtimeMs || a.path.localeCompare(b.path)).map(item => item.path)
}

async function pngThumb(sharp: SharpFactory, input: Buffer, width: number, palette: number | undefined, density: number | undefined): Promise<string | undefined> {
  const done = await sharp(input, { failOn: 'error', ...(density === undefined ? {} : { density }) })
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: density === undefined })
    .png({ compressionLevel: 9, effort: 7, ...(palette === undefined ? {} : { palette: true, colours: palette }) })
    .toBuffer({ resolveWithObject: true })
  const url = `data:image/png;base64,${done.data.toString('base64')}`
  return url.length <= DRAFT_THUMB_MAX_CHARS ? url : undefined
}

/**
 * A small PNG data URL for an image (PNG, JPEG, GIF, WebP or a SVG that passes {@link checkSvg}): 192 px when it fits in 24 KB, else 96 px, else none.
 * @param bytes - The file.
 * @param mime - Its media type.
 */
export async function thumbOf(bytes: Buffer, mime: string): Promise<string | undefined> {
  try {
    const svg = mime === 'image/svg+xml'
    if (!svg && !/^image\/(?:png|jpeg|gif|webp)$/u.test(mime)) return undefined
    if (bytes.length > THUMB_SOURCE_MAX_BYTES) return undefined
    if (svg && checkSvg(bytes.toString('utf8')) !== undefined) return undefined
    const sharp = loadSharp()
    if (sharp === undefined) return undefined
    const intrinsic = svg ? (await sharp(bytes, { failOn: 'error' }).metadata()).width : undefined
    for (const [width, palette] of [[192, undefined], [192, 64], [96, undefined], [96, 32]] as const) {
      const density = svg && intrinsic !== undefined && intrinsic > 0 ? Math.max(72, Math.min(600, Math.round(72 * width / intrinsic))) : undefined
      const url = await pngThumb(sharp, bytes, width, palette, density)
      if (url !== undefined) return url
    }
    return undefined
  } catch (error) {
    void error
    return undefined
  }
}

export interface DraftFilesOfTurn {
  /** Root of the draft (`ticket.execution.directory`). */
  readonly root: string
  /** Start of the turn, epoch ms. */
  readonly since: number
  readonly taskId: string
  readonly personaId: string
}

/**
 * What a persona saved in the draft during one turn, ready for the typed line: one item per path (the final state), oldest write first, at most 12, with the PNG sibling of
 * every SVG (written here, next to it) and a thumbnail for the first images. A file that cannot be read is left out.
 * @param input - Draft, turn start, Task and persona.
 */
export async function draftFilesOfTurn(input: DraftFilesOfTurn): Promise<DraftFileView[]> {
  const changed = changedSince(input.root, input.since).slice(0, DRAFT_FILES_MAX)
  if (changed.length === 0) return []
  const svgs = changed.filter(path => /\.svg$/iu.test(path))
  const siblings = svgs.length === 0 ? undefined : await renderSvgSiblings(input.root, { only: svgs })
  const made = new Set(siblings?.written ?? [])
  const views: DraftFileView[] = []
  let thumbs = 0
  for (const path of changed) {
    // The PNG this module just drew is part of the SVG's item (`pngPath`), not a file the persona saved.
    if (made.has(path)) continue
    const read = readDraftFile(input.root, path)
    if (!read.ok) continue
    const wantsThumb = thumbs < DRAFT_THUMBS_MAX && read.mime.startsWith('image/')
    const thumb = wantsThumb ? await thumbOf(read.bytes, read.mime) : undefined
    if (wantsThumb) thumbs += 1
    const sibling = /\.svg$/iu.test(path) ? path.replace(/\.svg$/iu, '.png') : undefined
    views.push({
      path: read.path, name: read.name, mime: read.mime, taskId: input.taskId, personaId: input.personaId, size: read.bytes.length,
      ...(thumb === undefined ? {} : { thumb }),
      ...(sibling !== undefined && (made.has(sibling) || readDraftFile(input.root, sibling).ok) ? { pngPath: sibling } : {}),
    })
  }
  return views
}

/**
 * The fallback sentence of the typed line (the screen writes its own in pt/en).
 * @param persona - Who saved.
 * @param files - What was saved.
 */
export function filesSavedBody(persona: string, files: readonly DraftFileView[]): string {
  if (files.length === 1) return `${persona} salvou ${files[0]?.name ?? 'um arquivo'} no rascunho`
  return `${persona} salvou ${String(files.length)} arquivos no rascunho`
}
