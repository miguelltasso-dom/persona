/**
 * Keel: stuck loading, console fatals, Remote storm, onboarding overlay with cache complete.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import {
  createPanelConsoleTripwire,
  measureOnboardingOverlayViolation,
  measureRemoteStorm,
  measureStuckLoading,
} from '../src/real-gallery/panel-gate.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'

/** Lumen Remote panels Keel called out + full nav sweep. */
const STORM_PANELS = new Set(['conhecimento', 'uso', 'aprovacoes', 'rotinas', 'arquivos', 'conexoes'])

describe.skipIf(!run)('real gallery — panel gate (loading, console, storm)', () => {
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
    it(`[${spec.owner}] ${spec.slug}: not stuck loading (>5s)`, async () => {
      const tripwire = createPanelConsoleTripwire()
      tripwire.attach(session.page)
      await navigateGalleryPanel(session.page, spec)
      const overlay = await measureOnboardingOverlayViolation(session.page)
      if (overlay.violated) {
        tripwire.detach(session.page)
        expect.fail(`[${spec.owner}] ${spec.slug}: onboarding-overlay — ${overlay.detail}`)
      }
      const stuck = await measureStuckLoading(session.page)
      const fatals = tripwire.fatalCount()
      tripwire.detach(session.page)
      if (fatals > 0) {
        expect.fail(
          `[${spec.owner}] ${spec.slug}: console-fatal (${String(fatals)}) — ${tripwire.fatals().join(' | ').slice(0, 400)}`,
        )
      }
      expect(stuck.stuck, `[${spec.owner}] ${spec.slug}: stuck-loading — ${stuck.detail}`).toBe(false)
    }, 120_000)
  }

  for (const spec of navPanels.filter(p => STORM_PANELS.has(p.slug))) {
    it(`[${spec.owner}] ${spec.slug}: Remote ws storm ≤ limit (3s idle)`, async () => {
      await navigateGalleryPanel(session.page, spec)
      await measureStuckLoading(session.page)
      const storm = await measureRemoteStorm(session.page)
      expect(
        storm.overLimit,
        `[${spec.owner}] ${spec.slug}: remote-storm — ${storm.detail}`,
      ).toBe(false)
    }, 90_000)
  }
})
