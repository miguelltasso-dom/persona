import { readFileSync, writeFileSync } from 'node:fs'
import type { Page } from 'playwright'

export interface PngCompareResult {
  width: number
  height: number
  diffPixels: number
  diffRatio: number
  pass: boolean
}

const COMPARE_SCRIPT = `
async function loadImage(base64, width, height) {
  const img = new Image()
  img.src = 'data:image/png;base64,' + base64
  await img.decode()
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  const ctx = canvas.getContext('2d')
  ctx.drawImage(img, 0, 0, width, height)
  return ctx.getImageData(0, 0, width, height)
}
async function compare(actualB64, expectedB64, width, height, threshold) {
  const a = await loadImage(actualB64, width, height)
  const b = await loadImage(expectedB64, width, height)
  let diffPixels = 0
  const diff = new Uint8ClampedArray(a.data.length)
  for (let i = 0; i < a.data.length; i += 4) {
    const dr = Math.abs(a.data[i] - b.data[i])
    const dg = Math.abs(a.data[i + 1] - b.data[i + 1])
    const db = Math.abs(a.data[i + 2] - b.data[i + 2])
    const da = Math.abs(a.data[i + 3] - b.data[i + 3])
    if (dr > threshold || dg > threshold || db > threshold || da > threshold) {
      diffPixels++
      diff[i] = 255
      diff[i + 1] = 0
      diff[i + 2] = 0
      diff[i + 3] = 255
    } else {
      diff[i] = a.data[i]
      diff[i + 1] = a.data[i + 1]
      diff[i + 2] = a.data[i + 2]
      diff[i + 3] = 80
    }
  }
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  canvas.getContext('2d').putImageData(new ImageData(diff, width, height), 0, 0)
  return {
    diffPixels,
    diffRatio: diffPixels / (width * height),
    diffPng: canvas.toDataURL('image/png').split(',')[1],
  }
}
globalThis.compare = compare
`

/**
 * Compare two PNG files in the browser (no extra npm deps).
 * @param page - Playwright page used as a canvas host.
 * @param actualPath - captured screenshot path.
 * @param expectedPath - baseline or reference path.
 * @param options - viewport size and acceptance threshold.
 */
export async function comparePngFiles(
  page: Page,
  actualPath: string,
  expectedPath: string,
  options: { width: number; height: number; maxDiffRatio: number; colorThreshold?: number },
): Promise<PngCompareResult & { diffPngBase64?: string }> {
  const actual = readFileSync(actualPath).toString('base64')
  const expected = readFileSync(expectedPath).toString('base64')
  await page.setContent('<canvas id="c"></canvas>', { waitUntil: 'domcontentloaded' })
  await page.addScriptTag({ content: COMPARE_SCRIPT })
  await page.waitForFunction(() => typeof (globalThis as { compare?: unknown }).compare === 'function')
  const result = await page.evaluate(
    async ({ actual, expected, width, height, threshold }) => {
      return (globalThis as unknown as {
        compare: (a: string, b: string, w: number, h: number, t: number) =>
        Promise<{ diffPixels: number; diffRatio: number; diffPng: string }>
      }).compare(actual, expected, width, height, threshold)
    },
    {
      actual,
      expected,
      width: options.width,
      height: options.height,
      threshold: options.colorThreshold ?? 16,
    },
  ) as { diffPixels: number; diffRatio: number; diffPng: string }

  const pass = result.diffRatio <= options.maxDiffRatio
  return {
    width: options.width,
    height: options.height,
    diffPixels: result.diffPixels,
    diffRatio: result.diffRatio,
    pass,
    diffPngBase64: result.diffPng,
  }
}

/**
 * Write a diff overlay PNG next to the actual capture.
 * @param actualPath - source capture path.
 * @param diffBase64 - PNG payload without data-url prefix.
 */
export function writeDiffPng(actualPath: string, diffBase64: string): string {
  const out = actualPath.replace(/\.png$/u, '.diff.png')
  writeFileSync(out, Buffer.from(diffBase64, 'base64'))
  return out
}
