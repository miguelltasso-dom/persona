import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { ARTIFACTS_DIR, REPO_ROOT } from '../src/paths.ts'
import { comparePngFiles } from '../src/visual-diff/png-compare.ts'
import {
  assertNotHarnessShell,
  assertConsoleClean,
  chat,
  ensureGeralComposer,
  openRealPersonaApp,
  selectSidebarPanel,
  shell,
  type RealPersonaSession,
} from '../src/real-app-session.ts'
import { checkReducedMotionOnPersonaPage } from '../src/motion-jank.ts'
import { geralComposerLocator } from '../src/geral-composer.ts'
import { resetGalleryHome } from '../src/real-gallery/navigate-panel.ts'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'
const REFERENCE = join(REPO_ROOT, 'persona-assets', 'references', 'dirD-tela.png')

/**
 * B9 real app (Keel): persona-host + client-ui-persona — not isolated HTML previews.
 * Tier 1 web; one host boot per file (sequential).
 */
describe.skipIf(!runPersonaE2e)('persona-e2e mandatory-b9 (real app, profile persona)', () => {
  describe.sequential('Tier 1 web (shared session)', () => {
    let session: RealPersonaSession

    beforeAll(async () => {
      session = await openRealPersonaApp({
        dismissOnboardingViaStorage: true,
        devSeed: true,
        viewport: { width: 1280, height: 720 },
      })
      await session.page.waitForTimeout(2_000)
      await assertNotHarnessShell(session.page)
    }, 360_000)

    afterAll(async () => {
      await session?.close()
    }, 60_000)

    it('zero console errors after onboarding', () => {
      assertConsoleClean(session.tripwire)
    })

    it('#geral composer visible', async () => {
      await ensureGeralComposer(session.page)
      await session.page.getByRole('heading', { name: 'Geral', exact: true }).waitFor({ state: 'visible' })
      expect(await geralComposerLocator(session.page).first().isVisible()).toBe(true)
    }, 180_000)

    it('kanban global after navigation', async () => {
      await selectSidebarPanel(session.page, shell.kanban)
      await session.page.locator('[data-persona-surface="boards"]').waitFor({ state: 'visible' })
      await selectSidebarPanel(session.page, shell.channels)
    })

    it('composer draft enables send (runner wire pending)', async () => {
      await resetGalleryHome(session.page)
      await ensureGeralComposer(session.page)
      const textarea = session.page.locator('[data-persona-area="composer"] textarea')
      await textarea.waitFor({ state: 'visible', timeout: 60_000 })
      await textarea.fill('Probe: mensagem de teste E2E')
      expect(await session.page.getByRole('button', { name: chat.send, exact: true }).isEnabled()).toBe(true)
    }, 180_000)

    it('reduced-motion on live shell', async () => {
      const motion = await checkReducedMotionOnPersonaPage(session.page)
      expect(motion.pass, `transition ${motion.transitionDurationMs}ms reduced=${motion.reducedMedia}`).toBe(true)
    })

    it('diff visual vs dirD-tela.png (informacional)', async () => {
      await session.page.waitForTimeout(2_000)
      await mkdir(ARTIFACTS_DIR, { recursive: true })
      const shot = join(ARTIFACTS_DIR, 'b9-real-app-light.png')
      await session.page.screenshot({ path: shot, animations: 'disabled' })
      if (existsSync(REFERENCE)) {
        const { chromium } = await import('playwright')
        const browser = await chromium.launch({ channel: 'chrome' })
        const diffPage = await browser.newPage()
        try {
          const ref = await comparePngFiles(diffPage, shot, REFERENCE, {
            width: 1440,
            height: 900,
            maxDiffRatio: 0.62,
          })
          expect(ref.diffRatio).toBeLessThanOrEqual(1)
          if (process.env.PERSONA_E2E_STRICT_DIRD === '1') {
            expect(ref.pass, `dirD diff ${(ref.diffRatio * 100).toFixed(2)}%`).toBe(true)
          }
        } finally {
          await diffPage.close()
          await browser.close()
        }
      }
    }, 120_000)
  })

  it.skipIf(!runPersonaE2e)(
    'Tier 1: #geral → resposta do runner; Tarefa no quadro; criar e editar persona (B8-1..4, host próprio, runner scriptado)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/real-b8-app.spec.ts', [], { inheritPersonaE2e: true }) },
    900_000,
  )
  it.skipIf(!runPersonaE2e)(
    'Tier 2 desktop: onboarding + #geral + Quadros + ponte nativa do seletor de pasta (B8-5, Electron via CDP)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/real-desktop-app.spec.ts', [], { inheritPersonaE2e: true }) },
    1_200_000,
  )
})
