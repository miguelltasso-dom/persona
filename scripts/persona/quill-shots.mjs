// Quill: real-app captures (light/dark x 960x640 and zoom 200%) of the screens Quill owns, driven through the real UI.
// Boots `--profile persona` on a temp home with a free port (D-067), opens the web UI in Chrome (dev seed) and walks a scenario.
// Run under the build lock (bundle first when the client changed):
//   node scripts/persona/with-lock.mjs "Quill shots" --lock build -- node scripts/persona/quill-shots.mjs <scenario> [viewport...]
// Scenarios: connections | teach. Viewports: 960x640 | zoom200 | 1440x900 (default: 960x640 and zoom200).
// Env: QUILL_AXE=<path to axe.min.js> (WCAG A/AA scan of each state), QUILL_REDUCED=1 (reduced motion), QUILL_SCHEMES=light|dark.
// Output: .maestri/tmp/shots/quill/<scenario>-<state>-<scheme>-<viewport>.png and a JSON summary on the last line.
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
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
const viewports = (requested.length > 0 ? requested : ['960x640', 'zoom200']).map(tag => ALL_VIEWPORTS[tag])
const schemes = process.env.QUILL_SCHEMES === undefined ? ['light', 'dark'] : [process.env.QUILL_SCHEMES]

const home = `${root}/.maestri/tmp/quill-shot-home-${process.pid}`
const outDir = `${root}/.maestri/tmp/shots/quill`
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })

// The web host has no Electron safeStorage: the Cofre only opens with the test cipher (temp home, never real secrets).
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1', PERSONA_VAULT_TEST_CIPHER: '1' }
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
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${scheme} ${viewport.tag}] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => errors.push(`[${scheme} ${viewport.tag}] pageerror ${String(e).slice(0, 240)}`))
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(9000)
  // A cold host can race the plugin boot order (SlotAssemblyError on the first load): reload until the app answers.
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(6000)
    if (await page.getByRole('button', { name: 'Visão geral', exact: true }).first().isVisible().catch(() => false)) break
  }
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

/** QUILL_AXE=<axe.min.js>: A/AA violations of the current page (null = skipped). */
async function axeViolations(page) {
  if (process.env.QUILL_AXE === undefined) return null
  await page.addScriptTag({ path: process.env.QUILL_AXE })
  return page.evaluate(async () => {
    const r = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }))
  })
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
    await page.screenshot({ path: file })
    const axe = await axeViolations(page)
    const overflow = await overflowProbe(page)
    for (const v of axe ?? []) console.log(`[axe ${state} ${scheme} ${viewport.tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 200)}`)
    summary.push({ state, scheme, viewport: viewport.tag, axe: axe === null ? 'skipped' : axe.length, ...overflow })
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
  await page.getByRole('radio', { name: 'Tela de exemplo' }).check({ force: true })
  await page.getByRole('button', { name: 'Começar a gravar' }).click()
  await page.getByRole('region', { name: 'Gravação em andamento' }).waitFor({ timeout: 10_000 })
  await shot('3-countdown')
  await page.waitForTimeout(6500)
  await shot('4-recording')
  await page.getByRole('button', { name: 'Parar e revisar' }).click()
  await page.getByRole('dialog', { name: 'Quer contar o que você fez?' }).waitFor({ timeout: 10_000 })
  await page.getByLabel('O que você fez').fill('Abro o pedido, confiro o valor e aviso o cliente.')
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
writeFileSync(`${outDir}/${scenario}-summary.json`, JSON.stringify({ errors, summary }, null, 2))
clearTimeout(timer)
console.log(`console errors: ${errors.length}`)
for (const line of errors.slice(0, 12)) console.log(line)
console.log(JSON.stringify({ scenario, shots: summary.length, sideways: summary.filter(row => row.pageScrollsSideways || row.dialogScrollsSideways).length, dialogsCut: summary.filter(row => row.dialogFits === false).length, failed }))
await finish(failed || errors.length > 0 ? 1 : 0, failed ? 'FAILED' : 'DONE')
