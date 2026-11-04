#!/usr/bin/env node
// Persona boot smoke (Keel; D-060): temp home (clean install), headless Chrome, onboarding overlay, then the nine-panel
// clean-home tour (ErrorState or stuck "Carregando…" fails). Also catches blank #root and fatal client errors.
// Requires: node --import tsx/esm (persona-gate.mjs passes this).
// Usage: node scripts/persona/persona-boot-smoke.mjs [--root <dir>] [--port <n>]
// Exit codes: 0 ok, 1 smoke failed (reason printed), 2 could not start.
import { spawn, execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from './free-port.mjs'

const args = process.argv.slice(2)
const option = (name, fallback) => { const index = args.indexOf(name); return index >= 0 && args[index + 1] !== undefined ? args[index + 1] : fallback }
const root = resolve(option('--root', resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')))
const port = option('--port', String(await freePort()))
const hostTimeoutMs = Number(option('--host-timeout-ms', process.env.PERSONA_BOOT_HOST_TIMEOUT_MS ?? '180000'))
const home = mkdtempSync(join(tmpdir(), 'persona-smoke-'))
const log = (message) => console.log(`[boot-smoke] ${message}`)

const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open', '--port', port], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let hostOutput = ''
let finished = false
const finish = (code, note) => {
  if (finished) return
  finished = true
  log(note)
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* already gone */ }
  try { rmSync(home, { recursive: true, force: true }) } catch { /* temp dir busy */ }
  process.exit(code)
}
const startTimer = setTimeout(
  () => finish(2, `host did not print its URL in ${hostTimeoutMs / 1000} s:\n${hostOutput.slice(-800)}`),
  hostTimeoutMs,
)

const onData = async (chunk) => {
  hostOutput += chunk.toString()
  const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/u.exec(hostOutput)
  if (match === null) return
  child.stdout.off('data', onData)
  child.stderr.off('data', onData)
  clearTimeout(startTimer)
  let browser
  try {
    browser = await chromium.launch({ channel: 'chrome', headless: true })
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' })
    const page = await context.newPage()
    const fatal = []
    /** Clean-home tour hits many panels quickly; host may rate-limit listConversationSubjects. */
    const benignPageError = (text) =>
      /listConversationSubjects.*rate-limited|gateway\/internal.*rate-limited/i.test(text)
    let benignGateway = 0
    page.on('pageerror', (error) => {
      const line = `pageerror: ${String(error).slice(0, 240)}`
      if (benignPageError(line)) {
        benignGateway += 1
        if (benignGateway <= 4) return
      }
      fatal.push(line)
    })
    page.on('console', (message) => {
      if (message.type() === 'error' && /Maximum update depth|Minified React error #185|Uncaught|is not a function/u.test(message.text())) fatal.push(`console: ${message.text().slice(0, 240)}`)
    })
    await page.goto(match[1], { waitUntil: 'domcontentloaded' })
    try {
      await page.waitForSelector('[data-persona-shell]', { timeout: 60_000 })
    } catch {
      const rootHtml = await page.evaluate(() => document.querySelector('#root')?.innerHTML.length ?? -1)
      await browser.close()
      return finish(1, `FAIL: [data-persona-shell] never mounted (#root html length ${rootHtml}); fatal: ${fatal.join(' | ') || 'none'}`)
    }
    const { completePersonaOnboardingOverlay } = await import('./playwright-onboarding.mjs')
    await completePersonaOnboardingOverlay(page, { displayName: 'Probe Gate', vaultLine: 'Empresa de teste para publish gate.' })
    const { runCleanHomeTourChecks, formatCleanHomeTourFailures } = await import('../../packages/persona/persona-e2e/src/boot-gate-bootstrap.ts')
    const tour = await runCleanHomeTourChecks(page)
    const tourLines = formatCleanHomeTourFailures(tour)
    await browser.close()
    if (fatal.length > 0) return finish(1, `FAIL: fatal client errors: ${fatal.slice(0, 4).join(' | ')}`)
    if (tourLines.length > 0) return finish(1, `FAIL: ${tourLines.join('\n')}`)
    finish(0, `OK: clean home tour 9/9 panels; no fatal client errors`)
  } catch (error) {
    try { await browser?.close() } catch { /* closing */ }
    finish(2, `smoke crashed: ${String(error).slice(0, 300)}`)
  }
}
child.stdout.on('data', onData)
child.stderr.on('data', onData)
child.on('exit', (code) => { if (!finished && code !== null && code !== 0) finish(2, `host exited early (${code}):\n${hostOutput.slice(-600)}`) })
