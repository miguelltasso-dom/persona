/**
 * P0-C2 (Atlas 07/11, EQUIPE-REAL-SPEC §(e)): the files a persona SAVES in the draft of a Task become part of the thread. This module is the host's side of it (the
 * count of changed files for the "agora" strip is `draft-files.ts`, another thing):
 *
 *   - {@link readDraftFile}: read ONE file of a draft by its relative path, never outside the draft (no `..`, no absolute path, no symlink out). The opinion tool uses it to
 *     show the team the art the asker saved.
 *   - {@link changedSince}: the files a turn wrote (the draft is a copy/worktree made BEFORE the turn, so what is newer than the turn's start was written by it).
 *   - {@link thumbOf}: the picture for the line of the thread (so it survives Aplicar and Descartar), as a data URL: for a SVG the SVG ITSELF (checked, with the namespaces the
 *     browser needs: it is vector, the screen scales it without loss through `<img src>`); for a raster a PNG up to 640 px wide. Both fall back to smaller pictures to fit the budget.
 *   - {@link draftFilesOfTurn}: the list of `DraftFileView` of one turn, with the PNG sibling of every SVG the persona saved (the team SEES the PNG).
 *   - {@link filesSavedBody}: the fallback sentence of the typed line.
 *
 * Pure reading of the draft (the PNG siblings are the only thing written). Nothing here throws on a bad file: it is left out.
 */

import { lstatSync, readdirSync, readFileSync, realpathSync, statSync } from 'node:fs'
import { basename, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { checkSvg, loadSharp, renderSvgSiblings, type SharpFactory } from './svg-to-png.ts'
import type { DraftFileView } from './types.ts'

/**
 * A thumbnail is a data URL of at most this many characters (128 KB of text: well under the 256 K the screen draws, `REVIEW_IMAGE_MAX_CHARS`), so a typed line stays small. It
 * carries the art big and sharp (DESIGN-01 Fio real, Flint 11/11): the SVG itself, or a raster up to {@link DRAFT_THUMB_WIDTH} px wide.
 */
export const DRAFT_THUMB_MAX_CHARS = 128 * 1024
/** When a line has spent its budget ({@link DRAFT_THUMBS_LINE_MAX_CHARS}) the next thumbnails are held to this (the small tier: 24 KB of text). */
export const DRAFT_THUMB_MIN_CHARS = 24 * 1024
/** All the thumbnails of ONE line add up to about this much (the thumbnails are stored with the line, so a line of big art must not grow without bound). */
export const DRAFT_THUMBS_LINE_MAX_CHARS = 384 * 1024
/** The widest raster thumbnail, in pixels (the opinion card draws the art up to 320 CSS px, 640 at 2x). A raster narrower than this is never enlarged. */
export const DRAFT_THUMB_WIDTH = 640
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
/** What the HOST puts in a draft (the person's attachments in `inputs/`, a colleague's copies in `recebidos/`: draft-inbox.ts) is never something the persona saved. */
const HOST_PUT = /^(?:inputs|recebidos)\//u

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

async function pngThumb(sharp: SharpFactory, input: Buffer, width: number, palette: number | undefined, density: number | undefined, maxChars: number): Promise<string | undefined> {
  const done = await sharp(input, { failOn: 'error', ...(density === undefined ? {} : { density }) })
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: density === undefined })
    .png({ compressionLevel: 9, effort: 7, ...(palette === undefined ? {} : { palette: true, colours: palette }) })
    .toBuffer({ resolveWithObject: true })
  const url = `data:image/png;base64,${done.data.toString('base64')}`
  return url.length <= maxChars ? url : undefined
}

/** The PNG sizes tried, best first: full width as it is, the same with a palette (flat art shrinks a lot with no visible loss), then narrower and narrower. */
const RASTER_LADDER: readonly (readonly [number, number | undefined])[] = [
  [DRAFT_THUMB_WIDTH, undefined], [DRAFT_THUMB_WIDTH, 256], [480, 256], [320, 256], [192, 64], [96, 32],
]

/** A photo as a PNG is far too heavy for the cap, so a JPEG source stays a JPEG: width and quality tried, best first. */
const JPEG_LADDER: readonly (readonly [number, number])[] = [
  [DRAFT_THUMB_WIDTH, 82], [DRAFT_THUMB_WIDTH, 65], [480, 65], [320, 65], [192, 60], [96, 55],
]

async function jpegThumb(sharp: SharpFactory, input: Buffer, width: number, quality: number, maxChars: number): Promise<string | undefined> {
  const done = await sharp(input, { failOn: 'error' })
    .resize({ width, height: width, fit: 'inside', withoutEnlargement: true })
    .jpeg({ quality })
    .toBuffer({ resolveWithObject: true })
  const url = `data:image/jpeg;base64,${done.data.toString('base64')}`
  return url.length <= maxChars ? url : undefined
}

/** What no SVG that is drawn as a picture may carry, on top of {@link checkSvg} (script, foreignObject, `on*`, external reference): another document embedded in it. */
const EMBEDS = /<(?:iframe|embed|object)[\s/>]/iu

/**
 * The SVG without its comments (they are not part of the picture and weigh). The refusals run on THIS text, never on the original: taking a comment out of `<scr<!-- -->ipt>` makes a
 * script, and what is sent must be what was checked.
 */
function withoutComments(svg: string): string {
  return svg.replace(/<!--[\s\S]*?-->/gu, '').trim()
}

/**
 * A SVG ready to be the `src` of an `<img>`: the SVG the persona saved, with the namespaces a browser insists on and a renderer like librsvg forgives (`xmlns` on the root; `xmlns:xlink`
 * when `xlink:` is used and never declared: without them the browser draws a broken picture). Nothing else is touched. {@link checkSvg} has already refused script and external resources.
 * @param svg - The SVG text.
 */
export function svgForImage(svg: string): string {
  const text = svg.replace(/^﻿/u, '')
  const root = /<svg(?=[\s/>])[^>]*>/iu.exec(text)
  if (root === null) return text
  const extra = [
    /\sxmlns\s*=/iu.test(root[0]) ? '' : ' xmlns="http://www.w3.org/2000/svg"',
    /\bxlink:[a-z]/iu.test(text) && !/\sxmlns:xlink\s*=/iu.test(text) ? ' xmlns:xlink="http://www.w3.org/1999/xlink"' : '',
  ].join('')
  return extra === '' ? text : `${text.slice(0, root.index)}<svg${extra}${text.slice(root.index + 4)}`
}

export interface ThumbOptions {
  /** The most characters the data URL may have (default {@link DRAFT_THUMB_MAX_CHARS}). */
  readonly maxChars?: number
}

/**
 * The picture of an image for the line of the thread, as a data URL (PNG, JPEG, GIF, WebP or a SVG that passes {@link checkSvg}).
 *  - SVG: the SVG itself (`data:image/svg+xml;base64,…`, see {@link svgForImage}) when it parses and fits; the screen treats it as vector and scales it with no loss. A SVG too big for that
 *    is drawn as a PNG like a raster.
 *    Its comments are taken out first and the refusals (script, foreignObject, `on*`, external reference, entity, iframe/embed/object) run on the text that is sent.
 *  - Raster (and the fallback of a big SVG): a PNG up to {@link DRAFT_THUMB_WIDTH} px wide (never enlarged), then narrower and with a palette until it fits, down to 96 px; none when even that is too big.
 *  - A JPEG stays a JPEG (`data:image/jpeg;base64,…`, 640 px at quality 82, then lighter and narrower): a photo as a PNG would not fit.
 * @param bytes - The file.
 * @param mime - Its media type.
 * @param options - `maxChars`.
 */
export async function thumbOf(bytes: Buffer, mime: string, options: ThumbOptions = {}): Promise<string | undefined> {
  try {
    const svg = mime === 'image/svg+xml'
    if (!svg && !/^image\/(?:png|jpeg|gif|webp)$/u.test(mime)) return undefined
    if (bytes.length > THUMB_SOURCE_MAX_BYTES) return undefined
    const maxChars = options.maxChars ?? DRAFT_THUMB_MAX_CHARS
    const text = svg ? withoutComments(bytes.toString('utf8')) : undefined
    if (text !== undefined && (checkSvg(text) !== undefined || EMBEDS.test(text))) return undefined
    const sharp = loadSharp()
    if (sharp === undefined) return undefined
    if (mime === 'image/jpeg') {
      for (const [width, quality] of JPEG_LADDER) {
        const url = await jpegThumb(sharp, bytes, width, quality, maxChars)
        if (url !== undefined) return url
      }
      return undefined
    }
    let source = bytes
    let intrinsic: number | undefined
    if (text !== undefined) {
      // What is shipped is what is checked: the renderer (libxml2, as strict as a browser about the XML) must parse THIS text.
      const ready = svgForImage(text)
      source = Buffer.from(ready, 'utf8')
      intrinsic = (await sharp(source, { failOn: 'error' }).metadata()).width
      const url = `data:image/svg+xml;base64,${source.toString('base64')}`
      if (url.length <= maxChars) return url
    }
    for (const [width, palette] of RASTER_LADDER) {
      const density = intrinsic !== undefined && intrinsic > 0 ? Math.max(72, Math.min(600, Math.round(72 * width / intrinsic))) : undefined
      const url = await pngThumb(sharp, source, width, palette, density, maxChars)
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
  const changed = changedSince(input.root, input.since).filter(path => !HOST_PUT.test(path)).slice(0, DRAFT_FILES_MAX)
  if (changed.length === 0) return []
  const svgs = changed.filter(path => /\.svg$/iu.test(path))
  const siblings = svgs.length === 0 ? undefined : await renderSvgSiblings(input.root, { only: svgs })
  const made = new Set(siblings?.written ?? [])
  const views: DraftFileView[] = []
  let thumbs = 0
  let budget = DRAFT_THUMBS_LINE_MAX_CHARS
  for (const path of changed) {
    // The PNG this module just drew is part of the SVG's item (`pngPath`), not a file the persona saved.
    if (made.has(path)) continue
    const read = readDraftFile(input.root, path)
    if (!read.ok) continue
    const wantsThumb = thumbs < DRAFT_THUMBS_MAX && read.mime.startsWith('image/')
    // The first pictures may be big and sharp; what the line has left after them is shared, never below the small tier.
    const thumb = wantsThumb ? await thumbOf(read.bytes, read.mime, { maxChars: Math.max(DRAFT_THUMB_MIN_CHARS, Math.min(DRAFT_THUMB_MAX_CHARS, budget)) }) : undefined
    if (wantsThumb) thumbs += 1
    if (thumb !== undefined) budget -= thumb.length
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
