// Atlas boot gate checks (Playwright). Usage: node --import tsx/esm scripts/persona/exec-bootstrap-gate.mjs <app-url>
import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const require = createRequire(join(dirname(fileURLToPath(import.meta.url)), '../../packages/persona/persona-e2e/package.json'))
const { chromium } = require('playwright')
import {
  formatBootstrapGateFailures,
  recordBootstrapPageError,
  runBootstrapGateChecks,
} from '../../packages/persona/persona-e2e/src/boot-gate-bootstrap.ts'

const url = process.argv[2]
if (url === undefined || url.length === 0) {
  console.error('usage: exec-bootstrap-gate.mjs <http://127.0.0.1:PORT/?token=...>')
  process.exit(2)
}

const pageErrors = []
const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({
    viewport: { width: 1440, height: 900 },
    colorScheme: 'light',
    locale: 'pt-BR',
  })
  await context.addInitScript(() => {
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    localStorage.setItem('persona.devSeed.v1', '1')
  })
  const page = await context.newPage()
  page.on('pageerror', (error) => {
    recordBootstrapPageError(pageErrors, `pageerror ${String(error).slice(0, 400)}`)
  })
  page.on('console', (m) => {
    if (m.type() === 'error') recordBootstrapPageError(pageErrors, `console.error ${m.text().slice(0, 400)}`)
  })
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 })
  const result = await runBootstrapGateChecks(page, pageErrors)
  const failures = formatBootstrapGateFailures(result)
  if (failures.length > 0) {
    console.error(['bootstrap gate FAILED:', ...failures].join('\n\n'))
    process.exit(1)
  }
  console.log(`bootstrap gate OK (${result.teamWaitDetail})`)
} finally {
  await browser.close()
}
