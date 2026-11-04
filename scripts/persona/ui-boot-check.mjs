// UI boot gate for the Persona profile (Keel). Boots `--profile persona` on a temp home, opens it in Chrome (light/dark),
// prints the console (incl. 'web boot: warning: N entries did not activate' = a plugin is stuck/failed) and saves captures to
// .maestri/tmp/shots/. Run under the lock: node scripts/persona/with-lock.mjs "<you> ui boot" -- node scripts/persona/ui-boot-check.mjs
// Gate: zero 'did not activate' warnings and zero console errors before any UI task is reported done.
import { spawn, execFileSync } from 'node:child_process'
import { freePort } from './free-port.mjs'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'
import { completePersonaOnboardingOverlay } from './playwright-onboarding.mjs'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const home = `${root}/.maestri/tmp/keel-shot-home-${process.pid}`
const outDir = `${root}/.maestri/tmp/shots`
mkdirSync(home, { recursive: true }); mkdirSync(outDir, { recursive: true })
// Default seeded channel (Probe/design-shots); production-like gate: PERSONA_BOOT_NO_DEV_SEED=1
const devSeed = process.env.PERSONA_BOOT_NO_DEV_SEED !== '1'
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', String(await freePort())], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
let browser
const finish = async (code, note) => {
  console.log(note)
  try { await browser?.close() } catch { /* closing */ }
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  process.exit(code)
}
const timer = setTimeout(() => finish(1, `TIMEOUT\n${out.slice(-1200)}`), 150_000)
const onData = async (chunk) => {
  out += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
  if (!match) return
  child.stdout.off('data', onData); child.stderr.off('data', onData)
  clearTimeout(timer)
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const errors = []
    const all = globalThis.__all = []
    for (const scheme of ['light', 'dark']) {
      const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: scheme, locale: 'pt-BR' })
      if (scheme === 'dark') {
        await context.addInitScript(() => {
          const apply = () => { document.body?.setAttribute('data-ds-dark-theme', 'true') }
          if (document.body) apply()
          else document.addEventListener('DOMContentLoaded', apply, { once: true })
        })
      }
      const page = await context.newPage()
      page.on('console', (m) => { if (scheme === 'light') all.push(`${m.type()}: ${m.text().slice(0, 900)}`); if (m.type() === 'error') errors.push(`[${scheme}] ${m.text().slice(0, 300)}`) })
      page.on('pageerror', (e) => errors.push(`[${scheme}] pageerror ${String(e).slice(0, 300)}`))
      await page.goto(match[1], { waitUntil: 'load' })
      await page.waitForTimeout(6000)
      await page.screenshot({ path: `${outDir}/persona-${scheme}.png` })
      const text = (await page.locator('body').innerText()).slice(0, 600).replace(/\n+/g, ' | ')
      console.log(`[${scheme}] title="${await page.title()}" text: ${text}`)
      await context.close()
    }
    let bootstrapNote = 'bootstrap gate: skipped'
    try {
      const bootOut = execFileSync(process.execPath, ['--import', 'tsx/esm', 'scripts/persona/exec-bootstrap-gate.mjs', match[1]], { cwd: root, encoding: 'utf8' })
      bootstrapNote = bootOut.trim().split('\n').pop() ?? bootstrapNote
    } catch (bootError) {
      const msg = bootError instanceof Error ? bootError.message : String(bootError)
      const stderr = bootError && typeof bootError === 'object' && 'stderr' in bootError ? String(bootError.stderr) : ''
      errors.push(`[bootstrap] ${msg.slice(0, 200)}`)
      if (stderr.length > 0) errors.push(`[bootstrap] ${stderr.slice(0, 800)}`)
      bootstrapNote = 'bootstrap gate FAILED (see errors)'
    }
    const channelCtx = await browser.newContext({ viewport: { width: 1440, height: 900 }, colorScheme: 'light', locale: 'pt-BR' })
    await channelCtx.addInitScript((seed) => {
      localStorage.setItem('persona.onboarding.complete.v1', '1')
      if (seed) localStorage.setItem('persona.devSeed.v1', '1')
    }, devSeed)
    const channelPage = await channelCtx.newPage()
    channelPage.on('console', (m) => { if (m.type() === 'error') errors.push(`[channel] ${m.text().slice(0, 300)}`) })
    channelPage.on('pageerror', (e) => errors.push(`[channel] pageerror ${String(e).slice(0, 300)}`))
    await channelPage.goto(match[1], { waitUntil: 'load' })
    if (!devSeed) await completePersonaOnboardingOverlay(channelPage)
    await channelPage.waitForTimeout(4000)
    await channelPage.screenshot({ path: `${outDir}/persona-light-channel.png` })
    console.log(`[channel] text: ${(await channelPage.locator('body').innerText()).slice(0, 600).replace(/\n+/g, ' | ')}`)
    await channelPage.keyboard.press('Tab')
    await channelPage.keyboard.press('Tab')
    const focused = await channelPage.evaluate(() => document.activeElement?.tagName ?? 'none')
    console.log(`[a11y] focus after Tab×2: ${focused}`)
    await channelCtx.close()
    const narrowCtx = await browser.newContext({ viewport: { width: 1280, height: 720 }, colorScheme: 'light', locale: 'pt-BR' })
    await narrowCtx.addInitScript((seed) => {
      if (seed) localStorage.setItem('persona.devSeed.v1', '1')
    }, devSeed)
    const narrowPage = await narrowCtx.newPage()
    await narrowPage.goto(match[1], { waitUntil: 'load' })
    if (!devSeed) await completePersonaOnboardingOverlay(narrowPage)
    await narrowPage.waitForTimeout(4000)
    await narrowPage.screenshot({ path: `${outDir}/persona-light-720.png` })
    await narrowCtx.close()
    const wideCtx = await browser.newContext({ viewport: { width: 1920, height: 1080 }, colorScheme: 'light', locale: 'pt-BR' })
    await wideCtx.addInitScript((seed) => {
      if (seed) localStorage.setItem('persona.devSeed.v1', '1')
    }, devSeed)
    const widePage = await wideCtx.newPage()
    await widePage.goto(match[1], { waitUntil: 'load' })
    if (!devSeed) await completePersonaOnboardingOverlay(widePage)
    await widePage.waitForTimeout(4000)
    await widePage.screenshot({ path: `${outDir}/persona-light-1080.png` })
    await wideCtx.close()
    let dirDLine = 'dirD compare: skipped'
    try {
      const cmp = execFileSync(process.execPath, ['scripts/persona/compare-shot-dirD.mjs'], { cwd: root, encoding: 'utf8' })
      dirDLine = cmp.trim().split('\n').pop() ?? dirDLine
    } catch (error) {
      dirDLine = `dirD compare failed: ${error instanceof Error ? error.message : String(error)}`
    }
    console.log(['--- all console (light) ---', ...all.slice(0, 40)].join('\n'))
    const exitCode = errors.length > 0 ? 1 : 0
    await finish(exitCode, `${bootstrapNote}\nconsole errors (${errors.length}):\n${errors.slice(0, 12).join('\n') || '(none)'}\n${dirDLine}\nshots: ${outDir}/persona-light.png, persona-dark.png, persona-light-channel.png, persona-light-720.png, persona-light-1080.png`)
  } catch (error) {
    await finish(1, `failed: ${error instanceof Error ? error.message : String(error)}\n${out.slice(-800)}`)
  }
}
child.stdout.on('data', onData); child.stderr.on('data', onData)
child.on('exit', (code) => { clearTimeout(timer); console.log(`host exited early ${code}\n${out.slice(-1200)}`); process.exit(1) })
