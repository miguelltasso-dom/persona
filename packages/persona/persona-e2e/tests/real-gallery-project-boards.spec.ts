/**
 * PB-9+ gallery smoke — Quadros (`data-persona-surface="boards"`).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dismissBlockingOverlays } from '../src/boot-gate-bootstrap.ts'
import { isMainPanelBlank, measureMainPanelContent } from '../src/real-gallery/blank-main-panel.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { createPanelConsoleTripwire, measureStuckLoading } from '../src/real-gallery/panel-gate.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'
const boards = REAL_GALLERY_PANELS.find(p => p.slug === 'kanban')!

describe.skipIf(!run)('real gallery — project boards (PB-9+)', () => {
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

  it(`[${boards.owner}] ${boards.slug}: Quadros surface mounts`, async () => {
    const tripwire = createPanelConsoleTripwire()
    tripwire.attach(session.page)
    const mark = tripwire.mark()
    await navigateGalleryPanel(session.page, boards)

    const stuck = await measureStuckLoading(session.page)
    const main = await measureMainPanelContent(session.page)
    const fatals = tripwire.fatalCountSince(mark)
    tripwire.detach(session.page)

    expect(fatals).toBe(0)
    expect(stuck.stuck, stuck.detail).toBe(false)
    expect(isMainPanelBlank(main), main.detail).toBe(false)
    await session.page.locator('[data-persona-surface="boards"]').waitFor({ state: 'visible', timeout: 60_000 })
    await session.page.getByRole('button', { name: /Novo projeto/i }).waitFor({ state: 'visible', timeout: 30_000 })
    expect(await session.page.locator('[data-persona-boards]').count()).toBeGreaterThan(0)
    await dismissBlockingOverlays(session.page)
  }, 120_000)
})
