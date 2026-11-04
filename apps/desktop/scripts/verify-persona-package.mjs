/** Inspect packaged resources and exercise startup/retry through the actual Electron binary. */
import { createRequire } from 'node:module'
import { spawn, spawnSync } from 'node:child_process'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { createServer } from 'node:net'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '../../..')
const require = createRequire(import.meta.url)
const builder = createRequire(require.resolve('electron-builder'))
const asar = createRequire(builder.resolve('app-builder-lib'))('@electron/asar')
const { chromium } = createRequire(join(root, 'packages/persona/persona-e2e/package.json'))('playwright')
const exe = resolve(process.argv[2])
const output = resolve(process.argv[3] ?? join(root, '.maestri/tmp/shots/rivet-d8'))
mkdirSync(output, { recursive: true })
const archive = join(dirname(exe), 'resources/app.asar')
const files = asar.listPackage(archive).map(file => file.replaceAll('\\', '/'))
for (const name of [
  '/dsh/node_modules/@deepseek-ai/dsh-desktop-host/config/electron.cordis.patch.yml',
  '/renderer/persona-boot/boot.html', '/renderer/persona-boot/boot.js', '/renderer/persona-boot/boot.css',
  '/renderer/persona-boot/assets/atlas-erro.webp', '/renderer/persona-boot/assets/atlas-disponivel.webp',
]) {
  if (!files.includes(name)) throw new Error(`Missing packaged resource: ${name}`)
  console.log(`ASAR OK ${name}`)
}
const manifest = JSON.parse(asar.extractFile(archive, 'package.json').toString())
console.log(`COMMIT ${manifest.dshBuildCommit}`)
const results = []
for (const dark of [false, true]) {
  const home = mkdtempSync(join(tmpdir(), 'persona-d8-proof-'))
  const socket = createServer()
  await new Promise(resolve => socket.listen(0, '127.0.0.1', resolve))
  const port = socket.address().port
  await new Promise(resolve => socket.close(resolve))
  const log = []
  const started = Date.now()
  const child = spawn(exe, [`--remote-debugging-port=${port}`, ...(dark ? ['--force-dark-mode'] : [])], {
    windowsHide: true,
    env: { ...process.env, ELECTRON_RUN_AS_NODE: '',
      PERSONA_HOME: join(home, 'home'), DSH_HOME: join(home, 'home'), DSH_PROFILE: 'persona',
      DSH_DESKTOP_USER_DATA_DIR: join(home, 'user'), DSH_TELEMETRY_DISABLED: '1',
      DSH_DESKTOP_WELCOME: '0', DSH_DESKTOP_UPDATES: '0',
      PERSONA_TEST_BOOT_FAILURE: dark ? '1' : '0',
    },
    stdio: ['ignore', 'pipe', 'pipe'],
  })
  child.stdout.on('data', chunk => log.push(chunk.toString()))
  child.stderr.on('data', chunk => log.push(chunk.toString()))
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
    const consoleErrors = []
    page.on('pageerror', error => consoleErrors.push(error.message))
    await page.screenshot({ path: join(output, dark ? 'dark-first-frame.png' : 'light-first-frame.png') })
    if (dark) {
      await page.locator('#boot-error-title').waitFor({ state: 'visible', timeout: 65000 })
      await page.screenshot({ path: join(output, 'dark-boot-error.png') })
      const focused = await page.locator('#boot-retry').evaluate(button => button.getRootNode().activeElement === button)
      if (!focused) throw new Error('Retry did not receive focus')
      await page.getByRole('button', { name: 'Tentar de novo', exact: true }).click()
    }
    await page.locator('#root').filter({ hasText: /Boas-vindas|Sua empresa|Sua equipe|PASSO 1|Passo 1|Como.*chama|Vamos/iu }).waitFor({ timeout: 90000 })
    await page.locator('#persona-boot-overlay').waitFor({ state: 'detached', timeout: 10000 })
    await page.screenshot({ path: join(output, dark ? 'dark-onboarding.png' : 'light-onboarding.png') })
    const text = await page.locator('#root').innerText()
    results.push({ dark, elapsedMs: Date.now() - started, retry: dark, text: text.slice(0, 800), consoleErrors })
    console.log(JSON.stringify(results.at(-1)))
    if (consoleErrors.length) throw new Error(`Renderer errors: ${consoleErrors.join('; ')}`)
  } finally {
    await browser?.close().catch(() => {})
    if (child.pid) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true })
    writeFileSync(join(output, dark ? 'dark.log' : 'light.log'), log.join(''))
  }
}
writeFileSync(join(output, 'proof.json'), JSON.stringify({ commit: manifest.dshBuildCommit, archive, results }, null, 2) + '\n')
