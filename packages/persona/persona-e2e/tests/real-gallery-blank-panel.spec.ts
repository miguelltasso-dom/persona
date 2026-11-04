/**
 * Keel P1 + panel gate: blank cream, stuck loading, console fatals, onboarding overlay.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isMainPanelBlank, measureMainPanelContent } from '../src/real-gallery/blank-main-panel.ts'
import { navigateGalleryPanel, resetGalleryHome } from '../src/real-gallery/navigate-panel.ts'
import { realGalleryHealthPanelSpecs } from '../src/real-gallery/panels.ts'
import {
  createPanelConsoleTripwire,
  measureOnboardingOverlayViolation,
  measureRemoteStorm,
  measureStuckLoading,
} from '../src/real-gallery/panel-gate.ts'

const STORM_PANELS = new Set(['conhecimento', 'uso', 'aprovacoes', 'rotinas', 'arquivos', 'conexoes'])
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run).sequential('real gallery — panel health (1280×720 light, dev seed)', () => {
  let session: RealPersonaSession
  const navPanels = realGalleryHealthPanelSpecs()

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
      const mark = tripwire.mark()
      await navigateGalleryPanel(session.page, spec)

      const overlay = await measureOnboardingOverlayViolation(session.page)
      if (overlay.violated) {
        tripwire.detach(session.page)
        expect.fail(`onboarding-overlay — ${overlay.detail}`)
      }

      const stuck = await measureStuckLoading(session.page)
      const fatals = tripwire.fatalCountSince(mark)
      const main = await measureMainPanelContent(session.page)
      tripwire.detach(session.page)

      if (fatals > 0) {
        expect.fail(`console-fatal (${String(fatals)}) — ${tripwire.fatalsSince(mark).join(' | ').slice(0, 400)}`)
      }
      expect(stuck.stuck, `stuck-loading — ${stuck.detail}`).toBe(false)
      expect(isMainPanelBlank(main), `blank — ${main.detail}`).toBe(false)
      if (STORM_PANELS.has(spec.slug)) {
        const storm = await measureRemoteStorm(session.page)
        expect(storm.overLimit, `remote-storm — ${storm.detail}`).toBe(false)
      }
      if (spec.slug !== 'visao-geral') {
        await resetGalleryHome(session.page)
      }
    }, spec.slug === 'geral' || spec.slug === 'canais' ? 240_000 : 120_000)
  }
})
