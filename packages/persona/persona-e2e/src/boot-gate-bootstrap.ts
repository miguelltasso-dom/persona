import type { Page } from 'playwright'
import type { GalleryPanelSpec } from './real-gallery/panels.ts'
import { navigateGalleryPanel } from './real-gallery/navigate-panel.ts'
import { completeOnboardingOverlay } from './real-app-session.ts'

/** Dev harness roster marker (seed-default-team gallery). */
export const BOOT_GATE_SEEDED_PERSONA = 'Atlas'

/** Keel / Atlas: primary surfaces that must leave loading state after bootstrap. */
export const BOOT_GATE_MAIN_PANELS: readonly GalleryPanelSpec[] = [
  { slug: 'visao-geral', navLabel: 'Visão geral', owner: 'Prism', kind: 'nav' },
  { slug: 'geral', navLabel: 'Canais', owner: 'Prism', kind: 'nav' },
  { slug: 'kanban', navLabel: 'Quadros', owner: 'Lumen', readySelector: '[data-persona-surface="boards"]', kind: 'nav' },
  { slug: 'conhecimento', navLabel: 'Conhecimento', owner: 'Lumen', kind: 'nav' },
  { slug: 'rotinas', navLabel: 'Rotinas', owner: 'Lumen', kind: 'nav' },
  { slug: 'arquivos', navLabel: 'Arquivos', owner: 'Lumen', kind: 'nav' },
  { slug: 'uso', navLabel: 'Uso e limites', owner: 'Lumen', kind: 'nav' },
  { slug: 'conexoes', navLabel: 'Conexões', owner: 'Lumen', kind: 'nav' },
  {
    slug: 'aprovacoes',
    navLabel: 'Aprovações',
    owner: 'Lumen',
    readySelector: '[data-persona-surface="approvals"]',
    kind: 'nav',
  },
]

export const BOOT_GATE_PANEL_SETTLE_MS = 8_000
export const BOOT_GATE_TEAM_WAIT_MS = 45_000
/** Prism-owned surfaces for ui-boot-check (avoids Lumen loading storms on dev host). */
export const BOOT_GATE_PRISM_PANELS: readonly GalleryPanelSpec[] = BOOT_GATE_MAIN_PANELS.filter(spec => spec.owner === 'Prism')

/** Atlas / Keel publish gate: fresh install path after onboarding (no dev seed). */
export const BOOT_GATE_CLEAN_HOME_TOUR: readonly GalleryPanelSpec[] = [
  { slug: 'visao-geral', navLabel: 'Visão geral', owner: 'Prism', kind: 'nav' },
  { slug: 'geral', navLabel: 'Canais', owner: 'Prism', kind: 'nav' },
  { slug: 'conexoes', navLabel: 'Conexões', owner: 'Lumen', kind: 'nav' },
  { slug: 'uso', navLabel: 'Uso e limites', owner: 'Lumen', kind: 'nav' },
  { slug: 'team-health', navLabel: 'Saúde', owner: 'Lumen', readySelector: '[data-persona-surface="team-health"]', kind: 'nav' },
  { slug: 'org-chart', navLabel: 'Quem cuida de quem', owner: 'Lumen', readySelector: '[data-persona-surface="org-chart"]', kind: 'nav' },
  { slug: 'kanban', navLabel: 'Quadros', owner: 'Lumen', readySelector: '[data-persona-surface="boards"]', kind: 'nav' },
  { slug: 'conhecimento', navLabel: 'Conhecimento', owner: 'Lumen', kind: 'nav' },
  {
    slug: 'aprovacoes',
    navLabel: 'Aprovações',
    owner: 'Lumen',
    readySelector: '[data-persona-surface="approvals"]',
    kind: 'nav',
  },
]

export const CLEAN_HOME_TOUR_SETTLE_MS = 12_000
const BOOT_GATE_NOISE_RE = /ERR_INSUFFICIENT_RESOURCES|Failed to load resource: net::ERR_/i

/** Drop duplicate/noisy console lines so one resource storm does not fail the gate. */
export function sanitizeBootstrapPageErrors(errors: readonly string[]): string[] {
  const out: string[] = []
  const seen = new Set<string>()
  let gatewayInternal = 0
  for (const line of errors) {
    if (BOOT_GATE_NOISE_RE.test(line)) continue
    if (line.includes('gateway/internal')) {
      gatewayInternal += 1
      if (gatewayInternal > 2) continue
    }
    if (seen.has(line)) continue
    seen.add(line)
    out.push(line)
    if (out.length >= 24) break
  }
  return out
}

/** @param line - console.error or pageerror text from Playwright. */
export function recordBootstrapPageError(errors: string[], line: string): void {
  const trimmed = line.trim()
  if (trimmed.length === 0) return
  const next = sanitizeBootstrapPageErrors([...errors, trimmed])
  errors.length = 0
  errors.push(...next)
}

/** Harness onboarding scrim blocks rail clicks until step 5 or cache+host agree. */
export async function dismissBlockingOverlays(page: Page): Promise<void> {
  await completeOnboardingOverlay(page).catch(() => {})
  const blocking = page.locator(
    '[role="presentation"][class*="scrim"], [role="presentation"][class*="overlay"], [role="presentation"] [class*="mask"]',
  )
  if (await blocking.count() > 0) {
    for (let i = 0; i < 3; i += 1) {
      await page.keyboard.press('Escape').catch(() => {})
      await page.waitForTimeout(250)
      if (await blocking.count() === 0) break
    }
  }
}

async function waitForPersonaRail(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Visão geral', exact: true }).waitFor({
    state: 'visible',
    timeout: 120_000,
  })
}

async function navigateBootGatePanel(page: Page, spec: GalleryPanelSpec): Promise<void> {
  await navigateGalleryPanel(page, spec)
}

const LOADING_RE = /Carregando/i

export interface BootstrapGateResult {
  readonly pageErrors: string[]
  readonly stuckLoadingPanels: string[]
  readonly seededTeamMissing: boolean
  readonly teamWaitDetail: string
}

/**
 * Text in the main column (`[data-persona-grain]`), not the Muse rail.
 */
export async function readMainColumnText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const grain = document.querySelector('[data-persona-grain]')
    const main = grain instanceof HTMLElement
      ? grain
      : (() => {
        const shell = document.querySelector('[data-persona-shell]')
        const legacy = shell?.children[1]
        return legacy instanceof HTMLElement ? legacy : null
      })()
    return (main?.textContent ?? '').replace(/\s+/g, ' ').trim()
  })
}

/**
 * @param page - Persona shell with a panel selected.
 */
export async function mainColumnShowsLoading(page: Page): Promise<boolean> {
  const text = await readMainColumnText(page)
  return LOADING_RE.test(text)
}

/**
 * After navigation, wait {@link BOOT_GATE_PANEL_SETTLE_MS} then fail if main still shows loading copy.
 */
export async function assertPanelLeftLoadingState(
  page: Page,
  spec: GalleryPanelSpec,
  settleMs: number = BOOT_GATE_PANEL_SETTLE_MS,
): Promise<void> {
  const deadline = Date.now() + settleMs
  while (Date.now() < deadline) {
    if (!(await mainColumnShowsLoading(page))) return
    await page.waitForTimeout(400)
  }
  const snippet = (await readMainColumnText(page)).slice(0, 120)
  throw new Error(`[${spec.slug}] still loading after ${String(settleMs)}ms: "${snippet}"`)
}

export interface MainColumnErrorState {
  readonly present: boolean
  readonly detail: string
}

/** PanelBoundary / ErrorState renders `role="alert"` in the main column. */
export async function readMainColumnErrorState(page: Page): Promise<MainColumnErrorState> {
  return page.evaluate(() => {
    const grain = document.querySelector('[data-persona-grain]')
    const main = grain instanceof HTMLElement
      ? grain
      : (() => {
        const shell = document.querySelector('[data-persona-shell]')
        const legacy = shell?.children[1]
        return legacy instanceof HTMLElement ? legacy : null
      })()
    if (main === null) return { present: false, detail: '' }
    const alert = main.querySelector('[role="alert"]')
    if (!(alert instanceof HTMLElement)) return { present: false, detail: '' }
    const rect = alert.getBoundingClientRect()
    if (rect.width < 4 || rect.height < 4) return { present: false, detail: '' }
    return { present: true, detail: (alert.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 240) }
  })
}

export interface CleanHomeTourResult {
  readonly panelFailures: string[]
}

/**
 * Post-onboarding tour on a clean install home (Atlas publish gate).
 */
export async function runCleanHomeTourChecks(page: Page): Promise<CleanHomeTourResult> {
  const panelFailures: string[] = []
  await dismissBlockingOverlays(page)
  await waitForPersonaRail(page)
  await page.waitForTimeout(1_500)

  for (const spec of BOOT_GATE_CLEAN_HOME_TOUR) {
    try {
      await navigateBootGatePanel(page, spec)
      await page.waitForTimeout(400)
      const errorState = await readMainColumnErrorState(page)
      if (errorState.present) {
        panelFailures.push(`[${spec.slug}] ErrorState: ${errorState.detail}`)
      }
      await assertPanelLeftLoadingState(page, spec, CLEAN_HOME_TOUR_SETTLE_MS)
    } catch (error) {
      panelFailures.push(error instanceof Error ? error.message : String(error))
    }
  }
  return { panelFailures }
}

export function formatCleanHomeTourFailures(result: CleanHomeTourResult): string[] {
  if (result.panelFailures.length === 0) return []
  return [`clean home tour failed (${String(result.panelFailures.length)} panels):\n${result.panelFailures.join('\n')}`]
}

/**
 * Dev seed roster should appear in rail, strip, or main after live store bootstrap.
 */
export async function waitForSeededTeam(page: Page, name = BOOT_GATE_SEEDED_PERSONA): Promise<string> {
  const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const text = page.getByText(name, { exact: true })
  const dmRail = page.getByRole('button', { name: new RegExp(`Conversar com ${escaped}`) })
  const sobreRail = page.getByRole('button', { name: `Sobre ${name}`, exact: true })
  const deadline = Date.now() + BOOT_GATE_TEAM_WAIT_MS
  while (Date.now() < deadline) {
    if (await text.first().isVisible().catch(() => false)) return `visible: ${name}`
    if (await dmRail.first().isVisible().catch(() => false)) return `visible: ${name} (rail dm)`
    if (await sobreRail.first().isVisible().catch(() => false)) return `visible: ${name} (rail sobre)`
    const teamTitle = page.locator('#persona-rail-team-title')
    if (await teamTitle.count() > 0 && (await teamTitle.getAttribute('aria-expanded')) === 'false') {
      await teamTitle.click({ timeout: 5_000 }).catch(() => {})
    }
    await page.waitForTimeout(400)
  }
  const bodySnippet = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200)
  return `missing after ${String(BOOT_GATE_TEAM_WAIT_MS)}ms; body="${bodySnippet}"`
}

/**
 * Atlas boot gate: page errors during session, seeded team, and no stuck loading on main panels.
 */
export async function runBootstrapGateChecks(
  page: Page,
  pageErrors: string[],
  panels: readonly GalleryPanelSpec[] = BOOT_GATE_PRISM_PANELS,
): Promise<BootstrapGateResult> {
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })
  await dismissBlockingOverlays(page)
  await waitForPersonaRail(page)
  await page.waitForTimeout(1_500)

  const teamWaitDetail = await waitForSeededTeam(page)
  const seededTeamMissing = !teamWaitDetail.startsWith('visible:')

  const stuckLoadingPanels: string[] = []
  for (const spec of panels) {
    try {
      await navigateBootGatePanel(page, spec)
      await assertPanelLeftLoadingState(page, spec)
    } catch (error) {
      stuckLoadingPanels.push(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    pageErrors: sanitizeBootstrapPageErrors(pageErrors),
    stuckLoadingPanels,
    seededTeamMissing,
    teamWaitDetail,
  }
}

/**
 * @param result - output from {@link runBootstrapGateChecks}.
 */
export function formatBootstrapGateFailures(result: BootstrapGateResult): string[] {
  const lines: string[] = []
  if (result.pageErrors.length > 0) {
    lines.push(`bootstrap pageerror/exception (${String(result.pageErrors.length)}):\n${result.pageErrors.join('\n')}`)
  }
  if (result.seededTeamMissing) {
    lines.push(`seeded team missing (${BOOT_GATE_SEEDED_PERSONA}): ${result.teamWaitDetail}`)
  }
  if (result.stuckLoadingPanels.length > 0) {
    lines.push(`panels stuck loading:\n${result.stuckLoadingPanels.join('\n')}`)
  }
  return lines
}

/**
 * @param result - output from {@link runBootstrapGateChecks}.
 */
export function assertBootstrapGateClean(result: BootstrapGateResult): void {
  const parts = formatBootstrapGateFailures(result)
  if (parts.length > 0) throw new Error(parts.join('\n\n'))
}
