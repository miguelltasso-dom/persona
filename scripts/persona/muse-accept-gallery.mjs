// Muse: acceptance captures for GES-4 (Gestor) and GOV-8 (Assistente de estrutura) from a sample-data gallery (copy of
// Lumen's lumen-review-gallery.mjs). States `assistant-N` open the assistant and press Continuar N-1 times.
// Builds scripts/persona/muse-accept-gallery/ with the repo's Vite, serves it on a free port, and shoots every state in
// light/dark at 1280x720, 960x640 and zoom 200 % (640x360 @2x), with an overflow probe and (LUMEN_AXE=<axe.min.js>) axe.
//   node scripts/persona/with-lock.mjs "<you> review gallery" --lock check -- node scripts/persona/lumen-review-gallery.mjs [state...]
// LUMEN_REDUCED=1 → prefers-reduced-motion (also counts infinite animations). Output: .maestri/tmp/shots/lumen-review/.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, normalize, resolve } from 'node:path'
import { freePort } from './free-port.mjs'

const root = 'C:/Users/migue/dev/persona'
const pkg = `${root}/packages/persona/client-ui-persona`
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const { build } = await import(createRequire(`${root}/package.json`).resolve('vite').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'))

const STATES = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : ['gestor-off', 'gestor-on', 'plan-pending', 'plan-approved', 'plan-declined', 'plan-adjusting', 'plan-as-chat', 'assistant-1', 'assistant-2', 'assistant-3', 'assistant-4', 'subjects', 'subjects-new', 'subjects-archived']
const VIEWPORTS = [
  { tag: '1280x720', width: 1280, height: 720, dpr: 1 },
  { tag: '960x640', width: 960, height: 640, dpr: 1 },
  { tag: 'zoom200', width: 640, height: 360, dpr: 2 },
]
const outDir = `${root}/.maestri/tmp/shots/design/accept-gallery`
const dist = resolve(`${root}/.maestri/tmp/muse-accept-gallery-${process.pid}`)
mkdirSync(outDir, { recursive: true })
rmSync(dist, { recursive: true, force: true })

/** The asset script rewrites generated-imports.ts for a moment now and then (other agents): retry instead of failing. */
const buildOptions = {
  root: `${root}/scripts/persona/muse-accept-gallery`,
  base: './',
  logLevel: 'warn',
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      { find: /^react$/, replacement: `${pkg}/node_modules/react` },
      { find: /^react\/(.*)$/, replacement: `${pkg}/node_modules/react/$1` },
      { find: /^react-dom$/, replacement: `${pkg}/node_modules/react-dom` },
      { find: /^react-dom\/(.*)$/, replacement: `${pkg}/node_modules/react-dom/$1` },
    ],
  },
  build: { outDir: dist, emptyOutDir: true, assetsInlineLimit: 200_000, target: 'es2022', minify: false },
}
for (let attempt = 1; ; attempt += 1) {
  try {
    await build(buildOptions)
    break
  } catch (error) {
    if (attempt >= 4 || !String(error).includes('generated-imports')) throw error
    console.log(`vite build: assets are being regenerated, retry ${String(attempt)}/3`)
    await new Promise(resolveWait => setTimeout(resolveWait, 6000))
  }
}

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.woff2': 'font/woff2', '.woff': 'font/woff' }
const port = await freePort()
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0])).replace(/^([/\\])+/, '')
  const file = join(dist, path === '' ? 'index.html' : path)
  if (!resolve(file).startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(resolve => server.listen(port, '127.0.0.1', resolve))

/** Content the person cannot reach: poking out of the viewport, or out of an ancestor that clips it. */
function probeOverflow() {
  const vw = document.documentElement.clientWidth
  const hits = []
  let scrollers = 0
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) scrollers += 1
    // All ancestors: an svg (overflow hidden by default) must not hide a scroller further up.
    let scrolled = false
    let cut = false
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === 'auto' || ox === 'scroll') { scrolled = true; break }
      if ((ox === 'hidden' || ox === 'clip') && !cut) {
        const pr = p.getBoundingClientRect()
        cut = r.right > pr.right + 1.5 || r.left < pr.left - 1.5
      }
    }
    if (!cut && scrolled) continue
    if (cut || r.right > vw + 1 || r.left < -1) {
      const cls = typeof el.className === 'string' ? el.className.split(' ')[0] : ''
      hits.push(`${cut ? 'cut:' : ''}${el.tagName.toLowerCase()}.${cls}@${Math.round(r.left)}..${Math.round(r.right)}`)
    }
  }
  return { vw, docScrollOverflow: Math.max(0, document.documentElement.scrollWidth - vw), offscreen: hits.length, scrollers, sample: hits.slice(0, 5) }
}

const report = []
const errors = []
let fontsReported = false
let browser
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const viewport of VIEWPORTS) {
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({
        viewport: { width: viewport.width, height: viewport.height },
        deviceScaleFactor: viewport.dpr,
        colorScheme: scheme,
        locale: 'pt-BR',
        reducedMotion: process.env.MUSE_REDUCED === '1' ? 'reduce' : 'no-preference',
      })
      const page = await context.newPage()
      page.on('response', (r) => { if (r.status() >= 400) errors.push(`[${scheme} ${viewport.tag}] HTTP ${String(r.status())} ${new URL(r.url()).pathname}`) })
      page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`[${scheme} ${viewport.tag}] ${m.text().slice(0, 200)}`) })
      page.on('pageerror', (e) => errors.push(`[${scheme} ${viewport.tag}] pageerror ${String(e).slice(0, 200)}`))
      for (const state of STATES) {
        try {
          // A blank page passes axe: the screen must have real text before it counts as a capture.
          let mainText = ''
          for (let attempt = 1; attempt <= 3 && mainText.length < 20; attempt += 1) {
            const drawn = state.startsWith('assistant-') ? 'assistant' : state
            await page.goto(`http://127.0.0.1:${port}/index.html#${drawn}`, { waitUntil: 'load' })
            await page.reload({ waitUntil: 'load' })
            await page.locator(`[data-gallery-state="${drawn}"]`).waitFor({ timeout: 15_000 })
            for (let step = 1; step < Number(state.split('-')[1] ?? 1); step += 1) {
              await page.getByRole('button', { name: 'Continuar', exact: true }).first().click({ timeout: 5_000 })
              await page.waitForTimeout(400)
            }
            await page.evaluate(async () => { await document.fonts.ready })
            await page.waitForTimeout(500)
            mainText = (await page.locator('main').first().innerText()).trim()
          }
          if (mainText.length < 20) throw new Error(`empty screen: main has ${String(mainText.length)} characters`)
          if (false) {
            // Open every file so the screen shows its before/after by type.
            for (const toggle of await page.locator('button[aria-expanded="false"]').all()) await toggle.click().catch(() => undefined)
            await page.waitForTimeout(300)
          }
          // Clicks leave the pointer over a row (its hover tint reads as "selected"): park it away.
          await page.mouse.move(0, 0)
          const file = `${state}-${scheme}-${viewport.tag}.png`
          // The action bar is sticky in the real scroller; in a full-page shot it would sit mid-page over the list.
          await page.screenshot({ path: `${outDir}/${file}`, fullPage: true })
          const probe = await page.evaluate(probeOverflow)
          let axe = 'skipped'
          const axeFile = process.env.MUSE_AXE
          if (axeFile !== undefined) {
            await page.addScriptTag({ path: axeFile })
            const violations = await page.evaluate(async () => {
              const r = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
              return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }))
            })
            axe = violations.length
            for (const v of violations) console.log(`[axe ${state} ${scheme} ${viewport.tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 200)}`)
          }
          if (!fontsReported) {
            fontsReported = true
            const fonts = await page.evaluate(() => {
              const label = [...document.querySelectorAll('main *')].find(el => getComputedStyle(el).textTransform === 'uppercase')
              const cs = label === undefined ? null : getComputedStyle(label)
              return {
                label: label?.textContent?.slice(0, 24) ?? null,
                family: cs?.fontFamily.slice(0, 40) ?? null,
                weight: cs?.fontWeight ?? null,
                letterSpacing: cs?.letterSpacing ?? null,
                wordSpacing: cs?.wordSpacing ?? null,
                faces: [...document.fonts].map(face => `${face.family} ${face.weight} ${face.status}`),
              }
            })
            console.log(`[fonts] ${JSON.stringify(fonts)}`)
          }
          const infinite = await page.evaluate(() => document.getAnimations().filter(an => an.playState === 'running' && Number(an.effect?.getComputedTiming().iterations) === Infinity).length)
          report.push({ state, scheme, viewport: viewport.tag, file, axe, infiniteAnimations: infinite, ...probe })
          console.log(`[${viewport.tag} ${scheme}] ${state}: offscreen=${probe.offscreen} docΔ=${probe.docScrollOverflow} scrollers=${probe.scrollers} axe=${axe} infinite=${infinite}${probe.offscreen > 0 ? ` :: ${probe.sample.join(' | ')}` : ''}`)
        } catch (error) {
          report.push({ state, scheme, viewport: viewport.tag, error: String(error).slice(0, 200) })
          console.log(`[${viewport.tag} ${scheme}] ${state}: FAILED ${String(error).slice(0, 160)}`)
        }
      }
      await context.close()
    }
  }
} finally {
  await browser?.close().catch(() => undefined)
  server.close()
  rmSync(dist, { recursive: true, force: true })
}
writeFileSync(`${outDir}/report.json`, JSON.stringify({ errors, report }, null, 2))
const bad = report.filter(row => row.error !== undefined || row.offscreen > 0 || row.docScrollOverflow > 0 || (typeof row.axe === 'number' && row.axe > 0))
console.log(`console errors: ${errors.length}${errors.length > 0 ? `\n${errors.slice(0, 6).join('\n')}` : ''}`)
console.log(`muse accept gallery: ${report.length} captures, ${bad.length} with overflow/axe/errors → ${outDir}`)
process.exit(bad.length > 0 || errors.length > 0 ? 1 : 0)
