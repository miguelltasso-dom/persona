/**
 * TEAM-5 (D-090 #4): images that travel with a turn so the persona really SEES them (a draft or a reference a colleague shared on the
 * team channel). OAR's own image input is used (`InputOptions.images`): the file is read when the input is delivered and goes as the
 * runtime's native image content, never as a path in prose. This module only decides, BEFORE any session is opened, whether the turn may
 * carry its images, and refuses in human words rather than silently dropping them: a colleague asked "what do you think of this image" must
 * not answer about an image it never saw.
 */

import { statSync } from 'node:fs'
import { extname } from 'node:path'
import type { TurnImage } from '../contract.ts'

/** At most this many images per turn (the cost of an image is paid on every request of the turn). */
export const MAX_TURN_IMAGES = 4

/** The API refuses an image over 5 MB. The product refuses it earlier, with a reason the person can read. */
export const MAX_IMAGE_BYTES = 5 * 1024 * 1024

const MEDIA_TYPES: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
}

export type ImagesRefusal = 'engine' | 'count' | 'size' | 'type' | 'unreadable'

const MESSAGES: Readonly<Record<ImagesRefusal, string>> = {
  engine: 'Este motor não lê imagem. Peça a opinião a uma persona que use um motor que leia imagem, ou descreva a imagem em texto.',
  count: `Só dá para enviar até ${String(MAX_TURN_IMAGES)} imagens por vez.`,
  size: `Uma das imagens passa de ${String(MAX_IMAGE_BYTES / 1024 / 1024)} MB. Envie uma versão menor.`,
  type: 'Só leio imagens PNG, JPG, GIF ou WebP.',
  unreadable: 'Não consegui abrir uma das imagens. Envie de novo.',
}

/** The turn cannot carry its images. `message` is for the person (pt-BR, no paths, no internals). */
export class ImagesRefusedError extends Error {
  readonly code = 'images_refused'
  readonly reason: ImagesRefusal

  constructor(reason: ImagesRefusal) {
    super(MESSAGES[reason])
    this.name = 'ImagesRefusedError'
    this.reason = reason
  }
}

/** An image as OAR delivers it. */
export interface DeliverableImage {
  readonly path: string
  readonly mediaType: string
}

/**
 * Validates the images of a turn and gives back what OAR needs. Throws {@link ImagesRefusedError}; never returns a partial list.
 * @param images - What the host attached.
 * @param engineReads - Whether this runner/engine reads images at all.
 * @param stat - File size lookup (injected in tests).
 */
export function checkTurnImages(
  images: readonly TurnImage[],
  engineReads: boolean,
  stat: (path: string) => { readonly size: number; readonly isFile: boolean } = (path) => {
    const info = statSync(path)
    return { size: info.size, isFile: info.isFile() }
  },
): readonly DeliverableImage[] {
  if (!engineReads) throw new ImagesRefusedError('engine')
  if (images.length > MAX_TURN_IMAGES) throw new ImagesRefusedError('count')
  const ready: DeliverableImage[] = []
  for (const image of images) {
    const byName = MEDIA_TYPES[extname(image.path).toLowerCase()]
    const mediaType = image.mediaType ?? byName
    if (mediaType === undefined || !Object.values(MEDIA_TYPES).includes(mediaType) || (byName !== undefined && image.mediaType !== undefined && byName !== image.mediaType)) {
      throw new ImagesRefusedError('type')
    }
    let info: { readonly size: number; readonly isFile: boolean }
    try { info = stat(image.path) } catch { throw new ImagesRefusedError('unreadable') }
    if (!info.isFile) throw new ImagesRefusedError('unreadable')
    if (info.size > MAX_IMAGE_BYTES) throw new ImagesRefusedError('size')
    ready.push({ path: image.path, mediaType })
  }
  return ready
}
