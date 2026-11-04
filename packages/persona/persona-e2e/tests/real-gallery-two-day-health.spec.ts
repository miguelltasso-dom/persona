/**
 * Saúde — Teste dos 2 dias não degenerado (Lumen derive-two-day / preferDerivedTwoDay).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dismissBlockingOverlays } from '../src/boot-gate-bootstrap.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'
const healthPanel = REAL_GALLERY_PANELS.find(p => p.slug === 'team-health')

describe.skipIf(!run || healthPanel === undefined)('real gallery — two-day timeline (GOV-7)', () => {
  let session: RealPersonaSession

  beforeAll(async () => {
    session = await openRealPersonaApp({
      dismissOnboardingViaStorage: true,
      devSeed: true,
      viewport: { width: 1440, height: 900 },
    })
    await session.page.waitForTimeout(2_000)
  }, 360_000)

  afterAll(async () => {
    await session?.close()
  }, 60_000)

  it('[Lumen] Teste dos 2 dias region + at least two timeline rows', async () => {
    await navigateGalleryPanel(session.page, healthPanel!)
    await session.page.locator('[data-persona-surface="team-health"]').waitFor({ state: 'visible', timeout: 60_000 })
    const region = session.page.getByRole('region', { name: /Teste dos 2 dias|Two-day/i })
    await region.waitFor({ state: 'visible', timeout: 30_000 })
    const rows = region.locator('[data-two-day-row]')
    await expect.poll(async () => rows.count(), { timeout: 30_000 }).toBeGreaterThanOrEqual(2)
    await dismissBlockingOverlays(session.page)
  }, 120_000)
})
