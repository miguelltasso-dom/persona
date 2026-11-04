#!/usr/bin/env node
/** CDP dump of unpackaged dest:desktop (packaging-default persona profile). */
import { spawn } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdir, writeFile, rm } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
const e2eRequire = createRequire(fileURLToPath(new URL('../../packages/persona/persona-e2e/package.json', import.meta.url)))
const { chromium } = e2eRequire('playwright')
import { probeFreePort } from '../../packages/persona/persona-e2e/src/ports.ts'
import { ARTIFACTS_DIR } from '../../packages/persona/persona-e2e/src/paths.ts'
import { developmentRuntimeDirectory } from '../../apps/desktop/scripts/desktop-build-paths.mjs'

const repo = fileURLToPath(new URL('../..', import.meta.url))
const appRoot = join(repo, 'apps', 'desktop')
const require = createRequire(join(appRoot, 'package.json'))
const electron = require('electron')
if (typeof electron !== 'string') {
  process.stderr.write('dev-desktop-cdp: electron executable missing\n')
  process.exit(1)
}

const rendererPort = await probeFreePort()
const mainPort = rendererPort + 1
const hostPort = rendererPort + 2
const runRoot = join(repo, '.maestri', 'tmp', `dev-desktop-cdp-${Date.now()}`)
const home = join(runRoot, 'home')
const userData = join(runRoot, 'user-data')
await mkdir(home, { recursive: true })
await mkdir(userData, { recursive: true })
await mkdir(ARTIFACTS_DIR, { recursive: true })

const child = spawn(electron, [
  `--inspect=127.0.0.1:${String(mainPort)}`,
  `--remote-debugging-port=${String(rendererPort)}`,
  `--user-data-dir=${userData}`,
  appRoot,
], {
  cwd: appRoot,
  env: {
    ...process.env,
    DSH_HOME: home,
    PERSONA_HOME: home,
    DSH_PROFILE: 'persona',
    PERSONA_REAL_CLI: '1',
    DSH_DESKTOP_USER_DATA_DIR: userData,
    DSH_DESKTOP_OPEN_DEVTOOLS: '0',
    DSH_DESKTOP_WELCOME: '0',
    DSH_DESKTOP_UPDATES: '0',
    DSH_TELEMETRY_DISABLED: '1',
    DSH_DESKTOP_HOST_INSPECT_PORT: String(hostPort),
    DSH_DESKTOP_RENDERER_DEBUG_PORT: String(rendererPort),
    DSH_DESKTOP_MAIN_INSPECT_PORT: String(mainPort),
    DSH_DESKTOP_PRIMARY_RUNTIME_DIR: developmentRuntimeDirectory(),
    ELECTRON_ENABLE_LOGGING: '1',
  },
  stdio: ['ignore', 'pipe', 'pipe'],
  windowsHide: true,
})

let bootLog = ''
child.stdout?.on('data', (chunk) => { bootLog += chunk.toString('utf8') })
child.stderr?.on('data', (chunk) => { bootLog += chunk.toString('utf8') })

const deadline = Date.now() + 180_000
let browser
try {
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(rendererPort)}/json/version`)
      if (response.ok) {
        const body = await response.json()
        if (body?.webSocketDebuggerUrl) break
      }
    } catch {
      // renderer not up yet
    }
    await new Promise((done) => { setTimeout(done, 250) })
  }
  browser = await chromium.connectOverCDP(`http://127.0.0.1:${String(rendererPort)}`)
  let page
  const pageDeadline = Date.now() + 120_000
  while (Date.now() < pageDeadline) {
    for (const context of browser.contexts()) {
      for (const candidate of context.pages()) {
        if (candidate.url().startsWith('dsh-app://app/')) {
          page = candidate
          break
        }
      }
      if (page) break
    }
    if (page) break
    await new Promise((done) => { setTimeout(done, 500) })
  }
  if (!page) throw new Error(`no dsh-app://app/ page\n${bootLog.slice(-2000)}`)
  const consoleLines = []
  const exceptions = []
  page.on('console', (msg) => { consoleLines.push(`${msg.type()}: ${msg.text()}`.slice(0, 240)) })
  page.on('pageerror', (error) => { consoleLines.push(`pageerror: ${error.message}`.slice(0, 240)) })
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Runtime.enable')
  cdp.on('Runtime.exceptionThrown', (event) => {
    const detail = event.exceptionDetails
    exceptions.push((detail?.text ?? detail?.exception?.description ?? 'exception').slice(0, 240))
  })
  await page.evaluate(() => {
    const store = globalThis
    store.__personaCspViolations = []
    document.addEventListener('securitypolicyviolation', (event) => {
      store.__personaCspViolations.push({
        violatedDirective: event.violatedDirective,
        blockedURI: event.blockedURI,
        effectiveDirective: event.effectiveDirective,
      })
    })
  }).catch(() => {})
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 }).catch(() => {})
  await page.getByText(/passo 1 de 5|como podemos te chamar/i).waitFor({ timeout: 30_000 }).catch(() => {})
  const boot = await page.evaluate(async () => {
    const meta = document.querySelector('meta[name="apple-mobile-web-app-title"]')
    const bootGraph = globalThis.__DSH_BOOT__
    const entries = bootGraph && typeof bootGraph === 'object' && Array.isArray(bootGraph.entries)
      ? bootGraph.entries.map((entry) => entry?.id).filter(Boolean)
      : []
    const desktopBoot = globalThis.dshDesktopBoot
    let injectionKinds = []
    let inlineScriptCount = 0
    let bootScriptSrcs = []
    if (desktopBoot && typeof desktopBoot.ready === 'function') {
      try {
        const payload = await desktopBoot.ready()
        const rows = Array.isArray(payload?.injections) ? payload.injections : []
        injectionKinds = rows.map((row) => row?.kind)
        inlineScriptCount = rows.filter((row) => row?.kind === 'script').length
        bootScriptSrcs = rows
          .filter((row) => row?.kind === 'script-src' && String(row.src ?? '').includes('__persona-boot__'))
          .map((row) => String(row.src))
      } catch {
        // boot IPC may already have settled
      }
    }
    return {
      appleTitle: meta?.getAttribute('content') ?? null,
      hasPersonaShell: Boolean(document.querySelector('[data-persona-shell]')),
      rootChildCount: document.querySelector('#root')?.childElementCount ?? -1,
      moduleLoader: typeof globalThis.__ModuleLoader__,
      bootEntryCount: entries.length,
      bootHasPersonaUi: entries.some((id) => String(id).includes('client-ui-persona')),
      bootIds: entries.slice(0, 40),
      injectionKinds: injectionKinds.slice(0, 12),
      inlineScriptCount,
      bootScriptSrcs,
      cspViolations: globalThis.__personaCspViolations ?? [],
      readyScript: Boolean(document.querySelector('script[src="/__persona-boot__/ready.js"]')),
    }
  })
  const { readFile } = await import('node:fs/promises')
  const profileDir = join(home, 'profiles', 'persona')
  let profileFacts = { profile: 'persona', exists: existsSync(profileDir), bundles: [], hasPersonaAppPatch: false }
  try {
    const manifest = JSON.parse(await readFile(join(profileDir, 'package.json'), 'utf8'))
    profileFacts = {
      profile: 'persona',
      exists: true,
      bundles: manifest.dsh?.profile?.bundles ?? Object.keys(manifest.dependencies ?? {}),
      hasPersonaAppPatch: existsSync(join(profileDir, 'node_modules', '@deepseek-ai', 'dsh-persona-app', 'cordis.patch.yml')),
    }
  } catch {
    // profile not written yet
  }
  const shot = join(ARTIFACTS_DIR, 'dev-desktop-onboarding.png')
  await page.screenshot({ path: shot, animations: 'disabled' })
  const report = {
    mode: 'dev-desktop',
    rendererPort,
    home,
    pageUrl: page.url(),
    title: await page.title().catch(() => ''),
    bodyText: await page.locator('body').innerText().catch(() => '').then((text) => text.slice(0, 800)),
    boot,
    profileFacts,
    exceptions: exceptions.slice(0, 20),
    consoleLines: consoleLines.slice(0, 40),
    bootLogTail: bootLog.slice(-1500),
    shot,
  }
  const jsonPath = join(ARTIFACTS_DIR, 'dev-desktop-cdp.json')
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  const cspHits = (boot.cspViolations ?? []).filter((row) => /script/i.test(row.violatedDirective ?? ''))
  const evalHits = [...exceptions, ...consoleLines].filter((line) => /unsafe-eval|Evaluating a string as JavaScript/i.test(line))
  if (!boot.hasPersonaShell || boot.inlineScriptCount !== 0 || cspHits.length > 0 || evalHits.length > 0) {
    process.exitCode = 1
  }
} finally {
  await browser?.close().catch(() => {})
  child.kill('SIGTERM')
  await new Promise((done) => { setTimeout(done, 1500) })
  if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL')
  if (process.env.PERSONA_E2E_KEEP_HOME !== '1' && existsSync(runRoot)) {
    await rm(runRoot, { recursive: true, force: true }).catch(() => {})
  }
}
