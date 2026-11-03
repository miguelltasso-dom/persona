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
  completeOnboardingOverlay,
  openRealPersonaApp,
  selectSidebarPanel,
  shell,
  type RealPersonaSession,
} from '../src/real-app-session.ts'
import { checkReducedMotionOnPersonaPage } from '../src/motion-jank.ts'

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
      session = await openRealPersonaApp()
      await assertNotHarnessShell(session.page)
      await completeOnboardingOverlay(session.page)
    }, 360_000)

    afterAll(async () => {
      await session?.close()
    }, 60_000)

    it('zero console errors after onboarding', () => {
      assertConsoleClean(session.tripwire)
    })

    it('#geral composer visible', async () => {
      await session.page.getByPlaceholder(chat.composerPlaceholder).waitFor({ state: 'visible' })
      await session.page.getByText('Geral', { exact: true }).waitFor({ state: 'visible' })
    })

    it('kanban global after navigation', async () => {
      await selectSidebarPanel(session.page, shell.kanban)
      await session.page.locator('[data-persona-kanban="global"]').waitFor({ state: 'visible' })
      await selectSidebarPanel(session.page, shell.channels)
    })

    it('composer draft enables send (runner wire pending)', async () => {
      const textarea = session.page.getByPlaceholder(chat.composerPlaceholder)
      await textarea.fill('Probe: mensagem de teste E2E')
      expect(await session.page.getByRole('button', { name: chat.send }).isEnabled()).toBe(true)
    })

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
    })
  })

  it.todo('Tier 1: enviar mensagem no #geral e ver resposta do runner scriptado / fake CLI (Rivet/Anvil host wire)')
  it.todo('Tier 1: kanban reflete tarefa criada pelo host após mensagem (Anvil store + host events)')
  it.todo('Tier 1: criar e editar persona na superfície Equipe/Members (Prism + host)')
  it.todo('Tier 2 desktop: onboarding + kanban + composer (smoke-desktop só boot shell hoje)')
})
