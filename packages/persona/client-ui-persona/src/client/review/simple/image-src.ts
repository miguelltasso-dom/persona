/**
 * "Revisar mudanças" draws a picture ONLY as an `<img>` of an INLINE address — never inline markup, never a remote URL. An SVG shown through `<img>` runs no
 * script and loads nothing from outside, so a poster the persona drew (`cartaz.svg`) is safe to show; this module is the single gate every picture of the
 * review goes through (what the host sends, and what is read out of the draft's own patch).
 */

/** Longest address the review draws (≈ 190 KB of image in base64): a bigger picture is not shown, the person opens the draft's copy instead. */
export const REVIEW_IMAGE_MAX_CHARS = 262_144

/** `data:image/png|jpeg|webp|gif|svg+xml` (optional `;charset=…` / `;utf8` parameters), base64 or text: nothing else is a picture the review draws. */
const INLINE_PICTURE = /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml)(?:;(?:[\w-]+=[\w.+-]+|utf-?8))*(?:;base64)?,/iu

/** The SVG prolog: an optional XML declaration, comments and doctype, then the `<svg` element. */
const SVG_START = /^(?:<\?xml[^>]*\?>\s*)?(?:<!--[\s\S]*?-->\s*)*(?:<!doctype[^>]*>\s*)?(?:<!--[\s\S]*?-->\s*)*<svg[\s>]/iu

/**
 * @param src - an address the host (or the patch reader) offers for a picture.
 * @returns the same address when it is an inline picture of a known type within the size limit; otherwise `undefined` (http(s), `javascript:`, `blob:`,
 * `data:text/html`, SVG with another media type, oversized).
 */
export function safeReviewImageSrc(src: string | undefined): string | undefined {
  if (src === undefined || src.length > REVIEW_IMAGE_MAX_CHARS) return undefined
  return INLINE_PICTURE.test(src) ? src : undefined
}

/**
 * The text of an SVG file as an inline picture, for `<img src>`.
 * @param svg - the whole file: it must start with `<svg` (after an optional prolog) and end with `</svg>`, so a half-read file never becomes a broken picture.
 * @returns a `data:image/svg+xml` address within the size limit, or `undefined`.
 */
export function svgTextToImageSrc(svg: string): string | undefined {
  const text = svg.trim()
  if (text === '' || !SVG_START.test(text) || !/<\/svg\s*>$/iu.test(text)) return undefined
  return safeReviewImageSrc(`data:image/svg+xml;charset=utf-8,${encodeURIComponent(text)}`)
}
