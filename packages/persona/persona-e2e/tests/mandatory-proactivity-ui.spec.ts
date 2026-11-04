/**
 * PRO-6 layer 2 smoke — Visão geral honest states + away panel chrome (full aceite still todo).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dismissBlockingOverlays } from '../src/boot-gate-bootstrap.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { geralComposerLocator } from '../src/geral-composer.ts'
import {
  assertConsoleClean,
  ensureGeralComposer,
  openRealPersonaApp,
  type RealPersonaSession,
} from '../src/real-app-session.ts'

const overviewPanel = REAL_GALLERY_PANELS.find(p => p.slug === 'visao-geral')!

const run = process.env.PERSONA_E2E === '1'

describe.skipIf(!run).sequential('mandatory proactivity — UI smoke (PRO-6 layer 2)', () => {
  let session: RealPersonaSession

  beforeAll(async () => {
    session = await openRealPersonaApp({
      dismissOnboardingViaStorage: true,
      devSeed: true,
      viewport: { width: 1280, height: 720 },
    })
    await session.page.waitForTimeout(1_500)
    await dismissBlockingOverlays(session.page)
  }, 360_000)

  afterAll(async () => {
    await session?.close()
  }, 60_000)

  it('Visão geral overview root + attention block (PRO-6; away panel only when awayEvents.length > 0)', async () => {
    await dismissBlockingOverlays(session.page)
    await navigateGalleryPanel(session.page, overviewPanel)
    await session.page.locator('[data-persona-root]').waitFor({ state: 'visible', timeout: 60_000 })
    await session.page.locator('#persona-attention-title').waitFor({ state: 'visible', timeout: 60_000 })
    assertConsoleClean(session.tripwire)
  }, 120_000)

  it('#geral composer reachable after channel nav (dispatch surface)', async () => {
    await dismissBlockingOverlays(session.page)
    await ensureGeralComposer(session.page)
    expect(await geralComposerLocator(session.page).first().isVisible()).toBe(true)
  }, 240_000)
})
