/**
 * WCAG axe + keyboard traversal on real Persona panels (Keel item 2).
 * Full matrix: run gallery first; this spec spot-checks nav panels at 1440×900.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { scanAccessibility } from '../src/axe-check.ts'
import { probeKeyboardTraversal } from '../src/real-gallery/keyboard.ts'
import { REAL_GALLERY_PANELS, type GalleryPanelSpec } from '../src/real-gallery/panels.ts'
import { completeOnboardingOverlay, openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const runA11y = process.env.PERSONA_A11Y === '1' || process.env.PERSONA_E2E === '1'

async function goPanel(page: Page, spec: GalleryPanelSpec): Promise<void> {
  if (spec.kind !== 'nav' && spec.kind !== 'settings') return
  await page.getByRole('button', { name: spec.navLabel, exact: true }).click()
  if (spec.slug === 'geral') {
    await page.getByPlaceholder('Mensagem para #geral…').waitFor({ state: 'visible', timeout: 60_000 })
  } else if (spec.readySelector !== undefined) {
    await page.locator(spec.readySelector).first().waitFor({ state: 'visible', timeout: 60_000 })
  } else {
    await page.waitForTimeout(600)
  }
}

describe.skipIf(!runA11y)('real-surface a11y (axe + keyboard)', () => {
  let session: RealPersonaSession

  beforeAll(async () => {
    session = await openRealPersonaApp()
    await completeOnboardingOverlay(session.page)
  }, 360_000)

  afterAll(async () => {
    await session?.close()
  }, 60_000)

  const navPanels = REAL_GALLERY_PANELS.filter(p => p.kind === 'nav' || p.kind === 'settings')

  for (const spec of navPanels) {
    it(`[${spec.owner}] ${spec.slug}: axe WCAG + Tab traversal`, async () => {
      await goPanel(session.page, spec)
      const axe = await scanAccessibility(session.page)
      if (!axe.skipped) {
        expect(axe.violations, `${spec.slug} axe violations`).toEqual([])
      }
      const kb = await probeKeyboardTraversal(session.page)
      expect(kb.pass, `${spec.slug}: ${kb.reason ?? kb.focusTags.join(' → ')}`).toBe(true)
    })
  }

  it.todo('[Prism] editor-persona: axe + keyboard when PersonaEditor mounts in shell')
  it.todo('[Muse] onboarding modal: Esc closes scrim without focus trap (5 steps)')
})
