/**
 * P0-C2 (Atlas 07/11, pedido explícito do Miguel: o time opina sobre as IMAGENS): the models read only raster, so an SVG the team is to SEE is turned into a PNG.
 *
 *   - {@link svgToPng}: one SVG text -> a PNG (width at most ~1600 px, SVG at most 1 MB, no external resource, no script). Pure and idempotent. It never throws: a refusal or a
 *     failure is a `reason`, and the delivery goes on with the SVG alone (no PNG = the team reads the SVG as text).
 *   - {@link svgBlocksIn}: the SVGs written inside the TEXT of a delivery (a fenced block or a bare `<svg>…</svg>`), at most 3.
 *   - {@link renderSvgSiblings}: for the `.svg` files a persona saved in a DRAFT, writes the `.png` next to each (Revisar shows both, the team sees the PNG).
 *
 * `sharp` is NOT a dependency of this package (adding one would change the lockfile and force a clean install in the pack): it is reached the way the packaged runtime and
 * the workspace both resolve it — from this module (the flat packaged runtime hoists it next to `persona-host`), or from the `package.json` of `dsh-attachment-local`, which
 * declares `sharp` (the workspace checkout). The type is the minimal one below, never `import type sharp`. Rivet's verifier loads it from the packaged `dsh-persona-host`.
 */

import { existsSync, mkdirSync, readdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, isAbsolute, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'

/** An SVG larger than this (UTF-8 bytes) is refused. */
export const SVG_MAX_BYTES = 1024 * 1024
/** The PNG is never wider than this. */
export const SVG_PNG_MAX_WIDTH = 1600
/** The PNG is never taller than this. */
export const SVG_PNG_MAX_HEIGHT = 4000
/** At most this many SVGs are taken from the text of one delivery. */
export const SVG_BLOCKS_MAX = 3
/** At most this many `.svg` files get a sibling in one pass. */
export const SVG_SIBLINGS_MAX = 20

export type SvgToPngFailure = 'too_big' | 'external' | 'script' | 'invalid' | 'engine'

export type SvgToPngResult =
  | { readonly ok: true; readonly png: Buffer; readonly width: number; readonly height: number }
  | { readonly ok: false; readonly reason: SvgToPngFailure }

/** The part of `sharp` this module uses, typed by hand. */
export interface SharpImage {
  metadata(): Promise<{ readonly width?: number; readonly height?: number }>
  resize(options: { readonly width?: number; readonly height?: number; readonly fit?: string; readonly withoutEnlargement?: boolean }): SharpImage
  png(options?: { readonly compressionLevel?: number; readonly palette?: boolean; readonly colours?: number; readonly effort?: number }): SharpImage
  toBuffer(options: { readonly resolveWithObject: true }): Promise<{ readonly data: Buffer; readonly info: { readonly width: number; readonly height: number } }>
}
export type SharpFactory = (input: Buffer, options?: { readonly density?: number; readonly failOn?: string }) => SharpImage

let cached: SharpFactory | null | undefined

/**
 * Load `sharp` once. `undefined` when no candidate resolves (the callers then answer `engine`).
 * @param candidates - Test seam: functions that return a `require`, tried in order. The default is the production order.
 */
export function loadSharp(candidates?: readonly (() => NodeRequire)[]): SharpFactory | undefined {
  if (candidates === undefined && cached !== undefined) return cached ?? undefined
  const here = createRequire(import.meta.url)
  const root = dirname(fileURLToPath(import.meta.url))
  const order: readonly (() => NodeRequire)[] = candidates ?? [
    // 1. The flat packaged runtime: `sharp` sits next to `persona-host` (Rivet, exe H2 #4).
    () => here,
    // 2. Hoisted layouts: through the package that declares it.
    () => createRequire(here.resolve('@deepseek-ai/dsh-attachment-local/package.json')),
    // 3. The workspace checkout (pnpm is strict: persona-host cannot see `sharp`, attachment-local can). `src/` and `lib/` are one level under the package.
    () => createRequire(join(root, '..', '..', '..', 'attachment', 'attachment-local', 'package.json')),
  ]
  for (const attempt of order) {
    try {
      const found: unknown = attempt()('sharp')
      if (typeof found === 'function') {
        const factory = found as SharpFactory
        if (candidates === undefined) cached = factory
        return factory
      }
    } catch (error) {
      void error // the next layout may have it
    }
  }
  if (candidates === undefined) cached = null
  return undefined
}

/** The only embedded raster a reference may point to (a `data:` URL of one of these is part of the document, not an external resource). */
const INLINE_RASTER = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/=\s]+$/iu

function isLocalReference(value: string): boolean {
  const target = value.trim()
  return target.startsWith('#') || INLINE_RASTER.test(target)
}

/**
 * Whether this SVG may be rendered: size, a real `<svg>` root, no script, no external resource (a `file:`/`http:` href is how a renderer reads a file or the network).
 * @param svg - The SVG text.
 * @returns The refusal reason, or `undefined` when it is fine.
 */
export function checkSvg(svg: string): SvgToPngFailure | undefined {
  if (Buffer.byteLength(svg, 'utf8') > SVG_MAX_BYTES) return 'too_big'
  if (!/<svg[\s>]/iu.test(svg) || !/<\/svg\s*>/iu.test(svg)) return 'invalid'
  if (/<script[\s>]/iu.test(svg) || /<foreignObject[\s>]/iu.test(svg) || /\son[a-z]+\s*=/iu.test(svg)) return 'script'
  // A DOCTYPE/ENTITY is how an XML file pulls another file in; @import pulls a stylesheet.
  if (/<!DOCTYPE/iu.test(svg) || /<!ENTITY/iu.test(svg) || /@import/iu.test(svg)) return 'external'
  for (const match of svg.matchAll(/(?:xlink:)?href\s*=\s*(["'])([\s\S]*?)\1/giu)) {
    if (!isLocalReference(match[2] ?? '')) return 'external'
  }
  for (const match of svg.matchAll(/url\(\s*(["']?)([\s\S]*?)\1\s*\)/giu)) {
    if (!isLocalReference(match[2] ?? '')) return 'external'
  }
  return undefined
}

/**
 * Turn an SVG into a PNG. Never throws.
 * @param svg - The SVG text.
 * @param options - `maxWidth` (default 1600).
 */
export async function svgToPng(svg: string, options: { readonly maxWidth?: number } = {}): Promise<SvgToPngResult> {
  const refused = checkSvg(svg)
  if (refused !== undefined) return { ok: false, reason: refused }
  const sharp = loadSharp()
  if (sharp === undefined) return { ok: false, reason: 'engine' }
  const maxWidth = Math.max(16, Math.min(options.maxWidth ?? SVG_PNG_MAX_WIDTH, SVG_PNG_MAX_WIDTH))
  try {
    const input = Buffer.from(svg, 'utf8')
    const meta = await sharp(input, { failOn: 'error' }).metadata()
    const width = meta.width
    if (width === undefined || width <= 0 || meta.height === undefined || meta.height <= 0) return { ok: false, reason: 'invalid' }
    // Small art is drawn larger so the model can read it; big art is never wider than `maxWidth`.
    const target = Math.min(maxWidth, Math.max(width, 800))
    const density = Math.max(72, Math.min(600, Math.round(72 * target / width)))
    const done = await sharp(input, { density, failOn: 'error' })
      .resize({ width: target, height: SVG_PNG_MAX_HEIGHT, fit: 'inside' })
      .png({ compressionLevel: 9 })
      .toBuffer({ resolveWithObject: true })
    return { ok: true, png: done.data, width: done.info.width, height: done.info.height }
  } catch (error) {
    void error
    return { ok: false, reason: 'invalid' }
  }
}

/**
 * The SVGs written inside the text of a delivery: a fenced block or a bare `<svg>…</svg>` (nested `<svg>` counted). At most 3, each at most 1 MB, no repeats.
 * @param text - The delivery text.
 * @returns The SVG sources.
 */
export function svgBlocksIn(text: string): string[] {
  const found: string[] = []
  const open = /<svg[\s>]/giu
  let from = 0
  while (found.length < SVG_BLOCKS_MAX) {
    open.lastIndex = from
    const start = open.exec(text)
    if (start === null) break
    // Walk to the `</svg>` that closes THIS element (inner <svg> elements are legal).
    const tags = /<(\/?)svg(?=[\s>])/giu
    tags.lastIndex = start.index
    let depth = 0
    let end = -1
    for (let tag = tags.exec(text); tag !== null; tag = tags.exec(text)) {
      depth += tag[1] === '/' ? -1 : 1
      if (depth === 0) {
        const close = text.indexOf('>', tag.index)
        end = close === -1 ? -1 : close + 1
        break
      }
    }
    if (end === -1) break
    const block = text.slice(start.index, end)
    from = end
    if (Buffer.byteLength(block, 'utf8') > SVG_MAX_BYTES || found.includes(block)) continue
    found.push(block)
  }
  return found
}

export interface SvgSiblingsResult {
  /** Paths (relative to the folder, `/`) of the PNGs written. */
  readonly written: string[]
  readonly skipped: { readonly file: string; readonly reason: SvgToPngFailure | 'exists' | 'not_found' | 'outside' }[]
}

function walkSvg(root: string, out: string[], depth: number): void {
  if (depth > 8 || out.length >= SVG_SIBLINGS_MAX * 4) return
  let entries: string[]
  try {
    entries = readdirSync(root)
  } catch {
    return
  }
  for (const name of entries) {
    if (name.startsWith('.') || name === 'node_modules') continue
    const full = join(root, name)
    let info: ReturnType<typeof statSync>
    try {
      info = statSync(full)
    } catch {
      continue
    }
    if (info.isDirectory()) walkSvg(full, out, depth + 1)
    else if (info.isFile() && /\.svg$/iu.test(name)) out.push(full)
  }
}

/**
 * For each `.svg` of a draft, write the `.png` next to it (Revisar shows both; the team sees the PNG). Idempotent: a PNG newer than its SVG is left as it is. One file that fails
 * never stops the others, and a path outside `dir` is never touched.
 * @param dir - The root of the draft.
 * @param options - `only`: the SVGs to treat (relative to `dir`, e.g. the ones saved in this turn); without it every `.svg` of the folder.
 */
export async function renderSvgSiblings(dir: string, options: { readonly only?: readonly string[]; readonly maxWidth?: number } = {}): Promise<SvgSiblingsResult> {
  const root = resolve(dir)
  const written: string[] = []
  const skipped: SvgSiblingsResult['skipped'][number][] = []
  const files: string[] = []
  if (options.only === undefined) walkSvg(root, files, 0)
  else {
    for (const item of options.only) {
      const full = resolve(root, item)
      const inside = relative(root, full)
      if (inside.startsWith('..') || inside === '' || isAbsolute(inside)) skipped.push({ file: item, reason: 'outside' })
      else files.push(full)
    }
  }
  for (const full of files.slice(0, SVG_SIBLINGS_MAX)) {
    const rel = relative(root, full).split(sep).join('/')
    if (!/\.svg$/iu.test(full) || !existsSync(full)) {
      skipped.push({ file: rel, reason: 'not_found' })
      continue
    }
    const png = full.replace(/\.svg$/iu, '.png')
    try {
      const svgInfo = statSync(full)
      if (svgInfo.size > SVG_MAX_BYTES) {
        skipped.push({ file: rel, reason: 'too_big' })
        continue
      }
      if (existsSync(png) && statSync(png).mtimeMs >= svgInfo.mtimeMs) {
        skipped.push({ file: rel, reason: 'exists' })
        continue
      }
      const done = await svgToPng(readFileSync(full, 'utf8'), options.maxWidth === undefined ? {} : { maxWidth: options.maxWidth })
      if (!done.ok) {
        skipped.push({ file: rel, reason: done.reason })
        continue
      }
      mkdirSync(dirname(png), { recursive: true })
      writeFileSync(png, done.png)
      written.push(relative(root, png).split(sep).join('/'))
    } catch (error) {
      void error
      skipped.push({ file: rel, reason: 'engine' })
    }
  }
  return { written, skipped }
}
