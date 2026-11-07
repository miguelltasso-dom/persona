// Lumen: real-browser proof that "Revisar mudanças" fits its window (bundle 6; the pre-accept's `dialogo` check, Muse 07/11: a blocker).
// Builds scripts/persona/lumen-sheet-fit/ with the repo's Vite (its own dist: the client lib is NOT touched), serves it on a free port and walks
// the sheet — list, clash, success — in light/dark at 1440x900, 960x640 and 640x360@2x (zoom 200 %), inside a stand-in for the shell's page area
// (an identity-transformed `main`: the box `position: fixed` resolves against in the real app). For each step it runs the pre-accept probe's own
// dialog measurement (`dialogs[].cut`) and checks the way out ("Aplicar na pasta" / "Voltar ao quadro") is inside the window and not covered.
//   node scripts/persona/with-lock.mjs "<you> sheet fit" --lock check -- node scripts/persona/lumen-sheet-fit.mjs [label]
// LUMEN_SHEET_OLD_CSS=<file>  → builds with THAT stylesheet instead of KanbanReviewSheet.module.css (the negative control: the committed one must FAIL).
// LUMEN_AXE=<axe.min.js>      → also reports axe (WCAG 2.x A/AA) per step.   Output: .maestri/tmp/shots/lumen-sheet-fit/<label>/ (+ report.json). Exit 1 on any cut.
import { createServer } from 'node:http'
import { existsSync, mkdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { extname, join, normalize, resolve } from 'node:path'
import { freePort } from './free-port.mjs'
import { collectProbe } from './preaccept-probe.mjs'

const root = 'C:/Users/migue/dev/persona'
const pkg = `${root}/packages/persona/client-ui-persona`
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const { build } = await import(createRequire(`${root}/package.json`).resolve('vite').replace(/\\/g, '/').replace(/^([A-Za-z]):/, 'file:///$1:'))

const label = process.argv[2] ?? (process.env.LUMEN_SHEET_OLD_CSS === undefined ? 'after' : 'control-old-css')
const VIEWPORTS = [
  { tag: '1440x900', width: 1440, height: 900, dpr: 1 },
  { tag: '960x640', width: 960, height: 640, dpr: 1 },
  { tag: 'zoom200', width: 640, height: 360, dpr: 2 },
]
const outDir = `${root}/.maestri/tmp/shots/lumen-sheet-fit/${label}`
const dist = resolve(`${root}/.maestri/tmp/lumen-sheet-fit-${process.pid}`)
mkdirSync(outDir, { recursive: true })
rmSync(dist, { recursive: true, force: true })

const oldCss = process.env.LUMEN_SHEET_OLD_CSS
const buildOptions = {
  root: `${root}/scripts/persona/lumen-sheet-fit`,
  base: './',
  logLevel: 'warn',
  esbuild: { jsx: 'automatic' },
  resolve: {
    alias: [
      ...(oldCss === undefined ? [] : [{ find: /^\.\/KanbanReviewSheet\.module\.css$/, replacement: resolve(oldCss).replace(/\\/g, '/') }]),
      { find: /^react$/, replacement: `${pkg}/node_modules/react` },
      { find: /^react\/(.*)$/, replacement: `${pkg}/node_modules/react/$1` },
      { find: /^react-dom$/, replacement: `${pkg}/node_modules/react-dom` },
      { find: /^react-dom\/(.*)$/, replacement: `${pkg}/node_modules/react-dom/$1` },
    ],
  },
  build: { outDir: dist, emptyOutDir: true, assetsInlineLimit: 200_000, target: 'es2022', minify: false },
}
// The asset script rewrites generated-imports.ts for a moment now and then (other agents): retry instead of failing.
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

/** Is the control inside the window, and is it the thing under its own centre (not covered by a toast, a sheet edge...)? */
async function reach(page, testId) {
  return page.evaluate((id) => {
    const el = document.querySelector(`[data-testid="${id}"]`)
    if (el === null) return { present: false }
    const r = el.getBoundingClientRect()
    const inWindow = r.top >= -1 && r.bottom <= window.innerHeight + 1 && r.left >= -1 && r.right <= window.innerWidth + 1
    const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2)
    return { present: true, inWindow, reachable: at !== null && (at === el || el.contains(at)), top: Math.round(r.top), bottom: Math.round(r.bottom) }
  }, testId)
}

/** The sheet's own box and its title (the title must never leave the window). */
async function sheetBox(page) {
  return page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog === null) return null
    const r = dialog.getBoundingClientRect()
    const title = dialog.querySelector('h2')?.getBoundingClientRect()
    const body = dialog.querySelector('[data-testid="review-sheet-body"]')
    return {
      win: { w: window.innerWidth, h: window.innerHeight },
      sheet: { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) },
      title: title === undefined ? null : { top: Math.round(title.top), bottom: Math.round(title.bottom) },
      bodyScrolls: body === null ? null : body.scrollHeight > body.clientHeight + 1,
    }
  })
}

const rows = []
let failed = 0
let browser
try {
  browser = await chromium.launch({ channel: 'chrome', headless: true })
  for (const viewport of VIEWPORTS) {
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr, colorScheme: scheme, locale: 'pt-BR' })
      const page = await context.newPage()
      const errors = []
      page.on('pageerror', error => errors.push(String(error).slice(0, 200)))
      await page.goto(`http://127.0.0.1:${port}/index.html`, { waitUntil: 'load' })
      await page.locator('[data-testid="review-panel"]').waitFor({ timeout: 20_000 })
      await page.evaluate(async () => { await document.fonts.ready })
      await page.waitForTimeout(700)

      const measure = async (step, primaryId) => {
        const tag = `${scheme}-${viewport.tag}`
        await page.screenshot({ path: `${outDir}/${step}-${tag}.png` })
        const axePath = process.env.LUMEN_AXE
        const probe = await collectProbe(page, { ...(axePath === undefined ? {} : { axePath }), consoleErrors: errors, focus: false })
        const cuts = probe.dialogs.flatMap(dialog => dialog.cut)
        const box = await sheetBox(page)
        const primary = await reach(page, primaryId)
        const titleIn = box?.title !== null && box?.title !== undefined && box.title.top >= -1 && box.title.bottom <= box.win.h + 1
        const ok = cuts.length === 0 && primary.present && primary.inWindow && primary.reachable && titleIn
        if (!ok) failed += 1
        const axeCount = (probe.axe ?? []).length
        const row = { step, scheme, viewport: viewport.tag, ok, cuts, sheet: box?.sheet, title: box?.title, bodyScrolls: box?.bodyScrolls, primary: { id: primaryId, ...primary }, axe: axePath === undefined ? 'skipped' : axeCount }
        rows.push(row)
        console.log(`[${step} ${tag}] ${ok ? 'OK ' : 'CUT'} sheet ${JSON.stringify(box?.sheet)} in ${box?.win.h} px; title ${titleIn ? 'in' : 'OUT'}; ${primaryId} ${primary.present ? `${primary.inWindow ? 'in window' : 'OUTSIDE'}, ${primary.reachable ? 'reachable' : 'COVERED'}` : 'MISSING'}; body ${box?.bodyScrolls === true ? 'scrolls' : 'fits'}${cuts.length > 0 ? ` :: ${cuts.join(' | ')}` : ''}${axePath === undefined ? '' : ` axe=${String(axeCount)}`}`)
      }

      await measure('lista', 'review-apply')
      await page.locator('[data-testid="review-apply"]').click()
      await page.locator('[data-testid="review-conflict"]').waitFor({ timeout: 10_000 })
      await page.waitForTimeout(500)
      await measure('conflito', 'review-apply')
      // The card's own radio sits over its title (a hidden input that covers the card): choose it directly, like a person's click lands on it.
      await page.locator('input[type="radio"][value="both"]').first().dispatchEvent('click')
      await page.waitForTimeout(300)
      await page.locator('[data-testid="review-apply"]').click()
      await page.locator('[data-testid="review-applied"]').waitFor({ timeout: 10_000 })
      await page.waitForTimeout(900)
      await measure('sucesso', 'review-leave')
      if (errors.length > 0) console.log(`[${scheme} ${viewport.tag}] page errors: ${errors.join(' | ')}`)
      await context.close()
    }
  }
} finally {
  await browser?.close().catch(() => undefined)
  server.close()
  rmSync(dist, { recursive: true, force: true })
}
writeFileSync(`${outDir}/report.json`, JSON.stringify({ label, oldCss: oldCss ?? null, finishedAt: new Date().toISOString(), failed, rows }, null, 2))
console.log(`lumen sheet fit (${label}): ${rows.length} steps, ${failed} with a cut or a cut-off way out → ${outDir}`)
process.exit(failed === 0 ? 0 : 1)
