import type { Page } from 'playwright'
import type { GalleryPanelSpec } from './real-gallery/panels.ts'
import { completeOnboardingOverlay } from './real-app-session.ts'

/** Dev harness roster marker (seed-default-team gallery). */
export const BOOT_GATE_SEEDED_PERSONA = 'Atlas'

/** Keel / Atlas: primary surfaces that must leave loading state after bootstrap. */
export const BOOT_GATE_MAIN_PANELS: readonly GalleryPanelSpec[] = [
  { slug: 'visao-geral', navLabel: 'Visão geral', owner: 'Prism', kind: 'nav' },
  { slug: 'geral', navLabel: 'Canais', owner: 'Prism', kind: 'nav' },
  { slug: 'kanban', navLabel: 'Kanban', owner: 'Lumen', readySelector: '[data-persona-kanban="global"]', kind: 'nav' },
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
export const BOOT_GATE_TEAM_WAIT_MS = 25_000
/** Prism-owned surfaces for ui-boot-check (avoids Lumen loading storms on dev host). */
export const BOOT_GATE_PRISM_PANELS: readonly GalleryPanelSpec[] = BOOT_GATE_MAIN_PANELS.filter(spec => spec.owner === 'Prism')
const NAV_TIMEOUT_MS = 30_000
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
  if (await page.locator('[role="presentation"][class*="scrim"]').count() > 0) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(300)
  }
}

async function waitForPersonaRail(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Visão geral', exact: true }).waitFor({
    state: 'visible',
    timeout: 120_000,
  })
}

async function navigateBootGatePanel(page: Page, spec: GalleryPanelSpec): Promise<void> {
  const clickNav = async (name: string | RegExp): Promise<void> => {
    const btn = typeof name === 'string'
      ? page.getByRole('button', { name, exact: true })
      : page.getByRole('button', { name }).first()
    await btn.scrollIntoViewIfNeeded({ timeout: NAV_TIMEOUT_MS })
    await btn.click({ timeout: NAV_TIMEOUT_MS })
  }

  if (spec.slug === 'busca') {
    await clickNav('Buscar em tudo…')
    await page.waitForTimeout(600)
    return
  }

  if (spec.kind === 'settings') {
    await clickNav(/configura/i)
    return
  }

  await clickNav(spec.navLabel)
  if (spec.slug === 'geral') {
    const geral = page.getByRole('button', { name: '#geral' })
    if (await geral.count() > 0) await geral.click({ timeout: NAV_TIMEOUT_MS })
    else await page.getByText('#geral').first().click({ timeout: NAV_TIMEOUT_MS }).catch(() => {})
    await page.waitForTimeout(800)
    return
  }

  if (spec.readySelector !== undefined) {
    await page.locator(spec.readySelector).first().waitFor({ state: 'visible', timeout: NAV_TIMEOUT_MS }).catch(() => {})
  } else if (spec.slug === 'geral' || spec.slug === 'canais') {
    await page.getByPlaceholder('Mensagem para #geral…').waitFor({ state: 'visible', timeout: NAV_TIMEOUT_MS }).catch(() => {})
  } else {
    await page.waitForTimeout(800)
  }
}

const LOADING_RE = /Carregando/i

export interface BootstrapGateResult {
  readonly pageErrors: string[]
  readonly stuckLoadingPanels: string[]
  readonly seededTeamMissing: boolean
  readonly teamWaitDetail: string
}

/**
 * Text in the main column (shell second child), not the Muse rail.
 */
export async function readMainColumnText(page: Page): Promise<string> {
  return page.evaluate(() => {
    const shell = document.querySelector('[data-persona-shell]')
    const main = shell?.children[1]
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
export async function assertPanelLeftLoadingState(page: Page, spec: GalleryPanelSpec): Promise<void> {
  const deadline = Date.now() + BOOT_GATE_PANEL_SETTLE_MS
  while (Date.now() < deadline) {
    if (!(await mainColumnShowsLoading(page))) return
    await page.waitForTimeout(400)
  }
  const snippet = (await readMainColumnText(page)).slice(0, 120)
  throw new Error(`[${spec.slug}] still loading after ${String(BOOT_GATE_PANEL_SETTLE_MS)}ms: "${snippet}"`)
}

/**
 * Dev seed roster should appear in rail, strip, or main after live store bootstrap.
 */
export async function waitForSeededTeam(page: Page, name = BOOT_GATE_SEEDED_PERSONA): Promise<string> {
  const locator = page.getByText(name, { exact: false }).first()
  try {
    await locator.waitFor({ state: 'visible', timeout: BOOT_GATE_TEAM_WAIT_MS })
    return `visible: ${name}`
  } catch {
    const bodySnippet = (await page.locator('body').innerText()).replace(/\s+/g, ' ').slice(0, 200)
    return `missing after ${String(BOOT_GATE_TEAM_WAIT_MS)}ms; body="${bodySnippet}"`
  }
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
