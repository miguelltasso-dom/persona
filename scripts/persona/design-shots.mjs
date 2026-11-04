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

async function open(url, scheme, { onboarded, emptyHome = false, collapsed = false, viewport = { width: 1440, height: 900 }, extraLs }) {
  const context = await browser.newContext({ reducedMotion: process.env.MUSE_REDUCED === '1' ? 'reduce' : 'no-preference', viewport, deviceScaleFactor: 1, colorScheme: scheme, locale: 'pt-BR' })
  await context.addInitScript(([dark, done, railCollapsed, emptyOnly]) => {
    localStorage.setItem('persona.rail.collapsed.v1', railCollapsed ? '1' : '0')
    if (emptyOnly) {
      localStorage.setItem('persona.onboarding.complete.v1', '1')
      localStorage.removeItem('persona.devSeed.v1')
    } else if (done) {
      localStorage.setItem('persona.onboarding.complete.v1', '1')
      localStorage.setItem('persona.devSeed.v1', '1')
    } else {
      localStorage.removeItem('persona.onboarding.complete.v1')
      localStorage.removeItem('persona.devSeed.v1')
    }
    const apply = () => { if (dark) document.body?.setAttribute('data-ds-dark-theme', 'true') }
    if (document.body) apply()
    else document.addEventListener('DOMContentLoaded', apply, { once: true })
  }, [scheme === 'dark', onboarded, emptyHome, collapsed])
  // MUSE_LS="key=value;key2=value2": extra localStorage for dev overrides (e.g. persona.orgChartScaleSeed=150).
  if (process.env.MUSE_LS !== undefined || extraLs !== undefined) {
    const pairs = [...(process.env.MUSE_LS ?? '').split(';'), ...(extraLs ?? [])].filter(Boolean).map(kv => kv.split('='))
    await context.addInitScript((entries) => { for (const [k, v] of entries) localStorage.setItem(k, v) }, pairs)
  }
  const page = await context.newPage()
  page.on('console', (m) => {
    if (process.env.MUSE_DUMP === '1') console.log(`[dump ${scheme}] ${m.type()}: ${m.text().slice(0, 400)}`)
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
    await page.getByRole('button', { name: 'Visão geral', exact: true }).first().waitFor({ timeout: 20_000 }).catch(() => undefined)
    for (let attempt = 0; attempt < 3 && await page.getByRole('button', { name: label, exact: true }).count() === 0; attempt += 1) {
      // Rail groups fold in short windows: open every folded group so the target exists.
      for (const toggle of await page.locator('button[aria-controls^="persona-nav-"][aria-expanded="false"]').all()) {
        await toggle.evaluate((node) => { node.click() }).catch(() => undefined)
      }
      await page.waitForTimeout(500)
    }
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
    ['Saúde', 'team-health'],
    ['Quem cuida de quem', 'org-chart'],
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
            if (step === 4 && wanted.has('assistant')) {
              // GOV-8 "Monte uma equipe que faça sentido": walk the 4 steps inside onboarding step 4.
              try {
                await page.getByRole('button', { name: /Assistente de estrutura/u }).first().click({ timeout: 5_000 })
                await page.waitForTimeout(700)
                for (let sub = 1; sub <= 4; sub += 1) {
                  const path = `${outDir}/assistant-${scheme}-${sub}.png`
                  await page.screenshot({ path }); shots.push(path)
                  await axeReport(page, `assistant ${sub} ${scheme}`)
                  const option = page.locator('[aria-pressed="false"]').first()
                  if (sub === 1 && await option.count() > 0) await option.click().catch(() => undefined)
                  const next = page.getByRole('button', { name: 'Continuar', exact: true }).first()
                  if (sub < 4) { await next.click({ timeout: 5_000 }).catch(() => undefined); await page.waitForTimeout(700) }
                }
                await page.getByRole('button', { name: /Pular assistente|Voltar/u }).first().click({ timeout: 3_000 }).catch(() => undefined)
              } catch (error) {
                console.log(`[assistant ${scheme}] failed: ${error instanceof Error ? error.message.slice(0, 140) : String(error)}`)
              }
            }
          }
        }
        await context.close()
      }
    }
    for (const scheme of ['light', 'dark']) {
      // Muse integration round: big org chart (Lumen seed 60/150) with search focus.
      for (const n of ['60', '150']) {
        if (!wanted.has(`org${n}`)) continue
        const { context, page } = await open(match[1], scheme, { onboarded: true, extraLs: [`persona.orgChartScaleSeed=${n}`] })
        try {
          await nav(page, 'Quem cuida de quem')
          await page.waitForTimeout(1500)
          const path = `${outDir}/org${n}-${scheme}.png`
          await page.screenshot({ path }); shots.push(path)
          const box = page.getByRole('combobox', { name: 'Encontrar persona' })
          if (await box.count() > 0) {
            await box.fill('a')
            await page.keyboard.press('Enter')
            await page.waitForTimeout(1900)
            const found = `${outDir}/org${n}-found-${scheme}.png`
            await page.screenshot({ path: found }); shots.push(found)
            console.log(`[org${n} ${scheme}] focused: ${await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))}`)
          } else {
            console.log(`[org${n} ${scheme}] no OrgMap search (seed not applied?)`)
          }
          await axeReport(page, `org${n} ${scheme}`)
        } catch (error) {
          console.log(`[org${n} ${scheme}] failed: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`)
        }
        await context.close()
      }
      // Muse integration round: composer "/" menu, "/limites" panel, details drawer, F6.
      if (wanted.has('composer')) {
        const { context, page } = await open(match[1], scheme, { onboarded: true })
        try {
          await nav(page, 'Canais')
          const box = page.locator('[data-persona-area="composer"] textarea').first()
          await box.click()
          await box.type('/')
          await page.waitForTimeout(400)
          const slash = `${outDir}/composer-slash-${scheme}.png`
          await page.screenshot({ path: slash }); shots.push(slash)
          await box.type('limites')
          await page.keyboard.press('Enter')
          await page.waitForTimeout(700)
          const limits = `${outDir}/composer-limits-${scheme}.png`
          await page.screenshot({ path: limits }); shots.push(limits)
          await page.keyboard.press('F6')
          await page.waitForTimeout(200)
          const f6 = `${outDir}/composer-f6-${scheme}.png`
          await page.screenshot({ path: f6 }); shots.push(f6)
          console.log(`[composer ${scheme}] after F6 focus in area: ${await page.evaluate(() => document.activeElement?.closest('[data-persona-area]')?.getAttribute('data-persona-area'))}`)
          await axeReport(page, `composer ${scheme}`)
        } catch (error) {
          console.log(`[composer ${scheme}] failed: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`)
        }
        await context.close()
      }
      if (wanted.has('empty-panels')) {
        const { context, page } = await open(match[1], scheme, { onboarded: false, emptyHome: true })
        try {
          await page.waitForTimeout(9000)
          for (const label of ['Conexões', 'Uso e limites', 'Saúde', 'Quem cuida de quem']) {
            await nav(page, label)
            await waitPanelSettled(page, label)
            const slug = label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '-')
            const path = `${outDir}/empty-${slug}-${scheme}.png`
            await page.screenshot({ path }); shots.push(path)
          }
        } catch (error) {
          console.log(`[empty-panels ${scheme}] failed: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`)
        }
        await context.close()
      }
      if (wanted.has('seed-panels')) {
        const { context, page } = await open(match[1], scheme, { onboarded: true })
        try {
          for (const label of ['Conexões', 'Uso e limites', 'Saúde', 'Quem cuida de quem']) {
            await nav(page, label)
            await waitPanelSettled(page, label)
            const slug = label.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/\s+/g, '-')
            const path = `${outDir}/seed-${slug}-${scheme}.png`
            await page.screenshot({ path }); shots.push(path)
          }
        } catch (error) {
          console.log(`[seed-panels ${scheme}] failed: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`)
        }
        await context.close()
      }
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
            const hiddenRunning = await page.evaluate(async () => {
              Object.defineProperty(document, 'hidden', { configurable: true, get: () => true })
              document.dispatchEvent(new Event('visibilitychange'))
              await new Promise(resolve => setTimeout(resolve, 300))
              return document.getAnimations().filter(an => an.playState === 'running' && Number(an.effect?.getComputedTiming().iterations) === Infinity).length
            })
            console.log(`[motion channel ${scheme}] window hidden → infinite animations running: ${hiddenRunning}`)
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
        ['Importadores', 'Importadores'],
        ['Uso', 'Uso e limites'],
        ['Regras', 'Regras'],
        ['Membros', 'Membros'],
        ['Perfil', 'Perfil'],
      ])
      const panelSlugByLabel = new Map([
        ['Conexões', 'conexoes'],
        ['Aprovações', 'aprovacoes'],
        ['Importadores', 'importadores'],
      ])
      if (wanted.has('dm')) {
        const { context, page } = await open(match[1], scheme, { onboarded: true })
        try {
          await page.getByRole('button', { name: /^Conversar com Nina/u }).first().click({ timeout: 10_000 })
          await page.waitForTimeout(2500)
          const path = `${outDir}/dm-nina-${scheme}.png`
          await page.screenshot({ path }); shots.push(path)
          await axeReport(page, `dm ${scheme}`)
        } catch (error) {
          console.log(`[dm ${scheme}] failed: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`)
        }
        await context.close()
      }
      const expandTeam = async (page) => {
        const toggle = page.getByRole('button', { name: /^Sua equipe/u }).first()
        if (await toggle.getAttribute('aria-expanded') === 'false') await toggle.click()
      }
      const openCard = async (page, who) => {
        await expandTeam(page)
        await page.getByRole('button', { name: `Sobre ${who}`, exact: true }).first().click({ timeout: 10_000 })
        await page.getByRole('dialog', { name: who }).waitFor({ timeout: 5_000 })
        await page.waitForTimeout(700)
      }
      if (wanted.has('card')) {
        const { context, page } = await open(match[1], scheme, { onboarded: true })
        for (const who of ['Nina', 'Atlas', 'Bento']) {
          try {
            await openCard(page, who)
            const path = `${outDir}/card-${who.toLowerCase()}-${scheme}.png`
            await page.screenshot({ path }); shots.push(path)
            await axeReport(page, `card ${who} ${scheme}`)
            if (who === 'Nina') {
              await page.getByRole('button', { name: `Mais ações para ${who}` }).click()
              const menuPath = `${outDir}/card-${who.toLowerCase()}-${scheme}-menu.png`
              await page.screenshot({ path: menuPath }); shots.push(menuPath)
              await page.keyboard.press('Escape')
            }
            await page.keyboard.press('Escape')
            const open = await page.getByRole('dialog').count()
            console.log(`[card ${who} ${scheme}] Esc closed: ${open === 0}; focus: ${await page.evaluate(() => document.activeElement?.getAttribute('aria-label'))}`)
          } catch (error) {
            console.log(`[card ${who} ${scheme}] failed: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`)
          }
        }
        await context.close()
      }
      for (const [flag, label, slug] of [['hire', 'Contratar persona', 'hire'], ['profile', 'Atlas', 'profile-atlas']]) {
        if (!wanted.has(flag)) continue
        const { context, page } = await open(match[1], scheme, { onboarded: true })
        try {
          if (flag === 'profile') {
            await openCard(page, label)
            await page.getByRole('button', { name: `Mais ações para ${label}` }).click()
            await page.getByRole('menuitem', { name: 'Abrir perfil' }).click()
          } else {
            await nav(page, label)
          }
          await page.waitForTimeout(1500)
          const path = `${outDir}/${slug}-${scheme}.png`
          await page.screenshot({ path }); shots.push(path)
          if (flag === 'hire') {
            const full = `${outDir}/${slug}-${scheme}-full.png`
            await page.locator('[data-persona-main]').screenshot({ path: full }).catch(() => undefined)
          }
          await axeReport(page, `${slug} ${scheme}`)
        } catch (error) {
          console.log(`[${flag} ${scheme}] failed: ${error instanceof Error ? error.message.slice(0, 160) : String(error)}`)
        }
        await context.close()
      }
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
