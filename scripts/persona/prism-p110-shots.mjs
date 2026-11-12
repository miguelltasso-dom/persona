// P1-10 (Prism): capturas das "Travas da casa" (Regras da casa) no shell REAL, para o aceite da Muse. Host real (apps/cli, perfil persona), cliente do bundle atual.
// Run: node scripts/persona/with-lock.mjs "Prism p110 shots" -- node scripts/persona/prism-p110-shots.mjs      (antes: bundle do cliente sob o lock exclusivo)
// Saída: .maestri/tmp/shots/design/p1-10-regras/<estado>-<claro|escuro>-<100|960|200>.png
// Estados: travas-desligadas (as 5 chaves, nenhuma ligada) · travas-ligada (a de "enviar" ligada de verdade no host: a regra é gravada e a lista recarrega).
import { spawn, execFileSync } from 'node:child_process'
import { freePort } from './free-port.mjs'
import { mkdirSync, rmSync, statSync } from 'node:fs'
import { createRequire } from 'node:module'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const home = `${root}/.maestri/tmp/prism-p110-home-${process.pid}`
const outDir = `${root}/.maestri/tmp/shots/design/p1-10-regras`
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
const errors = []
const notes = []
const finish = async (code, note) => {
  console.log(note)
  for (const line of notes) console.log(line)
  if (errors.length > 0) console.log(`console errors (${errors.length}):\n${errors.slice(0, 8).join('\n')}`)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 420_000)

const ONLY = process.env.PRISM_ZOOM // "100" | "960" | "200"
const ZOOMS = [
  { name: '100', viewport: { width: 1440, height: 900 }, scale: 1 },
  { name: '960', viewport: { width: 960, height: 640 }, scale: 1 },
  { name: '200', viewport: { width: 720, height: 450 }, scale: 2 },
].filter(zoom => ONLY === undefined || ONLY.split(',').includes(zoom.name))
const SCHEMES = [{ name: 'claro', scheme: 'light' }, { name: 'escuro', scheme: 'dark' }]

async function open(url, { scheme }, zoom) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: zoom.viewport, deviceScaleFactor: zoom.scale, colorScheme: scheme, locale: 'pt-BR' })
  await context.addInitScript((dark) => {
    localStorage.setItem('persona.rail.collapsed.v1', '0')
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    localStorage.setItem('persona.devSeed.v1', '1')
    const apply = () => { if (dark) document.body?.setAttribute('data-ds-dark-theme', 'true') }
    if (document.body) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, scheme === 'dark')
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${scheme}] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => errors.push(`[${scheme}] pageerror ${String(e).slice(0, 240)}`))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(9000)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(6000)
  return { context, page }
}

async function openRules(page) {
  // "Regras da casa" é uma aba do lugar "Memória da empresa" (nav-places: memory > rules).
  const place = page.locator('[data-nav-panel="secondBrain"]').first()
  await place.evaluate((node) => { node.scrollIntoView({ block: 'center' }) })
  await place.click({ timeout: 15_000 })
  const tab = page.locator('[data-tab-panel="rules"]').first()
  await tab.waitFor({ timeout: 15_000 })
  await tab.click({ timeout: 15_000 })
  await page.locator('[data-persona-surface="rules"]').first().waitFor({ timeout: 25_000 })
  await page.locator('[data-persona-surface="rules"][aria-busy="true"]').waitFor({ state: 'detached', timeout: 25_000 }).catch(() => undefined)
  await page.waitForTimeout(800)
}

async function shot(target, name) {
  const path = `${outDir}/${name}.png`
  await target.screenshot({ path })
  if (statSync(path).size < 5_000) throw new Error(`blank capture ${name}`)
  return path
}

const onData = async (chunk) => {
  out += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
  if (!match) return
  child.stdout.off('data', onData); child.stderr.off('data', onData)
  clearTimeout(timer)
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const saved = []
    let lockOn = false // a lock is saved in the host's home and shared by the next contexts: turn it off again at the end of each pass
    for (const zoom of ZOOMS) {
      for (const scheme of SCHEMES) {
        const tag = `${scheme.name}-${zoom.name}`
        const { context, page } = await open(match[1], scheme, zoom)
        try {
          await openRules(page)
          const sendSwitch = page.getByRole('switch', { name: 'Nunca enviar sem mim' })
          await sendSwitch.waitFor({ timeout: 15_000 })
          const switches = await page.getByRole('switch').count()
          notes.push(`[${tag}] chaves de trava na tela: ${switches}; "enviar" ligada? ${await sendSwitch.getAttribute('aria-checked')}`)
          const card = page.locator('[data-house-lock]').first().locator('xpath=ancestor::section[1]')
          await card.scrollIntoViewIfNeeded()
          await page.evaluate(() => Promise.all([...document.images].map(image => image.decode().catch(() => undefined))))
          await page.waitForTimeout(400)
          if (await sendSwitch.getAttribute('aria-checked') === 'true') { await sendSwitch.click(); await page.waitForTimeout(1200) }
          saved.push(await shot(zoom.name === '100' ? card : page, `travas-desligadas-${tag}`))
          await sendSwitch.click({ timeout: 8000 })
          await page.waitForFunction(() => document.querySelector('[role="switch"][aria-checked="true"]') !== null, undefined, { timeout: 10_000 })
          await page.waitForTimeout(900)
          lockOn = true
          notes.push(`[${tag}] depois do clique: "enviar" ligada? ${await sendSwitch.getAttribute('aria-checked')}`)
          saved.push(await shot(zoom.name === '100' ? card : page, `travas-ligada-${tag}`))
          if (lockOn) { await sendSwitch.click({ timeout: 8000 }); await page.waitForTimeout(1200); lockOn = false }
        } catch (error) {
          notes.push(`[${tag}] FALHOU: ${error instanceof Error ? error.message.slice(0, 220) : String(error)}`)
          await page.screenshot({ path: `${outDir}/debug-${tag}.png` }).catch(() => undefined)
        }
        await context.close()
      }
    }
    await finish(0, `${saved.length} capturas em ${outDir}`)
  } catch (error) {
    await finish(1, `erro: ${error instanceof Error ? error.stack : String(error)}`)
  }
}
child.stdout.on('data', onData)
child.stderr.on('data', onData)
child.on('exit', (code) => { if (!browser) finish(1, `host saiu (${String(code)})\n${out.slice(-800)}`) })
