// Keel repro helper: panel gate against a running persona web host.
// Usage: node --import tsx/esm scripts/persona/keel-panel-diag.mjs http://127.0.0.1:3191/?token=...
import { chromium } from 'playwright'
import { REAL_GALLERY_PANELS } from '../../packages/persona/persona-e2e/src/real-gallery/panels.ts'
import { navigateGalleryPanel } from '../../packages/persona/persona-e2e/src/real-gallery/navigate-panel.ts'
import {
  createPanelConsoleTripwire,
  measureOnboardingOverlayViolation,
  measureRemoteStorm,
  measureStuckLoading,
} from '../../packages/persona/persona-e2e/src/real-gallery/panel-gate.ts'

const url = process.argv[2]
const slugs = new Set(['conhecimento', 'uso', 'aprovacoes'])
const specs = REAL_GALLERY_PANELS.filter(p => slugs.has(p.slug))

if (url === undefined) {
  console.error('usage: keel-panel-diag.mjs <persona-web-url>')
  process.exit(2)
}

const browser = await chromium.launch({ channel: 'chrome', headless: true })
try {
  const context = await browser.newContext({ locale: 'pt-BR', viewport: { width: 1280, height: 720 } })
  await context.addInitScript(() => {
    localStorage.setItem('persona.onboarding.complete.v1', '1')
    localStorage.setItem('persona.devSeed.v1', '1')
  })
  const page = await context.newPage()
  await page.goto(url, { waitUntil: 'load', timeout: 120_000 })
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })

  let failed = 0
  for (const spec of specs) {
    const tripwire = createPanelConsoleTripwire()
    tripwire.attach(page)
    await navigateGalleryPanel(page, spec)
    const overlay = await measureOnboardingOverlayViolation(page)
    const stuck = await measureStuckLoading(page)
    const storm = await measureRemoteStorm(page)
    const fatals = tripwire.fatalCount()
    tripwire.detach(page)
    const ok = !overlay.violated && !stuck.stuck && fatals === 0 && !storm.overLimit
    console.log(
      `[${spec.owner}] ${spec.slug}: ${ok ? 'PASS' : 'FAIL'} stuck=${String(stuck.stuck)} fatals=${String(fatals)} ws=${storm.detail} overlay=${overlay.detail}`,
    )
    if (!ok) failed += 1
  }
  process.exit(failed > 0 ? 1 : 0)
} finally {
  await browser.close()
}
