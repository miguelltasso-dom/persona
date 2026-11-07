/**
 * BUG-QUIT-1 measurement tooling (not product): bring an already running Persona.exe (started by bug-quit.mjs with a remote-debugging port,
 * a temp home and the fake CLI on PATH with a LONG turn) to "a turn is in flight", then let go of it.
 *
 *   node --import tsx/esm turn-driver.mjs <cdpPort> <fakeCliLog>
 *
 * Walks onboarding to the first delivery (Probe's `walkOnboardingToStep5`), asks for it, waits until the fake CLI logged a turn (the stub logs `turn` when the
 * user message ARRIVES, before its FAKE_CLI_TURN_MS sleep, so the stub process is then alive and sleeping), prints one JSON line and disconnects (a connected
 * debugger is an artifact on quit, so it must not stay attached).
 *
 * It is plain .mjs on purpose: the root `tsc -p tsconfig.host.json` aggregate type-checks every scripts/**\/*.ts, and a typed copy of this file broke the pack's
 * host aggregate gate (TS2307 'playwright', TS7006) on the 07/11 rehearsal.
 */
import { createRequire } from 'node:module'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { firstDeliveryCopy, walkOnboardingToStep5 } from '../../../packages/persona/persona-e2e/src/first-delivery-flow.ts'
import { onboarding } from '../../../packages/persona/persona-e2e/src/real-app-locale.pt.ts'

const require = createRequire(new URL('../../../packages/persona/persona-e2e/package.json', import.meta.url))
const { chromium } = require('playwright')

const [cdpPort, fakeLog] = process.argv.slice(2)
if (cdpPort === undefined || fakeLog === undefined) throw new Error('usage: turn-driver.mjs <cdpPort> <fakeCliLog>')

const browser = await chromium.connectOverCDP(`http://127.0.0.1:${cdpPort}`)
try {
  const page = browser.contexts().flatMap(context => context.pages()).find(candidate => candidate.url().startsWith('dsh-app://app/'))
  if (page === undefined) throw new Error('no dsh-app://app/ page')
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 60_000 })
  await walkOnboardingToStep5(page, 'Quit Probe')
  await page.getByRole('button', { name: onboarding.requestNow, exact: true }).click()
  const started = Date.now()
  const turns = () => (existsSync(fakeLog) ? readFileSync(fakeLog, 'utf8').split('\n').filter(line => line.includes('"event":"turn"')).length : 0)
  const shot = join(dirname(fakeLog), 'turn-driver.png')
  const working = await page.getByText(firstDeliveryCopy.workingTitle).first().waitFor({ state: 'visible', timeout: 20_000 }).then(() => true, () => false)
  await page.screenshot({ path: shot }).catch(() => undefined)
  while (turns() === 0 && Date.now() - started < 45_000) await new Promise(resolve => setTimeout(resolve, 250))
  const body = (await page.locator('body').innerText().catch(() => '')).replace(/\s+/gu, ' ').slice(0, 700)
  console.log(JSON.stringify({ turnInFlight: turns() > 0, workingTitleSeen: working, waitedMs: Date.now() - started, body }))
} finally {
  await browser.close().catch(() => undefined)
}
