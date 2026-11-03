/**
 * Keel P1: fail when main column is cream-only (never blank dashboard).
 * Owner tag in title routes bugs to Prism/Lumen/Muse via REAL_GALLERY_PANELS.owner.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isMainPanelBlank, measureMainPanelContent } from '../src/real-gallery/blank-main-panel.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run)('real gallery — main panel not blank (1280×720 light)', () => {
  let session: RealPersonaSession
  const navPanels = REAL_GALLERY_PANELS.filter(p => p.kind === 'nav' || p.kind === 'settings')

  beforeAll(async () => {
    session = await openRealPersonaApp({
      dismissOnboardingViaStorage: true,
      viewport: { width: 1280, height: 720 },
    })
    await session.page.waitForTimeout(2_000)
  }, 360_000)

  afterAll(async () => {
    await session?.close()
  }, 60_000)

  for (const spec of navPanels) {
    it(`[${spec.owner}] ${spec.slug}: main area has content (not blank cream)`, async () => {
      await navigateGalleryPanel(session.page, spec)
      const main = await measureMainPanelContent(session.page)
      expect(isMainPanelBlank(main), `${spec.slug} blank: ${main.detail}`).toBe(false)
    }, 90_000)
  }
})
