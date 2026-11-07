/**
 * P0-1 (Keel 15:34, contract with Lumen): the files of "Revisar mudanças" that are PICTURES carry the picture itself, so the person SEES the art a persona saved in the
 * draft instead of a diff of bytes. For each image file of the summary the host sends data URIs:
 *  - `afterImage`  — the file in the DRAFT (what the persona made);
 *  - `beforeImage` / `folderImage` — the file in the person's own FOLDER as it is now (what Aplicar would replace; the same picture the conflict screen shows as "yours").
 * A picture bigger than the screen's own limit (`REVIEW_IMAGE_MAX_CHARS`, the length of the whole address) is left out and the screen says the preview is unavailable.
 *
 * Reading is confined: the path must be relative and stay INSIDE the folder after symlinks are resolved; only png / jpeg / webp / gif / svg are read; the SVG goes
 * out as a picture (the screen draws it with `<img>`, never inline), not as markup.
 */

import { readFileSync, realpathSync, statSync } from 'node:fs'
import { extname, isAbsolute, relative, resolve } from 'node:path'
import type { ReviewFileView } from './types.ts'

const MIME: Readonly<Record<string, string>> = {
  '.png': 'image/png', '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.webp': 'image/webp', '.gif': 'image/gif', '.svg': 'image/svg+xml',
}

/** The longest address the review screen draws (its `REVIEW_IMAGE_MAX_CHARS`): a bigger picture is not sent. */
export const REVIEW_IMAGE_MAX_CHARS = 262_144

/** File bytes that can still fit that address in base64 (4 characters per 3 bytes plus the `data:…;base64,` prefix). */
const MAX_BYTES = 196_000

/** @param path - A path of the summary. @returns The picture media type the review draws for it, or `undefined`. */
export function imageMimeOf(path: string): string | undefined {
  return MIME[extname(path).toLowerCase()]
}

/**
 * @param folder - A folder (the draft, or the project's own).
 * @param path - Path of a file relative to it, with `/` (the same string `ReviewFileView.path` has).
 * @returns The file as a `data:` address, or `undefined` when it is not a picture, does not exist, leaves the folder, or is too big.
 */
export function readImageUri(folder: string | undefined, path: string): string | undefined {
  const mime = imageMimeOf(path)
  if (mime === undefined || folder === undefined || folder === '' || folder === '.') return undefined
  if (path === '' || isAbsolute(path) || path.split(/[\\/]/u).includes('..')) return undefined
  try {
    const base = realpathSync(folder)
    const file = realpathSync(resolve(base, ...path.split('/')))
    const inside = relative(base, file)
    if (inside === '' || inside.startsWith('..') || isAbsolute(inside)) return undefined
    const stat = statSync(file)
    if (!stat.isFile() || stat.size > MAX_BYTES) return undefined
    const uri = `data:${mime};base64,${readFileSync(file).toString('base64')}`
    return uri.length <= REVIEW_IMAGE_MAX_CHARS ? uri : undefined
  } catch {
    return undefined
  }
}

/**
 * @param file - One file of the review summary.
 * @param draftDirectory - The Task's draft folder (`.`/empty = none).
 * @param folderRoot - The project's own folder.
 * @returns The same file with the pictures it can show; a file that is not a picture is returned as it is.
 */
export function withReviewImages(file: ReviewFileView, draftDirectory: string | undefined, folderRoot: string | undefined): ReviewFileView {
  if (imageMimeOf(file.path) === undefined) return file
  const afterImage = readImageUri(draftDirectory, file.path)
  const folderImage = readImageUri(folderRoot, file.path)
  return {
    ...file,
    ...(folderImage === undefined ? {} : { beforeImage: folderImage, folderImage }),
    ...(afterImage === undefined ? {} : { afterImage }),
  }
}
