/** One-off: timestamp cordis inspect sync console errors vs channel gate steps (Probe → Keel). */
import { spawn, execFileSync } from 'node:child_process'
import { mkdirSync } from 'node:fs'
import { createRequire } from 'node:module'

const root = 'C:/Users/migue/dev/persona'
const require = createRequire(`${root}/packages/persona/persona-e2e/package.json`)
const { chromium } = require('playwright')
const home = `${root}/.maestri/tmp/probe-inspect-timing-home`
mkdirSync(home, { recursive: true })
const env = { ...process.env, DSH_HOME: home, PERSONA_HOME: home, DSH_TELEMETRY_DISABLED: '1' }
const child = spawn(process.execPath, ['--import', 'tsx/esm', 'apps/cli/src/bin.ts', '--profile', 'persona', '--no-open'], { cwd: root, env, stdio: ['ignore', 'pipe', 'pipe'] })
let out = ''
const events = []
const log = (label) => {
  const t = Date.now()
  events.push(`${t} ${label}`)
  console.log(`${new Date(t).toISOString()} ${label}`)
}
child.stdout.on('data', (c) => { out += c.toString() })
child.stderr.on('data', (c) => { out += c.toString() })
const urlPromise = new Promise((resolve, reject) => {
  const deadline = Date.now() + 150_000
  const tick = () => {
    const match = /(http:\/\/127\.0\.0\.1:\d+\/\?token=[^\s]+)/.exec(out)
    if (match) return resolve(match[1])
    if (child.exitCode !== null) return reject(new Error(`host exited ${child.exitCode}`))
    if (Date.now() > deadline) return reject(new Error('timeout'))
    setTimeout(tick, 200)
  }
  tick()
})
try {
  const url = await urlPromise
  log('host url ready')
  const browser = await chromium.launch({ channel: 'chrome', headless: true })
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, locale: 'pt-BR' })
  const page = await ctx.newPage()
  page.on('console', (m) => {
    const text = m.text()
    if (text.includes('syncing inspect providers')) {
      log(`console.${m.type()} inspect-sync: ${text.slice(0, 120)}`)
    }
  })
  const noReload = process.argv.includes('--no-reload')
  log('goto start')
  await page.goto(url, { waitUntil: 'load' })
  log('goto done')
  if (!noReload) {
    await page.evaluate(() => { localStorage.setItem('persona.onboarding.complete.v1', '1') })
    log('localStorage set')
    await page.reload({ waitUntil: 'load' })
    log('reload done')
  } else {
    await page.waitForTimeout(6000)
    log('steady wait done (no reload)')
  }
  await page.waitForTimeout(6000)
  log('after 6s wait')
  await page.screenshot({ path: `${root}/.maestri/tmp/probe-inspect-channel.png` })
  log('screenshot done')
  await page.keyboard.press('Tab')
  await page.keyboard.press('Tab')
  log('tabs done')
  await ctx.close()
  log('context closed')
  await browser.close()
  log('browser closed')
  try { execFileSync('taskkill', ['/T', '/F', '/PID', String(child.pid)], { stdio: 'ignore' }) } catch { /* gone */ }
  log('host killed')
  console.log('\n--- timeline ---\n' + events.join('\n'))
} catch (error) {
  console.error(error)
  process.exit(1)
}
