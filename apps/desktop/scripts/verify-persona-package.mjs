/** Inspect packaged resources and exercise startup/retry through the actual Electron binary. */
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { freePort } from '../../../scripts/persona/free-port.mjs'
import { prepareVaultProof, readVaultProof } from './persona-vault-proof.mjs'
import { componentsGateOf } from './components-gate.mjs'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')

/**
 * Playwright's `page.screenshot` can hang on the boot-error page of the packaged app (measured 17:40 on d2135706cd and on the older 752e85396a:
 * "fonts loaded" and then nothing for 120 s) while the raw CDP capture of the same page works. The screenshot is evidence, not the assertion, so
 * after 15 s fall back to `Page.captureScreenshot` instead of failing the whole proof.
 * @param {import('playwright').Page} page - The application page.
 * @param {string} path - Where the PNG goes.
 */
async function savePng(page, path) {
  try {
    await page.screenshot({ timeout: 15_000, path })
  } catch (error) {
    if (!String(error?.message).includes('Timeout')) throw error
    const session = await page.context().newCDPSession(page)
    const shot = await session.send('Page.captureScreenshot', { format: 'png', fromSurface: true })
    writeFileSync(path, Buffer.from(shot.data, 'base64'))
    await session.detach().catch(() => undefined)
    console.log(JSON.stringify({ screenshotFallback: path }))
  }
}
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
let engineGate
let imageGate
// ENG-1 gate: the packaged AI engines must LOAD with the exe's own node (and run a turn through the product's resolveRunner), or the
// pack fails. H2 #3 shipped with a dependency drift that threw at `import('@botiverse/oar')`; detection still said "Pronta" and no
// engine could start. Runs before any window opens; ~2 s for the imports, ~10-40 s for the stub turn (--no-turn-smoke skips only that).
{
  const probe = join(dirname(fileURLToPath(import.meta.url)), 'packaged-runners-probe.mjs')
  const lib = join(dirname(exe), 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-persona-runners/lib/index.js')
  const stubs = join(root, 'packages/persona/persona-e2e/fixtures/fake-cli')
  const cleanEnv = Object.fromEntries(Object.entries(process.env).filter(([name]) => !['NODE_OPTIONS', 'NODE_PATH', 'VITEST'].includes(name)))
  const run = (args, timeout) => {
    const done = spawnSync(exe, [probe, ...args], { env: { ...cleanEnv, ELECTRON_RUN_AS_NODE: '1' }, encoding: 'utf8', timeout, windowsHide: true })
    const text = `${done.stdout ?? ''}${done.stderr ?? ''}`
    const line = text.split(/\r?\n/u).find(row => /^(?:RUNTIME-IMPORTS|RUNNER-TURN|SHARP-RASTER) /u.test(row))
    if (line === undefined) throw new Error(`Packaged runner probe printed nothing (${args[0]}, exit ${String(done.status)}): ${text.slice(-600)}`)
    return JSON.parse(line.slice(line.indexOf(' ') + 1))
  }
  const imports = run(['imports', lib], 120_000)
  console.log(`RUNTIME-IMPORTS ${JSON.stringify(imports)}`)
  if (imports.ok !== true) {
    const bad = imports.rows === undefined ? imports.error : imports.rows.filter(row => !row.ok).map(row => `${row.runtime}: ${row.error}`).join(' | ')
    throw new Error(`A packaged AI engine cannot load with the exe's own node (ENG-1): ${bad}`)
  }
  if (!process.argv.includes('--no-turn-smoke')) {
    const turn = run(['turn', lib, stubs], 240_000)
    console.log(`RUNNER-TURN ${JSON.stringify(turn)}`)
    if (turn.ok !== true) throw new Error(`The packaged resolveRunner could not complete a turn with the faithful claude stub (ENG-1): ${turn.error ?? JSON.stringify(turn)}`)
  }
  engineGate = { runtimeImports: imports.rows, runnerTurn: process.argv.includes('--no-turn-smoke') ? 'skipped' : 'ok' }
  // Image gate (Keel 07/11): the v1.1 image features rasterize SVGs with `sharp`, whose native binary is NOT in the asar. Resolved from the persona-host's own place
  // in the runtime, like the product does. A pack that forgot to unpack it, or lost the package, fails here in ~5 s instead of failing the person's first image.
  const rasterized = run(['sharp', join(dirname(exe), 'resources/app.asar/dsh/node_modules/@deepseek-ai/dsh-persona-host/package.json')], 90_000)
  console.log(`SHARP-RASTER ${JSON.stringify(rasterized)}`)
  if (rasterized.ok !== true) throw new Error(`The packaged runtime cannot rasterize an SVG with sharp (the v1.1 image features need it): ${rasterized.error ?? JSON.stringify(rasterized)}`)
  imageGate = rasterized
}
// D-101 (item 20): the manifest of on-demand components travels with the app; without it the voice model stays 'unavailable' (the model itself is
// downloaded on demand, so only the manifest is judged here).
const componentsGate = componentsGateOf(join(dirname(exe), 'resources'))
console.log(`COMPONENTS ${JSON.stringify(componentsGate)}`)
if (!componentsGate.ok) throw new Error(`The package has no valid components.json with the voice model (D-101): ${componentsGate.problems.join('; ')}`)
const results = []
// --real-theme: pin the REAL native theme per run through PERSONA_THEME (P0-7) instead of faking dark by writing the DOM attribute.
const realTheme = process.argv.includes('--real-theme')
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
      ...(realTheme ? { PERSONA_THEME: dark ? 'dark' : 'light' } : {}),
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
    if (dark && !realTheme) {
      await page.evaluate(() => document.documentElement.setAttribute('data-ds-theme-source', 'dark'))
      await page.waitForFunction(() => matchMedia('(prefers-color-scheme: dark)').matches)
    }
    // The forced theme must reach the renderer by the real path. FIRST FRAME (splash or boot error): prefers-color-scheme follows the
    // forced nativeTheme. After the app MOUNTS: the app writes data-ds-dark-theme="true" in dark and REMOVES it in light (Keel's contract).
    // data-ds-dark-theme lives on <body> (preload-windows.ts observes it there), not on <html>.
    const themeSeen = () => page.evaluate(() => ({
      prefersDark: matchMedia('(prefers-color-scheme: dark)').matches,
      darkAttribute: document.body?.getAttribute('data-ds-dark-theme') ?? null,
      themeSource: document.documentElement.getAttribute('data-ds-theme-source'),
    }))
    let theme
    if (realTheme) {
      // Playwright over CDP emulates prefers-color-scheme: light by default, which hides the real nativeTheme (and made the
      // installed dark theme look broken). Drop the emulation so what is measured and captured is what the person sees.
      await page.emulateMedia({ colorScheme: null })
      await page.waitForFunction(expectDark => matchMedia('(prefers-color-scheme: dark)').matches === expectDark, dark, { timeout: 20000 })
        .catch(async () => { throw new Error(`forced ${dark ? 'dark' : 'light'} theme did not reach the first frame: ${JSON.stringify(await themeSeen())}`) })
      theme = { firstFrame: await themeSeen() }
    }
    await savePng(page, join(output, dark ? 'dark-first-frame.png' : 'light-first-frame.png'))
    if (dark) {
      await page.locator('#boot-error-title').waitFor({ state: 'visible', timeout: 65000 })
      await savePng(page, join(output, 'dark-boot-error.png'))
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
    if (realTheme) {
      await page.waitForFunction(expectDark => (document.body?.getAttribute('data-ds-dark-theme') === 'true') === expectDark
        && matchMedia('(prefers-color-scheme: dark)').matches === expectDark, dark, { timeout: 20000 })
        .catch(async () => { throw new Error(`forced ${dark ? 'dark' : 'light'} theme did not reach the mounted app: ${JSON.stringify(await themeSeen())}`) })
      theme = { ...theme, mounted: await themeSeen() }
    }
    await savePng(page, join(output, dark ? 'dark-onboarding.png' : 'light-onboarding.png'))
    const text = await page.locator('#root').innerText()
    const resources = await page.evaluate(() => performance.getEntriesByType('resource')
      .map(entry => ({ path: new URL(entry.name).pathname, durationMs: Math.round(entry.duration) }))
      .sort((a, b) => b.durationMs - a.durationMs).slice(0, 12))
    const profile = await profiler.send('Profiler.stop')
    writeFileSync(join(output, dark ? 'dark.cpuprofile' : 'light.cpuprofile'), JSON.stringify(profile.profile))
    // P0-6: the harness's own splash ("HARNESS" / "Loading plugins…") must not stay in the DOM under the app (a screen reader
    // reads it in English), and the house fonts must be loaded for the splash and the error page.
    const harness = await page.evaluate(() => ({
      harnessBootNodes: document.querySelectorAll('[data-dsh-boot]').length,
      loadingPluginsText: (document.body.innerText + document.body.textContent).includes('Loading plugins'),
      fonts: Object.fromEntries(['Fredoka', 'Nunito'].map(family => [family, document.fonts.check(`16px "${family}"`)])),
    }))
    const vault = vaultHome ? readVaultProof(join(home, 'home'), dark) : undefined
    results.push({ dark, elapsedMs: Date.now() - started, retry: dark, text: text.slice(0, 800), consoleErrors, resources,
      harness, ...(theme ? { theme } : {}), ...(vault ? { vault } : {}) })
    console.log(JSON.stringify(results.at(-1)))
    if (consoleErrors.length) throw new Error(`Renderer errors: ${consoleErrors.join('; ')}`)
  } finally {
    await browser?.close().catch(() => {})
    if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    writeFileSync(join(output, dark ? 'dark.log' : 'light.log'), log.join(''))
  }
}
writeFileSync(join(output, 'proof.json'), JSON.stringify({ commit: manifest.dshBuildCommit, archive, engineGate, imageGate, componentsGate, results }, null, 2) + '\n')
