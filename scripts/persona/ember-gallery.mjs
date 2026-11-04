// Ember: captures of the screens I build, from the sample-data gallery (scripts/persona/ember-gallery/).
// Builds the gallery with the repo's Vite, serves it on a free port, and shoots every state in light/dark at 1440x900,
// 960x640 and zoom 200 % (640x360 @2x), with an overflow probe, a keyboard pass and (EMBER_AXE=<axe.min.js>) axe.
//   node scripts/persona/with-lock.mjs "Ember gallery" --lock check -- node scripts/persona/ember-gallery.mjs [state...]
// EMBER_REDUCED=1 → prefers-reduced-motion (also counts infinite animations). Output: .maestri/tmp/shots/ember/.
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

const STATES = process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['approvals-hire', 'approvals-hire-details']
const VIEWPORTS = [
  { tag: '1440x900', width: 1440, height: 900, dpr: 1 },
  { tag: '960x640', width: 960, height: 640, dpr: 1 },
  { tag: 'zoom200', width: 640, height: 360, dpr: 2 },
]
const outDir = `${root}/.maestri/tmp/shots/ember`
const dist = resolve(`${root}/.maestri/tmp/ember-gallery-${process.pid}`)
mkdirSync(outDir, { recursive: true })
rmSync(dist, { recursive: true, force: true })

/** The asset script rewrites generated-imports.ts for a moment now and then (other agents): retry instead of failing. */
const buildOptions = {
  root: `${root}/scripts/persona/ember-gallery`,
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

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.webp': 'image/webp', '.woff2': 'font/woff2', '.woff': 'font/woff' }
const port = await freePort()
const server = createServer((req, res) => {
  const path = normalize(decodeURIComponent((req.url ?? '/').split('?')[0].split('#')[0])).replace(/^([/\\])+/, '')
  const file = join(dist, path === '' ? 'index.html' : path)
  if (!resolve(file).startsWith(dist) || !existsSync(file) || statSync(file).isDirectory()) { res.writeHead(404); res.end(); return }
  res.writeHead(200, { 'content-type': MIME[extname(file)] ?? 'application/octet-stream' })
  res.end(readFileSync(file))
})
await new Promise(resolveListen => server.listen(port, '127.0.0.1', resolveListen))

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

/** Keyboard pass: Tab reaches the control, Enter opens the dialog, Esc closes it and gives focus back to the trigger. */
async function keyboardDetails(page) {
  const trigger = page.getByRole('button', { name: 'Ver detalhes' }).first()
  await trigger.focus()
  const focusVisible = await page.evaluate(() => document.activeElement?.matches(':focus-visible') ?? false)
  await page.keyboard.press('Enter')
  await page.getByRole('dialog').waitFor({ timeout: 3000 })
  const inDialog = await page.evaluate(() => document.activeElement?.closest('[role="dialog"]') !== null)
  await page.screenshot({ path: `${outDir}/_keyboard-dialog-open.png` })
  await page.keyboard.press('Escape')
  await page.waitForTimeout(150)
  const closed = (await page.getByRole('dialog').count()) === 0
  const back = await page.evaluate(() => document.activeElement?.textContent?.trim() ?? '')
  return { focusVisible, focusInDialog: inDialog, escCloses: closed, focusBackOn: back }
}

const report = []
const errors = []
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
        reducedMotion: process.env.EMBER_REDUCED === '1' ? 'reduce' : 'no-preference',
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
            await page.goto(`http://127.0.0.1:${port}/index.html#${state}`, { waitUntil: 'load' })
            await page.reload({ waitUntil: 'load' })
            await page.locator(`[data-gallery-state="${state}"]`).waitFor({ timeout: 15_000 })
            await page.evaluate(async () => { await document.fonts.ready })
            await page.waitForTimeout(500)
            mainText = (await page.locator('main').first().innerText()).trim()
          }
          if (mainText.length < 20) throw new Error(`empty screen: main has ${String(mainText.length)} characters`)
          let keyboard
          // The routine editor is a dialog over the screen: shoot the viewport (the scrim is fixed to it), like the hire details.
          const dialogState = state.startsWith('routine-editor')
          if (dialogState) await page.getByRole('dialog').waitFor({ timeout: 5000 })
          if (state === 'approvals-hire-details') {
            keyboard = await keyboardDetails(page)
            await page.getByRole('button', { name: 'Ver detalhes' }).first().click()
            await page.getByRole('dialog').waitFor({ timeout: 3000 })
            await page.waitForTimeout(300)
          }
          await page.mouse.move(0, 0)
          const file = `${state}-${scheme}-${viewport.tag}.png`
          // D-074: internal captures are cropped to the screen (main), never the empty rail strip. A dialog's scrim is fixed
          // to the viewport, so with one open the whole viewport is shot instead.
          if (keyboard === undefined && !dialogState) await page.locator('main').first().screenshot({ path: `${outDir}/${file}` })
          else await page.screenshot({ path: `${outDir}/${file}` })
          const probe = await page.evaluate(probeOverflow)
          let axe = 'skipped'
          const axeFile = process.env.EMBER_AXE
          if (axeFile !== undefined) {
            await page.addScriptTag({ path: axeFile })
            const violations = await page.evaluate(async () => {
              const r = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
              return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }))
            })
            axe = violations.length
            for (const v of violations) console.log(`[axe ${state} ${scheme} ${viewport.tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 200)}`)
          }
          const infinite = await page.evaluate(() => document.getAnimations().filter(an => an.playState === 'running' && Number(an.effect?.getComputedTiming().iterations) === Infinity).length)
          report.push({ state, scheme, viewport: viewport.tag, file, axe, infiniteAnimations: infinite, ...(keyboard === undefined ? {} : { keyboard }), ...probe })
          console.log(`[${viewport.tag} ${scheme}] ${state}: offscreen=${probe.offscreen} docΔ=${probe.docScrollOverflow} scrollers=${probe.scrollers} axe=${axe} infinite=${infinite}${keyboard === undefined ? '' : ` kbd=${JSON.stringify(keyboard)}`}${probe.offscreen > 0 ? ` :: ${probe.sample.join(' | ')}` : ''}`)
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
const keyboardBad = report.filter(row => row.keyboard !== undefined && !(row.keyboard.focusVisible && row.keyboard.focusInDialog && row.keyboard.escCloses))
const bad = report.filter(row => row.error !== undefined || row.offscreen > 0 || row.docScrollOverflow > 0 || (typeof row.axe === 'number' && row.axe > 0))
console.log(`console errors: ${errors.length}${errors.length > 0 ? `\n${errors.slice(0, 6).join('\n')}` : ''}`)
console.log(`ember gallery: ${report.length} captures, ${bad.length} with overflow/axe/errors, ${keyboardBad.length} keyboard failures → ${outDir}`)
process.exit(bad.length > 0 || keyboardBad.length > 0 || errors.length > 0 ? 1 : 0)
