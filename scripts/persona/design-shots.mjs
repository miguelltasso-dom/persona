// Design review captures (Muse, DESIGN-SYSTEM §10). Boots `--profile persona` on a temp home, opens the real UI in Chrome
// and saves light/dark captures of the showcase screens to .maestri/tmp/shots/design/.
// Run under the lock: node scripts/persona/with-lock.mjs "<you> design shots" -- node scripts/persona/design-shots.mjs [screen...]
// Screens: channel, overview, onboarding (default: all). Also prints console errors.
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const home = `${root}/.maestri/tmp/muse-shot-home`
const outDir = `${root}/.maestri/tmp/shots/design`
rmSync(home, { recursive: true, force: true })
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })
const wanted = new Set(process.argv.slice(2).length > 0 ? process.argv.slice(2) : ['channel', 'overview', 'onboarding'])
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
const errors = []
const finish = async (code, note) => {
  console.log(note)
  if (process.env.MUSE_HOST_LOG === '1') console.log(`--- host log ---${String.fromCharCode(10)}${out.slice(-3000)}`)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 180_000)

async function open(url, scheme, { onboarded, collapsed = false, viewport = { width: 1440, height: 900 } }) {
  const context = await browser.newContext({ reducedMotion: process.env.MUSE_REDUCED === '1' ? 'reduce' : 'no-preference', viewport, deviceScaleFactor: 1, colorScheme: scheme, locale: 'pt-BR' })
  await context.addInitScript(([dark, done, railCollapsed]) => {
    localStorage.setItem('persona.rail.collapsed.v1', railCollapsed ? '1' : '0')
    if (done) {
      localStorage.setItem('persona.onboarding.complete.v1', '1')
      localStorage.setItem('persona.devSeed.v1', '1')
    } else {
      localStorage.removeItem('persona.onboarding.complete.v1')
      localStorage.removeItem('persona.devSeed.v1')
    }
    const apply = () => { if (dark) document.body?.setAttribute('data-ds-dark-theme', 'true') }
    if (document.body) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, [scheme === 'dark', onboarded, collapsed])
  const page = await context.newPage()
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`[${scheme}] ${m.text().slice(0, 300)}`)
    else if (process.env.MUSE_CONSOLE === '1' && /seed|persona|onboard/iu.test(m.text())) console.log(`[console ${scheme}] ${m.type()}: ${m.text().slice(0, 300)}`)
  })
  page.on('pageerror', (e) => errors.push(`[${scheme}] pageerror ${String(e).slice(0, 300)}`))
  page.on('response', (r) => { if (r.status() >= 400 && process.env.MUSE_CONSOLE === '1') console.log(`[http ${scheme}] ${r.status()} ${r.url().slice(0, 200)}`) })
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(onboarded ? 9000 : 5000)
  if (onboarded) {
    // The dev seed completes onboarding after bootstrap; reload so the host no longer reports first use.
    await page.reload({ waitUntil: 'load' })
    await page.waitForTimeout(6000)
  }
  return { context, page }
}

/** MUSE_AXE=<path to axe.min.js>: WCAG 2.x AA scan of the current page (no repo dependency). */
async function axeReport(page, label) {
  if (process.env.MUSE_AXE === undefined) return
  await page.addScriptTag({ path: process.env.MUSE_AXE })
  const result = await page.evaluate(async () => {
    const r = await globalThis.axe.run(document, { runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21aa', 'wcag22aa'] } })
    return r.violations.map(v => ({ id: v.id, impact: v.impact, nodes: v.nodes.length, sample: v.nodes.slice(0, 3).map(n => n.target.join(' ')) }))
  })
  console.log(`[axe ${label}] violations: ${result.length}`)
  for (const v of result) console.log(`[axe ${label}] ${v.impact} ${v.id} ×${v.nodes} :: ${v.sample.join(' | ').slice(0, 220)}`)
}

async function nav(page, label) {
  try {
    const target = page.getByRole('button', { name: label, exact: true }).first()
    await target.evaluate((node) => { node.scrollIntoView({ block: 'center' }) })
    await target.click({ timeout: 10_000 })
  } catch (error) {
    await page.screenshot({ path: `${outDir}/debug-nav-failed.png` })
    console.log(`[debug] body: ${(await page.locator('body').innerText()).slice(0, 500).split(String.fromCharCode(10)).join(' | ')}`)
    throw error
  }
  await page.waitForTimeout(1600)
}

/** Wait for Lumen remote panels to leave infinite loading before Muse captures. */
async function waitPanelSettled(page, label) {
  const surfaceByLabel = new Map([
    ['Conexões', 'connections'],
    ['Aprovações', 'approvals'],
    ['Uso e limites', 'usage'],
    ['Conhecimento', 'knowledge'],
    ['Arquivos', 'files'],
    ['Rotinas', 'routines'],
    ['Membros', 'members'],
    ['Perfil', 'profile'],
    ['Importar equipe', 'importers'],
    ['Regras', 'rules'],
    ['Canvas', 'canvas'],
  ])
  if (label === 'Kanban' || label === 'Quadros') {
    await page.locator('[data-persona-boards]').waitFor({ timeout: 20_000 })
    await page.locator('[data-persona-boards][aria-busy="true"]').waitFor({ state: 'detached', timeout: 25_000 }).catch(() => {})
  }
  const surface = surfaceByLabel.get(label)
  if (surface !== undefined) {
    await page.locator(`[data-persona-surface="${surface}"][aria-busy="true"]`).waitFor({ state: 'detached', timeout: 25_000 }).catch(() => {})
    await page.locator(`[data-persona-surface="${surface}"] [aria-busy="true"]`).waitFor({ state: 'detached', timeout: 25_000 }).catch(() => {})
  }
  await page.waitForTimeout(400)
}

const onData = async (chunk) => {
  out += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
  if (!match) return
  child.stdout.off('data', onData); child.stderr.off('data', onData)
  clearTimeout(timer)
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const shots = []
    // Onboarding first, on the clean home (the dev seed below completes onboarding server-side).
    for (const scheme of ['light', 'dark']) {
      if (wanted.has('onboarding')) {
        const { context, page } = await open(match[1], scheme, { onboarded: false })
        const step1 = `${outDir}/onboarding-${scheme}-1.png`
        await page.screenshot({ path: step1 }); shots.push(step1)
        const name = page.getByPlaceholder('Ex.: Miguel')
        if (await name.count() > 0) {
          await name.fill('Miguel')
          for (const step of [2, 3, 4, 5]) {
            await page.getByRole('button', { name: 'Continuar', exact: true }).click()
            await page.waitForTimeout(900)
            if (step === 4 || step === 5 || step === 2) {
              const path = `${outDir}/onboarding-${scheme}-${step}.png`
              await page.screenshot({ path }); shots.push(path)
            }
          }
        }
        await context.close()
      }
    }
    for (const scheme of ['light', 'dark']) {
      if (wanted.has('channel') || wanted.has('overview')) {
        const { context, page } = await open(match[1], scheme, { onboarded: true })
        if (wanted.has('overview')) {
          await nav(page, 'Visão geral')
          const path = `${outDir}/overview-${scheme}.png`
          await page.screenshot({ path }); shots.push(path)
          await axeReport(page, `overview ${scheme}`)
        }
        if (wanted.has('channel')) {
          await nav(page, 'Canais')
          const path = `${outDir}/channel-${scheme}.png`
          await page.screenshot({ path }); shots.push(path)
          await axeReport(page, `channel ${scheme}`)
          if (process.env.MUSE_REDUCED !== undefined) {
            const running = await page.evaluate(() => document.getAnimations().filter(an => an.playState === 'running' && Number(an.effect?.getComputedTiming().iterations) === Infinity).length)
            console.log(`[motion channel ${scheme}] reduced=${process.env.MUSE_REDUCED} infinite animations running: ${running}`)
          }
          await page.keyboard.press('Tab')
          await page.keyboard.press('Tab')
          await page.keyboard.press('Tab')
          const focusPath = `${outDir}/channel-${scheme}-focus.png`
          await page.screenshot({ path: focusPath }); shots.push(focusPath)
        }
        await context.close()
      }
      if (wanted.has('sizes')) {
        for (const viewport of [{ width: 1280, height: 720 }, { width: 1920, height: 1080 }]) {
          const { context, page } = await open(match[1], scheme, { onboarded: true, viewport })
          await nav(page, 'Canais')
          const path = `${outDir}/channel-${scheme}-${viewport.width}x${viewport.height}.png`
          await page.screenshot({ path }); shots.push(path)
          await context.close()
        }
      }
      if (wanted.has('collapsed')) {
        const { context, page } = await open(match[1], scheme, { onboarded: true, collapsed: true })
        await nav(page, 'Canais')
        const path = `${outDir}/rail-collapsed-${scheme}.png`
        await page.screenshot({ path }); shots.push(path)
        await context.close()
      }
      const panelLabelAliases = new Map([
        ['Quadros', 'Quadros'],
        ['Kanban', 'Quadros'],
        ['Conexoes', 'Conexões'],
        ['Aprovacoes', 'Aprovações'],
        ['Importadores', 'Importar equipe'],
        ['Uso', 'Uso e limites'],
        ['Regras', 'Regras'],
        ['Membros', 'Membros'],
        ['Perfil', 'Perfil'],
      ])
      const panelSlugByLabel = new Map([
        ['Conexões', 'conexoes'],
        ['Aprovações', 'aprovacoes'],
        ['Importar equipe', 'importadores'],
      ])
      const panels = [...wanted]
        .filter(name => name.startsWith('panel:'))
        .map(name => panelLabelAliases.get(name.slice(6).replaceAll('_', ' ')) ?? name.slice(6).replaceAll('_', ' '))
      if (panels.length > 0) {
        const { context, page } = await open(match[1], scheme, { onboarded: true })
        for (const label of panels) {
          if (label === 'Membros' || label === 'Perfil' || label === 'Importadores' || label === 'Canvas') {
            const more = page.getByRole('button', { name: 'Mais', exact: true })
            if (await more.getAttribute('aria-expanded') === 'false') await more.click()
          }
          try {
            await nav(page, label)
            await waitPanelSettled(page, label)
          } catch (error) {
            console.log(`[panel ${label} ${scheme}] navigation failed: ${error instanceof Error ? error.message.slice(0, 120) : String(error)}`)
            continue
          }
          const slug = panelSlugByLabel.get(label) ?? label.normalize('NFD').replace(/[^a-zA-Z]+/g, '-').toLowerCase()
          const path = `${outDir}/panel-${slug}-${scheme}.png`
          await page.screenshot({ path }); shots.push(path)
          const mainText = await page.evaluate(() => (document.querySelector('[data-persona-main]')?.textContent ?? '').trim().length)
          console.log(`[panel ${label} ${scheme}] main text chars: ${mainText}`)
        }
        await context.close()
      }
    }
    await finish(0, `console errors (${errors.length}):\n${errors.slice(0, 12).join('\n') || '(none)'}\nshots:\n${shots.join('\n')}`)
  } catch (error) {
    const nl = String.fromCharCode(10)
    await finish(1, `failed: ${error instanceof Error ? error.message.slice(0, 300) : String(error)}${nl}${errors.slice(0, 12).join(nl)}`)
  }
}
child.stdout.on('data', onData); child.stderr.on('data', onData)
child.on('exit', (code) => { clearTimeout(timer); console.log(`host exited early ${code}\n${out.slice(-1200)}`); process.exit(1) })
