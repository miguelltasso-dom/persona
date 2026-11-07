// Quill: real-app captures (light/dark x 960x640 and zoom 200%) of the screens Quill owns, driven through the real UI.
// Boots `--profile persona` on a temp home with a free port (D-067), opens the web UI in Chrome (dev seed) and walks a scenario.
// Run under the build lock (bundle first when the client changed):
//   node scripts/persona/with-lock.mjs "Quill shots" --lock build -- node scripts/persona/quill-shots.mjs <scenario> [viewport...]
// Scenarios: connections | teach | canvas. Viewports: 960x640 | zoom200 | 1440x900 (default: 1440x900, 960x640 and zoom200 = the D-076 acceptance sizes).
// Env: QUILL_AXE=<path to axe.min.js> (WCAG A/AA scan of each state), QUILL_REDUCED=1 (reduced motion), QUILL_SCHEMES=light|dark.
// Output: .maestri/tmp/shots/quill/<scenario>-<state>-<scheme>-<viewport>.png and a JSON summary on the last line.
import { spawn, execFileSync } from 'node:child_process'
import { appendFileSync, createWriteStream, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { freePort } from './free-port.mjs'
import { collectProbe, writeProbe } from './preaccept-probe.mjs'

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
// QUILL_OUT redirects a debug run away from the official capture folder (the bundle captures stay untouched).
const outDir = process.env.QUILL_OUT ?? `${root}/.maestri/tmp/shots/quill`
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })

// The web host boots without PERSONA_VAULT_TEST_CIPHER now (Keel, D-067 addendum): temp home and free port only.
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
// The host's stdout and stderr go to a file from the first byte (Keel 03:17): a dead host is then explained by its own last lines.
const hostLog = createWriteStream(`${outDir}/host-${scenario}-${process.pid}.log`)
child.stdout.pipe(hostLog, { end: false })
child.stderr.pipe(hostLog, { end: false })
child.on('exit', (code, signal) => {
  // Diagnostics only: the host's last output and how it ended, kept next to the shots.
  try { writeFileSync(`${outDir}/host-exit-${scenario}.log`, `${out.slice(-6000)}\nexit code=${code} signal=${signal} at ${new Date().toISOString()}\n`) } catch { /* diagnostics only */ }
})
let browser
const errors = []
// Each probe sidecar gets only the console errors raised since the previous capture (not the whole scene's list).
let probeMark = 0
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
  if (process.env.QUILL_NETLOG === '1') {
    // Debug only: one JSON line per host response (method, path, status, first 300 chars of the body) to learn the wire shape.
    page.on('response', async (res) => {
      try {
        const u = new URL(res.url())
        if (u.hostname !== '127.0.0.1' && u.hostname !== 'localhost') return
        if (/\.(js|css|svg|png|webp|woff2?|ico|map)$/u.test(u.pathname)) return
        // Persona RPC bodies are kept whole (up to 60 KB) so the NextStepBar / EFF-1 intercepts can copy their real shape.
        const limit = u.pathname.startsWith('/api/persona/') ? 60_000 : 300
        const body = (await res.text()).slice(0, limit)
        appendFileSync(`${outDir}/netlog.jsonl`, `${JSON.stringify({ at: new Date().toISOString(), method: res.request().method(), path: u.pathname + u.search.slice(0, 120), status: res.status(), type: res.headers()['content-type'] ?? '', body })}\n`)
      } catch { /* a response that closed early is not a finding */ }
    })
  }
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(9000)
  // A cold host can race the plugin boot order (SlotAssemblyError on the first load): reload until the app answers.
  let shellUp = false
  for (let attempt = 0; attempt < 3 && !shellUp; attempt += 1) {
    await page.reload({ waitUntil: 'load' })
    shellUp = await page.waitForSelector('[data-persona-shell]', { timeout: 15_000 }).then(() => true, () => false)
  }
  if (!shellUp) throw new Error(`app shell never appeared (${scheme} ${viewport.tag}) — blank page, not a capture`)
  // The loads above only warm the host up, and every reload aborts the previous page's in-flight fetches (a "Failed to fetch"
  // that is the browser's, not the app's). One more, WARM boot, and only THEN the listeners: what they hear is the app's.
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 30_000 })
  await page.waitForTimeout(4000)
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${scheme} ${viewport.tag}] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => errors.push(`[${scheme} ${viewport.tag}] pageerror ${String(e).slice(0, 240)}`))
  return { context, page }
}

// Bundle 3 (CV-1 trilho): the rail shows places; their tabs hold the screens. A label that is not a rail button is reached through its place.
const PLACE_OF = { 'Quadros': 'Projetos', 'Rotinas': 'Projetos', 'Arquivos': 'Projetos', 'Canvas': 'Projetos', 'Segundo cérebro': 'Memória da empresa', 'Conhecimento': 'Memória da empresa', 'Regras': 'Memória da empresa', 'Conexões': 'Configurações', 'Personas': 'Configurações', 'Uso e limites': 'Configurações', 'Membros': 'Configurações', 'Aparência': 'Configurações' }
async function nav(page, label) {
  await page.getByRole('button', { name: 'Visão geral', exact: true }).first().waitFor({ timeout: 20_000 }).catch(() => undefined)
  for (let attempt = 0; attempt < 3 && await page.getByRole('button', { name: label, exact: true }).count() === 0; attempt += 1) {
    for (const toggle of await page.locator('button[aria-controls^="persona-nav-"][aria-expanded="false"]').all()) {
      await toggle.evaluate((node) => { node.click() }).catch(() => undefined)
    }
    await page.waitForTimeout(500)
  }
  if (await page.getByRole('button', { name: label, exact: true }).count() === 0 && PLACE_OF[label] !== undefined) {
    await page.getByRole('button', { name: PLACE_OF[label], exact: true }).first().click({ timeout: 10_000 })
    await page.waitForTimeout(900)
    const tab = page.getByRole('tab', { name: label, exact: true })
    const target = (await tab.count()) > 0 ? tab.first() : page.getByRole('button', { name: label, exact: true }).first()
    await target.click({ timeout: 10_000 })
    await page.waitForTimeout(1800)
    await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined)
    await page.waitForTimeout(400)
    return
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
  away: ['[data-persona-away]'],
  personas: ['[data-persona-settings]', '[data-persona-engine-overlay]', '[role="dialog"]'],
  nextstep: ['[data-persona-next-step]'],
  effort: ['[data-persona-settings]', '[data-persona-engine-overlay]', '[role="dialog"]'],
  savefiles: ['[data-persona-settings]'],
  effortreal: ['[data-persona-settings]', '[data-persona-engine-overlay]', '[role="dialog"]'],
  effortcodex: ['[data-persona-settings]', '[data-persona-engine-overlay]', '[role="dialog"]'],
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
    // Pre-acceptance probe (Keel 04:26): a sidecar <capture>.probe.json next to each PNG, read by preaccept.mjs.
    const sinceLast = errors.slice(probeMark)
    probeMark = errors.length
    // The pre-acceptance probe needs an axe that knows target-size (4.7+); QUILL_AXE (3.3) stays for the scene axe pass.
    writeProbe(file, await collectProbe(page, { axePath: process.env.PREACCEPT_AXE ?? process.env.QUILL_AXE, consoleErrors: sinceLast }))
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

/** The same call the client makes, from the page's own browser session (a real host RPC, not a mock). */
async function hostRpc(page, method, request) {
  const response = await page.context().request.post(new URL(`/api/persona/${method}`, url).href, {
    data: { type: 'client-request', rpcId: crypto.randomUUID(), method: `persona/${method}`, payload: { args: { request } } },
    timeout: 60_000,
  })
  const body = await response.json()
  if (body.result?.ok !== true) throw new Error(`rpc:${method}:${body.result?.error?.code ?? 'invalid-result'}`)
  return body.result.value
}

/**
 * P1-7: "Enquanto você estava fora" with what the host really knows. A persona proposes a hire (a real approval card waits for the
 * person → a real "Espera você" row). Nothing is dismissed here: every size sees the same window (dismissing is covered by tests).
 */
SCENARIOS.away = async function away(page, shot) {
  const tenant = await page.evaluate(() => {
    try { return JSON.parse(localStorage.getItem('persona.tenant.v1') ?? 'null') } catch { return null }
  })
  if (tenant === null) throw new Error('no tenant in localStorage: the host session is not up')
  const scope = { workspaceId: tenant.workspaceId, projectId: tenant.projectId }
  const team = await hostRpc(page, 'listTeam', scope)
  const creator = team.personas[0]
  if (creator === undefined) throw new Error('the team is empty: nobody can propose a hire')
  // A fixed id: the same real card for every size (a repeat is refused by the host, which is fine).
  await hostRpc(page, 'proposeHire', {
    ...scope, id: 'hire-away-capture', creatorPersonaId: creator.id, name: 'Bolota', title: 'Revisor de contratos',
    description: 'Lê contratos e aponta riscos.', reason: 'Os contratos estão acumulando.',
  }).catch(() => undefined)
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 30_000 })
  await nav(page, 'Visão geral')
  await page.locator('[data-persona-away]').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(600)
  await shot('1-away')
  // The row's link goes to the real card in Aprovações.
  await page.locator('[data-persona-away]').getByRole('button', { name: /^Abrir/u }).first().click()
  await page.waitForTimeout(1800)
  await shot('2-opened')
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

/** HT-13 + EFF-1 + D-090: Configurações › Personas and the Motor, Modelo e Esforço dialog (native effort levels). */
SCENARIOS.personas = async function personas(page, shot) {
  await page.evaluate(() => {
    localStorage.setItem('persona.flag.settingsPersonas', '1')
    localStorage.setItem('persona.flag.engineEffort', '1')
    localStorage.setItem('persona.flag.teamwork', '1')
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 30_000 })
  await page.waitForTimeout(2000)
  await nav(page, 'Conexões')
  const tab = page.getByRole('tab', { name: 'Personas', exact: true }).first()
  if (await tab.count() > 0) {
    await tab.click()
  } else {
    await nav(page, 'Personas')
  }
  await page.locator('[data-persona-settings="personas"]').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(800)
  await shot('1-panel')
  // Keel (01:58): the team controls (help between colleagues, review before delivery) sit below the fold: capture them too.
  const helpControl = page.getByText('Pode pedir ajuda a colegas', { exact: false }).first()
  if (await helpControl.count() > 0) {
    await helpControl.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await shot('1b-team-help')
  }
  const reviewBlock = page.getByText('Revisão antes de entregar', { exact: false }).first()
  if (await reviewBlock.count() > 0) {
    await reviewBlock.scrollIntoViewIfNeeded()
    await page.waitForTimeout(300)
    await shot('1c-team-review')
  }
  const trigger = page.locator('[data-persona-engine-trigger]').first()
  if (await trigger.count() > 0) {
    await trigger.scrollIntoViewIfNeeded()
    await trigger.click()
    await page.getByRole('dialog').waitFor({ timeout: 10_000 })
    await page.waitForTimeout(500)
    await shot('2-engine-dialog')
    await page.keyboard.press('Escape')
    await page.waitForTimeout(300)
  }
}

/** EFF-1 (EFFORT-SPEC §6, pedido do Keel): the engine dialog with a CONNECTED engine that reports models and levels. Fake client:
 *  the host's own `listConnections` answer with only the Claude row changed (logged in, models, levels). These models and levels are TEST data. */
const FAKE_CLAUDE_MODELS = [
  { id: 'haiku', label: 'Haiku', effortLevels: ['low', 'medium', 'high'] },
  { id: 'sonnet', label: 'Sonnet', effortLevels: ['low', 'medium', 'high', 'max'] },
  { id: 'opus', label: 'Opus', effortLevels: ['low', 'medium', 'high', 'xhigh', 'max'] },
]
const FAKE_CLAUDE_DEFAULT_LEVELS = ['low', 'medium', 'high', 'xhigh', 'max']

async function fakeClaudeEngine(page) {
  await page.route('**/api/persona/listConnections', async route => {
    // The app polls listConnections: a poll still in flight when the scene's context closes is not an error of the scene (it crashed a run at 12:47).
    try {
      const upstream = await route.fetch()
      const headers = { ...upstream.headers() }
      delete headers['content-length']
      delete headers['content-encoding']
      const text = await upstream.text()
      let body = null
      try { body = JSON.parse(text) } catch { body = null }
      if (body === null || !Array.isArray(body?.result?.value)) { await route.fulfill({ status: upstream.status(), headers, body: text }); return }
      body.result.value = body.result.value.map(row => row?.kind === 'claude'
        ? { ...row, available: true, loggedIn: true, phase: 'ready', error: undefined, models: FAKE_CLAUDE_MODELS, defaultEffortLevels: FAKE_CLAUDE_DEFAULT_LEVELS, source: 'cli' }
        : row)
      await route.fulfill({ status: upstream.status(), headers, body: JSON.stringify(body) })
    } catch { /* context closed or page gone: nothing left to answer */ }
  })
}

SCENARIOS.effort = async function effort(page, shot) {
  await fakeClaudeEngine(page)
  await page.evaluate(() => {
    localStorage.setItem('persona.flag.settingsPersonas', '1')
    localStorage.setItem('persona.flag.engineEffort', '1')
    localStorage.setItem('persona.flag.teamwork', '1')
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 30_000 })
  await page.waitForTimeout(2000)
  await nav(page, 'Conexões')
  const tab = page.getByRole('tab', { name: 'Personas', exact: true }).first()
  if (await tab.count() > 0) {
    await tab.click()
  } else {
    await nav(page, 'Personas')
  }
  await page.locator('[data-persona-settings="personas"]').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(800)
  const trigger = page.locator('[data-persona-engine-trigger]').first()
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  await page.getByRole('dialog').waitFor({ timeout: 10_000 })
  await page.getByRole('option', { name: /Claude Code/ }).click()
  const modelBlock = page.locator('[data-engine-block="model"]')
  const effortBlock = page.locator('[data-engine-block="effort"]')
  await effortBlock.waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)
  // Guard: without the fake answer the Claude engine has no models, and the shots would prove nothing about EFF-1.
  if (await modelBlock.getByText('Opus', { exact: true }).count() === 0) throw new Error('fake Claude engine not applied: no Opus in the model block')
  await shot('3-claude-default')
  // The model cards are real radio inputs covered by their title (the title itself is not clickable): choose by input.
  await modelBlock.locator('input[name="persona-engine-model"][value="opus"]').check()
  await effortBlock.locator('input[name="persona-engine-effort"][value="max"]').check()
  await page.waitForTimeout(300)
  // The notice and the hint sit under the segmented control: show the end of the block, with the Modal's "more below" fade gone.
  await effortBlock.evaluate((node) => { node.scrollIntoView({ block: 'end' }) })
  await page.waitForTimeout(500)
  await shot('4-opus-max')
  // Haiku has no "max": the level must fall to the nearest one below and the dialog must say so (EFFORT-SPEC §2).
  await modelBlock.locator('input[name="persona-engine-model"][value="haiku"]').check()
  await effortBlock.evaluate((node) => { node.scrollIntoView({ block: 'end' }) })
  await page.waitForTimeout(500)
  await shot('5-haiku-snapped')
}

/** EFF-1 com a lista REAL do host (Anvil 06:27: Claude com os modelos da conta, source 'cli'; sem cliente falso). A tela mostra o que o host manda
 *  e o chip do cartão depois de Aplicar (Muse, EFFORT-SPEC §6: shell real, lista do host, chip depois de salvar). */
SCENARIOS.effortreal = async function effortreal(page, shot) {
  await page.evaluate(() => {
    localStorage.setItem('persona.flag.settingsPersonas', '1')
    localStorage.setItem('persona.flag.engineEffort', '1')
    localStorage.setItem('persona.flag.teamwork', '1')
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 30_000 })
  await page.waitForTimeout(2000)
  await nav(page, 'Conexões')
  const tab = page.getByRole('tab', { name: 'Personas', exact: true }).first()
  if (await tab.count() > 0) {
    await tab.click()
  } else {
    await nav(page, 'Personas')
  }
  await page.locator('[data-persona-settings="personas"]').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(800)
  const trigger = page.locator('[data-persona-engine-trigger]').first()
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  await page.getByRole('dialog').waitFor({ timeout: 10_000 })
  await page.getByRole('option', { name: /Claude Code/ }).click()
  const modelBlock = page.locator('[data-engine-block="model"]')
  const effortBlock = page.locator('[data-engine-block="effort"]')
  await effortBlock.waitFor({ timeout: 10_000 })
  await page.waitForTimeout(400)
  // Guard: the host must send models for Claude Code; without them the screen has nothing to show.
  const modelInputs = modelBlock.locator('input[name="persona-engine-model"]:not([value="__default__"])')
  if (await modelInputs.count() === 0) throw new Error('host sent no models for Claude Code (real list)')
  // A start that does not depend on what the host stored: when the team is bound to the logged-in Claude with its cheap first-delivery model is a race, and the dialog now
  // opens on the saved model. 3-host-list is the list from its engine default (the saved-model case is the `personas` scene).
  await modelBlock.locator('input[name="persona-engine-model"][value="__default__"]').check()
  await page.waitForTimeout(400)
  await shot('3-host-list')
  // The model a person would pick to show the chip: the first "Opus" of the host's own list (its newest comes first), else the first row.
  const opusRow = modelBlock.locator('label', { hasText: /Opus/u }).locator('input[name="persona-engine-model"]').first()
  await ((await opusRow.count()) > 0 ? opusRow : modelInputs.first()).check()
  await page.waitForTimeout(300)
  await shot('4-host-model')
  // The heaviest level that model accepts (its native name: "max", or "ultra" where the host lists it); the rows are in the engine's order, lightest first.
  const levels = effortBlock.locator('input[name="persona-engine-effort"]:not([value="__default__"])')
  const levelCount = await levels.count()
  if (levelCount > 0) await levels.nth(levelCount - 1).check()
  await page.waitForTimeout(300)
  await shot('5-host-effort')
  await page.getByRole('button', { name: 'Aplicar' }).click()
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 15_000 }).catch(() => {})
  await page.waitForTimeout(1200)
  await shot('6-chip-after-apply')
}

/** DIAGNOSTIC (not for acceptance): the engine dialog on Codex, whose host list is long (many models): how it stacks and scrolls. */
SCENARIOS.effortcodex = async function effortcodex(page, shot) {
  await page.evaluate(() => {
    localStorage.setItem('persona.flag.settingsPersonas', '1')
    localStorage.setItem('persona.flag.engineEffort', '1')
    localStorage.setItem('persona.flag.teamwork', '1')
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 30_000 })
  await page.waitForTimeout(2000)
  await nav(page, 'Conexões')
  const tab = page.getByRole('tab', { name: 'Personas', exact: true }).first()
  if (await tab.count() > 0) await tab.click()
  else await nav(page, 'Personas')
  await page.locator('[data-persona-settings="personas"]').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(800)
  const trigger = page.locator('[data-persona-engine-trigger]').first()
  await trigger.scrollIntoViewIfNeeded()
  await trigger.click()
  await page.getByRole('dialog').waitFor({ timeout: 10_000 })
  await page.getByRole('option', { name: /Codex/ }).click()
  const modelBlock = page.locator('[data-engine-block="model"]')
  await modelBlock.waitFor({ timeout: 10_000 })
  await page.waitForTimeout(500)
  console.log(`[codex models] ${await modelBlock.locator('input[name="persona-engine-model"]').count()} rows incl. the engine default`)
  console.log(`[codex model names] ${(await modelBlock.locator('label span[class*="modelName"]').allTextContents()).join(' | ')}`)
  await shot('3-codex-list')
  await page.locator('[data-engine-block="effort"]').evaluate((node) => { node.scrollIntoView({ block: 'end' }) })
  await page.waitForTimeout(500)
  await shot('4-codex-end')
}

/** P1-6: "Próximo passo" across the 5 screens of the 1st batch (Quadros, Rotinas, Uso e limites, Aprovações, Segundo cérebro). */
SCENARIOS.nextstep = async function nextstep(page, shot) {
  await page.evaluate(() => {
    localStorage.setItem('persona.flag.nextStep', '1')
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 30_000 })
  await page.waitForTimeout(2000)
  await nav(page, 'Quadros')
  await page.waitForTimeout(600)
  await shot('1-boards')
  await nav(page, 'Rotinas')
  await page.waitForTimeout(600)
  await shot('2-routines')
  await nav(page, 'Uso e limites')
  await page.waitForTimeout(600)
  await shot('3-usage')
  await nav(page, 'Aprovações')
  await page.waitForTimeout(600)
  await shot('4-approvals')
  await nav(page, 'Segundo cérebro')
  await page.waitForTimeout(600)
  await shot('5-brain')
}

/** lib 6c: "Pode salvar arquivos no rascunho" LIGADO (projeto com pasta). listTeam answered with canSaveFiles/canSaveFilesAvailable true: host de mentira só nesses 2 campos. */
SCENARIOS.savefiles = async function savefiles(page, shot) {
  await page.route('**/api/persona/listTeam', async route => {
    try {
      const upstream = await route.fetch()
      const headers = { ...upstream.headers() }
      delete headers['content-length']; delete headers['content-encoding']
      const text = await upstream.text()
      let body = null
      try { body = JSON.parse(text) } catch { body = null }
      const value = body?.result?.value
      if (value === undefined || !Array.isArray(value.personas)) { await route.fulfill({ status: upstream.status(), headers, body: text }); return }
      value.personas = value.personas.map(row => ({ ...row, canSaveFiles: true, canSaveFilesAvailable: true }))
      await route.fulfill({ status: upstream.status(), headers, body: JSON.stringify(body) })
    } catch { /* context closed */ }
  })
  await page.evaluate(() => {
    localStorage.setItem('persona.flag.settingsPersonas', '1')
    localStorage.setItem('persona.flag.teamwork', '1')
  })
  await page.reload({ waitUntil: 'load' })
  await page.waitForSelector('[data-persona-shell]', { timeout: 30_000 })
  await page.waitForTimeout(2000)
  await nav(page, 'Conexões')
  const tab = page.getByRole('tab', { name: 'Personas', exact: true }).first()
  if (await tab.count() > 0) await tab.click()
  else await nav(page, 'Personas')
  await page.locator('[data-persona-settings="personas"]').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(1200)
  const toggle = page.locator('[id^="switch-save-files-"]').first()
  await toggle.waitFor({ timeout: 10_000 })
  if (await toggle.isDisabled()) throw new Error('switch still disabled with canSaveFilesAvailable true')
  await shot('1-on')
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
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      const rows = summary.length
      const heard = errors.length
      const { context, page } = await open(url, scheme, viewport)
      let ok = true
      try {
        await run(page, shooter(page, scheme, viewport))
      } catch (error) {
        ok = false
        console.log(`[${attempt === 1 ? 'retry' : 'FAIL'} ${scenario} ${scheme} ${viewport.tag}] ${String(error).slice(0, 600)}`)
        if (attempt === 2) {
          failed = true
          try { await page.screenshot({ path: `${outDir}/${scenario}-FAILED-${scheme}-${viewport.tag}.png` }) } catch { /* page gone */ }
        } else {
          // The first attempt is thrown away whole: its rows and console lines do not count.
          summary.length = rows
          errors.length = heard
        }
      }
      await page.unrouteAll({ behavior: 'ignoreErrors' }).catch(() => undefined)
      await context.close()
      if (ok) break
    }
  }
}
writeFileSync(`${outDir}/${scenario}-summary.json`, JSON.stringify({ at: new Date().toISOString(), scenario, errors, summary }, null, 2))
clearTimeout(timer)
console.log(`console errors: ${errors.length}`)
for (const line of errors.slice(0, 12)) console.log(line)
console.log(JSON.stringify({ scenario, shots: summary.length, axeMine: summary.filter(row => typeof row.axe === 'number' && row.axe > 0).length, axeOutside: summary.filter(row => typeof row.axeOutside === 'number' && row.axeOutside > 0).length, sideways: summary.filter(row => row.pageScrollsSideways || row.dialogScrollsSideways).length, dialogsCut: summary.filter(row => row.dialogFits === false).length, failed }))
await finish(failed || errors.length > 0 || summary.some(row => typeof row.axe === 'number' && row.axe > 0) ? 1 : 0, failed ? 'FAILED' : 'DONE')
