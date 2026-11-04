import type { Page } from 'playwright'
import { DEV_SEED_PROFILE_PERSONA, type GalleryPanelSpec } from './panels.ts'
import { dismissBlockingOverlays } from '../boot-gate-bootstrap.ts'
import { waitForGeralComposer } from '../geral-composer.ts'

const MORE_PANELS = new Set(['membros', 'importar', 'canvas'])
const COMPANY_PANELS = new Set(['conhecimento', 'arquivos', 'uso', 'conexoes', 'regras'])
const TEAM_PANELS = new Set(['equipe', 'org-chart', 'team-health'])
const WORK_PANELS = new Set(['projetos', 'kanban', 'rotinas', 'aprovacoes'])

async function ensureNavGroupExpanded(page: Page, groupId: string, fallbackLabel: string): Promise<void> {
  const toggle = page.locator(`[aria-controls="persona-nav-${groupId}"]`).first()
  if (await toggle.count() === 0) {
    const byLabel = page.getByRole('button', { name: fallbackLabel, exact: true }).first()
    if (await byLabel.count() === 0) return
    if (await byLabel.getAttribute('aria-expanded') !== 'true') await byLabel.click({ timeout: 30_000 })
    return
  }
  if (await toggle.getAttribute('aria-expanded') !== 'true') await toggle.click({ timeout: 30_000 })
}

async function clickNav(page: Page, name: string | RegExp): Promise<void> {
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
  if (typeof name === 'string') {
    const navItem = page.locator('[data-nav-item]').getByRole('button', { name, exact: true })
    if (await navItem.count() > 0) {
      await navItem.first().scrollIntoViewIfNeeded({ timeout: 60_000 })
      await navItem.first().click({ timeout: 60_000 })
      return
    }
  }
  const btn = typeof name === 'string'
    ? page.getByRole('button', { name, exact: true }).first()
    : page.getByRole('button', { name }).first()
  await btn.scrollIntoViewIfNeeded({ timeout: 60_000 })
  await btn.click({ timeout: 60_000 })
}

/** Close search/modals and return to Visão geral (gallery loop + boot gate test 2). */
export async function resetGalleryHome(page: Page): Promise<void> {
  await dismissBlockingOverlays(page).catch(() => {})
  for (let i = 0; i < 4; i += 1) {
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(200)
  }
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
  const home = page.locator('[data-nav-item]').getByRole('button', { name: 'Visão geral', exact: true })
  if (await home.count() > 0) {
    await home.first().click({ timeout: 60_000 })
  } else {
    await page.getByRole('button', { name: 'Visão geral', exact: true }).first().click({ timeout: 60_000 })
  }
  await page.locator('[data-persona-root], [data-persona-grain]').first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
}

/** UX-04: Perfil left the nav — open via rail card ⋯ (list density) or Shift+F10 → Abrir perfil. */
export async function navigateProfileViaRailCard(
  page: Page,
  personaName: string = DEV_SEED_PROFILE_PERSONA,
): Promise<void> {
  await resetGalleryHome(page)
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })

  const teamTitle = page.locator('#persona-rail-team-title')
  if (await teamTitle.count() > 0 && (await teamTitle.getAttribute('aria-expanded')) === 'false') {
    await teamTitle.click({ timeout: 30_000 })
  }

  const sobre = page.getByRole('button', { name: `Sobre ${personaName}`, exact: true }).first()
  if (await sobre.isVisible().catch(() => false)) {
    await sobre.click({ timeout: 60_000 })
  } else {
    const dm = page.getByRole('button', { name: new RegExp(`Conversar com ${escapeRegExp(personaName)}`) }).first()
    await dm.waitFor({ state: 'visible', timeout: 60_000 })
    await dm.focus()
    await page.keyboard.press('Shift+F10')
  }

  await page.getByRole('button', { name: `Mais ações para ${personaName}`, exact: true }).first()
    .click({ timeout: 30_000 })
  await page.getByRole('menuitem', { name: 'Abrir perfil', exact: true }).click({ timeout: 30_000 })
  await page.locator('[data-persona-surface="profile"]').first().waitFor({ state: 'visible', timeout: 60_000 })
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * Navigate via Muse grouped rail (expand "Mais" when needed).
 */
export async function navigateGalleryPanel(page: Page, spec: GalleryPanelSpec): Promise<void> {
  if (spec.kind === 'profile-via-rail') {
    await dismissBlockingOverlays(page).catch(() => {})
    await navigateProfileViaRailCard(page, spec.profileRailPersona ?? DEV_SEED_PROFILE_PERSONA)
    return
  }
  if (spec.kind !== 'nav' && spec.kind !== 'settings') return

  await dismissBlockingOverlays(page).catch(() => {})

  if (spec.slug === 'busca') {
    const search = page.getByRole('button', { name: /Buscar em tudo/i })
    if (await search.count() > 0) {
      await search.first().click({ timeout: 30_000 })
    } else {
      await page.keyboard.press('Control+k')
    }
    await page.waitForTimeout(600)
    await page.keyboard.press('Escape').catch(() => {})
    await page.waitForTimeout(200)
    return
  }

  if (TEAM_PANELS.has(spec.slug)) await ensureNavGroupExpanded(page, 'team', 'Equipe')
  if (WORK_PANELS.has(spec.slug)) await ensureNavGroupExpanded(page, 'work', 'Trabalho')
  if (COMPANY_PANELS.has(spec.slug)) await ensureNavGroupExpanded(page, 'company', 'Empresa')

  if (MORE_PANELS.has(spec.slug)) await ensureNavGroupExpanded(page, 'more', 'Mais')

  if (spec.kind === 'settings') {
    await clickNav(page, /configura/i)
  } else {
    await clickNav(page, spec.navLabel)
  }

  if (spec.slug === 'geral') {
    const geral = page.getByRole('button', { name: '#geral' })
    if (await geral.count() > 0) await geral.click({ timeout: 30_000 })
    else await page.getByText('#geral').first().click({ timeout: 30_000 }).catch(() => {})
  }

  if (spec.slug === 'geral' || spec.slug === 'canais') {
    await waitForGeralComposer(page, 90_000)
  } else if (spec.readySelector !== undefined) {
    await page.locator(spec.readySelector).first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
  } else {
    await page.waitForTimeout(800)
  }
}
