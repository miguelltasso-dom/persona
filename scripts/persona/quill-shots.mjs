// Quill: real-app captures (light/dark x 960x640 and zoom 200%) of the screens Quill owns, driven through the real UI.
// Boots `--profile persona` on a temp home with a free port (D-067), opens the web UI in Chrome (dev seed) and walks a scenario.
// Run under the build lock (bundle first when the client changed):
//   node scripts/persona/with-lock.mjs "Quill shots" --lock build -- node scripts/persona/quill-shots.mjs <scenario> [viewport...]
// Scenarios: connections | teach | canvas. Viewports: 960x640 | zoom200 | 1440x900 (default: 1440x900, 960x640 and zoom200 = the D-076 acceptance sizes).
// Env: QUILL_AXE=<path to axe.min.js> (WCAG A/AA scan of each state), QUILL_REDUCED=1 (reduced motion), QUILL_SCHEMES=light|dark.
// Output: .maestri/tmp/shots/quill/<scenario>-<state>-<scheme>-<viewport>.png and a JSON summary on the last line.
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { freePort } from './free-port.mjs'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const scenario = process.argv[2] ?? 'connections'
const ALL_VIEWPORTS = {
  '960x640': { tag: '960x640', width: 960, height: 640, dpr: 1 },
  zoom200: { tag: 'zoom200', width: 640, height: 360, dpr: 2 },
  '1440x900': { tag: '1440x900', width: 1440, height: 900, dpr: 1 },
}
const requested = process.argv.slice(3).filter(tag => ALL_VIEWPORTS[tag] !== undefined)
const viewports = (requested.length > 0 ? requested : ['1440x900', '960x640', 'zoom200']).map(tag => ALL_VIEWPORTS[tag])
const schemes = process.env.QUILL_SCHEMES === undefined ? ['light', 'dark'] : [process.env.QUILL_SCHEMES]

const home = `${root}/.maestri/tmp/quill-shot-home-${process.pid}`
const outDir = `${root}/.maestri/tmp/shots/quill`
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })

// The web host boots without PERSONA_VAULT_TEST_CIPHER now (Keel, D-067 addendum): temp home and free port only.
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
const errors = []
const summary = []
const finish = async (code, note) => {
  console.log(note)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  try { rmSync(home, { recursive: true, force: true }) } catch { /* temp home in use: reap-orphans cleans later */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 2_400_000)

async function open(url, scheme, viewport) {
  const context = await browser.newContext({
    reducedMotion: process.env.QUILL_REDUCED === '1' ? 'reduce' : 'no-preference',
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
    colorScheme: scheme,
    locale: 'pt-BR',
  })
  await context.addInitScript(([dark]) => {
    localStorage.setItem('persona.rail.collapsed.v1', '0')
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    localStorage.setItem('persona.devSeed.v1', '1')
    // Ensinar: the example recorder (records nothing) so the whole flow can be walked in a plain browser.
    localStorage.setItem('persona.teach.synthetic', '1')
    const apply = () => { if (dark) document.body?.setAttribute('data-ds-dark-theme', 'true') }
    if (document.body) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, [scheme === 'dark'])
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(9000)
  // A cold host can race the plugin boot order (SlotAssemblyError on the first load): reload until the app answers.
  let shellUp = false
  for (let attempt = 0; attempt < 3 && !shellUp; attempt += 1) {
    await page.reload({ waitUntil: 'load' })
    shellUp = await page.waitForSelector('[data-persona-shell]', { timeout: 15_000 }).then(() => true, () => false)
  }
  if (!shellUp) throw new Error(`app shell never appeared (${scheme} ${viewport.tag}) — blank page, not a capture`)
  // The first loads above only warm the host up. Errors are recorded from one more, WARM boot on: those are the app's.
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${scheme} ${viewport.tag}] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => errors.push(`[${scheme} ${viewport.tag}] pageerror ${String(e).slice(0, 240)}`))
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 30_000 })
  await page.waitForTimeout(2500)
  return { context, page }
}

async function nav(page, label) {
  await page.getByRole('button', { name: 'Visão geral', exact: true }).first().waitFor({ timeout: 20_000 }).catch(() => undefined)
  for (let attempt = 0; attempt < 3 && await page.getByRole('button', { name: label, exact: true }).count() === 0; attempt += 1) {
    for (const toggle of await page.locator('button[aria-controls^="persona-nav-"][aria-expanded="false"]').all()) {
      await toggle.evaluate((node) => { node.click() }).catch(() => undefined)
    }
    await page.waitForTimeout(500)
  }
  const target = page.getByRole('button', { name: label, exact: true }).first()
  await target.evaluate((node) => { node.scrollIntoView({ block: 'center' }) })
  await target.click({ timeout: 10_000 })
  await page.waitForTimeout(1800)
  await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined)
  await page.waitForTimeout(400)
}

/** What each scenario owns. Axe runs on these ("mine": must be 0) and, separately, on the rest of the page ("outside": shell, rail, other screens). */
const AXE_SCOPE = {
  connections: ['[data-persona-surface="connections"]', '[role="dialog"]'],
  teach: ['[data-persona-teach]', '[data-persona-teach-layer]', '[role="dialog"]'],
  canvas: ['[data-persona-surface="canvas"]'],
}

/** QUILL_AXE=<axe.min.js>: A/AA violations of the current page, split in mine / outside (null = skipped). */
async function axeViolations(page) {
  if (process.env.QUILL_AXE === undefined) return null
  await page.addScriptTag({ path: process.env.QUILL_AXE })
  return page.evaluate(async (scopes) => {
    const options = { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } }
    const pack = (r) => r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(' ')), detail: v.nodes[0]?.any?.[0]?.data ?? null }))
    const present = scopes.filter(sel => document.querySelector(sel) !== null).map(sel => [sel])
    const mine = present.length === 0 ? [] : pack(await globalThis.axe.run({ include: present }, options))
    const outside = pack(await globalThis.axe.run(present.length === 0 ? document : { exclude: present }, options))
    return { mine, outside }
  }, AXE_SCOPE[scenario] ?? [])
}

/** What a person would notice: content wider than the window, or clipped by the dialog. */
const overflowProbe = page => page.evaluate(() => {
  const doc = document.documentElement
  const dialog = document.querySelector('[role="dialog"]')
  return {
    pageScrollsSideways: doc.scrollWidth > doc.clientWidth + 1,
    dialogScrollsSideways: dialog === null ? null : dialog.scrollWidth > dialog.clientWidth + 1,
    dialogFits: dialog === null ? null : dialog.getBoundingClientRect().bottom <= window.innerHeight + 1,
  }
})

function shooter(page, scheme, viewport) {
  return async (state) => {
    const file = `${outDir}/${scenario}-${state}-${scheme}-${viewport.tag}.png`
    await page.waitForSelector('[data-persona-shell]', { timeout: 15_000 })
    await page.screenshot({ path: file })
    // A near-empty PNG is a blank page: that is a FAILURE, not a result (Keel, D-067 addendum).
    if (statSync(file).size < 10_000) {
      rmSync(file, { force: true })
      throw new Error(`blank capture (<10 KB) at ${scenario}/${state} ${scheme} ${viewport.tag}`)
    }
    const axe = await axeViolations(page)
    const overflow = await overflowProbe(page)
    for (const v of axe?.mine ?? []) console.log(`[axe ${state} ${scheme} ${viewport.tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 200)}`)
    for (const v of axe?.outside ?? []) console.log(`[axe-outside ${state} ${scheme} ${viewport.tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 200)} :: ${JSON.stringify(v.detail ?? {}).slice(0, 260)}`)
    if (axe !== null && axe.outside.length > 0 && scenario === 'teach' && (state === '3-countdown' || state === '4-recording')) {
      // Muse's hypothesis: axe computes the page's background through the red frame. Hide the recording chrome and ask again.
      const without = await page.evaluate(async () => {
        const chrome = document.querySelector('[data-persona-teach="recording"]')
        if (chrome instanceof HTMLElement) chrome.style.visibility = 'hidden'
        const r = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
        if (chrome instanceof HTMLElement) chrome.style.visibility = ''
        return r.violations.map(v => `${v.id} x${v.nodes.length} :: ${v.nodes[0]?.target.join(' ')}`)
      })
      console.log(`[axe-without-recording-chrome ${state} ${scheme} ${viewport.tag}] ${without.length === 0 ? 'ZERO' : without.join(' | ').slice(0, 300)}`)
    }
    summary.push({ state, scheme, viewport: viewport.tag, axe: axe === null ? 'skipped' : axe.mine.length, axeOutside: axe === null ? 'skipped' : axe.outside.length, ...overflow })
  }
}

const SCENARIOS = {
  /** W2-7: list → "Uma persona" → add account (name, sign-in) → rename → remove. */
  async connections(page, shot) {
    await nav(page, 'Conexões')
    await shot('list')

    await page.getByRole('tab', { name: 'Uma persona' }).click()
    await page.waitForTimeout(500)
    await shot('persona-scope')
    await page.getByRole('tab', { name: 'Toda a equipe' }).click()

    const add = page.getByRole('button', { name: /Adicionar outra conta/u }).first()
    await add.scrollIntoViewIfNeeded()
    await add.click()
    await page.getByRole('dialog').waitFor({ timeout: 10_000 })
    await page.waitForTimeout(400)
    await shot('add-1-name')
    await page.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click()
    await page.waitForTimeout(500)
    await shot('add-1-name-empty-error')
    const suggestion = page.getByRole('dialog').getByRole('group', { name: 'Sugestões de nome' }).getByRole('button').first()
    await suggestion.click()
    await page.getByRole('dialog').getByRole('button', { name: 'Continuar' }).click()
    await page.getByText(/Passo [23] de 3/u).waitFor({ timeout: 15_000 })
    await page.waitForTimeout(500)
    await shot('add-2-login')
    const later = page.getByRole('dialog').getByRole('button', { name: /Terminar depois|Concluir/u })
    await later.click()
    await page.waitForTimeout(500)
    await shot('list-after-add')

    const menu = page.getByRole('button', { name: /^Mais ações para/u }).last()
    await menu.scrollIntoViewIfNeeded()
    await menu.click()
    await page.getByRole('menuitem', { name: 'Renomear' }).click()
    await page.getByRole('dialog').waitFor({ timeout: 10_000 })
    await page.waitForTimeout(300)
    await shot('rename')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)

    await menu.click()
    await page.getByRole('menuitem', { name: 'Remover conta' }).click()
    await page.getByRole('dialog').waitFor({ timeout: 10_000 })
    await page.waitForTimeout(300)
    await shot('remove')
    await page.getByRole('dialog').getByRole('button', { name: 'Remover conta' }).click()
    await page.waitForTimeout(1200)
    await shot('list-after-remove')
  },
}

SCENARIOS.teach = async function teach(page, shot) {
  // Reach the DM of the first persona in the rail, then its ⋯ menu → "Ensinar a …".
  const rail = page.locator('[data-persona-area="rail"]')
  const personaRow = rail.getByRole('button', { name: /Atlas/u }).first()
  await personaRow.scrollIntoViewIfNeeded()
  await personaRow.click()
  await page.waitForTimeout(1500)
  await page.getByRole('button', { name: /^Mais ações para /u }).first().click()
  await page.getByRole('menuitem', { name: /^Ensinar a /u }).click()
  await page.getByRole('dialog').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(500)
  await shot('1-consent')
  await page.getByRole('button', { name: 'Escolher o que gravar' }).click()
  await page.getByRole('radio', { name: 'Tela de exemplo' }).waitFor({ timeout: 10_000 })
  await shot('2-source')
  // The radio is visually hidden (the whole option is the control): click what a person clicks.
  await page.locator('label', { hasText: 'Tela de exemplo' }).click()
  await page.getByRole('button', { name: 'Começar a gravar' }).click()
  await page.getByRole('region', { name: 'Gravação em andamento' }).waitFor({ timeout: 10_000 })
  await shot('3-countdown')
  await page.waitForTimeout(6500)
  await shot('4-recording')
  await page.getByRole('button', { name: 'Parar e revisar' }).click()
  await page.getByRole('dialog', { name: 'Quer contar o que você fez?' }).waitFor({ timeout: 10_000 })
  await page.getByRole('textbox', { name: 'O que você fez' }).fill('Abro o pedido, confiro o valor e aviso o cliente.')
  await shot('5-narrate')
  await page.getByRole('button', { name: 'Montar o passo a passo' }).click()
  await page.getByRole('heading', { name: /^Revise o que .* aprendeu$/u }).waitFor({ timeout: 30_000 })
  await page.waitForTimeout(600)
  await shot('6-review')
  await page.getByRole('button', { name: 'Adicionar passo' }).click()
  await page.waitForTimeout(300)
  await shot('7-review-added')
  await page.getByRole('button', { name: 'Salvar como skill candidata' }).click()
  await page.getByText(/aprendeu /u).first().waitFor({ timeout: 15_000 })
  await page.waitForTimeout(800)
  await shot('8-done')
  await page.getByRole('button', { name: /^Ativar para / }).click()
  await page.waitForTimeout(1500)
  await shot('9-activated-or-refused')
  await page.getByRole('button', { name: 'Compartilhar com mais gente' }).click().catch(() => undefined)
  await page.waitForTimeout(400)
  await shot('10-share')
  await page.getByRole('button', { name: 'Concluir' }).click()
}

/** G2: map and list of the canvas; keyboard selection in the list (empty state is a valid, honest capture too). */
SCENARIOS.canvas = async function canvas(page, shot) {
  await nav(page, 'Canvas')
  await shot('1-map-or-empty')
  const listTab = page.getByRole('tab', { name: 'Lista' })
  if (await listTab.count() === 0) return
  await listTab.focus()
  await page.keyboard.press('Enter')
  await page.waitForTimeout(500)
  const stayedOnTab = await page.evaluate(() => document.activeElement?.getAttribute('role') === 'tab')
  summary.push({ state: 'focus-stays-on-tab', ok: stayedOnTab })
  await shot('2-list')
  const rows = page.getByRole('row')
  if (await rows.count() > 1) {
    await rows.nth(1).focus()
    await page.keyboard.press('ArrowDown')
    // Space selects (Enter OPENS the object on its own screen, which would leave the canvas).
    await page.keyboard.press(' ')
    await page.waitForTimeout(400)
    await shot('3-list-selected')
    // The Projects page also has a "Canvas" section tab: this is the map/list switch of the canvas itself.
    await page.locator('#canvas-mode-tab-canvas').click()
    await page.waitForTimeout(400)
    await shot('4-map-selection-kept')
  }
}

const run = SCENARIOS[scenario]
if (run === undefined) await finish(2, `unknown scenario "${scenario}" (known: ${Object.keys(SCENARIOS).join(', ')})`)

child.stdout.on('data', (chunk) => { out += chunk.toString() })
child.stderr.on('data', (chunk) => { out += chunk.toString() })
let url
// A busy machine (several app launches at once) can take minutes to boot the host: wait up to 7 minutes, but fail fast if it exits.
for (let i = 0; i < 840 && url === undefined; i += 1) {
  const match = out.match(/https?:\/\/(?:127\.0\.0\.1|localhost):\d+[^\s]*/u)
  if (match !== null) url = match[0]
  else if (child.exitCode !== null) break
  else await new Promise((r) => { setTimeout(r, 500) })
}
if (url === undefined) await finish(1, `host did not print a URL (exit=${String(child.exitCode)})\n${out.slice(-1500)}`)
console.log(`host: ${url.replace(/token=[^&\s]+/u, 'token=…')}`)

browser = await chromium.launch({ channel: 'chrome', headless: true })
let failed = false
for (const scheme of schemes) {
  for (const viewport of viewports) {
    const { context, page } = await open(url, scheme, viewport)
    try {
      await run(page, shooter(page, scheme, viewport))
    } catch (error) {
      failed = true
      console.log(`[FAIL ${scenario} ${scheme} ${viewport.tag}] ${String(error).slice(0, 600)}`)
      try { await page.screenshot({ path: `${outDir}/${scenario}-FAILED-${scheme}-${viewport.tag}.png` }) } catch { /* page gone */ }
    }
    await context.close()
  }
}
writeFileSync(`${outDir}/${scenario}-summary.json`, JSON.stringify({ at: new Date().toISOString(), scenario, errors, summary }, null, 2))
clearTimeout(timer)
console.log(`console errors: ${errors.length}`)
for (const line of errors.slice(0, 12)) console.log(line)
console.log(JSON.stringify({ scenario, shots: summary.length, axeMine: summary.filter(row => typeof row.axe === 'number' && row.axe > 0).length, axeOutside: summary.filter(row => typeof row.axeOutside === 'number' && row.axeOutside > 0).length, sideways: summary.filter(row => row.pageScrollsSideways || row.dialogScrollsSideways).length, dialogsCut: summary.filter(row => row.dialogFits === false).length, failed }))
await finish(failed || errors.length > 0 || summary.some(row => typeof row.axe === 'number' && row.axe > 0) ? 1 : 0, failed ? 'FAILED' : 'DONE')
