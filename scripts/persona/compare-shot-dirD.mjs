/** Compare Persona UI capture vs dirD-tela.png (Probe visual-diff, no TS import graph). */
import { createRequire } from 'node:module'
import { readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = join(dirname(fileURLToPath(import.meta.url)), '../..')
const require = createRequire(join(root, 'packages/persona/persona-e2e/package.json'))
const { chromium } = require('playwright')

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

const actualPath = process.argv[2] ?? join(root, '.maestri/tmp/shots/persona-light-channel.png')
const referencePath = join(root, 'persona-assets/references/dirD-tela.png')
const viewport = { width: 1440, height: 900 }

const browser = await chromium.launch({ channel: 'chrome', headless: true })
const page = await browser.newPage()
try {
  const actual = readFileSync(actualPath).toString('base64')
  const expected = readFileSync(referencePath).toString('base64')
  await page.setContent('<canvas id="c"></canvas>', { waitUntil: 'domcontentloaded' })
  await page.addScriptTag({ content: COMPARE_SCRIPT })
  await page.waitForFunction(() => typeof globalThis.compare === 'function')
  const result = await page.evaluate(
    async ({ actual, expected, width, height }) =>
      globalThis.compare(actual, expected, width, height, 16),
    { actual, expected, width: viewport.width, height: viewport.height },
  )
  const pass = result.diffRatio <= 0.62
  const diffOverlay = actualPath.replace(/\.png$/u, '.diff.png')
  writeFileSync(diffOverlay, Buffer.from(result.diffPng, 'base64'))
  const summary = { actualPath, referencePath, diffRatio: result.diffRatio, diffPixels: result.diffPixels, pass, diffOverlay }
  writeFileSync(join(root, '.maestri/tmp/shots/dirD-compare.json'), `${JSON.stringify(summary, null, 2)}\n`)
  console.log(JSON.stringify(summary))
} finally {
  await browser.close()
}
