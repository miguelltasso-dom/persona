import type { Page } from 'playwright'
import { chat, onboarding, shell } from './real-app-locale.pt.ts'
import { startWebHost, type WebHostHandle } from './web-host.ts'
import { watchConsole, assertConsoleClean, type ConsoleTripwire } from './console-tripwire.ts'
import { withFakeCliOnPath, type FakeCliPathScope } from './fake-cli.ts'

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
  viewport?: { width: number; height: number }
}

/**
 * Boot the real Persona profile (B9) in Chrome with console tripwire and fake CLIs on PATH.
 */
export async function openRealPersonaApp(options: OpenRealPersonaAppOptions = {}): Promise<RealPersonaSession> {
  const fakeCli = withFakeCliOnPath()
  const host = await startWebHost({ profile: 'persona' })
  const { chromium } = await import('playwright')
  const browser = await chromium.launch({ channel: 'chrome' })
  const context = await browser.newContext({
    locale: 'pt-BR',
    viewport: options.viewport ?? { width: 1440, height: 900 },
  })
  if (options.dismissOnboardingViaStorage || options.devSeed) {
    await context.addInitScript(({ onboarding, seed }: { onboarding: boolean; seed: boolean }) => {
      if (onboarding) localStorage.setItem('persona.onboarding.complete.v1', '1')
      if (seed) localStorage.setItem('persona.devSeed.v1', '1')
    }, { onboarding: options.dismissOnboardingViaStorage === true, seed: options.devSeed === true })
  }
  const page = await context.newPage()
  const tripwire = watchConsole(page)
  await page.goto(host.url, { waitUntil: 'load', timeout: 120_000 })
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })

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
  await page.getByRole('heading', { name: onboarding.step5Title }).waitFor({ state: 'visible' })
  await page.getByRole('button', { name: onboarding.finish }).click()
  await page.getByPlaceholder(chat.composerPlaceholder).waitFor({ state: 'visible', timeout: 60_000 })
}

/**
 * @param page - Persona page.
 * @param panelLabel - sidebar label from shell.pt locale.
 */
export async function selectSidebarPanel(page: Page, panelLabel: string): Promise<void> {
  await page.getByRole('button', { name: panelLabel, exact: true }).click()
}

export { assertConsoleClean, shell, chat, onboarding }
