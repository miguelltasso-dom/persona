/**
 * Gauge (QA nº 2) app-layer helpers for the mandatory per-feature suites: one real Persona session per spec,
 * both-theme captures, panel health gate (blank / stuck loading / console fatals) and small UI walkers.
 * `GAUGE_HOST_URL` lets a developer iterate against an already running host (never used by the gates).
 */
import { mkdir, writeFile } from 'node:fs/promises'
import { join } from 'node:path'
import type { Page } from 'playwright'
import { ARTIFACTS_DIR } from './paths.ts'
import { completeOnboardingOverlay, openRealPersonaApp, type RealPersonaSession } from './real-app-session.ts'
import { isMainPanelBlank, measureMainPanelContent } from './real-gallery/blank-main-panel.ts'
import { navigateGalleryPanel } from './real-gallery/navigate-panel.ts'
import { createPanelConsoleTripwire, measureStuckLoading, type PanelConsoleTripwire } from './real-gallery/panel-gate.ts'
import { REAL_GALLERY_PANELS } from './real-gallery/panels.ts'
import { scanAccessibility, type AxeScanResult } from './axe-check.ts'

export interface GaugeSession {
  readonly page: Page
  readonly via: 'own-host' | 'dev-host'
  readonly console: PanelConsoleTripwire
  close(): Promise<void>
}

export interface GaugeSessionOptions {
  /** Walk the 5-step onboarding to the end (blank template) — default true. */
  readonly onboard?: boolean
  readonly engine?: Parameters<typeof openRealPersonaApp>[0] extends infer O ? (O extends { engine?: infer E } ? E : never) : never
  readonly viewport?: { width: number; height: number }
}

/**
 * Open the real app (own host under the build lock, or `GAUGE_HOST_URL` for development) and finish onboarding.
 * @param options - Engine, viewport and whether to onboard.
 */
export async function openGaugeSession(options: GaugeSessionOptions = {}): Promise<GaugeSession> {
  const devUrl = process.env.GAUGE_HOST_URL
  const onboard = options.onboard ?? true
  if (devUrl !== undefined && devUrl !== '') {
    const { chromium } = await import('playwright')
    const browser = await chromium.launch({ channel: 'chrome' })
    const context = await browser.newContext({ locale: 'pt-BR', viewport: options.viewport ?? { width: 1440, height: 900 } })
    const page = await context.newPage()
    const tripwire = createPanelConsoleTripwire()
    tripwire.attach(page)
    await page.goto(devUrl, { waitUntil: 'load', timeout: 120_000 })
    await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
    await page.waitForTimeout(2_000)
    if (onboard) await completeOnboardingOverlay(page).catch(() => {})
    return { page, via: 'dev-host', console: tripwire, close: async () => { await context.close(); await browser.close() } }
  }
  const session: RealPersonaSession = await openRealPersonaApp({
    keepOnboarding: true,
    ...(options.engine === undefined ? {} : { engine: options.engine }),
    ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
  })
  const tripwire = createPanelConsoleTripwire()
  tripwire.attach(session.page)
  if (onboard) await completeOnboardingOverlay(session.page)
  return { page: session.page, via: 'own-host', console: tripwire, close: () => session.close() }
}

/** Directory for this suite's captures (gitignored under artifacts/). */
export async function captureDir(suite: string): Promise<string> {
  const dir = join(ARTIFACTS_DIR, 'gauge', suite)
  await mkdir(dir, { recursive: true })
  return dir
}

/**
 * Screenshot the current view in light and dark (prefers-color-scheme), leaving the page in light.
 * @param page - Live page.
 * @param suite - Folder name under artifacts/gauge.
 * @param name - File stem.
 * @returns Written files.
 */
export async function shootBothThemes(page: Page, suite: string, name: string): Promise<string[]> {
  const dir = await captureDir(suite)
  const files: string[] = []
  for (const scheme of ['light', 'dark'] as const) {
    await page.emulateMedia({ colorScheme: scheme })
    await page.waitForTimeout(450)
    const file = join(dir, `${name}-${scheme}.png`)
    await page.screenshot({ path: file })
    files.push(file)
  }
  await page.emulateMedia({ colorScheme: 'light' })
  return files
}

export interface PanelHealth {
  readonly blank: boolean
  readonly stuck: boolean
  readonly detail: string
  readonly fatals: readonly string[]
  readonly axe: AxeScanResult
}

/**
 * Open a gallery panel and measure the health gate (Keel): not blank, no stuck "Carregando…", no console fatals.
 * @param session - Gauge session.
 * @param slug - Gallery panel slug.
 */
export async function panelHealth(session: GaugeSession, slug: string): Promise<PanelHealth> {
  const spec = REAL_GALLERY_PANELS.find(panel => panel.slug === slug)
  if (spec === undefined) throw new Error(`unknown gallery panel ${slug}`)
  const mark = session.console.mark()
  await navigateGalleryPanel(session.page, spec)
  if (spec.readySelector !== undefined) await session.page.locator(spec.readySelector).waitFor({ state: 'visible', timeout: 60_000 })
  const stuck = await measureStuckLoading(session.page)
  const main = await measureMainPanelContent(session.page)
  const axe = await scanAccessibility(session.page)
  const dir = await captureDir('axe')
  await writeFile(join(dir, `${slug}.json`), JSON.stringify(axe, null, 2), 'utf8')
  return {
    blank: isMainPanelBlank(main),
    stuck: stuck.stuck,
    detail: `${stuck.detail} | ${main.detail}`,
    fatals: session.console.fatalsSince(mark),
    axe,
  }
}

/** Visible text of the main region (cheap content assertions). */
export async function mainText(page: Page): Promise<string> {
  return (await page.locator('[data-persona-surface], main').first().innerText().catch(() => '')) || (await page.locator('body').innerText())
}

/** Open "Contratar persona" → the structure assistant (step 1). */
export async function openStructureAssistant(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Contratar persona' }).click()
  await page.getByRole('heading', { name: 'Monte uma equipe que faça sentido' }).waitFor({ state: 'visible', timeout: 30_000 })
}

/**
 * Walk the assistant: company → sectors → recommendation → preview.
 * @param page - Live page with the assistant open at step 1.
 * @param company - Button label of the company type.
 */
export async function assistantToPreview(page: Page, company: string): Promise<void> {
  await page.getByRole('button', { name: company, exact: true }).click()
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByText('Prévia do organograma e do Teste dos 2 dias offline.').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Axe violations that block (WCAG A/AA failures): impact critical or serious. Moderate best-practice rules are tracked separately. */
export function blockingAxe(axe: AxeScanResult): string[] {
  return axe.violations
    .filter(row => row.impact === 'critical' || row.impact === 'serious')
    .map(row => `${row.id}[${row.impact ?? '?'}](${String(row.nodes)}): ${row.detail ?? ''}`)
}

/** Axe best-practice findings (moderate/minor), e.g. landmark-one-main, region, heading-order. */
export function advisoryAxe(axe: AxeScanResult): string[] {
  return axe.violations
    .filter(row => row.impact !== 'critical' && row.impact !== 'serious')
    .map(row => `${row.id}[${row.impact ?? '?'}](${String(row.nodes)}): ${row.detail ?? ''}`)
}
