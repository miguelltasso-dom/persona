/** Inspect packaged resources and exercise startup/retry through the actual Electron binary. */
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from '../../../scripts/persona/free-port.mjs'
import { prepareVaultProof, readVaultProof } from './persona-vault-proof.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(import.meta.url)
const builder = createRequire(require.resolve('electron-builder'))
const asar = createRequire(builder.resolve('app-builder-lib'))('@electron/asar')
const { chromium } = createRequire(join(root, 'packages/persona/persona-e2e/package.json'))('playwright')
const exe = resolve(process.argv[2])
const output = resolve(process.argv[3] ?? join(root, '.maestri/tmp/shots/rivet-d8'))
if (process.argv.includes('--profile-host')) throw new Error('Use verify-persona-development.mjs --profile-host for Host CPU profiling on an explicitly allocated inspector port')
mkdirSync(output, { recursive: true })
const archive = join(dirname(exe), 'resources/app.asar')
const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'))
for (const name of [
  '/dsh/node_modules/@deepseek-ai/dsh-desktop-host/config/electron.cordis.patch.yml',
  '/renderer/persona-boot/boot.html', '/renderer/persona-boot/boot.js', '/renderer/persona-boot/boot.css',
  ...(process.argv.includes('--vault') ? ['/renderer/persona-boot/boot-fonts.css'] : []),
  '/renderer/persona-boot/assets/atlas-erro.webp', '/renderer/persona-boot/assets/atlas-disponivel.webp',
]) {
  if (!files.includes(name)) throw new Error(`Missing packaged resource: ${name}`)
  console.log(`ASAR OK ${name}`)
}
const manifest = JSON.parse(asar.extractFile(archive, 'package.json').toString())
console.log(`COMMIT ${manifest.dshBuildCommit}`)
const results = []
const vaultHome = process.argv.includes('--vault') ? mkdtempSync(join(tmpdir(), 'persona-native-package-')) : undefined
if (vaultHome) prepareVaultProof(join(vaultHome, 'home'))
for (const dark of (process.argv.includes('--light-only') ? [false] : [false, true])) {
  const home = vaultHome ?? mkdtempSync(join(tmpdir(), 'persona-d8-proof-'))
  const port = await freePort()
  const log = []
  const started = Date.now()
  const child = spawn(exe, [`--remote-debugging-port=${port}`, ...(dark ? ['--force-dark-mode'] : [])], {
    windowsHide: true,
    env: { ...Object.fromEntries(Object.entries(process.env).filter(([name]) =>
      !['ELECTRON_RUN_AS_NODE', 'NODE_OPTIONS', 'NODE_PATH'].includes(name))),
      PERSONA_HOME: join(home, 'home'), DSH_HOME: join(home, 'home'), DSH_PROFILE: 'persona',
      DSH_DESKTOP_USER_DATA_DIR: join(home, 'user'), DSH_TELEMETRY_DISABLED: '1',
      DSH_DESKTOP_WELCOME: '0', DSH_DESKTOP_UPDATES: '0',
      ...(vaultHome ? { PERSONA_VAULT_TEST_CIPHER: '1' } : {}),
      PERSONA_TEST_BOOT_FAILURE: dark ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  const capture = chunk => log.push(chunk.toString().replace(/([?&]token=)[^\s]+/gu, '$1[redacted]'))
  child.stdout.on('data', capture)
  child.stderr.on('data', capture)
  let browser
  try {
    let endpoint
    for (let attempt = 0; attempt < 300; attempt++) {
      try {
        const response = await fetch(`http://127.0.0.1:${port}/json/version`)
        if (response.ok) { endpoint = (await response.json()).webSocketDebuggerUrl; break }
      } catch (error) { if (child.exitCode !== null) throw new Error(`Desktop exited: ${child.exitCode}: ${log.join('')}`) }
      await new Promise(resolve => setTimeout(resolve, 200))
    }
    if (!endpoint) throw new Error('Desktop CDP deadline expired')
    browser = await chromium.connectOverCDP(endpoint)
    let page
    for (let attempt = 0; attempt < 100; attempt++) {
      page = browser.contexts().flatMap(context => context.pages()).find(page => page.url().startsWith('dsh-app://app'))
      if (page) break
      await new Promise(resolve => setTimeout(resolve, 100))
    }
    if (!page) throw new Error('No application page')
    const profiler = await page.context().newCDPSession(page)
    await profiler.send('Profiler.enable')
    await profiler.send('Profiler.start')
    const consoleErrors = []
    page.on('pageerror', error => consoleErrors.push(error.message))
    if (dark) {
      await page.evaluate(() => document.documentElement.setAttribute('data-ds-theme-source', 'dark'))
      await page.waitForFunction(() => matchMedia('(prefers-color-scheme: dark)').matches)
    }
    await page.screenshot({ path: join(output, dark ? 'dark-first-frame.png' : 'light-first-frame.png') })
    if (dark) {
      await page.locator('#boot-error-title').waitFor({ state: 'visible', timeout: 65000 })
      await page.screenshot({ path: join(output, 'dark-boot-error.png') })
      const focused = await page.locator('#boot-retry').evaluate(button => button.getRootNode().activeElement === button)
      if (!focused) throw new Error('Retry did not receive focus')
      await page.getByRole('button', { name: 'Tentar de novo', exact: true }).click()
    }
    await page.locator('#root').filter({ hasText: /Boas-vindas|Sua empresa|Sua equipe|PASSO 1|Passo 1|Como.*chama|Vamos/iu }).waitFor({ timeout: 90000 })
    console.log(JSON.stringify({ boot: await page.evaluate(() => ({
      markers: document.querySelectorAll('[data-persona-root], [data-persona-shell]').length,
      overlay: document.getElementById('persona-boot-overlay')?.className,
      state: document.getElementById('persona-boot-overlay')?.shadowRoot?.querySelector('.boot')?.getAttribute('data-state'),
    })) }))
    await page.locator('#persona-boot-overlay').waitFor({ state: 'detached', timeout: 10000 })
    await page.screenshot({ path: join(output, dark ? 'dark-onboarding.png' : 'light-onboarding.png') })
    const text = await page.locator('#root').innerText()
    const resources = await page.evaluate(() => performance.getEntriesByType('resource')
      .map(entry => ({ path: new URL(entry.name).pathname, durationMs: Math.round(entry.duration) }))
      .sort((a, b) => b.durationMs - a.durationMs).slice(0, 12))
    const profile = await profiler.send('Profiler.stop')
    writeFileSync(join(output, dark ? 'dark.cpuprofile' : 'light.cpuprofile'), JSON.stringify(profile.profile))
    const vault = vaultHome ? readVaultProof(join(home, 'home'), dark) : undefined
    results.push({ dark, elapsedMs: Date.now() - started, retry: dark, text: text.slice(0, 800), consoleErrors, resources,
      ...(vault ? { vault } : {}) })
    console.log(JSON.stringify(results.at(-1)))
    if (consoleErrors.length) throw new Error(`Renderer errors: ${consoleErrors.join('; ')}`)
  } finally {
    await browser?.close().catch(() => {})
    if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    writeFileSync(join(output, dark ? 'dark.log' : 'light.log'), log.join(''))
  }
}
writeFileSync(join(output, 'proof.json'), JSON.stringify({ commit: manifest.dshBuildCommit, archive, results }, null, 2) + '\n')
