/**
 * CV-4 (CONVERSAS-SPEC §5; Muse/Prism, 04/11): clicking a persona's FACE opens the DM with her — in the three places the face appears
 * (rail "Sua equipe", team strip of #geral, organograma). The persona card is NOT the click: it opens from the ⋯ ("Sobre {nome}",
 * `data-persona-card-trigger="<persona id>"`), from a long hover (~700 ms) or from Shift+F10 on the face. Real `persona` profile in
 * Chrome, fake CLI on PATH, 0 AI. Opt-in `PERSONA_E2E=1` (one host, ~2 min); run under `--lock build`.
 *
 * The organograma is the "Lista" version for small teams (up to 24 people), where the keyboard is the way in: Enter on the face opens the
 * DM and Shift+F10 opens the card menu (above 24 it becomes the scale map, with the same ⋯ — not covered: it needs a large team fixture).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { hireSuggestedTeam, openGaugeSession, type GaugeSession } from '../src/gauge-app.ts'
import { navigateGalleryPanel } from '../src/real-gallery/navigate-panel.ts'
import { REAL_GALLERY_PANELS } from '../src/real-gallery/panels.ts'

const run = process.env.PERSONA_E2E === '1'
const HOLD_MS = 900

const escapeRegExp = (value: string): string => value.replace(/[.*+?^${}()|[\]\\]/gu, '\\$&')

describe.skipIf(!run)('CV-4 — o rosto abre a DM; o cartão só pelo ⋯, hover longo ou Shift+F10', () => {
  let s: GaugeSession

  beforeAll(async () => {
    s = await openGaugeSession({ viewport: { width: 1440, height: 900 } })
    await hireSuggestedTeam(s.page)
  }, 420_000)

  afterAll(async () => { await s?.close() }, 60_000)

  const card = (page: Page) => page.getByRole('dialog')
  /** The DM thread pane is a labelled region named after the person who is on the other side. */
  const dmWith = (page: Page, name: string) => page.getByRole('region', { name, exact: true })

  async function openRailTeam(page: Page): Promise<void> {
    const title = page.locator('#persona-rail-team-title')
    if (await title.count() > 0 && (await title.getAttribute('aria-expanded')) === 'false') await title.click()
    await page.locator('#persona-rail-team-list').waitFor({ state: 'visible', timeout: 30_000 })
  }

  /** A persona on the rail: her host id (from the stable hook) and her name (from "Sobre {nome}"). */
  async function railPersona(page: Page, index = 0): Promise<{ id: string; name: string }> {
    await openRailTeam(page)
    const trigger = page.locator('#persona-rail-team-list [data-persona-card-trigger]').nth(index)
    await trigger.waitFor({ state: 'visible', timeout: 30_000 })
    const id = (await trigger.getAttribute('data-persona-card-trigger')) ?? ''
    const label = (await trigger.getAttribute('aria-label')) ?? ''
    const name = label.replace(/^Sobre /u, '')
    expect(id, 'the ⋯ carries data-persona-card-trigger=<persona id>').not.toBe('')
    expect(name, 'the ⋯ is named "Sobre {nome}"').not.toBe('')
    return { id, name }
  }

  async function closeCard(page: Page): Promise<void> {
    if (await card(page).count() > 0) {
      await page.keyboard.press('Escape')
      await card(page).first().waitFor({ state: 'hidden', timeout: 10_000 }).catch(() => {})
    }
  }

  it('RAIL: clicar no rosto abre a DM e NÃO abre o cartão', async () => {
    const { page } = s
    const who = await railPersona(page, 1)
    await closeCard(page)
    await page.locator('#persona-rail-team-list').getByRole('button', { name: new RegExp(`^Conversar com ${escapeRegExp(who.name)}`, 'u') }).first().click()
    await dmWith(page, who.name).first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await card(page).count(), 'the card did not open on a face click').toBe(0)
  })

  it('RAIL: o cartão abre pelo ⋯ (data-persona-card-trigger), pelo hover longo e por Shift+F10', async () => {
    const { page } = s
    const who = await railPersona(page, 1)
    // ⋯ — by the stable hook
    await page.locator(`[data-persona-card-trigger="${who.id}"]`).first().click()
    await card(page).first().waitFor({ state: 'visible', timeout: 15_000 })
    expect(await card(page).first().innerText()).toContain(who.name)
    await closeCard(page)
    // long hover (~700 ms)
    const face = page.locator('#persona-rail-team-list').getByRole('button', { name: new RegExp(`^Conversar com ${escapeRegExp(who.name)}`, 'u') }).first()
    // Leave the ⋯ first: a card that was just dismissed from the same persona must see a FRESH pointer entry on the face to open on hover.
    await page.mouse.move(2, 2)
    await page.waitForTimeout(400)
    await face.hover()
    await page.waitForTimeout(HOLD_MS)
    await card(page).first().waitFor({ state: 'visible', timeout: 10_000 })
    await page.mouse.move(2, 2)
    await closeCard(page)
    // Shift+F10 on the focused face
    await face.focus()
    await page.keyboard.press('Shift+F10')
    await card(page).first().waitFor({ state: 'visible', timeout: 10_000 })
    await closeCard(page)
  })

  it('FAIXA DA EQUIPE (#geral): clicar no rosto abre a DM; o ⋯ abre o cartão', async () => {
    const { page } = s
    await navigateGalleryPanel(page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'geral')!)
    const stripFace = page.locator('section[aria-labelledby="persona-team-strip-title"] button[aria-label^="Conversar com "]').first()
    await stripFace.waitFor({ state: 'visible', timeout: 60_000 })
    const name = ((await stripFace.getAttribute('aria-label')) ?? '').replace(/^Conversar com /u, '').split(' · ')[0]!.trim()
    await stripFace.click()
    await dmWith(page, name).first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await card(page).count(), 'the card did not open on a strip face click').toBe(0)

    await navigateGalleryPanel(page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'geral')!)
    const stripMenu = page.locator('section[aria-labelledby="persona-team-strip-title"] [data-persona-card-trigger]').first()
    await stripMenu.waitFor({ state: 'visible', timeout: 30_000 })
    await stripMenu.click()
    await card(page).first().waitFor({ state: 'visible', timeout: 15_000 })
    await closeCard(page)
  })

  it('ORGANOGRAMA: clicar no rosto abre a DM; o ⋯ "Sobre {nome}" abre o cartão', async () => {
    const { page } = s
    await navigateGalleryPanel(page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'org-chart')!)
    const surface = page.locator('[data-persona-surface="org-chart"]').first()
    await surface.waitFor({ state: 'visible', timeout: 60_000 })
    const menu = surface.locator('[data-persona-card-trigger]').first()
    await menu.waitFor({ state: 'visible', timeout: 30_000 })
    const id = (await menu.getAttribute('data-persona-card-trigger')) ?? ''
    const name = ((await menu.getAttribute('aria-label')) ?? '').replace(/^(Sobre|About) /u, '')
    expect(id).not.toBe('')
    // the face is the ⋯'s sibling button
    await menu.locator('xpath=../button[not(@data-persona-card-trigger)]').first().click()
    await dmWith(page, name).first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await card(page).count(), 'the card did not open on an organograma face click').toBe(0)

    await navigateGalleryPanel(page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'org-chart')!)
    await page.locator(`[data-persona-surface="org-chart"] [data-persona-card-trigger="${id}"]`).first().click()
    await card(page).first().waitFor({ state: 'visible', timeout: 15_000 })
    expect(await card(page).first().innerText()).toContain(name)
    await closeCard(page)
  })

  it('ORGANOGRAMA (Lista, teclado): Enter no rosto abre a DM; Shift+F10 abre o cartão', async () => {
    const { page } = s
    await navigateGalleryPanel(page, REAL_GALLERY_PANELS.find(panel => panel.slug === 'org-chart')!)
    const surface = page.locator('[data-persona-surface="org-chart"]').first()
    await surface.waitFor({ state: 'visible', timeout: 60_000 })
    const menu = surface.locator('[data-persona-card-trigger]').first()
    await menu.waitFor({ state: 'visible', timeout: 30_000 })
    const name = ((await menu.getAttribute('aria-label')) ?? '').replace(/^(Sobre|About) /u, '')
    const face = menu.locator('xpath=../button[not(@data-persona-card-trigger)]').first()
    await face.focus()
    await page.keyboard.press('Shift+F10')
    await card(page).first().waitFor({ state: 'visible', timeout: 10_000 })
    await closeCard(page)
    await face.focus()
    await page.keyboard.press('Enter')
    await dmWith(page, name).first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await card(page).count(), 'Enter on the face opens the DM, not the card').toBe(0)
  })
})
