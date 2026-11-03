// Onboarding steps only (separate home); use when main panels already captured.
// node scripts/persona/with-lock.mjs "Probe gallery onboarding" -- node --import tsx/esm scripts/persona/capture-real-gallery-onboarding.mjs
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import { randomUUID } from 'node:crypto'
import { REAL_GALLERY_DIR } from '../../packages/persona/persona-e2e/src/real-gallery/capture.ts'
import { GALLERY_THEMES, GALLERY_VIEWPORTS } from '../../packages/persona/persona-e2e/src/real-gallery/panels.ts'
import { E2E_TMP_ROOT } from '../../packages/persona/persona-e2e/src/paths.ts'
import { startWebHost } from '../../packages/persona/persona-e2e/src/web-host.ts'
import { scanAccessibility } from '../../packages/persona/persona-e2e/src/axe-check.ts'
import { onboarding } from '../../packages/persona/persona-e2e/src/real-app-locale.pt.ts'

process.env.PERSONA_HOST_NO_LOCK = '1'
await mkdir(REAL_GALLERY_DIR, { recursive: true })
const home = join(E2E_TMP_ROOT, `gallery-onboarding-${randomUUID()}`)
const host = await startWebHost({ profile: 'persona', home })
const { chromium } = await import('playwright')
const browser = await chromium.launch({ channel: 'chrome' })
const rows = []
try {
  const continueExact = (page) => page.getByRole('button', { name: onboarding.continue, exact: true })
  for (const viewport of GALLERY_VIEWPORTS) {
    for (const theme of GALLERY_THEMES) {
      const context = await browser.newContext({
        locale: 'pt-BR',
        viewport: { width: viewport.width, height: viewport.height },
        colorScheme: theme,
      })
      const page = await context.newPage()
      await page.goto(host.url, { waitUntil: 'load', timeout: 120_000 })
      await page.getByRole('heading', { name: onboarding.step1Title }).waitFor({ state: 'visible', timeout: 180_000 })
      for (const step of [1, 2, 3, 4, 5]) {
        const file = `onboarding-passo-${String(step)}-${theme}-${viewport.tag}.png`
        await page.screenshot({ path: join(REAL_GALLERY_DIR, file), animations: 'disabled' })
        const axe = await scanAccessibility(page)
        rows.push({ panel: `onboarding-passo-${step}`, file, axe })
        if (step === 1) {
          await page.getByPlaceholder(onboarding.step1Placeholder).fill('Galeria Probe')
          await continueExact(page).click()
        } else if (step === 2) {
          await page.getByPlaceholder('Descreva em linguagem natural ou cole um texto…').fill('Contexto E2E.')
          await continueExact(page).click()
        } else if (step === 3) await continueExact(page).click()
        else if (step === 4) {
          await page.getByRole('button', { name: onboarding.step4TemplateBlank }).click()
          await continueExact(page).click()
        }
        if (step < 5) await page.waitForTimeout(400)
      }
      await context.close()
    }
  }
} finally {
  await browser.close()
  await host.stop()
}
import { execFileSync } from 'node:child_process'
execFileSync(process.execPath, ['--import', 'tsx/esm', 'scripts/persona/finish-real-gallery-index.mjs'], { cwd: process.cwd(), stdio: 'inherit' })
console.log(`onboarding captures: ${String(rows.length)} screenshot sets`)
