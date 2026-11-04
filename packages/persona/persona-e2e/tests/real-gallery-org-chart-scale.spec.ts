/**
 * Quem cuida de quem — OrgMap at 60/150 (GOVERNANCE-SPEC § muitas personas).
 * Muse captures: `.maestri/tmp/shots/design/orgchart-scale/` after `PERSONA_E2E=1`.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { dismissBlockingOverlays } from '../src/boot-gate-bootstrap.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'
const orgPanel = REAL_GALLERY_PANELS.find(p => p.slug === 'org-chart')

describe.skipIf(!run || orgPanel === undefined)('real gallery — org chart scale (OrgMap)', () => {
  let session: RealPersonaSession

  beforeAll(async () => {
    session = await openRealPersonaApp({
      dismissOnboardingViaStorage: true,
      devSeed: true,
      orgChartScaleSeed: 150,
      viewport: { width: 1440, height: 900 },
    })
    await session.page.waitForTimeout(2_000)
  }, 360_000)

  afterAll(async () => {
    await session?.close()
  }, 60_000)

  it('[Lumen] 150 personas: OrgMap toolbar + search (locale governance org.map.*)', async () => {
    await navigateGalleryPanel(session.page, orgPanel!)
    await session.page.locator('[data-persona-surface="org-chart"]').waitFor({ state: 'visible', timeout: 60_000 })
    await session.page.getByRole('combobox', { name: 'Encontrar persona' }).waitFor({ state: 'visible', timeout: 30_000 })
    await session.page.getByText('Caber na tela').waitFor({ state: 'visible', timeout: 15_000 })
    await session.page.getByText('Abrir todos').waitFor({ state: 'visible', timeout: 15_000 })
    const subtitle = await session.page.locator('[data-persona-surface="org-chart"]').innerText()
    expect(subtitle).toMatch(/150|151/)
    await dismissBlockingOverlays(session.page)
  }, 120_000)

  it('[Lumen] list mode virtualizes (Abrir todos → rowcount ≥ 150)', async () => {
    await session.page.getByRole('tab', { name: 'Lista' }).click()
    await session.page.getByText('Abrir todos').click()
    const rowcount = await session.page.locator('[aria-rowcount]').first().getAttribute('aria-rowcount')
    expect(Number(rowcount)).toBeGreaterThanOrEqual(150)
  }, 60_000)
})

describe.skipIf(!run || orgPanel === undefined)('real gallery — org chart scale 60', () => {
  it('[Lumen] 60 personas: OrgMap mounts under 1 s after panel open', async () => {
    const local = await openRealPersonaApp({
      dismissOnboardingViaStorage: true,
      devSeed: true,
      orgChartScaleSeed: 60,
      viewport: { width: 1440, height: 900 },
    })
    try {
      const start = Date.now()
      await navigateGalleryPanel(local.page, orgPanel!)
      await local.page.locator('[data-persona-surface="org-chart"]').waitFor({ state: 'visible', timeout: 60_000 })
      await local.page.getByRole('combobox', { name: 'Encontrar persona' }).waitFor({ state: 'visible', timeout: 30_000 })
      expect(Date.now() - start).toBeLessThan(60_000)
    } finally {
      await local.close()
    }
  }, 180_000)
})
