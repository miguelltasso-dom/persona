/** Pixel helpers for the C9 gallery (no extra npm deps: a scratch page + canvas). */
import { readFileSync } from 'node:fs'
import type { BrowserContext } from 'playwright'

export interface Rgb {
  readonly r: number
  readonly g: number
  readonly b: number
}

export function hexToRgb(hex: string): Rgb {
  const value = hex.replace('#', '')
  return { r: parseInt(value.slice(0, 2), 16), g: parseInt(value.slice(2, 4), 16), b: parseInt(value.slice(4, 6), 16) }
}

/** Largest per-channel distance between two colors (0–255). */
export function channelDistance(a: Rgb, b: Rgb): number {
  return Math.max(Math.abs(a.r - b.r), Math.abs(a.g - b.g), Math.abs(a.b - b.b))
}

/** Relative luminance 0–1 (sRGB). */
export function luminance(color: Rgb): number {
  const channel = (value: number): number => {
    const v = value / 255
    return v <= 0.03928 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4
  }
  return 0.2126 * channel(color.r) + 0.7152 * channel(color.g) + 0.0722 * channel(color.b)
}

/**
 * Mean color of a rectangle of a PNG file.
 * @param context - Any browser context (a scratch page is opened and closed).
 * @param file - PNG path.
 * @param rect - Region in image pixels.
 */
export async function meanColor(
  context: BrowserContext,
  file: string,
  rect: { x: number; y: number; width: number; height: number },
): Promise<Rgb> {
  const page = await context.newPage()
  try {
    const base64 = readFileSync(file).toString('base64')
    await page.setContent('<canvas id="c"></canvas>')
    const result = await page.evaluate(async ({ base64: data, rect: box }) => {
      const image = new Image()
      image.src = `data:image/png;base64,${data}`
      await image.decode()
      const canvas = document.getElementById('c') as HTMLCanvasElement
      canvas.width = image.naturalWidth
      canvas.height = image.naturalHeight
      const ctx = canvas.getContext('2d')!
      ctx.drawImage(image, 0, 0)
      const pixels = ctx.getImageData(box.x, box.y, box.width, box.height).data
      let r = 0
      let g = 0
      let b = 0
      const count = pixels.length / 4
      for (let i = 0; i < pixels.length; i += 4) {
        r += pixels[i] ?? 0
        g += pixels[i + 1] ?? 0
        b += pixels[i + 2] ?? 0
      }
      return { r: Math.round(r / count), g: Math.round(g / count), b: Math.round(b / count) }
    }, { base64, rect })
    return result
  } finally {
    await page.close()
  }
}
