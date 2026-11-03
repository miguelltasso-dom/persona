import type { Page } from 'playwright'
import type { GalleryPanelSpec } from './real-gallery/panels.ts'

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

export const BOOT_GATE_PANEL_SETTLE_MS = 12_000
export const BOOT_GATE_TEAM_WAIT_MS = 20_000
const NAV_TIMEOUT_MS = 60_000

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
  await page.waitForTimeout(BOOT_GATE_PANEL_SETTLE_MS)
  if (await mainColumnShowsLoading(page)) {
    const snippet = (await readMainColumnText(page)).slice(0, 120)
    throw new Error(`[${spec.slug}] still loading after ${String(BOOT_GATE_PANEL_SETTLE_MS)}ms: "${snippet}"`)
  }
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
export async function runBootstrapGateChecks(page: Page, pageErrors: string[]): Promise<BootstrapGateResult> {
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 180_000 })

  const teamWaitDetail = await waitForSeededTeam(page)
  const seededTeamMissing = !teamWaitDetail.startsWith('visible:')

  const stuckLoadingPanels: string[] = []
  for (const spec of BOOT_GATE_MAIN_PANELS) {
    try {
      await navigateBootGatePanel(page, spec)
      await assertPanelLeftLoadingState(page, spec)
    } catch (error) {
      stuckLoadingPanels.push(error instanceof Error ? error.message : String(error))
    }
  }

  return {
    pageErrors: [...pageErrors],
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
