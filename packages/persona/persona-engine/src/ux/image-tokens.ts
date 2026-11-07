/**
 * What an image costs a model call, before it is sent (TEAM-4 budget of the opinion rounds).
 *
 * Pure and offline. Two parts: read the size of an image from its first bytes (PNG, GIF, WebP, JPEG: no image library, nothing decoded),
 * and turn a size into a RANGE of input tokens: the public rule of the vendor (width × height ÷ 750, after the image is scaled to at most
 * 1568 px on the long edge), CALIBRATED by one real measurement ({@link IMAGE_COST_MEASURED}). The rule used to carry an extra ~1.15 megapixel
 * cut and a ~1,600-token ceiling; the real call showed neither applies at 1.5 MP, so they are gone.
 */

import type { Range } from './estimate-ask.ts'

export interface ImageSize {
  readonly width: number
  readonly height: number
}

/** Longest edge the vendor keeps before it scales the image down. */
export const IMAGE_MAX_EDGE = 1568
/**
 * Upper bound of the tokens of ONE image: the largest image the vendor keeps (1568 × 1568 px) is 1568² ÷ 750 ≈ 3,278 tokens, rounded up.
 * Anything bigger is scaled down to the long-edge limit first.
 */
export const IMAGE_TOKENS_MAX = 3_300

/**
 * The one real measurement behind the calibration (reports/image-cost-real.json, 2 real calls, Atlas OK 04/11 22:40): on the cheap model, a
 * 1500×1000 PNG added exactly this many input tokens to an otherwise identical call (3,031 → 5,049). The difference is vendor-reported
 * arithmetic, not a vendor field of its own, so it is `calibrated`, with the caveat of a single measurement (one size, one model, one CLI).
 * The image was written to the prompt cache: it was billed at the cache-WRITE price on that call (see {@link IMAGE_CACHE_WRITE_FACTOR}).
 */
export const IMAGE_COST_MEASURED = {
  width: 1500,
  height: 1000,
  tokens: 2018,
  model: 'haiku (claude-haiku-5-5)',
  cli: 'claude 2.1.318',
  measuredOn: '2026-11-04',
  basis: '1 medição real (haiku, CLI 2.1.318, PNG 1500×1000 = 2.018 tokens)',
} as const

/** An image is billed at the cache-write price (× the input price) on the call that sends it, then read from the cache (measured: cacheWrite grew by the image's tokens). */
export const IMAGE_CACHE_WRITE_FACTOR = 1.25
/** An image whose size is not known: from a small one to the cap. Wide on purpose, never a single invented figure. */
export const IMAGE_TOKENS_UNKNOWN: Range = { min: 150, max: IMAGE_TOKENS_MAX }

const be16 = (b: Uint8Array, at: number): number => ((b[at] ?? 0) << 8) | (b[at + 1] ?? 0)
const le16 = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8)
const be32 = (b: Uint8Array, at: number): number => (((b[at] ?? 0) * 0x1000000) + (((b[at + 1] ?? 0) << 16) | ((b[at + 2] ?? 0) << 8) | (b[at + 3] ?? 0))) >>> 0
const le24 = (b: Uint8Array, at: number): number => (b[at] ?? 0) | ((b[at + 1] ?? 0) << 8) | ((b[at + 2] ?? 0) << 16)
const ascii = (b: Uint8Array, at: number, length: number): string => String.fromCharCode(...Array.from(b.subarray(at, at + length)))

function valid(width: number, height: number): ImageSize | undefined {
  return Number.isInteger(width) && Number.isInteger(height) && width > 0 && height > 0 && width <= 100_000 && height <= 100_000 ? { width, height } : undefined
}

function jpegSize(b: Uint8Array): ImageSize | undefined {
  let at = 2
  while (at + 9 < b.length) {
    if (b[at] !== 0xff) { at += 1; continue }
    const marker = b[at + 1] ?? 0
    if (marker === 0xff) { at += 1; continue }
    if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { at += 2; continue }
    if (marker === 0xd9 || marker === 0xda) return undefined
    // Start Of Frame markers carry the size (not DHT 0xC4, JPG 0xC8, DAC 0xCC).
    if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) return valid(be16(b, at + 7), be16(b, at + 5))
    const length = be16(b, at + 2)
    if (length < 2) return undefined
    at += 2 + length
  }
  return undefined
}

function webpSize(b: Uint8Array): ImageSize | undefined {
  const kind = ascii(b, 12, 4)
  if (kind === 'VP8 ') return b[23] === 0x9d && b[24] === 0x01 && b[25] === 0x2a ? valid(le16(b, 26) & 0x3fff, le16(b, 28) & 0x3fff) : undefined
  if (kind === 'VP8L') {
    if (b[20] !== 0x2f) return undefined
    const bits = (b[21] ?? 0) | ((b[22] ?? 0) << 8) | ((b[23] ?? 0) << 16) | ((b[24] ?? 0) << 24)
    return valid((bits & 0x3fff) + 1, ((bits >>> 14) & 0x3fff) + 1)
  }
  if (kind === 'VP8X') return valid(le24(b, 24) + 1, le24(b, 27) + 1)
  return undefined
}

/**
 * The pixel size of an image, read from its first bytes. A JPEG may carry a long thumbnail block before its size: give it the first
 * ~64 KB. `undefined` when it is not one of PNG/GIF/WebP/JPEG or the bytes are cut short.
 * @param head - The first bytes of the file.
 */
export function imageSizeOf(head: Uint8Array): ImageSize | undefined {
  if (head.length >= 24 && head[0] === 0x89 && ascii(head, 1, 3) === 'PNG' && ascii(head, 12, 4) === 'IHDR') return valid(be32(head, 16), be32(head, 20))
  if (head.length >= 10 && (ascii(head, 0, 6) === 'GIF87a' || ascii(head, 0, 6) === 'GIF89a')) return valid(le16(head, 6), le16(head, 8))
  if (head.length >= 30 && ascii(head, 0, 4) === 'RIFF' && ascii(head, 8, 4) === 'WEBP') return webpSize(head)
  if (head.length >= 12 && head[0] === 0xff && head[1] === 0xd8) return jpegSize(head)
  return undefined
}

/** Measured tokens ÷ the rule's tokens at the measured size: the calibration factor (≈ 1.009). */
const CALIBRATION = IMAGE_COST_MEASURED.tokens / ((IMAGE_COST_MEASURED.width * IMAGE_COST_MEASURED.height) / 750)

/**
 * Input tokens of ONE image, as a range.
 * @param size - Pixel size, when known. Without it the answer is {@link IMAGE_TOKENS_UNKNOWN}.
 */
export function imageTokens(size?: ImageSize): Range {
  if (size === undefined || !(size.width > 0) || !(size.height > 0)) return IMAGE_TOKENS_UNKNOWN
  const scale = Math.min(1, IMAGE_MAX_EDGE / Math.max(size.width, size.height))
  const center = Math.max(1, Math.ceil(((size.width * scale * size.height * scale) / 750) * CALIBRATION))
  return { min: Math.max(1, Math.round(center * 0.9)), max: Math.min(IMAGE_TOKENS_MAX, Math.max(Math.round(center * 0.9), Math.ceil(center * 1.1))) }
}
