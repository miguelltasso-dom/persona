import type { Page } from 'playwright'
import { DEV_SEED_PROFILE_PERSONA, type GalleryPanelSpec } from './panels.ts'
import { dismissBlockingOverlays } from '../boot-gate-bootstrap.ts'
import { waitForGeralComposer } from '../geral-composer.ts'
import { personaNameFromRailTalkLabel } from './rail-persona-name.ts'

/**
 * Gallery slug → `MainPanelId` (client `create-shell-store.ts`). NAV-SPEC A-1 (6 places + tabs) changes WHERE a screen lives, not its
 * id: navigation uses `data-nav-panel` / `data-nav-contains` / `data-tab-panel` (see {@link navigateByPanelId}) and only falls back to
 * the visible label (legacy rail).
 */
const PANEL_IDS: Readonly<Record<string, string>> = {
  'visao-geral': 'overview',
  geral: 'channels',
  canais: 'channels',
  dms: 'directMessages',
  equipe: 'team',
  'org-chart': 'orgChart',
  'team-health': 'teamHealth',
  projetos: 'projects',
  kanban: 'kanban',
  rotinas: 'routines',
  conhecimento: 'knowledge',
  'segundo-cerebro': 'secondBrain',
  arquivos: 'files',
  uso: 'usage',
  conexoes: 'connections',
  aprovacoes: 'approvals',
  regras: 'rules',
  membros: 'members',
  importar: 'importers',
  canvas: 'canvas',
}

const MORE_PANELS = new Set(['membros', 'importar', 'canvas'])
const COMPANY_PANELS = new Set(['conhecimento', 'segundo-cerebro', 'arquivos', 'uso', 'conexoes', 'regras'])
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

  const resolved = await resolveRailPersonaName(page, personaName)
  const sobre = page.getByRole('button', { name: `Sobre ${resolved}`, exact: true }).first()
  if (await sobre.isVisible().catch(() => false)) {
    await sobre.click({ timeout: 60_000 })
  } else {
    const dm = page.getByRole('button', { name: new RegExp(`Conversar com ${escapeRegExp(resolved)}`) }).first()
    await dm.waitFor({ state: 'visible', timeout: 60_000 })
    await dm.focus()
    await page.keyboard.press('Shift+F10')
  }

  // CV-4: the face now opens the DM; the rail ⋯ ("Sobre {nome}", data-persona-card-trigger) opens the card. Either the ⋯ already offers
  // "Abrir perfil" or the card's own "Mais ações para {nome}" does: take whichever is there.
  const openProfile = page.getByRole('menuitem', { name: 'Abrir perfil', exact: true })
  if (!(await openProfile.first().isVisible().catch(() => false))) {
    await page.getByRole('button', { name: `Mais ações para ${resolved}`, exact: true }).first()
      .click({ timeout: 30_000 })
  }
  await openProfile.first().click({ timeout: 30_000 })
  await page.locator('[data-persona-surface="profile"]').first().waitFor({ state: 'visible', timeout: 60_000 })
}

/** Prefer the requested name; otherwise the first rail "Conversar com" (first-run ≠ Atlas). */
async function resolveRailPersonaName(page: Page, preferred: string): Promise<string> {
  const preferredSobre = page.getByRole('button', { name: `Sobre ${preferred}`, exact: true }).first()
  if (await preferredSobre.isVisible().catch(() => false)) return preferred
  const preferredDm = page.getByRole('button', { name: new RegExp(`Conversar com ${escapeRegExp(preferred)}`) }).first()
  if (await preferredDm.isVisible().catch(() => false)) return preferred

  const anyDm = page.getByRole('button', { name: /^Conversar com / }).first()
  if (await anyDm.isVisible().catch(() => false)) {
    const label = (await anyDm.getAttribute('aria-label')) ?? (await anyDm.innerText())
    return personaNameFromRailTalkLabel(label) ?? preferred
  }
  return preferred
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/**
 * NAV-SPEC A-1 resolution (Prism, 04/11): to reach ANY `MainPanelId`
 *  1. a rail item whose entry screen is the id: `[data-nav-panel="<id>"]` → click;
 *  2. otherwise the place that contains it: `[data-nav-contains~="<id>"]` → click, then its tab `[data-tab-panel="<id>"]` (tabs exist only
 *     while the place is open; no tab means the place already opened on that screen);
 *  3. otherwise the caller falls back to the visible label (legacy rail).
 * @returns `true` when it navigated by id.
 */
async function navigateByPanelId(page: Page, spec: GalleryPanelSpec, panelId: string): Promise<boolean> {
  const direct = page.locator(`[data-nav-panel="${panelId}"]`).first()
  const place = page.locator(`[data-nav-contains~="${panelId}"]`).first()
  if (await direct.count() > 0) {
    await direct.scrollIntoViewIfNeeded({ timeout: 60_000 }).catch(() => {})
    await direct.click({ timeout: 60_000 })
  } else if (await place.count() > 0) {
    await place.scrollIntoViewIfNeeded({ timeout: 60_000 }).catch(() => {})
    await place.click({ timeout: 60_000 })
    const tab = page.locator(`[data-tab-panel="${panelId}"]`).first()
    await tab.waitFor({ state: 'visible', timeout: 10_000 }).catch(() => {})
    if (await tab.count() > 0) await tab.click({ timeout: 30_000 })
  } else {
    return false
  }
  if (spec.slug === 'geral') {
    const geral = page.getByRole('button', { name: '#geral' })
    if (await geral.count() > 0) await geral.first().click({ timeout: 30_000 }).catch(() => {})
  }
  await waitAfterNavigation(page, spec)
  return true
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

  const panelId = PANEL_IDS[spec.slug]
  if (panelId !== undefined && spec.kind === 'nav' && await navigateByPanelId(page, spec, panelId)) return

  if (TEAM_PANELS.has(spec.slug)) await ensureNavGroupExpanded(page, 'team', 'Equipe')
  if (WORK_PANELS.has(spec.slug)) await ensureNavGroupExpanded(page, 'work', 'Trabalho')
  if (COMPANY_PANELS.has(spec.slug)) await ensureNavGroupExpanded(page, 'company', 'Empresa')

  if (MORE_PANELS.has(spec.slug)) await ensureNavGroupExpanded(page, 'more', 'Mais')

  const toChannel = spec.slug === 'geral' || spec.slug === 'canais'
  if (spec.kind === 'settings') {
    await clickNav(page, /configura/i)
  } else if (toChannel) {
    // CV-1 (the lilac rail): "Canais" is the SECTION HEAD of the channels, a toggle that starts EXPANDED with "#geral" in it. The legacy rail had "Canais" as a nav item, so the old step clicked it
    // blindly — on the current rail that click COLLAPSES the group and hides "#geral": the boot smoke failed for it (09/11) as soon as the shipped client lib was rebuilt. Open the head only
    // when the channel is hidden.
    await openChannelsGroup(page, spec.navLabel)
  } else {
    await clickNav(page, spec.navLabel)
  }

  if (toChannel) {
    const geral = page.getByRole('button', { name: '#geral' })
    if (await geral.count() > 0) await geral.first().click({ timeout: 30_000 })
    else await page.getByText('#geral').first().click({ timeout: 30_000 }).catch(() => {})
  }

  await waitAfterNavigation(page, spec)
}

/**
 * Make "#geral" reachable without ever collapsing it: nothing to do when the channel is already listed; otherwise open the "Canais" head only if it says it is collapsed
 * (`aria-expanded="false"`), or click it when it is a plain nav item of the legacy rail (no `aria-expanded`).
 */
async function openChannelsGroup(page: Page, label: string): Promise<void> {
  await page.locator('[data-persona-shell]').waitFor({ state: 'visible', timeout: 120_000 })
  if (await page.getByRole('button', { name: '#geral' }).count() > 0) return
  const head = page.getByRole('button', { name: label, exact: true }).first()
  if (await head.count() === 0) return
  if (await head.getAttribute('aria-expanded') === 'true') return
  await head.scrollIntoViewIfNeeded({ timeout: 60_000 }).catch(() => {})
  await head.click({ timeout: 60_000 })
}

async function waitAfterNavigation(page: Page, spec: GalleryPanelSpec): Promise<void> {
  if (spec.slug === 'geral' || spec.slug === 'canais') {
    await waitForGeralComposer(page, 90_000)
  } else if (spec.readySelector !== undefined) {
    await page.locator(spec.readySelector).first().waitFor({ state: 'visible', timeout: 60_000 }).catch(() => {})
  } else {
    await page.waitForTimeout(800)
  }
}
