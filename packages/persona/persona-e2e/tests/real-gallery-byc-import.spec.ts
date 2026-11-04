/**
 * BYC-1b layer 2 — Importadores panel exposes BYC block (dev seed).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { measureStuckLoading } from '../src/real-gallery/panel-gate.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const importPanel = REAL_GALLERY_PANELS.find(p => p.slug === 'importar')!
const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run)('real gallery — BYC Importadores (BYC-1b)', () => {
  let session: RealPersonaSession

  beforeAll(async () => {
    session = await openRealPersonaApp({
      dismissOnboardingViaStorage: true,
      devSeed: true,
      viewport: { width: 1280, height: 720 },
    })
    await session.page.waitForTimeout(2_000)
  }, 360_000)

  afterAll(async () => {
    await session?.close()
  }, 60_000)

  it('[Lumen] importar: importers surface + BYC block without stuck loading', async () => {
    await navigateGalleryPanel(session.page, importPanel)
    await session.page.locator('[data-persona-surface="importers"]').waitFor({ state: 'visible', timeout: 60_000 })
    const stuck = await measureStuckLoading(session.page)
    expect(stuck.stuck, stuck.detail).toBe(false)
    await session.page.locator('[data-persona-byc]').first().waitFor({ state: 'visible', timeout: 30_000 })
    const title = session.page.getByRole('heading', { name: /Traga o que suas IAs já sabem/u })
    expect(await title.isVisible()).toBe(true)
  }, 120_000)
})
