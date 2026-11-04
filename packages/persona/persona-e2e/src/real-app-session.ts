import type { Page } from 'playwright'
import { chat, onboarding, shell } from './real-app-locale.pt.ts'
import { startWebHost, type WebHostHandle } from './web-host.ts'
import { watchConsole, assertConsoleClean, type ConsoleTripwire } from './console-tripwire.ts'
import { withFakeCliOnPath, withNoEngineOnPath, type FakeCliOptions, type FakeCliPathScope } from './fake-cli.ts'
import { dismissBlockingOverlays } from './boot-gate-bootstrap.ts'
import { waitForGeralComposer } from './geral-composer.ts'
import { navigateGalleryPanel, resetGalleryHome } from './real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from './real-gallery/panels.ts'

const geralPanel = REAL_GALLERY_PANELS.find(p => p.slug === 'geral')!

export interface RealPersonaSession {
  readonly host: WebHostHandle
  readonly page: Page
  readonly tripwire: ConsoleTripwire
  readonly fakeCli: FakeCliPathScope
  close(): Promise<void>
}

export interface OpenRealPersonaAppOptions {
  /** Set `persona.onboarding.complete.v1` before first navigation (no reload). */
  dismissOnboardingViaStorage?: boolean
  /** Set `persona.devSeed.v1` before first navigation (boot gate roster). */
  devSeed?: boolean
  /** Force Lumen `mockLargeOrgChart` roster (60 or 150) for Quem cuida de quem captures. */
  orgChartScaleSeed?: 60 | 150
  viewport?: { width: number; height: number }
  /**
   * Engine the host sees. Default `fake` (stubs on PATH, OAR pinned to them). `{ kind: 'fake', ...FakeCliOptions }` adds
   * turn latency / failure / reply. `{ kind: 'none' }` hides every CLI and key (the "Falta uma IA" path).
   */
  engine?: ({ kind: 'fake' } & FakeCliOptions) | { kind: 'none' }
  /**
   * Boot the host the way the desktop does (live runner: `PERSONA_REAL_CLI=1`, not the scripted Vitest runner), so the
   * stubs actually answer turns. Without it `VITEST` leaks into the host and replies are scripted.
   */
  liveRunner?: boolean
  /** Leave the onboarding overlay on screen (skip `dismissBlockingOverlays`) so the test can walk steps 1–5. */
  keepOnboarding?: boolean
}

/**
 * Boot the real Persona profile (B9) in Chrome with console tripwire and fake CLIs on PATH.
 */
export async function openRealPersonaApp(options: OpenRealPersonaAppOptions = {}): Promise<RealPersonaSession> {
  const engine = options.engine ?? { kind: 'fake' as const }
  const fakeCli = engine.kind === 'none' ? withNoEngineOnPath() : withFakeCliOnPath(engine)
  const host = await startWebHost({
    profile: 'persona',
    ...(options.liveRunner === true ? { env: { VITEST: '', PERSONA_SCRIPTED: '', PERSONA_REAL_CLI: '1' } } : {}),
  })
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({
    locale: 'pt-BR',
    viewport: options.viewport ?? { width: 1440, height: 900 },
  })
  if (options.dismissOnboardingViaStorage || options.devSeed || options.orgChartScaleSeed !== undefined) {
    await context.addInitScript(({ onboarding, seed, orgScale }: { onboarding: boolean; seed: boolean; orgScale: string | null }) => {
      if (onboarding) localStorage.setItem('persona.onboarding.complete.v1', '1')
      if (seed) localStorage.setItem('persona.devSeed.v1', '1')
      if (orgScale !== null) localStorage.setItem('persona.orgChartScaleSeed', orgScale)
    }, {
      onboarding: options.dismissOnboardingViaStorage === true,
      seed: options.devSeed === true,
      orgScale: options.orgChartScaleSeed === undefined ? null : String(options.orgChartScaleSeed),
    })
  }
  const page = await context.newPage()
  const tripwire = watchConsole(page)
  await page.goto(host.url, { waitUntil: 'load', timeout: 120_000 })
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
  if (options.keepOnboarding !== true) await dismissBlockingOverlays(page).catch(() => {})

  return {
    host,
    page,
    tripwire,
    fakeCli,
    close: async () => {
      await context.close()
      await browser.close()
      fakeCli.restore()
      await host.stop()
    },
  }
}

/**
 * Fail when the upstream Harness conversation shell is still mounted (B9 must use Persona root only).
 * @param page - live Persona page.
 */
export async function assertNotHarnessShell(page: Page): Promise<void> {
  const harnessComposer = await page.locator('[data-composer-input]').count()
  if (harnessComposer > 0) {
    throw new Error('Harness ui-conversation composer detected — expected Persona shell (ui-layout disabled)')
  }
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible' })
}

/**
 * Walk the five-step onboarding overlay on a clean home (localStorage gate).
 * @param page - Persona page with overlay visible.
 */
export async function completeOnboardingOverlay(page: Page): Promise<void> {
  const continueBtn = () => page.getByRole('button', { name: onboarding.continue, exact: true })
  if (await page.getByRole('heading', { name: onboarding.step1Title }).count() === 0) return

  await page.getByPlaceholder(onboarding.step1Placeholder).fill('Probe E2E')
  await continueBtn().click()
  await page.getByText(onboarding.step2VaultBadge).waitFor({ state: 'visible' })
  await page.getByPlaceholder('Descreva em linguagem natural ou cole um texto…').fill('Empresa fictícia para E2E.')
  await continueBtn().click()
  await page.getByRole('heading', { name: onboarding.step3Title }).waitFor({ state: 'visible' })
  await continueBtn().click()
  await page.getByRole('button', { name: onboarding.step4TemplateBlank }).click()
  await continueBtn().click()
  const step5Heading = page.getByRole('heading', { name: onboarding.step5Title })
  const step5LegacyHeading = page.getByRole('heading', { name: onboarding.step5TitleLegacy })
  await step5Heading.or(step5LegacyHeading).first().waitFor({ state: 'visible', timeout: 30_000 })

  const enterAppBtn = page.getByRole('button', { name: onboarding.enterApp })
  const finishBtn = page.getByRole('button', { name: onboarding.finish })
  if (await enterAppBtn.count() > 0) {
    await enterAppBtn.click()
  } else {
    await finishBtn.click()
  }
  await step5Heading.or(step5LegacyHeading).first().waitFor({ state: 'hidden', timeout: 30_000 }).catch(() => {})
  await waitForGeralComposer(page, 60_000)
}

/**
 * @param page - Persona page.
 * @param panelLabel - sidebar label from shell.pt locale.
 */
export async function selectSidebarPanel(page: Page, panelLabel: string): Promise<void> {
  await page.getByRole('button', { name: panelLabel, exact: true }).click()
}

/**
 * Open #geral channel composer (Visão geral does not mount the channel view).
 */
export async function ensureGeralComposer(page: Page): Promise<void> {
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
  let lastError: unknown
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await resetGalleryHome(page)
      await navigateGalleryPanel(page, geralPanel)
      await waitForGeralComposer(page, 45_000)
      return
    } catch (error) {
      lastError = error
    }
  }
  throw lastError
}

export { assertConsoleClean, shell, chat, onboarding }
