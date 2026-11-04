// Ember: acceptance captures INSIDE the real shell (D-074): the full rail + the real screen, on a temp home with a free port.
// Boots `--profile persona`, opens it in Chrome and saves light/dark captures at 1440x900, 960x640 and zoom 200 % (640x360 @2x),
// each with an axe pass (EMBER_AXE=<axe.min.js>) and a horizontal-overflow check.
//   node scripts/persona/with-lock.mjs "Ember shell shots" --lock build -- node scripts/persona/ember-shell-shots.mjs <recipe...>
// Recipes: approvals (dev seed) · empty-org (empty home: "Quem cuida de quem" with nobody) · empty-health · skills-empty (dev seed:
// a persona profile, Skills tab). Output: .maestri/tmp/shots/ember/shell/<recipe>-<scheme>-<viewport>.png (+ report.json).
import { spawn, execFileSync } from 'node:child_process'
import { freePort } from './free-port.mjs'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const home = `${root}/.maestri/tmp/ember-shot-home-${process.pid}`
const outDir = `${root}/.maestri/tmp/shots/ember/shell`
const VIEWPORTS = [
  { tag: '1440x900', width: 1440, height: 900, dpr: 1 },
  { tag: '960x640', width: 960, height: 640, dpr: 1 },
  { tag: 'zoom200', width: 640, height: 360, dpr: 2 },
]
const wanted = process.argv.slice(2)
if (wanted.length === 0) { console.error('usage: ember-shell-shots.mjs <recipe...>'); process.exit(2) }
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
const errors = []
const report = []
const finish = async (code, note) => {
  console.log(note)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  writeFileSync(`${outDir}/report.json`, JSON.stringify({ errors, report }, null, 2))
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 600_000)

/** Same flags as design-shots: `seeded` = onboarding done + dev seed; otherwise an empty home (onboarding done, no seed). */
async function open(url, scheme, viewport, seeded) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr, colorScheme: scheme, locale: 'pt-BR' })
  await context.addInitScript(([dark, withSeed]) => {
    localStorage.setItem('persona.rail.collapsed.v1', '0')
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    if (withSeed) localStorage.setItem('persona.devSeed.v1', '1')
    else localStorage.removeItem('persona.devSeed.v1')
    const apply = () => { if (dark) document.body?.setAttribute('data-ds-dark-theme', 'true') }
    if (document.body) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, [scheme === 'dark', seeded])
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`[${scheme} ${viewport.tag}] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => errors.push(`[${scheme} ${viewport.tag}] pageerror ${String(e).slice(0, 240)}`))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(seeded ? 9000 : 5000)
  if (seeded) {
    // The dev seed completes onboarding after bootstrap; reload so the host no longer reports first use.
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(6000)
  }
  await page.waitForSelector('[data-persona-shell]', { timeout: 20_000 })
  return { context, page }
}

/** Click a rail item by panel id (the same hook Probe uses), so renamed labels do not break captures. */
async function navPanel(page, panel) {
  const target = page.locator(`[data-nav-panel="${panel}"], [data-tab-panel="${panel}"]`).first()
  await target.waitFor({ timeout: 20_000 })
  await target.evaluate((node) => { node.scrollIntoView({ block: 'center' }) })
  await target.click({ timeout: 10_000 })
  await page.waitForTimeout(1600)
}

async function settle(page, surface) {
  await page.locator(`[data-persona-surface="${surface}"]`).first().waitFor({ timeout: 25_000 }).catch(() => undefined)
  await page.locator(`[data-persona-surface="${surface}"][aria-busy="true"]`).waitFor({ state: 'detached', timeout: 25_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
}

const RECIPES = {
  approvals: { seeded: true, run: async (page) => { await navPanel(page, 'approvals'); await settle(page, 'approvals') } },
  'empty-org': { seeded: false, run: async (page) => { await navPanel(page, 'orgChart'); await settle(page, 'org-chart') } },
  'empty-health': { seeded: false, run: async (page) => { await navPanel(page, 'teamHealth'); await settle(page, 'team-health') } },
  'skills-empty': {
    seeded: true,
    run: async (page) => {
      await navPanel(page, 'team')
      await page.waitForTimeout(1200)
      // Open the first persona's profile, then its Skills tab.
      const profile = page.getByRole('button', { name: /perfil/iu }).first()
      if (await profile.count() > 0) await profile.click()
      else await page.locator('[data-persona-member], [data-persona-id]').first().click()
      await page.waitForTimeout(1500)
      await page.getByRole('tab', { name: /skills/iu }).first().click()
      await page.waitForTimeout(800)
    },
  },
}

async function axeCount(page, label) {
  if (process.env.EMBER_AXE === undefined) return 'skipped'
  await page.addScriptTag({ path: process.env.EMBER_AXE })
  const violations = await page.evaluate(async () => {
    const r = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => n.target.join(' ')) }))
  })
  for (const v of violations) console.log(`[axe ${label}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 220)}`)
  return violations.length
}

const onData = async (chunk) => {
  out += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
  if (!match) return
  child.stdout.off('data', onData); child.stderr.off('data', onData)
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const name of wanted) {
      const recipe = RECIPES[name]
      if (recipe === undefined) { console.log(`[skip] unknown recipe ${name}`); continue }
      for (const viewport of VIEWPORTS) {
        for (const scheme of ['light', 'dark']) {
          const label = `${name} ${scheme} ${viewport.tag}`
          const { context, page } = await open(match[1], scheme, viewport, recipe.seeded)
          try {
            await recipe.run(page)
            await page.mouse.move(0, 0)
            const file = `${name}-${scheme}-${viewport.tag}.png`
            const buffer = await page.screenshot({ path: `${outDir}/${file}` })
            if (buffer.length < 10_240) throw new Error(`blank capture (${buffer.length} B)`)
            const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
            const axe = await axeCount(page, label)
            report.push({ recipe: name, scheme, viewport: viewport.tag, file, axe, pageOverflow: overflow })
            console.log(`[${label}] axe=${axe} pageOverflow=${overflow}`)
          } catch (error) {
            report.push({ recipe: name, scheme, viewport: viewport.tag, error: String(error).slice(0, 200) })
            console.log(`[${label}] FAILED ${String(error).slice(0, 200)}`)
          }
          await context.close()
        }
      }
    }
    const bad = report.filter(row => row.error !== undefined || row.pageOverflow > 0 || (typeof row.axe === 'number' && row.axe > 0))
    clearTimeout(timer)
    await finish(bad.length > 0 || errors.length > 0 ? 1 : 0, `ember shell shots: ${report.length} captures, ${bad.length} with errors/overflow/axe, console errors ${errors.length}${errors.length > 0 ? `\n${errors.slice(0, 6).join('\n')}` : ''} → ${outDir}`)
  } catch (error) {
    await finish(1, `FAILED ${String(error).slice(0, 400)}`)
  }
}
child.stdout.on('data', onData); child.stderr.on('data', onData)
child.on('exit', (code) => { if (browser === undefined) finish(1, `host exited ${String(code)}\n${out.slice(-1200)}`) })
