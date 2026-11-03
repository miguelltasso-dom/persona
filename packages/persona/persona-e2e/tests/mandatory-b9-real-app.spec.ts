import { existsSync } from 'node:fs'
import { mkdir } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
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
} from '../src/real-app-session.ts'
import { checkReducedMotionOnPersonaPage } from '../src/motion-jank.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'
const REFERENCE = join(REPO_ROOT, 'persona-assets', 'references', 'dirD-tela.png')

/**
 * B9 real app (Keel): persona-host + client-ui-persona — not isolated HTML previews.
 * Tier 1 web; Tier 2 reuses the same flows in smoke-desktop when CDP is stable.
 */
describe.skipIf(!runPersonaE2e)('persona-e2e mandatory-b9 (real app, profile persona)', () => {
  it('Tier 1: boots without Harness shell; zero console errors', async () => {
    const session = await openRealPersonaApp()
    try {
      await assertNotHarnessShell(session.page)
      await completeOnboardingOverlay(session.page)
      assertConsoleClean(session.tripwire)
    } finally {
      await session.close()
    }
  }, 360_000)

  it('Tier 1: onboarding completo em home limpo → #geral composer', async () => {
    const session = await openRealPersonaApp()
    try {
      await assertNotHarnessShell(session.page)
      await completeOnboardingOverlay(session.page)
      await session.page.getByPlaceholder(chat.composerPlaceholder).waitFor({ state: 'visible' })
      await session.page.getByText('Geral', { exact: true }).waitFor({ state: 'visible' })
      assertConsoleClean(session.tripwire)
    } finally {
      await session.close()
    }
  }, 360_000)

  it('Tier 1: kanban global visível após navegação', async () => {
    const session = await openRealPersonaApp()
    try {
      await completeOnboardingOverlay(session.page)
      await selectSidebarPanel(session.page, shell.kanban)
      await session.page.locator('[data-persona-kanban="global"]').waitFor({ state: 'visible' })
      assertConsoleClean(session.tripwire)
    } finally {
      await session.close()
    }
  }, 360_000)

  it('Tier 1: composer aceita rascunho (envio ainda sem runner)', async () => {
    const session = await openRealPersonaApp()
    try {
      await completeOnboardingOverlay(session.page)
      const textarea = session.page.getByPlaceholder(chat.composerPlaceholder)
      await textarea.fill('Probe: mensagem de teste E2E')
      expect(await session.page.getByRole('button', { name: chat.send }).isEnabled()).toBe(true)
      assertConsoleClean(session.tripwire)
    } finally {
      await session.close()
    }
  }, 360_000)

  it('Tier 1: reduced-motion no shell real', async () => {
    const session = await openRealPersonaApp()
    try {
      await completeOnboardingOverlay(session.page)
      const motion = await checkReducedMotionOnPersonaPage(session.page)
      expect(motion.pass, `transition ${motion.transitionDurationMs}ms reduced=${motion.reducedMedia}`).toBe(true)
      assertConsoleClean(session.tripwire)
    } finally {
      await session.close()
    }
  }, 360_000)

  it('Tier 1: diff visual vs dirD-tela.png (informacional)', async () => {
    const session = await openRealPersonaApp()
    try {
      await completeOnboardingOverlay(session.page)
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
      assertConsoleClean(session.tripwire)
    } finally {
      await session.close()
    }
  }, 360_000)

  it.todo('Tier 1: enviar mensagem no #geral e ver resposta do runner scriptado / fake CLI')
  it.todo('Tier 1: kanban reflete tarefa criada pelo host após mensagem')
  it.todo('Tier 1: criar e editar persona na superfície Equipe/Members')
  it.todo('Tier 2 desktop: mesmo fluxo B9 via CDP (smoke-desktop)')
})
