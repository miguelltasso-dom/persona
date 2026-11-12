// Lumen: 960x640 and zoom-200% captures (+ horizontal overflow probe) of the secondary screens.
// Boots `--profile persona` on a temp home, opens the real web UI in Chrome (dev seed) and walks the panels.
// Run under the build lock:
//   node scripts/persona/with-lock.mjs "Lumen viewport shots" -- node scripts/persona/lumen-viewport-shots.mjs <phase> [panel label...]
// <phase> = before | after (output dir .maestri/tmp/shots/lumen-viewport/<phase>/). Env LUMEN_REDUCED=1 → reduced motion.
// Viewports: 960x640 (window minimum) and zoom200 (1280x720 window at 200% zoom = 640x360 CSS px, DPR 2).
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { freePort } from './free-port.mjs'
import { collectProbe, writeProbe } from './preaccept-probe.mjs'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const phase = process.argv[2] ?? 'after'
// D-067: temp home per process and a free port — several app launches can share the machine.
const home = `${root}/.maestri/tmp/lumen-shot-home-${process.pid}`
const outDir = `${root}/.maestri/tmp/shots/lumen-viewport/${phase}`
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })

const ALL_PANELS = [
  'Visão geral', 'Quadros', 'Rotinas', 'Conhecimento', 'Segundo cérebro', 'Arquivos', 'Uso e limites', 'Conexões',
  'Aprovações', 'Regras', 'Quem cuida de quem', 'Saúde', 'Membros', 'Importadores', 'Canvas', 'Quadros › projeto',
]
const panels = process.argv.slice(3).length > 0 ? process.argv.slice(3) : ALL_PANELS
const VIEWPORTS = [
  ...(process.env.LUMEN_1440 === '1' ? [{ tag: '1440x900', width: 1440, height: 900, dpr: 1 }] : []),
  { tag: '960x640', width: 960, height: 640, dpr: 1 },
  { tag: 'zoom200', width: 640, height: 360, dpr: 2 },
]
const startedAt = new Date().toISOString()
/** A blank page is ~3 KB: below 10 KB the capture failed (empty window), so it is never saved as a result. */
const MIN_SHOT_BYTES = 10_000
/** Pre-accept (Ember/Keel): the probe sits next to each picture (`<shot>.probe.json`); a shot without it can only come out INCOMPLETO. */
let consoleErrorsSeen = 0
/** Scenes that are mid-motion or evidence of a failure: the probe's one Tab press would spoil them. */
const NO_TAB_SHOT = /decisions-|stamp|falha|depois-do-conflito|dump/u
async function shoot(page, path) {
  await page.locator('[data-persona-shell]').first().waitFor({ state: 'visible', timeout: 15_000 })
  const buffer = await page.screenshot()
  if (buffer.length < MIN_SHOT_BYTES) throw new Error(`blank capture (${String(buffer.length)} bytes < ${String(MIN_SHOT_BYTES)}): ${path}`)
  writeFileSync(path, buffer)
  if (process.env.LUMEN_PROBE === '0') return
  const fresh = errors.slice(consoleErrorsSeen)
  consoleErrorsSeen = errors.length
  const axePath = process.env.LUMEN_AXE
  writeProbe(path, await collectProbe(page, { ...(axePath === undefined ? {} : { axePath }), consoleErrors: fresh, focus: !NO_TAB_SHOT.test(path) }))
}
const slugOf = label => label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '')

// Temp home + free port (D-067). The web host boots without PERSONA_VAULT_TEST_CIPHER now (Keel, D-067 addendum).
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
let hostUrl = ''
let hostChild = child
/** Is the web host still answering? */
async function hostAlive() {
  try {
    const response = await fetch(hostUrl, { signal: AbortSignal.timeout(8000) })
    return response.status < 500
  } catch {
    return false
  }
}
/** Brings a dead host back (same temp home, a free port, a new token); returns true when the URL changed (pages must navigate to it). */
async function ensureHost() {
  if (hostUrl === '' || await hostAlive()) return false
  console.log('[host] not answering: starting a new one on the same temp home')
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(hostChild.pid)], { stdio: 'ignore' }) } catch { /* already gone */ }
  const next = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
  let text = ''
  hostUrl = await new Promise((resolveUrl, reject) => {
    const wait = setTimeout(() => reject(new Error('the host did not come back in 120 s')), 120_000)
    const listen = (chunk) => {
      text += chunk.toString()
      const found = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(text)
      if (found) { clearTimeout(wait); resolveUrl(found[1]) }
    }
    next.stdout.on('data', listen); next.stderr.on('data', listen)
  })
  hostChild = next
  return true
}
const errors = []
const report = []
const finish = async (code, note) => {
  console.log(note)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  if (hostChild !== child) { try { execFileSync('taskkill', ['/T', '/F', '/PID', String(hostChild.pid)], { stdio: 'ignore' }) } catch { /* gone */ } }
  try { rmSync(home, { recursive: true, force: true }) } catch { /* temp home still in use: reap-orphans cleans later */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), Number(process.env.LUMEN_TIMEOUT_MS ?? 1_800_000))

/** LUMEN_SCENARIOS=a,b,c: is this scenario part of the run? */
function scenarioOn(name) {
  return process.env.LUMEN_SCENARIOS?.split(',').includes(name) === true
}

async function open(url, scheme, viewport) {
  const context = await browser.newContext({
    reducedMotion: process.env.LUMEN_REDUCED === '1' ? 'reduce' : 'no-preference',
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: viewport.dpr,
    colorScheme: scheme,
    locale: 'pt-BR',
  })
  await context.addInitScript(([dark, withReview, withDecor, withTeamwork, withConnector]) => {
    localStorage.setItem('persona.rail.collapsed.v1', '0')
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    localStorage.setItem('persona.devSeed.v1', '1')
    // Opt-in dev seed: three skill proposals, so the decision cycle has several cards to act on.
    localStorage.setItem('persona.devSeed.decisions', '1')
    // Capture-only sample of "Revisar mudanças" (the fake CLI writes no files): the sheet says "Exemplo".
    if (withReview) localStorage.setItem('persona.devSeed.review', '1')
    // D-089 (b): the house ornaments are behind persona.flag.houseDecor.
    if (withDecor) localStorage.setItem('persona.flag.houseDecor', '1')
    // D-090: team work is behind persona.flag.teamwork; the example board needs the SECOND dev key (the first one is persona.devSeed.v1 above).
    // "Liberar para {B}": two example cards need the SECOND dev key (the first one is persona.devSeed.v1 above); they say "Exemplo" and never reach the host.
    if (withConnector) {
      localStorage.setItem('persona.devSeed.connector', '1')
      // HT-9 / D-095: the external-action cards of the same sample (the thread's preview card is behind this flag until the bundle that ships it).
      localStorage.setItem('persona.flag.actionPreview', '1')
    }
    if (withTeamwork) {
      localStorage.setItem('persona.flag.teamwork', '1')
      localStorage.setItem('persona.devSeed.teamwork', '1')
    }
    const apply = () => { if (dark) document.body?.setAttribute('data-ds-dark-theme', 'true') }
    if (document.body) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, [scheme === 'dark', scenarioOn('review'), scenarioOn('decor') || scenarioOn('teamwork'), scenarioOn('teamwork'), scenarioOn('connector')])
  const page = await context.newPage()
  page.on('console', (m) => { if (m.type() === 'error') errors.push(`[${scheme} ${viewport.tag}] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => errors.push(`[${scheme} ${viewport.tag}] pageerror ${String(e).slice(0, 240)}`))
  if (process.env.LUMEN_TRACE === '1') page.on('console', (m) => { if (m.type() === 'info' && m.text().includes('dev seed')) console.log(`[trace ${scheme} ${viewport.tag}] ${new Date().toISOString().slice(11, 23)} ${m.text().slice(0, 200)}`) })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(9000)
  await page.reload({ waitUntil: 'load' })
  await page.waitForTimeout(6000)
  await page.locator('[data-persona-shell]').first().waitFor({ state: 'visible', timeout: 15_000 })
  if (process.env.LUMEN_DUMP_NAV === '1') {
    // Debug aid: what the shell's buttons are called in THIS bundle (labels move between bundles).
    const names = await page.getByRole('button').evaluateAll(nodes => nodes.map(node => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 40)).filter(Boolean))
    console.log(`[dump-nav ${scheme} ${viewport.tag}] ${JSON.stringify(names.slice(0, 70))}`)
    writeFileSync(`${outDir}/dump-shell-${scheme}-${viewport.tag}.png`, await page.screenshot())
  }
  return { context, page }
}

/** Old screen label → the place in the rail and the tab (`data-tab-panel`) inside it, in the single-bar shell (nav-places.ts). */
const PLACE_TAB = {
  'Quadros': ['Projetos', 'kanban'],
  'Rotinas': ['Projetos', 'routines'],
  'Arquivos': ['Projetos', 'files'],
  'Canvas': ['Projetos', 'canvas'],
  'Quem cuida de quem': ['Equipe', 'orgChart'],
  'Saúde': ['Equipe', 'teamHealth'],
  'Segundo cérebro': ['Memória da empresa', 'secondBrain'],
  'Conhecimento': ['Memória da empresa', 'knowledge'],
  'Regras': ['Memória da empresa', 'rules'],
  'Conexões': ['Configurações', 'connections'],
  'Uso e limites': ['Configurações', 'usage'],
  'Membros': ['Configurações', 'members'],
  'Importadores': ['Configurações', 'importers'],
}

async function nav(page, label) {
  const placeTab = PLACE_TAB[label]
  if (placeTab !== undefined && await page.getByRole('button', { name: 'Memória da empresa', exact: true }).count() > 0) {
    const [place, panel] = placeTab
    await page.getByRole('button', { name: place, exact: true }).first().click({ timeout: 15_000 })
    await page.waitForTimeout(900)
    // The tab carries `data-tab-panel` (Tabs.tsx). A missing tab must STOP the scenario: skipping the click photographs the place's default tab under the wrong name.
    const tab = page.locator(`[data-persona-area="place-tabs"] [data-tab-panel="${panel}"]`).first()
    await tab.waitFor({ state: 'attached', timeout: 10_000 }).catch(() => { throw new Error(`nav("${label}"): the tab ${panel} of "${place}" is not on screen`) })
    if (await tab.getAttribute('aria-selected') !== 'true') await tab.click({ timeout: 10_000 })
    await page.locator(`[data-persona-area="place-tabs"] [data-tab-panel="${panel}"][aria-selected="true"]`).first().waitFor({ timeout: 8000 }).catch(() => { throw new Error(`nav("${label}"): the tab ${panel} did not become the selected one`) })
    await page.waitForTimeout(1800)
    await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 20_000 }).catch(() => undefined)
    await page.waitForTimeout(400)
    return
  }
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

/** LUMEN_AXE=<path to axe.min.js>: WCAG 2.x A/AA scan of the current page (no repo dependency). */
async function axeViolations(page) {
  if (process.env.LUMEN_AXE === undefined) return null
  await page.addScriptTag({ path: process.env.LUMEN_AXE })
  return page.evaluate(async () => {
    const r = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 2).map(n => n.target.join(' ')) }))
  })
}

const infiniteAnimations = page => page.evaluate(() => document.getAnimations().filter(an => an.playState === 'running' && Number(an.effect?.getComputedTiming().iterations) === Infinity).length)

/** DECISIONS-SPEC acceptance on the real app: the same cycle in Visão geral and Aprovações, counters together. */
async function decisionShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  const chip = async () => (await page.locator('#persona-attention-title').first().evaluate(node => node.closest('section')?.querySelector('p')?.textContent ?? '').catch(() => ''))
  const railBadge = async () => page.evaluate(() => {
    const button = [...document.querySelectorAll('[data-nav-item]')].find(node => node.textContent?.startsWith('Aprovações'))
    const id = button?.getAttribute('aria-describedby')
    return id ? document.getElementById(id)?.textContent ?? '' : ''
  })
  const rows = async () => page.locator('[data-persona-root] ul[role="list"] > li[data-decision-id]').count()
  const titles = async () => page.locator('[data-persona-root] ul[role="list"] > li[data-decision-id]').evaluateAll(nodes => nodes.map(node => `${node.getAttribute('data-decision-id')}:${node.getAttribute('data-decision-state')}`))
  const portraits = async () => page.locator('[data-persona-root] ul[role="list"] > li[data-decision-id]').evaluateAll(nodes => nodes.map(node => { const img = node.querySelector('img'); return img === null ? 'no-img' : `${img.naturalWidth}x${img.naturalHeight}:${(img.getAttribute('src') ?? '').slice(0, 40)}` }))
  await nav(page, 'Visão geral')
  const before = { chip: await chip(), rail: await railBadge(), rows: await rows(), titles: await titles(), portraits: await portraits() }
  await shoot(page, `${outDir}/decisions-overview-${tag}.png`)
  const axe1 = await axeViolations(page)
  const approve = page.locator('[data-persona-root] ul[role="list"] > li[data-decision-id] button', { hasText: /^Aprovar$/ }).first()
  let afterClick = null
  if (await approve.count() > 0) {
    await approve.click()
    await page.waitForTimeout(260)
    afterClick = { chip: await chip(), rail: await railBadge(), stamp: await page.locator('[data-decision-state="accepted"]').count(), infinite: await infiniteAnimations(page) }
    await shoot(page, `${outDir}/decisions-overview-stamp-${tag}.png`)
    await page.waitForTimeout(1300)
  }
  const gone = { rows: await rows(), chip: await chip(), rail: await railBadge(), titles: await titles() }
  await page.waitForTimeout(4500)
  const late = { rows: await rows(), chip: await chip(), rail: await railBadge(), titles: await titles() }
  await nav(page, 'Aprovações')
  const cards = await page.locator('[data-persona-approvals="reactive"] [data-decision-id]').count()
  await shoot(page, `${outDir}/decisions-approvals-${tag}.png`)
  const axe2 = await axeViolations(page)
  const line = { tag, before, afterClick, gone, late, approvalsReactiveCards: cards, axeOverview: axe1?.length ?? 'skipped', axeApprovals: axe2?.length ?? 'skipped' }
  console.log(`[decisions ${tag}] ${JSON.stringify(line)}`)
  for (const [name, list] of [['overview', axe1], ['approvals', axe2]]) for (const v of list ?? []) console.log(`[axe ${name} ${tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 200)}`)
  decisionReport.push(line)
}
const decisionReport = []

const REVIEW_PASTE = [
  '## Sobre a empresa',
  'A Padaria Aurora vende paes e bolos em Itu desde 2014.',
  '',
  '## Regras e restricoes',
  '- Nunca enviar proposta comercial sem revisao do juridico.',
  '- Respostas de orcamento saem em ate 1 dia util.',
  '',
  '## Clientes',
  '- Maria (dona) aprova orcamentos acima de R$ 500.',
].join('\n')

async function axeLine(page, name, tag) {
  const list = await axeViolations(page)
  for (const v of list ?? []) console.log(`[axe ${name} ${tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 200)}`)
  return list?.length ?? 'skipped'
}

/**
 * LUMEN_GEOM=1: where the dialog really sits (its own box and every ancestor that changes what `position: fixed` or `max-height` mean).
 * A dialog taller than the window is a layout fact, not a guess: the pre-accept's `dialogo` check reports it, this says why.
 */
async function dialogGeom(page, step, tag) {
  if (process.env.LUMEN_GEOM !== '1') return
  const geom = await page.evaluate(() => {
    const dialog = document.querySelector('[role="dialog"]')
    if (dialog === null) return null
    const rect = (el) => { const r = el.getBoundingClientRect(); return { top: Math.round(r.top), bottom: Math.round(r.bottom), h: Math.round(r.height) } }
    const chain = []
    for (let el = dialog; el !== null && el !== document.documentElement; el = el.parentElement) {
      const cs = getComputedStyle(el)
      chain.push({
        el: `${el.tagName.toLowerCase()}.${typeof el.className === 'string' ? el.className.split(' ')[0] : ''}`,
        ...rect(el),
        position: cs.position,
        transform: cs.transform === 'none' ? undefined : cs.transform,
        filter: cs.filter === 'none' ? undefined : cs.filter,
        willChange: cs.willChange === 'auto' ? undefined : cs.willChange,
        contain: cs.contain === 'none' ? undefined : cs.contain,
        overflowY: cs.overflowY === 'visible' ? undefined : cs.overflowY,
        maxHeight: cs.maxHeight === 'none' ? undefined : cs.maxHeight,
      })
    }
    return { win: { w: window.innerWidth, h: window.innerHeight }, rootFont: getComputedStyle(document.documentElement).fontSize, chain }
  })
  console.log(`[geom ${step} ${tag}] ${JSON.stringify(geom)}`)
}

/** "Revisar mudanças" in the complete shell: the list + preview, the clash moment, the success moment. */
async function reviewShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  // DESIGN-01 #10: Projetos opens straight on the board of the project of the moment; the sample review opens on its own
  await nav(page, 'Quadros')
  await page.locator('[data-testid="review-panel"]').waitFor({ timeout: 20_000 })
  await page.waitForTimeout(700)
  await shoot(page, `${outDir}/revisar-lista-${tag}.png`)
  await dialogGeom(page, 'lista', tag)
  const axe1 = await axeLine(page, 'revisar-lista', tag)
  await page.locator('[data-testid="review-apply"]').click()
  await page.locator('[data-testid="review-conflict"]').waitFor({ timeout: 10_000 })
  await page.waitForTimeout(500)
  await shoot(page, `${outDir}/revisar-conflito-${tag}.png`)
  await dialogGeom(page, 'conflito', tag)
  const axe2 = await axeLine(page, 'revisar-conflito', tag)
  // The card's own radio sits over its title (a hidden input that covers the card): choose it directly, like a person's click lands on it.
  await page.locator('input[type="radio"][value="both"]').first().dispatchEvent('click')
  await page.waitForTimeout(300)
  await page.locator('[data-testid="review-apply"]').click()
  await page.locator('[data-testid="review-applied"]').waitFor({ timeout: 10_000 }).catch(async (error) => {
    // Say what the screen shows instead (a failed step must leave evidence, not only a timeout).
    await shoot(page, `${outDir}/revisar-depois-do-conflito-${tag}.png`).catch(() => undefined)
    const bar = await page.locator('[data-testid^="review-"]').evaluateAll(nodes => nodes.map(node => `${node.getAttribute('data-testid')}:${(node.textContent ?? '').slice(0, 60)}`)).catch(() => [])
    console.log(`[revisar ${tag}] depois de escolher: ${JSON.stringify(bar.map(row => row.slice(0, 40)))}`)
    const detail = await page.evaluate(() => {
      const apply = document.querySelector('[data-testid="review-apply"]')
      return {
        bar: document.querySelector('[data-testid="review-bar"]')?.textContent?.slice(0, 220) ?? null,
        applyDisabled: apply === null ? null : apply.disabled === true,
        checked: [...document.querySelectorAll('input[type=radio]')].map(node => node.value + ':' + String(node.checked)),
        alerts: [...document.querySelectorAll('[role=alert],[role=status]')].map(node => (node.textContent ?? '').slice(0, 120)),
      }
    }).catch(() => null)
    console.log(`[revisar ${tag}] estado: ${JSON.stringify(detail)}`)
    throw error
  })
  await page.waitForTimeout(900)
  await shoot(page, `${outDir}/revisar-sucesso-${tag}.png`)
  await dialogGeom(page, 'sucesso', tag)
  const axe3 = await axeLine(page, 'revisar-sucesso', tag)
  console.log(`[revisar ${tag}] lista axe=${axe1} conflito axe=${axe2} sucesso axe=${axe3}`)
}

/** Importadores: the entry, the review with the rules waiting, the rules accepted, and the confirmation after saving. */
async function bycShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  await nav(page, 'Importadores')
  await page.waitForTimeout(600)
  await shoot(page, `${outDir}/byc-entrada-${tag}.png`)
  await page.getByRole('textbox').first().fill(REVIEW_PASTE)
  await page.getByRole('button', { name: 'Adicionar resposta' }).click()
  await page.getByRole('button', { name: 'Organizar', exact: true }).click()
  await page.locator('[data-persona-byc-review]').waitFor({ timeout: 25_000 })
  await page.waitForTimeout(600)
  await shoot(page, `${outDir}/byc-revisao-${tag}.png`)
  const axe1 = await axeLine(page, 'byc-revisao', tag)
  const acceptAll = page.getByRole('button', { name: /Aceitar todas as regras/u })
  if (await acceptAll.count() > 0) {
    await acceptAll.click()
    await page.waitForTimeout(300)
    await shoot(page, `${outDir}/byc-revisao-regras-aceitas-${tag}.png`)
  }
  await page.getByRole('button', { name: /^Gravar \d+ no Cofre$/u }).click()
  await page.locator('[data-persona-byc-saved]').waitFor({ timeout: 25_000 })
  await page.waitForTimeout(500)
  await shoot(page, `${outDir}/byc-gravado-${tag}.png`)
  const axe2 = await axeLine(page, 'byc-gravado', tag)
  console.log(`[byc ${tag}] revisao axe=${axe1} gravado axe=${axe2}`)
}

/** Saúde da equipe on a brand-new app: the calm first-day note — no score, no red sentence, no crosses. */
async function healthShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  await nav(page, 'Saúde')
  await page.waitForTimeout(900)
  await shoot(page, `${outDir}/saude-1o-dia-${tag}.png`)
  // Where the tab bar and the page really sit (a clipped bar in the picture is a layout fact, not a guess).
  const geom = await page.evaluate(() => {
    const box = (selector) => {
      const node = document.querySelector(selector)
      if (node === null) return null
      const rect = node.getBoundingClientRect()
      const style = getComputedStyle(node)
      return { top: Math.round(rect.top), height: Math.round(rect.height), marginTop: style.marginTop, transform: style.transform, overflow: style.overflow, position: style.position }
    }
    const center = document.querySelector('[data-persona-grain]')
    return {
      bar: box('[data-persona-area="place-tabs"]'),
      track: box('[data-persona-area="place-tabs"] [role="tablist"]'),
      main: box('[data-persona-area="main"]'),
      centerScrollTop: center === null ? null : center.scrollTop,
      mainScrollTop: document.querySelector('[data-persona-area="main"]')?.scrollTop ?? null,
      animatingInMain: [...document.querySelectorAll('[data-persona-area="main"], [data-persona-area="main"] *')].filter(node => node.getAnimations().length > 0).length,
    }
  })
  console.log(`[saude ${tag}] geom=${JSON.stringify(geom)}`)
  const axe1 = await axeLine(page, 'saude', tag)
  console.log(`[saude ${tag}] axe=${axe1}`)
}

/** Segundo cérebro: the home, the ⋯ menu, Permissões, and the new-page dialog. */
async function brainShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  await nav(page, 'Segundo cérebro')
  await page.waitForTimeout(700)
  await shoot(page, `${outDir}/segundo-cerebro-real-${tag}.png`)
  const axe1 = await axeLine(page, 'segundo-cerebro', tag)
  // the ⋯ menu (SB-4): on the web both items are disabled and say "Só funciona no app instalado."
  await page.getByRole('button', { name: 'Mais ações' }).click().catch(() => undefined)
  await page.waitForTimeout(300)
  await shoot(page, `${outDir}/segundo-cerebro-menu-${tag}.png`)
  await page.keyboard.press('Escape')
  await page.getByRole('button', { name: 'Permissões', exact: true }).click()
  await page.waitForTimeout(600)
  await shoot(page, `${outDir}/segundo-cerebro-permissoes-${tag}.png`)
  const axe2 = await axeLine(page, 'permissoes', tag)
  await page.getByRole('button', { name: 'Voltar', exact: false }).first().click().catch(() => undefined)
  await page.getByRole('button', { name: 'Nova página', exact: true }).first().click({ timeout: 8_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
  await shoot(page, `${outDir}/segundo-cerebro-nova-pagina-${tag}.png`)
  const axe3 = await axeLine(page, 'nova-pagina', tag)
  console.log(`[brain ${tag}] home axe=${axe1} permissoes axe=${axe2} nova-pagina axe=${axe3}`)
}

/**
 * Content the person cannot reach: an element that pokes out of the viewport, or out of an ancestor that CLIPS it
 * (overflow hidden/clip) — an overflow-x auto/scroll ancestor is fine (reachable by scrolling) and only counted.
 */
/** D-089 a: Aprovações — the card is titled by the task's name, the question under it, the verb is "Revisar". */
async function approvalsShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  await nav(page, 'Aprovações')
  await page.waitForTimeout(600)
  await shoot(page, `${outDir}/aprovacoes-titulo-${tag}.png`)
  const axe = await axeLine(page, 'aprovacoes', tag)
  const heads = await page.locator('[data-persona-root] h3').allInnerTexts().catch(() => [])
  const verbs = await page.getByRole('button', { name: /^(Revisar|Abrir tarefa)$/ }).allInnerTexts().catch(() => [])
  console.log(`[aprovacoes ${tag}] axe=${axe} títulos=${JSON.stringify(heads.slice(0, 4))} verbos=${JSON.stringify(verbs.slice(0, 4))}`)
}

/** D-089 b: the house ornaments (persona.flag.houseDecor): Visão geral, Aprovações, the night empties. */
async function decorShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  await nav(page, 'Visão geral')
  await shoot(page, `${outDir}/enfeites-visao-geral-${tag}.png`)
  const axe1 = await axeLine(page, 'enfeites-visao-geral', tag)
  const found = await page.evaluate(() => ({
    sprig: document.querySelectorAll('[data-house-decor="sprig"]').length,
    doodles: document.querySelectorAll('[data-house-decor="doodles"]').length,
    bodyAttr: document.body.hasAttribute('data-house-decor'),
    animated: document.getAnimations().filter(an => an.playState === 'running').length,
  }))
  await nav(page, 'Aprovações')
  await shoot(page, `${outDir}/enfeites-aprovacoes-${tag}.png`)
  const axe2 = await axeLine(page, 'enfeites-aprovacoes', tag)
  console.log(`[enfeites ${tag}] visão-geral axe=${axe1} aprovações axe=${axe2} ${JSON.stringify(found)}`)
}

/** D-090: "Precisa de você / Liberar para {B}" (Anvil §9): the colleague card (3 choices) and the initiative card (no "sempre"), as examples. */
async function connectorShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  await nav(page, 'Aprovações')
  // D-095 (V2 inbox, the default): each example card is reached THROUGH THE LIST — the first card selected is not the one we want.
  // [list title, file, what the card must offer]
  const cards = [
    ['Liberar o Gmail para Bento', 'liberar-conector', 'conector'],
    ['Liberar o Drive para Luna', 'liberar-conector-iniciativa', 'conector'],
    ['Enviar um email pelo Gmail', 'acao-email', 'acao'],
    ['Pagar R$ 120,00 pelo Mercado Pago', 'acao-pagamento', 'acao'],
  ]
  for (const [title, file, kind] of cards) {
    const option = page.locator('[role="option"]', { hasText: title }).first()
    await option.waitFor({ timeout: 20_000 })
    await option.click()
    await page.getByRole('heading', { name: title }).first().waitFor({ timeout: 10_000 })
    await page.waitForTimeout(600)
    await shoot(page, `${outDir}/${file}-${tag}.png`)
    const axe = await axeLine(page, file, tag)
    const choices = kind === 'conector'
      ? await page.locator('[data-connector-choice]').evaluateAll(nodes => nodes.map(node => node.textContent))
      : await page.locator('article button, [data-persona-approval-detail] button').evaluateAll(nodes => nodes.map(node => (node.textContent ?? '').trim()).filter(Boolean))
    console.log(`[${file} ${tag}] axe=${axe} botoes=${JSON.stringify(choices)}`)
    // One-pane layouts show the detail over the list: back to the list for the next card.
    const back = page.getByRole('button', { name: /Voltar|Fechar/u }).first()
    if (viewport.width <= 960 && await back.count() > 0) await back.click().catch(() => undefined)
  }
}

/** D-090: the board with the team-work chips (the example cards: flag + the 2 dev keys), the work path and the open note. */
async function teamworkShots(page, scheme, viewport) {
  const tag = `${scheme}-${viewport.tag}`
  // The "Revisar" sample auto-opens when a board mounts while this key is set (the review scenario ran before): the chips need the plain board.
  await page.evaluate(() => { try { localStorage.removeItem('persona.devSeed.review') } catch { /* storage blocked */ } })
  await nav(page, 'Quadros')
  await page.getByText('Pedido por Nina').first().waitFor({ timeout: 20_000 })
  await page.waitForTimeout(500)
  await shoot(page, `${outDir}/equipe-quadro-${tag}.png`)
  const axe1 = await axeLine(page, 'equipe-quadro', tag)
  await page.getByRole('button', { name: 'Caminho do trabalho' }).first().click()
  await page.getByRole('button', { name: 'Bilhete de Nina' }).first().click()
  await page.waitForTimeout(500)
  await shoot(page, `${outDir}/equipe-caminho-bilhete-${tag}.png`)
  const axe2 = await axeLine(page, 'equipe-caminho', tag)
  console.log(`[equipe ${tag}] quadro axe=${axe1} caminho axe=${axe2}`)
  await page.keyboard.press('Escape')
  await page.getByRole('dialog').waitFor({ state: 'detached', timeout: 5000 }).catch(() => undefined)
}

function probeOverflow() {
  const vw = document.documentElement.clientWidth
  const hits = []
  let scrollers = 0
  const label = (el, r) => {
    const own = typeof el.className === 'string' ? el.className.split(' ')[0] : ''
    // SVG parts carry no class: name the nearest classed ancestor so the culprit can be found.
    let via = ''
    if (own === '') {
      for (let p = el.parentElement; p; p = p.parentElement) {
        const c = typeof p.className === 'string' ? p.className.split(' ')[0] : ''
        if (c !== '') { via = ` in .${c}`; break }
      }
    }
    return `${el.tagName.toLowerCase()}.${own}${via}@${Math.round(r.left)}..${Math.round(r.right)}`
  }
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect()
    if (r.width === 0 || r.height === 0) continue
    const cs = getComputedStyle(el)
    if ((cs.overflowX === 'auto' || cs.overflowX === 'scroll') && el.scrollWidth > el.clientWidth + 1) scrollers += 1
    // Walk ALL ancestors: an svg (overflow hidden by default) must not hide the scroller further up; but an ancestor
    // that clips the element (it pokes out of that box) makes it unreachable even if a scroller sits above.
    let scrolled = false
    let cutBy = null
    for (let p = el.parentElement; p && p !== document.documentElement; p = p.parentElement) {
      const ox = getComputedStyle(p).overflowX
      if (ox === 'auto' || ox === 'scroll') { scrolled = true; break }
      if ((ox === 'hidden' || ox === 'clip') && cutBy === null) {
        const pr = p.getBoundingClientRect()
        if (r.right > pr.right + 1.5 || r.left < pr.left - 1.5) cutBy = p
      }
    }
    if (cutBy !== null) hits.push('cut:' + label(el, r))
    else if (!scrolled && (r.right > vw + 1 || r.left < -1)) hits.push(label(el, r))
  }
  return {
    vw,
    docScrollOverflow: Math.max(0, document.documentElement.scrollWidth - vw),
    offscreen: hits.length,
    scrollers,
    sample: hits.slice(0, 5),
  }
}

const onData = async (chunk) => {
  out += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
  if (!match) return
  hostUrl = match[1]
  child.stdout.off('data', onData); child.stderr.off('data', onData)
  clearTimeout(timer)
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    for (const viewport of VIEWPORTS) {
      for (const scheme of ['light', 'dark']) {
        if (process.env.LUMEN_ONLY !== undefined && !process.env.LUMEN_ONLY.split(',').includes(`${scheme}-${viewport.tag}`)) continue
        let opened
        try {
          await ensureHost()
          opened = await open(hostUrl, scheme, viewport)
        } catch (error) {
          // The shell never showed (empty window): say so for this pass with the browser's own errors, and go on.
          const why = errors.filter(row => row.startsWith(`[${scheme} ${viewport.tag}]`)).slice(-3).join(' | ')
          report.push({ panel: '(boot)', scheme, viewport: viewport.tag, error: String(error).slice(0, 200), console: why.slice(0, 600), at: new Date().toISOString() })
          console.log(`[${viewport.tag} ${scheme}] BOOT FAILED at ${new Date().toISOString()}: ${String(error).slice(0, 120)} :: ${why.slice(0, 300)}`)
          continue
        }
        const { context, page } = opened
        for (const label of (process.env.LUMEN_SKIP_PANELS === '1' ? [] : panels)) {
          try {
            if (label === 'Quadros › projeto') {
              // DESIGN-01 #10: the place opens on the board of the project of the moment.
              await nav(page, 'Quadros')
              await page.waitForTimeout(2500)
              await page.locator('[aria-busy="true"]').first().waitFor({ state: 'detached', timeout: 15_000 }).catch(() => undefined)
            } else {
              await nav(page, label)
            }
            const file = `${slugOf(label)}-${scheme}-${viewport.tag}.png`
            await shoot(page, `${outDir}/${file}`)
            const probe = await page.evaluate(probeOverflow)
            report.push({ panel: label, scheme, viewport: viewport.tag, file, ...probe })
            console.log(`[${viewport.tag} ${scheme}] ${label}: offscreen=${probe.offscreen} docΔ=${probe.docScrollOverflow} scrollers=${probe.scrollers}${probe.offscreen > 0 ? ` :: ${probe.sample.join(' | ')}` : ''}`)
          } catch (error) {
            report.push({ panel: label, scheme, viewport: viewport.tag, error: String(error).slice(0, 200) })
            console.log(`[${viewport.tag} ${scheme}] ${label}: FAILED ${String(error).slice(0, 140)}`)
          }
        }
        const scenarios = new Set((process.env.LUMEN_SCENARIOS ?? '').split(',').filter(Boolean))
        for (const [name, run] of [['health', healthShots], ['brain', brainShots], ['byc', bycShots], ['review', reviewShots], ['approvals', approvalsShots], ['decor', decorShots], ['teamwork', teamworkShots], ['connector', connectorShots]]) {
          if (!scenarios.has(name)) continue
          try {
            try { await run(page, scheme, viewport) } catch (first) {
              console.log(`[${name} ${scheme}-${viewport.tag}] retry once after: ${String(first).replace(/\x1b\[[0-9;]*m/gu, '').split('\n')[0]?.slice(0, 160) ?? ''}`)
              await page.keyboard.press('Escape').catch(() => undefined)
              if (await ensureHost()) { await page.goto(hostUrl, { waitUntil: 'load' }); await page.waitForTimeout(9000) }
              await page.reload({ waitUntil: 'load' })
              await page.waitForTimeout(6000)
              await page.locator('[data-persona-shell]').first().waitFor({ state: 'visible', timeout: 20_000 })
              await run(page, scheme, viewport)
            }
          } catch (error) {
            report.push({ panel: `(${name})`, scheme, viewport: viewport.tag, error: String(error).slice(0, 200), at: new Date().toISOString() })
            console.log(`[${name} ${scheme}-${viewport.tag}] FAILED ${String(error).replace(/\x1b\[[0-9;]*m/gu, '').slice(0, 1400)}`)
            // Evidence of WHERE it stopped: a failure that leaves no picture cannot be fixed in one try.
            await page.screenshot({ path: `${outDir}/falha-${name}-${scheme}-${viewport.tag}.png` }).catch(() => undefined)
          }
        }
        if (process.env.LUMEN_DECISIONS === '1') {
          try { await decisionShots(page, scheme, viewport) } catch (error) { console.log(`[decisions ${scheme}-${viewport.tag}] FAILED ${String(error).replace(/\x1b\[[0-9;]*m/gu, '').slice(0, 1400)}`) }
        }
        await context.close()
      }
    }
    writeFileSync(`${outDir}/report.json`, JSON.stringify({ phase, startedAt, finishedAt: new Date().toISOString(), errors, report, decisionReport }, null, 2))
    const bad = report.filter(row => row.error !== undefined || row.offscreen > 0 || row.docScrollOverflow > 0)
    console.log(`console errors: ${errors.length}${errors.length > 0 ? `\n${errors.slice(0, 6).join('\n')}` : ''}`)
    await finish(0, `lumen viewport shots (${phase}): ${report.length} captures, ${bad.length} with overflow/errors → ${outDir}`)
  } catch (error) {
    await finish(1, `FAILED ${error instanceof Error ? error.stack : String(error)}`)
  }
}
child.stdout.on('data', onData); child.stderr.on('data', onData)
child.on('exit', (code) => { if (!browser) void finish(1, `host exited ${String(code)}\n${out.slice(-1200)}`) })
