/** Redact screenshots before writing a frame or exposing a thumbnail. */
import { nativeImage } from 'electron'
import { blurTeachPixels, type TeachBlurRect } from './teach-capture.ts'

/** @param png - Captured frame. @param rectangles - Pixel areas to redact. @returns Sanitized PNG and a small local preview. */
export function prepareTeachImage(png: Buffer, rectangles: readonly TeachBlurRect[]): { png: Buffer; thumbnail: string } {
  const source = nativeImage.createFromBuffer(png)
  if (source.isEmpty()) throw new Error('teach: invalid captured PNG')
  const { width, height } = source.getSize()
  let pixels = source.toBitmap()
  for (const rect of rectangles) {
    if (rect.x >= width || rect.y >= height) throw new Error('teach: redaction is outside the captured frame')
    pixels = blurTeachPixels(pixels, width, height, rect)
  }
  const result = nativeImage.createFromBitmap(pixels, { width, height })
  return { png: result.toPNG(), thumbnail: result.resize({ width: 320, height: 200 }).toDataURL() }
}
