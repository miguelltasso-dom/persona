import type { Page } from 'playwright'
import { chat, onboarding, shell } from './real-app-locale.pt.ts'
import { startWebHost, type WebHostHandle } from './web-host.ts'
import { watchConsole, assertConsoleClean, type ConsoleTripwire } from './console-tripwire.ts'
import { withFakeCliOnPath, withNoEngineOnPath, withRealEngine, type FakeCliOptions, type FakeCliPathScope } from './fake-cli.ts'
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
  engine?: ({ kind: 'fake' } & FakeCliOptions) | { kind: 'none' } | { kind: 'real' }
  /**
   * Boot the host the way the desktop does (live runner: `PERSONA_REAL_CLI=1`, not the scripted Vitest runner), so the
   * stubs actually answer turns. Without it `VITEST` leaks into the host and replies are scripted.
   */
  liveRunner?: boolean
  /** Leave the onboarding overlay on screen (skip `dismissBlockingOverlays`) so the test can walk steps 1–5. */
  keepOnboarding?: boolean
  /**
   * Turn on the 6-places rail (NAV-SPEC A-1, behind `persona.flag.navPlaces` per D-077; off = today's rail). Defaults to the env
   * `PERSONA_NAV_PLACES=1`, so every existing gallery/B9 spec can be rerun against the new rail without editing it.
   */
  navPlaces?: boolean
  /** Extra environment for the HOST (the web host child), e.g. the team opt-in `PERSONA_TEAMWORK=1` / `PERSONA_FANOUT=1` (Flint/Keel/Anvil, 05/11). */
  hostEnv?: Record<string, string>
  /**
   * The host gets a CLEAN environment (no `VITEST*`/`PERSONA_SCRIPTED*`/`NODE_ENV=test`; see `startWebHost`). Do not combine with `liveRunner` (which blanks those variables
   * instead of removing them): pass `hostEnv: { PERSONA_REAL_CLI: '1' }`. A REAL round (TEAM-10) uses this.
   */
  cleanHostEnv?: boolean
  /** Keep the host's `PERSONA_HOME` here (it survives `close()`), so the database can be read and copied after the run. */
  home?: string
  /** Extra Chromium flags, e.g. the fake microphone of the voice E2E (`--use-fake-device-for-media-stream --use-file-for-fake-audio-capture=<wav>`). */
  browserArgs?: string[]
  /** Browser permissions granted to the context, e.g. `['microphone']`. */
  permissions?: string[]
}

/**
 * Boot the real Persona profile (B9) in Chrome with console tripwire and fake CLIs on PATH.
 */
export async function openRealPersonaApp(options: OpenRealPersonaAppOptions = {}): Promise<RealPersonaSession> {
  const engine = options.engine ?? { kind: 'fake' as const }
  const fakeCli = engine.kind === 'none' ? withNoEngineOnPath() : engine.kind === 'real' ? withRealEngine() : withFakeCliOnPath(engine)
  const hostEnv: Record<string, string> = {
    ...(options.liveRunner === true ? { VITEST: '', PERSONA_SCRIPTED: '', PERSONA_REAL_CLI: '1' } : {}),
    ...(options.hostEnv ?? {}),
  }
  const host = await startWebHost({
    profile: 'persona',
    ...(options.cleanHostEnv === true ? { cleanEnv: true } : {}),
    ...(options.home === undefined ? {} : { home: options.home }),
    ...(Object.keys(hostEnv).length === 0 ? {} : { env: hostEnv }),
  })
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ channel: 'chrome', ...(options.browserArgs === undefined ? {} : { args: options.browserArgs }) })
  const context = await browser.newContext({
    locale: 'pt-BR',
    viewport: options.viewport ?? { width: 1440, height: 900 },
    ...(options.permissions === undefined ? {} : { permissions: options.permissions }),
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
  if (options.navPlaces ?? process.env.PERSONA_NAV_PLACES === '1') {
    await context.addInitScript(() => { try { localStorage.setItem('persona.flag.navPlaces', '1') } catch { /* storage blocked */ } })
  } else if (options.navPlaces === false) {
    await context.addInitScript(() => { try { localStorage.setItem('persona.flag.navPlaces', '0') } catch { /* storage blocked */ } })
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
  // The `computers` surface (S4 client, bundle of 12/11 22:12) opens the onboarding with "Este computador vai ser a casa da equipe?" BEFORE step 1: its modal scrim blocks every click behind it
  // (found at 22:14: "Contratar persona" intercepted by `scrim`). Answer "Sim" and go on to step 1. Without the question (surface OFF) nothing changes.
  const homeYes = page.getByRole('button', { name: 'Sim, usar este computador', exact: true })
  const step1 = page.getByRole('heading', { name: onboarding.step1Title })
  await step1.or(homeYes).first().waitFor({ state: 'visible', timeout: 5_000 }).catch(() => undefined)
  if (await homeYes.count() > 0) {
    await homeYes.click()
    await step1.waitFor({ state: 'visible', timeout: 15_000 }).catch(() => undefined)
  }
  if (await step1.count() === 0) return

  await page.getByPlaceholder(onboarding.step1Placeholder).fill('Probe E2E')
  await continueBtn().click()
  // The badge text is also the rail's "Memória da empresa" item and part of the step's own copy: scope it to the step (strict mode).
  await page.getByLabel('Sobre a empresa').getByText(onboarding.step2VaultBadge, { exact: true }).waitFor({ state: 'visible' })
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
  const direct = page.getByRole('button', { name: panelLabel, exact: true })
  // NAV-SPEC A-1 (navPlaces ON by default): the old "Quadros" rail item is the first tab of the "Projetos" place, which opens on the board.
  if (await direct.count() === 0 && panelLabel === shell.kanban) {
    await page.getByRole('button', { name: shell.projects, exact: true }).click()
    return
  }
  await direct.click()
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
