// Ember: acceptance captures INSIDE the real shell (D-074): the full rail + the real screen, on a temp home with a free port.
// Boots `--profile persona`, opens it in Chrome and saves light/dark captures at 1440x900, 960x640 and zoom 200 % (640x360 @2x),
// each with an axe pass (EMBER_AXE=<axe.min.js>) and a horizontal-overflow check.
//   node scripts/persona/with-lock.mjs "Ember shell shots" --lock build -- node scripts/persona/ember-shell-shots.mjs <recipe...>
// Recipes: approvals (dev seed) · empty-org (empty home: "Quem cuida de quem" with nobody) · empty-health · skills-empty (dev seed:
// a persona profile, Skills tab). Output: .maestri/tmp/shots/ember/shell/<recipe>-<scheme>-<viewport>.png (+ report.json).
import { spawn, execFileSync } from 'node:child_process'
import { freePort } from './free-port.mjs'
import { collectProbe, writeProbe } from './preaccept-probe.mjs'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const home = `${root}/.maestri/tmp/ember-shot-home-${process.pid}`
// EMBER_OUT: another folder (a smoke run of the probe must never overwrite a batch that was already accepted).
const outDir = process.env.EMBER_OUT ?? `${root}/.maestri/tmp/shots/ember/shell`
const VIEWPORTS = [
  { tag: '1440x900', width: 1440, height: 900, dpr: 1 },
  { tag: '960x640', width: 960, height: 640, dpr: 1 },
  { tag: 'zoom200', width: 640, height: 360, dpr: 2 },
]
const wanted = process.argv.slice(2)
// The matrix wrapper boots one clean host per (viewport, scheme): EMBER_VIEWPORT / EMBER_SCHEME narrow the loops below.
const onlyViewport = process.env.EMBER_VIEWPORT
const onlyScheme = process.env.EMBER_SCHEME
if (wanted.length === 0) { console.error('usage: ember-shell-shots.mjs <recipe...>'); process.exit(2) }
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
const errors = []
// Errors thrown by a document the reload replaced (aborted fetches): kept apart and printed, never counted against the capture (Flint 07/11).
const ignoredErrors = []
const report = []
const finish = async (code, note) => {
  console.log(note)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  const notes = [
    'Recipes with seeded:false (the empty homes: approvals-v2-empty, empty-org, routines-empty) answer the getOnboarding call of the host as COMPLETED (everything else is the real host): after onboarding the app always has a team, so an empty team is only reachable before it, and the onboarding overlay would cover the state the Muse needs to see.',
    'Every host boots clean (home and port of its own); under the matrix wrapper each (group, viewport, scheme) is its own host and every entry is appended to report-all.json.',
  ]
  writeFileSync(`${outDir}/report.json`, JSON.stringify({ notes, errors, ignoredErrors, report }, null, 2))
  if (process.env.EMBER_VIEWPORT !== undefined) {
    const all = `${outDir}/report-all.json`
    const before = existsSync(all) ? JSON.parse(readFileSync(all, 'utf8')) : { notes, errors: [], report: [] }
    writeFileSync(all, JSON.stringify({ notes, errors: [...before.errors, ...errors], report: [...before.report, ...report] }, null, 2))
  }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 600_000)

/** Same flags as design-shots: `seeded` = onboarding done + dev seed; otherwise an empty home (onboarding done, no seed). */
async function open(url, scheme, viewport, seeded, flags = {}) {
  const context = await browser.newContext({ reducedMotion: 'no-preference', viewport: { width: viewport.width, height: viewport.height }, deviceScaleFactor: viewport.dpr, colorScheme: scheme, locale: 'pt-BR' })
  await context.addInitScript(([dark, withSeed, extra]) => {
    localStorage.setItem('persona.rail.collapsed.v1', '0')
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    if (withSeed) localStorage.setItem('persona.devSeed.v1', '1')
    else localStorage.removeItem('persona.devSeed.v1')
    // Feature flags a recipe turns on (e.g. the two-pane Aprovações inbox, D-077).
    for (const [key, value] of Object.entries(extra)) localStorage.setItem(key, value)
    const apply = () => { if (dark) document.body?.setAttribute('data-ds-dark-theme', 'true') }
    if (document.body) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, [scheme === 'dark', seeded, flags])
  const page = await context.newPage()
  if (!seeded) {
    // An empty home has no team, so the host still reports first use and the app would draw the onboarding over the screen the Muse needs to see.
    // The capture answers `getOnboarding` as finished (everything else is the real host).
    await page.route('**/api/persona/getOnboarding', async (route) => {
      try {
        const response = await route.fetch()
        const body = await response.json()
        if (body?.result?.ok === true && typeof body.result.value === 'object' && body.result.value !== null) {
          body.result.value = { ...body.result.value, firstUse: false, completed: true }
        }
        await route.fulfill({ response, json: body })
      } catch {
        await route.continue().catch(() => undefined)
      }
    })
  }
  page.on('console', (m) => { if (m.type() === 'error' && !m.text().startsWith('Failed to load resource')) errors.push(`[${scheme} ${viewport.tag}] ${m.text().slice(0, 240)}`) })
  page.on('pageerror', (e) => errors.push(`[${scheme} ${viewport.tag}] pageerror ${String(e).slice(0, 240)}`))
  const startedAt = errors.length
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(seeded ? 9000 : 5000)
  if (seeded) {
    // The dev seed completes onboarding after bootstrap; reload so the host no longer reports first use.
    await page.reload({ waitUntil: 'load' })
    // The reload ABORTS the fetches of the document that is going away: their "Failed to fetch" (a network error, not a bug) landed on the first scene of the recipe
    // (Flint 07/11; it failed one host of the bundle-5 batch). Those are moved to `ignoredErrors` (printed at the end, never dropped silently); ANY other error stays counted.
    for (const line of errors.splice(startedAt)) (/Failed to fetch|NetworkError|ERR_ABORTED/iu.test(line) ? ignoredErrors : errors).push(line)
    await page.waitForTimeout(6000)
  }
  await page.waitForSelector('[data-persona-shell]', { timeout: 20_000 })
  return { context, page }
}

/** Click a rail item by panel id (the same hook Probe uses), so renamed labels do not break captures. */
async function navPanel(page, panel) {
  const target = page.locator(`[data-nav-panel="${panel}"], [data-tab-panel="${panel}"]`).first()
  // Places rail (navPlaces is the default): a screen that is only a TAB of a place (Rotinas…) shows up after its place is opened.
  if (await target.count() === 0) {
    const place = page.locator(`[data-nav-contains~="${panel}"]`).first()
    if (await place.count() > 0) {
      await place.evaluate((node) => { node.click() })
      await page.waitForTimeout(900)
    }
  }
  // Rail groups fold in short windows (and start folded): open every folded group so the target exists, as Probe does.
  for (let attempt = 0; attempt < 3 && await target.count() === 0; attempt += 1) {
    for (const toggle of await page.locator('button[aria-controls^="persona-nav-"][aria-expanded="false"]').all()) {
      await toggle.evaluate((node) => { node.click() }).catch(() => undefined)
    }
    await page.waitForTimeout(600)
  }
  await target.waitFor({ state: 'attached', timeout: 20_000 })
  await target.evaluate((node) => { node.scrollIntoView({ block: 'center' }); node.click() })
  await page.waitForTimeout(1600)
}

async function settle(page, surface) {
  await page.locator(`[data-persona-surface="${surface}"]`).first().waitFor({ timeout: 25_000 }).catch(() => undefined)
  await page.locator(`[data-persona-surface="${surface}"][aria-busy="true"]`).waitFor({ state: 'detached', timeout: 25_000 }).catch(() => undefined)
  await page.waitForTimeout(500)
}

const RECIPES = {
  // The OLD screen (the two-pane inbox is the default since 05/11): asked for explicitly.
  approvals: { seeded: true, flags: { 'persona.approvalsInbox.v2': '0' }, run: async (page) => { await navPanel(page, 'approvals'); await settle(page, 'approvals') } },
  // The two-pane inbox (REVIEW-APPROVALS-REDESIGN §2), behind its flag until the Muse accepts it (D-077).
  'approvals-v2': {
    seeded: true,
    flags: { 'persona.approvalsInbox.v2': '1' },
    run: async (page) => {
      await navPanel(page, 'approvals')
      await settle(page, 'approvals')
      await page.locator('[data-persona-inbox], [role="listbox"]').first().waitFor({ timeout: 15_000 }).catch(() => undefined)
    },
  },
  'empty-org': { seeded: false, run: async (page) => { await navPanel(page, 'orgChart'); await settle(page, 'org-chart') } },
  'empty-health': { seeded: false, run: async (page) => { await navPanel(page, 'teamHealth'); await settle(page, 'team-health') } },
  // The four proofs the Muse asked for on the inbox (REVIEW-APPROVALS-REDESIGN §2), each inside the complete shell.
  // (1) the empty state with `empty-aprovacoes` (empty home).
  'approvals-v2-empty': {
    seeded: false,
    flags: { 'persona.approvalsInbox.v2': '1' },
    run: async (page) => {
      await navPanel(page, 'approvals')
      await settle(page, 'approvals')
      await page.getByText('Nada esperando você').first().waitFor({ timeout: 15_000 })
    },
  },
  // (2) cards decided OUT OF ORDER (A-4b: no forced order) and (3) a Cofre card with before → after ("Exemplo").
  'approvals-v2-flow': {
    seeded: true,
    multi: true,
    freshDecisions: true,
    flags: { 'persona.approvalsInbox.v2': '1', 'persona.devSeed.decisions': '1', 'persona.devSeed.approvalSample': '1' },
    run: async (page, { shot, scheme, viewport }) => {
      await navPanel(page, 'approvals')
      await settle(page, 'approvals')
      // Only THIS capture's seeded cards (their ids end with the run key), never a leftover from another capture on the same host.
      const runKey = `approvals-v2-flow-${scheme}-${viewport.tag}`
      const skillRows = page.locator(`[role="option"][data-decision-id*="skill"][data-decision-id$="${runKey}"]`)
      await skillRows.first().waitFor({ timeout: 20_000 })
      const total = await skillRows.count()
      // The Cofre card with the before → after, marked "Exemplo".
      await page.locator('[role="option"][data-decision-id="dev-approval-sample-vault"]').click()
      await page.waitForTimeout(500)
      await shot('approvals-v2-cofre')
      // Decide the LAST skill first, then the FIRST: any order goes, nothing waits for the card above.
      const lastId = await skillRows.nth(total - 1).getAttribute('data-decision-id')
      const firstId = await skillRows.first().getAttribute('data-decision-id')
      // Narrow (one pane at a time): the open detail hides the list, so go back to the list before reaching for the next row.
      const backToList = async () => {
        const back = page.getByRole('button', { name: 'Voltar à lista' })
        if (await back.count() > 0 && await back.first().isVisible()) { await back.first().click(); await page.waitForTimeout(250) }
      }
      const decide = async (row) => {
        await backToList()
        await row.click()
        if (await row.isVisible()) {
          await row.focus()
          await page.keyboard.press('a')
        } else {
          // One pane at a time: the list is hidden behind the open detail, so decide with the detail's own primary button.
          await page.locator('[data-persona-approval-detail] button[aria-keyshortcuts="A"]').first().click()
        }
      }
      await decide(skillRows.nth(total - 1))
      await page.waitForTimeout(350)
      await shot('approvals-v2-stamp')
      await page.waitForTimeout(1500)
      await decide(page.locator(`[role="option"][data-decision-id="${firstId}"]`))
      await page.waitForTimeout(1800)
      await backToList()
      const left = await skillRows.count()
      console.log(`[proof out-of-order] decided ${lastId} then ${firstId}; skill cards left: ${String(left)} of ${String(total)}`)
      await shot('approvals-v2-out-of-order')
    },
  },
  // (4) the low-risk batch: the confirmation that lists the titles, then the toast.
  'approvals-v2-batch': {
    seeded: true,
    multi: true,
    freshDecisions: true,
    flags: { 'persona.approvalsInbox.v2': '1', 'persona.devSeed.decisions': '1', 'persona.devSeed.approvalSample': '1' },
    run: async (page, { shot }) => {
      await navPanel(page, 'approvals')
      await settle(page, 'approvals')
      await page.locator('[role="option"][data-decision-id*="skill"]').first().waitFor({ timeout: 20_000 })
      await shot('approvals-v2-batch-button')
      await page.getByRole('button', { name: /de risco baixo/u }).first().click({ timeout: 10_000 })
      await page.getByRole('dialog').waitFor({ timeout: 5000 })
      // Let the modal finish its entrance: a shot taken mid-fade is a blurred overlap, not proof.
      await page.waitForTimeout(700)
      await shot('approvals-v2-batch-confirm')
      await page.getByRole('dialog').getByRole('button', { name: /^Aprovar \d+/u }).click()
      await page.waitForTimeout(500)
      await shot('approvals-v2-batch-toast')
    },
  },
  // D-095 (bundle 4): an external action and a connector card in the V2 detail. The real host sends none on its own, so the two dev keys bring the four
  // capture-only examples ("Exemplo", never reaching the host): the e-mail and the payment (the REAL preview card, primary Enviar / Pagar) and the two
  // "Liberar para {B}" cards. One shot per card, then the list with their chips ("Ação externa", "Permissão").
  'approvals-v2-action': {
    seeded: true,
    multi: true,
    flags: { 'persona.approvalsInbox.v2': '1', 'persona.devSeed.connector': '1' },
    run: async (page, { shot }) => {
      await navPanel(page, 'approvals')
      await settle(page, 'approvals')
      const row = (id) => page.locator(`[role="option"][data-decision-id="${id}"]`)
      await row('dev-action-email').waitFor({ timeout: 20_000 })
      // One pane at a time (narrow): the open detail hides the list, so go back before reaching for the next row.
      const backToList = async () => {
        const back = page.getByRole('button', { name: 'Voltar à lista' })
        if (await back.count() > 0 && await back.first().isVisible()) { await back.first().click(); await page.waitForTimeout(300) }
      }
      const pick = async (id, name) => {
        await backToList()
        await row(id).click()
        await page.locator('[data-persona-approval-detail]').first().waitFor({ timeout: 10_000 })
        await page.waitForTimeout(500)
        // A window as small as 200 % may cut the card / the choices below the fold: the capture must show the part that decides (the content and its buttons).
        await page.evaluate(() => {
          const detail = document.querySelector('[data-persona-approval-detail]')
          const target = detail?.querySelector('[data-inbox-action-preview], [data-connector-choices]')
          if (target !== null && target !== undefined && target.getBoundingClientRect().bottom > window.innerHeight) target.scrollIntoView({ block: 'end' })
        })
        await page.waitForTimeout(400)
        await shot(name)
      }
      await pick('dev-action-email', 'approvals-v2-action-email')
      await pick('dev-action-pay', 'approvals-v2-action-pay')
      await pick('dev-connector-colleague', 'approvals-v2-connector')
      await pick('dev-connector-initiative', 'approvals-v2-connector-initiative')
      await backToList()
      await page.waitForTimeout(400)
      await shot('approvals-v2-action-list')
    },
  },
  // IV-10 (the structured question with chips) and P1-9 ("Proposta de {persona}") in the #geral thread, behind their flags. The dev seed posts the
  // OPEN cards (`persona.devSeed.threadCards`); answered / accepted are the host's own records, so those states come from the internal gallery.
  'thread-cards': {
    seeded: true,
    multi: true,
    flags: { 'persona.devSeed.threadCards': '1', 'persona.flag.personaAsk': '1', 'persona.flag.taskProposal': '1' },
    run: async (page, { shot }) => {
      // With the single conversations bar (CV-1, on by default) the channel is a ROW of that bar, not a rail place.
      // Below ~1100 px the bar is a panel, not on screen: open the channel at a wide size, then come back to the size under test.
      const target = page.viewportSize()
      const wide = target !== null && target.width < 1100
      if (wide) await page.setViewportSize({ width: 1440, height: 900 })
      const channelRow = page.locator('[data-conversation-row][data-conversation-kind="channel"]').first()
      await channelRow.waitFor({ state: 'attached', timeout: 20_000 }).catch(() => undefined)
      if (await channelRow.count() > 0) {
        await channelRow.evaluate((node) => { node.click() })
        await page.waitForTimeout(1500)
      } else {
        await navPanel(page, 'channels')
      }
      if (wide && target !== null) {
        await page.setViewportSize(target)
        await page.waitForTimeout(800)
      }
      try {
        await page.locator('[data-persona-ask]').first().waitFor({ timeout: 30_000 })
      } catch (error) {
        // Evidence for the next run: what the thread drew instead of the cards.
        await page.screenshot({ path: `${outDir}/debug-thread-cards.png` })
        const info = await page.evaluate(() => ({
          url: location.hash || location.pathname,
          rows: document.querySelectorAll('ol li').length,
          texts: [...document.querySelectorAll('ol li')].slice(0, 12).map(node => (node.textContent ?? '').trim().slice(0, 90)),
          flags: Object.fromEntries(Object.keys(localStorage).filter(key => key.startsWith('persona.')).map(key => [key, localStorage.getItem(key)])),
        }))
        console.log(`[debug thread-cards] ${JSON.stringify(info).slice(0, 1500)}`)
        throw error
      }
      const show = async (selector, index = 0) => {
        const node = page.locator(selector).nth(index)
        await node.scrollIntoViewIfNeeded()
        await page.waitForTimeout(400)
      }
      await show('[data-persona-ask="dev-ask-1"]')
      await shot('thread-ask-single')
      await show('[data-persona-ask="dev-ask-2"]')
      for (const index of [0, 2, 3]) await page.locator('[data-persona-ask="dev-ask-2"] [role="checkbox"]').nth(index).click()
      await page.waitForTimeout(300)
      await shot('thread-ask-multiple')
      await show('[data-task-proposal="single"]')
      await shot('thread-proposal-single')
      await show('[data-task-proposal="digest"]')
      await shot('thread-proposal-digest')
    },
  },
  // A persona's profile → its Skills tab (the dev seed teaches nobody anything, so the tab is the empty state).
  'skills-empty': {
    seeded: true,
    run: async (page) => {
      await navPanel(page, 'orgChart')
      await settle(page, 'org-chart')
      // CV-4: the face opens the DM; the persona card comes from the "Sobre {nome}" menu button (or Shift+F10 on the face).
      const about = page.getByRole('button', { name: /^Sobre /u }).first()
      if (await about.count() > 0) {
        await about.click({ timeout: 10_000 })
      } else {
        const face = page.locator('[data-persona-surface="org-chart"] button:not([aria-expanded]):not([aria-pressed])').first()
        await face.focus()
        await page.keyboard.press('Shift+F10')
      }
      await page.waitForTimeout(1000)
      // The persona card that opens has the persona's NAME as a button that opens the profile (and "Abrir perfil" in its menu).
      const nameLink = page.locator('[class*="nameLink"]').first()
      if (await nameLink.count() > 0) {
        await nameLink.click()
      } else {
        const seeProfile = page.getByRole('menuitem', { name: /abrir perfil/iu }).first()
        if (await seeProfile.count() > 0) await seeProfile.click()
      }
      try {
        await page.getByRole('tab', { name: /skills/iu }).first().click({ timeout: 15_000 })
      } catch (error) {
        await page.screenshot({ path: `${outDir}/debug-skills-empty.png` })
        console.log(`[debug skills-empty] buttons: ${JSON.stringify((await page.getByRole('button').allInnerTexts()).slice(0, 30))} · tabs: ${JSON.stringify(await page.getByRole('tab').allInnerTexts())}`)
        throw error
      }
      await page.waitForTimeout(800)
    },
  },
  // IV-9: Rotinas (the list in people's words), the editor over it, and the empty screen with its one primary.
  routines: { seeded: true, run: async (page) => { await navPanel(page, 'routines'); await settle(page, 'routines') } },
  'routines-new': {
    seeded: true,
    run: async (page) => {
      await navPanel(page, 'routines')
      await settle(page, 'routines')
      await page.getByRole('button', { name: 'Nova rotina' }).first().click({ timeout: 15_000 })
      await page.getByRole('dialog').waitFor({ timeout: 5000 })
    },
  },
  'routines-empty': { seeded: false, run: async (page) => { await navPanel(page, 'routines'); await settle(page, 'routines') } },
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
      for (const viewport of VIEWPORTS.filter(row => onlyViewport === undefined || row.tag === onlyViewport)) {
        for (const scheme of ['light', 'dark'].filter(row => onlyScheme === undefined || row === onlyScheme)) {
          const label = `${name} ${scheme} ${viewport.tag}`
          // Each capture gets its own set of seeded decision cards: a recipe that DECIDES them must not eat the next one's.
          const flags = recipe.flags === undefined ? undefined : { ...recipe.flags, ...(recipe.freshDecisions === true ? { 'persona.devSeed.decisionsRun': `-${name}-${scheme}-${viewport.tag}` } : {}) }
          let errorMark = errors.length
          const { context, page } = await open(match[1], scheme, viewport, recipe.seeded, flags)
          // One screenshot of the screen as it is now, with axe and the sideways-overflow check; recipes can take several.
          const shot = async (shotName) => {
            await page.mouse.move(0, 0)
            await page.waitForFunction(() => document.getAnimations().every(animation => animation.playState !== 'running' || animation.effect?.getComputedTiming().iterations === Infinity), null, { timeout: 4000 }).catch(() => undefined)
            await page.waitForTimeout(150)
            const file = `${shotName}-${scheme}-${viewport.tag}.png`
            const buffer = await page.screenshot({ path: `${outDir}/${file}` })
            if (buffer.length < 10_240) throw new Error(`blank capture (${buffer.length} B)`)
            const overflow = await page.evaluate(() => Math.max(0, document.documentElement.scrollWidth - document.documentElement.clientWidth))
            // Pré-aceite mecânico: a sonda (texto visível, imagens, ícones, tema, folhagem, axe, foco no 1º Tab) vai ao lado da imagem.
            const fresh = errors.slice(errorMark)
            const probe = await collectProbe(page, { axePath: process.env.EMBER_AXE, consoleErrors: fresh, focus: process.env.PREACCEPT_FOCUS !== '0' })
            errorMark = errors.length
            writeProbe(`${outDir}/${file}`, probe)
            const axe = probe.axe === undefined ? 'skipped' : probe.axe.length
            for (const v of probe.axe ?? []) console.log(`[axe ${shotName} ${scheme} ${viewport.tag}] ${v.impact} ${v.id} x${v.nodes} :: ${v.sample.join(' | ').slice(0, 220)}`)
            report.push({ recipe: name, shot: shotName, scheme, viewport: viewport.tag, file, axe, pageOverflow: overflow })
            console.log(`[${shotName} ${scheme} ${viewport.tag}] axe=${axe} pageOverflow=${overflow}`)
          }
          try {
            await recipe.run(page, { shot, scheme, viewport })
            if (recipe.multi !== true) await shot(name)
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
    await finish(bad.length > 0 || errors.length > 0 ? 1 : 0, `ember shell shots: ${report.length} captures, ${bad.length} with errors/overflow/axe, console errors ${errors.length}${ignoredErrors.length > 0 ? ` (+${ignoredErrors.length} thrown by the document the seed reload replaced, ignored)` : ''}${errors.length > 0 ? `\n${errors.slice(0, 6).join('\n')}` : ''} → ${outDir}`)
  } catch (error) {
    await finish(1, `FAILED ${String(error).slice(0, 400)}`)
  }
}
child.stdout.on('data', onData); child.stderr.on('data', onData)
child.on('exit', (code) => { if (browser === undefined) finish(1, `host exited ${String(code)}\n${out.slice(-1200)}`) })
