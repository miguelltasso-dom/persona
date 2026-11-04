/**
 * Keel WS storm only (health checks live in real-gallery-blank-panel.spec.ts).
 * Filter: vitest -t "ws-storm"
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { measureRemoteStorm, measureStuckLoading } from '../src/real-gallery/panel-gate.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const run = process.env.PERSONA_E2E === '1'
const STORM_PANELS = new Set(['conhecimento', 'uso', 'aprovacoes', 'rotinas', 'arquivos', 'conexoes'])

describe.skipIf(!run).sequential('real gallery — ws-storm gate', () => {
  let session: RealPersonaSession
  const specs = REAL_GALLERY_PANELS.filter(p => STORM_PANELS.has(p.slug))

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

  for (const spec of specs) {
    it(`[${spec.owner}] ${spec.slug}: ws-storm ≤10 frames / 3s idle`, async () => {
      await navigateGalleryPanel(session.page, spec)
      await measureStuckLoading(session.page)
      const storm = await measureRemoteStorm(session.page)
      expect(storm.overLimit, `remote-storm — ${storm.detail}`).toBe(false)
    }, 90_000)
  }
})
