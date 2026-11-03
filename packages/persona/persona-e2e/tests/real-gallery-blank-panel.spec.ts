/**
 * Keel P1 + panel gate: blank cream, stuck loading, console fatals, onboarding overlay.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isMainPanelBlank, measureMainPanelContent } from '../src/real-gallery/blank-main-panel.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import {
  createPanelConsoleTripwire,
  measureOnboardingOverlayViolation,
  measureStuckLoading,
} from '../src/real-gallery/panel-gate.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run)('real gallery — panel health (1280×720 light, dev seed)', () => {
  let session: RealPersonaSession
  const navPanels = REAL_GALLERY_PANELS.filter(p => p.kind === 'nav' || p.kind === 'settings')

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

  for (const spec of navPanels) {
    it(`[${spec.owner}] ${spec.slug}: panel health (not blank, not stuck loading, no console fatals)`, async () => {
      const tripwire = createPanelConsoleTripwire()
      tripwire.attach(session.page)
      await navigateGalleryPanel(session.page, spec)

      const overlay = await measureOnboardingOverlayViolation(session.page)
      if (overlay.violated) {
        tripwire.detach(session.page)
        expect.fail(`onboarding-overlay — ${overlay.detail}`)
      }

      const stuck = await measureStuckLoading(session.page)
      const fatals = tripwire.fatalCount()
      const main = await measureMainPanelContent(session.page)
      tripwire.detach(session.page)

      if (fatals > 0) {
        expect.fail(`console-fatal (${String(fatals)}) — ${tripwire.fatals().join(' | ').slice(0, 400)}`)
      }
      expect(stuck.stuck, `stuck-loading — ${stuck.detail}`).toBe(false)
      expect(isMainPanelBlank(main), `blank — ${main.detail}`).toBe(false)
    }, 120_000)
  }
})
