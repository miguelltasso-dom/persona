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
    if (onboard) {
      await completeOnboardingOverlay(page).catch(() => {})
      await settleFirstDelivery(page)
    }
    return { page, via: 'dev-host', console: tripwire, close: async () => { await context.close(); await browser.close() } }
  }
  const session: RealPersonaSession = await openRealPersonaApp({
    keepOnboarding: true,
    // The product's rail is the single lilac bar since bundle 3; these suites walk the old rail (opt-out) until they move: GAUGE_NAV_PLACES=1 = product default.
    navPlaces: process.env.GAUGE_NAV_PLACES === '1',
    ...(options.engine === undefined ? {} : { engine: options.engine }),
    ...(options.viewport === undefined ? {} : { viewport: options.viewport }),
  })
  const tripwire = createPanelConsoleTripwire()
  tripwire.attach(session.page)
  if (onboard) {
    await completeOnboardingOverlay(session.page)
    await settleFirstDelivery(session.page)
  }
  return { page: session.page, via: 'own-host', console: tripwire, close: () => session.close() }
}

/**
 * Finishing onboarding makes the app run the first delivery on its own (the first request goes to #geral, the team answers, and the app
 * returns to #geral when it is done). A test that opens a screen in that window gets bounced back to #geral mid-click (the "Contratar
 * persona" assistant lost its company cards). Wait until the conversation stops changing before any test starts.
 * @param page - Live page right after onboarding.
 */
export async function settleFirstDelivery(page: Page, maxMs = 25_000): Promise<void> {
  const deadline = Date.now() + maxMs
  let last = -1
  let stable = 0
  while (Date.now() < deadline && stable < 5) {
    const count = await page.locator('li[data-message-id]').count().catch(() => -1)
    stable = count === last ? stable + 1 : 0
    last = count
    await page.waitForTimeout(700)
  }
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
  const hire = page.getByRole('button', { name: 'Contratar persona' })
  // NAV-SPEC A-1 (navPlaces ON by default): the old rail's "Contratar persona" moved into the team panel of the "Equipe" place; with the old rail the button is already on screen.
  if (await hire.count() === 0) await page.getByRole('button', { name: 'Equipe', exact: true }).click()
  await hire.first().click()
  await page.getByRole('heading', { name: 'Monte uma equipe que faça sentido' }).waitFor({ state: 'visible', timeout: 30_000 })
}

/**
 * Walk the assistant: company → sectors → recommendation → preview.
 * @param page - Live page with the assistant open at step 1.
 * @param company - Button label of the company type.
 */
export async function assistantToPreview(page: Page, company: string): Promise<void> {
  // The company cards are radios since the Muse a11y pass (names carry a one-line hint: "Agência Clientes, projetos…").
  const card = page.getByRole('radio', { name: new RegExp(company, 'u') }).or(page.getByRole('button', { name: company, exact: true })).first()
  try {
    await card.click()
  } catch (error) {
    // Diagnosis: what does step 1 actually show? (screenshot + the visible radios/buttons/headings)
    const seen = await page.evaluate(() => ({
      headings: [...document.querySelectorAll('h1,h2,h3')].map(el => (el.textContent ?? '').trim().slice(0, 50)).slice(0, 8),
      radios: [...document.querySelectorAll('[role="radio"]')].map(el => (el.getAttribute('aria-label') ?? el.textContent ?? '').trim().slice(0, 50)).slice(0, 10),
      buttons: [...document.querySelectorAll('button')].map(el => (el.textContent ?? '').trim().slice(0, 30)).filter(Boolean).slice(0, 24),
    })).catch(() => ({}))
    const dir = await captureDir('diag')
    await page.screenshot({ path: join(dir, `assistant-${company}.png`) }).catch(() => undefined)
    console.log(`[gauge-diag] assistente sem o cartão "${company}": ${JSON.stringify(seen)}`)
    throw error
  }
  for (let i = 0; i < 3; i += 1) await page.getByRole('button', { name: 'Continuar', exact: true }).click()
  await page.getByText('Prévia do organograma e do Teste dos 2 dias offline.').waitFor({ state: 'visible', timeout: 30_000 })
}

/** Number on the "Sua equipe" rail group (0 when unreadable). */
export async function railTeamCount(page: Page): Promise<number> {
  const text = await page.locator('#persona-rail-team-title').innerText().catch(() => '')
  return Number(/(\d+)/u.exec(text)?.[1] ?? '0')
}

/** "Pular assistente" opens the blank persona editor (a full page, not a modal): leave through the shell home. */
export async function leaveAssistant(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Visão geral', exact: true }).first().click()
  await page.getByRole('heading', { name: 'Monte uma equipe que faça sentido' }).waitFor({ state: 'hidden', timeout: 15_000 })
}

/**
 * A fresh own host finishes onboarding with the BLANK template (no personas): suites that need a team (replies, Coordenação as Gestor,
 * Atendimento…) hire the suggested one through the assistant, exactly as a user does. No-op when the rail already has a team.
 * @param page - Live page after onboarding.
 * @param company - Company card of the assistant (its team has Coordenação, Atendimento, Criação, Mídia).
 */
export async function hireSuggestedTeam(page: Page, company = 'Agência'): Promise<void> {
  const before = await railTeamCount(page)
  if (before >= 3) return
  await openStructureAssistant(page)
  await assistantToPreview(page, company)
  await page.getByRole('button', { name: 'Contratar equipe sugerida' }).click()
  const deadline = Date.now() + 60_000
  while (await railTeamCount(page) < Math.min(before + 4, 5)) {
    if (Date.now() > deadline) throw new Error(`a equipe sugerida não chegou ao rail (rail: ${String(await railTeamCount(page))})`)
    await page.waitForTimeout(400)
  }
  await leaveAssistant(page)
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

/** The status chip at the foot of the rail that opens the "Estou fora" panel (its label is the engine chip, "Conectado" or "Fora até …"). */
export async function openAwayPanel(page: Page): Promise<void> {
  const away = page.getByRole('switch', { name: 'Estou fora' })
  if (await away.count() > 0) return
  const chip = page.getByRole('button', { name: /^(Conectado|Fora até|Claude|Codex|OpenCode|Cursor|Sem IA|Offline)/u }).first()
  await chip.click({ timeout: 30_000 })
  await away.waitFor({ state: 'visible', timeout: 15_000 })
}

/** Close the "Estou fora" panel through the same chip (Esc/click-outside are tracked separately). */
export async function closeAwayPanel(page: Page): Promise<void> {
  if (await page.getByRole('switch', { name: 'Estou fora' }).count() === 0) return
  const chip = page.getByRole('button', { name: /^(Conectado|Fora até|Claude|Codex|OpenCode|Cursor|Sem IA|Offline)/u }).first()
  await chip.click({ timeout: 15_000 }).catch(() => {})
  await page.keyboard.press('Escape').catch(() => {})
}
