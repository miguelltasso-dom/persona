/**
 * Layer-2 E2E v1 close: live persona host + Uso panel, then engine/host gates
 * via subprocess (no remount). Probe: PERSONA_E2E=1.
 */
import { expect, it } from 'vitest'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'
import { openRealPersonaApp } from '../src/real-app-session.ts'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const run = process.env.PERSONA_E2E === '1'

it.skipIf(!run)('E2E v1: Uso e limites no host + measureV1CloseView / assertV1Close', async () => {
  const session = await openRealPersonaApp({ dismissOnboardingViaStorage: true, devSeed: true })
  try {
    const uso = REAL_GALLERY_PANELS.find(p => p.slug === 'uso')
    expect(uso).toBeDefined()
    if (uso !== undefined) await navigateGalleryPanel(session.page, uso)
    await session.page.locator('body').waitFor({ state: 'visible', timeout: 30_000 })
    runVitestSubprocess('packages/persona/persona-engine/tests/v1-close.spec.ts')
    runVitestSubprocess('packages/persona/persona-host/tests/token-opt.spec.ts', [
      '-t',
      'persists TurnLedgerEntry kinds and folds the Uso panel',
    ])
  } finally {
    await session.close()
  }
}, 360_000)
