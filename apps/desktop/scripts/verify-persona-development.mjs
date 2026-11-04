/** Exercise the real Electron vault and startup UI without submitting model requests. */
import { spawn, spawnSync, execFileSync } from 'node:child_process'
import { createRequire } from 'node:module'
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { freePort } from '../../../scripts/persona/free-port.mjs'
import { prepareDevelopmentProject } from './development-project.ts'
import { preparePrimaryRuntime } from './prepare-primary-runtime.ts'
import { developmentRuntimeDirectory, resolveDesktopBuildTarget } from './desktop-build-paths.mjs'
import { DESKTOP_HOST_PROTOCOL_VERSION } from '../src/host-protocol.ts'
import { prepareVaultProof, readVaultProof } from './persona-vault-proof.mjs'
import { profileOwnedHost } from './profile-persona-host.mjs'

const appRoot = resolve(import.meta.dirname, '..')
const root = resolve(appRoot, '../..')
const require = createRequire(import.meta.url)
const electron = require('electron')
const { chromium } = createRequire(join(root, 'packages/persona/persona-e2e/package.json'))('playwright')
const output = resolve(process.argv.slice(2).find(arg => !arg.startsWith('--')) ?? join(root, '.maestri/tmp/shots/rivet-native-vault'))
mkdirSync(output, { recursive: true })
const home = mkdtempSync(join(tmpdir(), 'persona-native-proof-'))
prepareVaultProof(home)
const env = Object.fromEntries(Object.entries(process.env).filter(([name]) =>
  !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH'].includes(name)))
const version = JSON.parse(readFileSync(join(appRoot, 'package.json'), 'utf8')).version
prepareDevelopmentProject({
  projectDir: join(appRoot, '.desktop-build/development/project'),
  cliDir: join(root, 'apps/cli'), hostDir: join(root, 'apps/desktop-host'),
  dependencyDir: join(root, 'node_modules/.pnpm/node_modules'),
  release: { schemaVersion: 1, version, hostProtocolVersion: DESKTOP_HOST_PROTOCOL_VERSION,
    nodeVersion: execFileSync(electron, ['-p', 'process.versions.node'],
      { encoding: 'utf8', env: { ...env, ELECTRON_RUN_AS_NODE: '1' } }).trim(),
    pnpmVersion: JSON.parse(readFileSync(join(appRoot, 'node_modules/pnpm/package.json'), 'utf8')).version },
  target: resolveDesktopBuildTarget(),
})
if (process.argv.includes('--reuse-runtime')) {
  if (!existsSync(join(developmentRuntimeDirectory(), 'runtime.json'))) throw new Error('Prepare the primary runtime before reusing it')
} else await preparePrimaryRuntime()
const results = []
for (const dark of [false, true]) {
  const port = await freePort()
  const hostPort = process.argv.includes('--profile-host') ? await freePort() : undefined
  const started = Date.now()
  const child = spawn(electron, [`--remote-debugging-port=${port}`, appRoot], {
    cwd: appRoot, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...env, DSH_HOME: home, PERSONA_HOME: home, DSH_PROFILE: 'persona',
      DSH_DESKTOP_USER_DATA_DIR: join(home, 'user'), DSH_DESKTOP_PRIMARY_RUNTIME_DIR: developmentRuntimeDirectory(),
      DSH_DESKTOP_OPEN_DEVTOOLS: '0', DSH_DESKTOP_WELCOME: '0', DSH_DESKTOP_UPDATES: '0',
      DSH_TELEMETRY_DISABLED: '1', PERSONA_REAL_CLI: '1', PERSONA_VAULT_TEST_CIPHER: '1',
      ...(hostPort ? { DSH_DESKTOP_HOST_INSPECT_PORT: String(hostPort) } : {}),
      ...(dark ? { PERSONA_TEST_BOOT_FAILURE: '1' } : {}) },
  })
  let log = ''
  const capture = chunk => {
    log += chunk
    writeFileSync(join(output, dark ? 'dark-live.log' : 'light-live.log'),
      log.replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]'))
  }
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  let browser
  let hostProfiler
  try {
    const deadline = Date.now() + 120000
    while (true) {
      try { browser = await chromium.connectOverCDP(`http://127.0.0.1:${port}`); break }
      catch (error) {
        if (Date.now() > deadline || child.exitCode !== null) throw error
        await new Promise(resolve => setTimeout(resolve, 200))
      }
    }
    const page = browser.contexts()[0].pages()[0]
    await page.waitForURL('dsh-app://app/**')
    await page.locator('#persona-boot-overlay').waitFor()
    if (dark) {
      await page.evaluate(() => document.documentElement.setAttribute('data-ds-theme-source', 'dark'))
      await page.waitForFunction(() => matchMedia('(prefers-color-scheme: dark)').matches)
    }
    const first = await page.evaluate(async () => {
      const fredoka = await document.fonts.load('500 26px "Persona Fredoka"')
      const nunito = await document.fonts.load('400 16px "Persona Nunito"')
      const root = document.querySelector('#root')
      return { rootHidden: root.hidden, rootInert: root.inert, rootAria: root.getAttribute('aria-hidden'),
        fredoka: fredoka.length > 0 && fredoka.every(font => font.status === 'loaded'),
        nunito: nunito.length > 0 && nunito.every(font => font.status === 'loaded'),
        dark: matchMedia('(prefers-color-scheme: dark)').matches }
    })
    if (!first.rootHidden || !first.rootInert || first.rootAria !== 'true' || !first.fredoka || !first.nunito)
      throw new Error('Startup accessibility or fonts failed')
    const cdp = await page.context().newCDPSession(page)
    const ax = await cdp.send('Accessibility.getFullAXTree')
    if (ax.nodes.some(node => !node.ignored && /Loading plugins|HARNESS/u.test(node.name?.value ?? '')))
      throw new Error('Upstream startup UI exposed in accessibility tree')
    await page.screenshot({ path: join(output, dark ? 'dark-splash.png' : 'light-splash.png') })
    if (!dark && hostPort) hostProfiler = await profileOwnedHost(child.pid, hostPort)
    if (dark) {
      await page.locator('#boot-error-title').waitFor({ timeout: 65000 })
      await page.screenshot({ path: join(output, 'dark-error.png') })
      await page.getByRole('button', { name: 'Tentar de novo', exact: true }).click()
    }
    await page.waitForFunction(() => {
      const overlay = document.getElementById('persona-boot-overlay')
      return !overlay || overlay.shadowRoot?.querySelector('.boot')?.getAttribute('data-state') === 'error'
    }, undefined, { timeout: 120000 })
    if (await page.locator('#persona-boot-overlay').count()) {
      await page.screenshot({ path: join(output, 'unexpected-boot-error.png') })
      throw new Error('Startup entered its error screen; see redacted startup log')
    }
    const bootElapsedMs = Date.now() - started
    if (hostProfiler) {
      writeFileSync(join(output, 'host.cpuprofile'), JSON.stringify(await hostProfiler.stop()))
      hostProfiler = undefined
    }
    await page.screenshot({ path: join(output, dark ? 'dark-onboarding.png' : 'light-onboarding.png') })
    const vaultPath = join(home, 'vault-proof.json')
    while (!existsSync(vaultPath) && Date.now() < deadline) await new Promise(resolve => setTimeout(resolve, 100))
    const vault = readVaultProof(home, dark)
    results.push({ dark, bootElapsedMs, elapsedMs: Date.now() - started, first, vault })
    console.log(JSON.stringify(results.at(-1)))
  } catch (error) {
    writeFileSync(join(output, 'failure.log'), log.replace(/([?&]token=)[^\s&]+/gu, '$1[redacted]'))
    throw error
  } finally {
    if (hostProfiler) await hostProfiler.stop().catch(() => {})
    await browser?.close().catch(() => {})
    spawnSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { windowsHide: true, stdio: 'ignore' })
  }
}
writeFileSync(join(output, 'proof.json'), JSON.stringify({ home, modelCalls: 0, results }, null, 2))
