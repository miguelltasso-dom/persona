/**
 * GOV+ smoke — Quem cuida de quem + Saúde (mock/live Remote per Lumen GOV-6/7).
 * Full §4 acceptance stays in mandatory-governance.spec.ts until Anvil GOV-5.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isMainPanelBlank, measureMainPanelContent } from '../src/real-gallery/blank-main-panel.ts'
import { dismissBlockingOverlays } from '../src/boot-gate-bootstrap.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { createPanelConsoleTripwire, measureStuckLoading } from '../src/real-gallery/panel-gate.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'
const GOV_PANELS = REAL_GALLERY_PANELS.filter(p => p.slug === 'org-chart' || p.slug === 'team-health')

describe.skipIf(!run)('real gallery — governance surfaces (GOV+)', () => {
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

  for (const spec of GOV_PANELS) {
    it(`[${spec.owner}] ${spec.slug}: mounts, not blank, Por pessoa/setor or Saúde copy`, async () => {
      const tripwire = createPanelConsoleTripwire()
      tripwire.attach(session.page)
      const mark = tripwire.mark()
      await navigateGalleryPanel(session.page, spec)

      const stuck = await measureStuckLoading(session.page)
      const main = await measureMainPanelContent(session.page)
      const fatals = tripwire.fatalCountSince(mark)
      tripwire.detach(session.page)

      expect(fatals, tripwire.fatalsSince(mark).join(' | ')).toBe(0)
      expect(stuck.stuck, stuck.detail).toBe(false)
      expect(isMainPanelBlank(main), main.detail).toBe(false)

      if (spec.slug === 'org-chart') {
        await session.page.getByRole('tab', { name: 'Por pessoa' }).waitFor({ state: 'visible', timeout: 30_000 })
        await session.page.getByRole('tab', { name: 'Por setor' }).waitFor({ state: 'visible', timeout: 30_000 })
        await session.page.getByRole('tab', { name: 'Por setor' }).click()
        await session.page.locator('[data-persona-surface="org-chart"]').waitFor({ state: 'visible', timeout: 30_000 })
      } else {
        await session.page.locator('[data-persona-surface="team-health"]').waitFor({ state: 'visible', timeout: 30_000 })
        await session.page.getByText(/Saúde da equipe|Teste dos 2 dias/i).first().waitFor({ state: 'visible', timeout: 30_000 })
      }

      await dismissBlockingOverlays(session.page)
    }, 120_000)
  }
})
