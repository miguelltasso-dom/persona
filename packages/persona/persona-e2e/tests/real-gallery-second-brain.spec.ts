/**
 * SB-5a layer 2 — Segundo cérebro home (dev seed, Empresa group).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { measureStuckLoading } from '../src/real-gallery/panel-gate.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const brainPanel = REAL_GALLERY_PANELS.find(p => p.slug === 'segundo-cerebro')!
const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run)('real gallery — Segundo cérebro (SB-5a)', () => {
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
  }, 180_000)

  it('[Lumen] segundo-cerebro: home surface without stuck loading', async () => {
    await navigateGalleryPanel(session.page, brainPanel)
    await session.page.locator('[data-persona-surface="second-brain"]').first().waitFor({ state: 'visible', timeout: 60_000 })
    const stuck = await measureStuckLoading(session.page)
    expect(stuck.stuck, stuck.detail).toBe(false)
    const title = session.page.getByRole('heading', { name: /Segundo cérebro/u })
    expect(await title.isVisible()).toBe(true)
  }, 120_000)
})
