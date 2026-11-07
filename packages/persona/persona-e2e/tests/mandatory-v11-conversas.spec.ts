/**
 * E2E-V11 — CV-1 (the single lilac bar), CV-3 ("Quem responde" with the whole team and `@nome`) and CV-7 (the empty team channel) on the real persona profile, web,
 * fake CLI, 0 AI, behind `persona.flag.navPlaces` (D-077: the app only turns it on at the cut). Spec: `persona-spec/design/CONVERSAS-SPEC.md` §0, §3, §4.
 * Selectors are the ones the app really exposes (`data-nav-place`, `data-conversation-row`, the composer's "Persona que responde"), read by `scripts/v11-discovery.ts`.
 * Opt-in `PERSONA_E2E=1`; one host, ~3–4 min.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import type { Page } from 'playwright'
import { openV11Session, type V11Session } from '../src/v11-app.ts'
import { personasOf, v11Tenant, type PersonaRow } from '../src/v11-helpers.ts'

const run = process.env.PERSONA_E2E === '1'
const PLACES = ['overview', 'projects', 'approvals', 'team', 'memory', 'settings'] as const

describe.skipIf(!run).sequential('V11 web — CV-1 barra lilás, CV-3 "Quem responde", CV-7 vazio do canal (fake, navPlaces ligada)', () => {
  let v11: V11Session
  let team: PersonaRow[]
  let page: Page
  const composer = () => page.locator('[data-persona-area="composer"]').first()
  const conversationRows = (kind: string) => page.locator(`[data-conversation-row][data-conversation-kind="${kind}"]`)
  /** The DM thread pane is a labelled region named after the person on the other side. */
  const dmWith = (name: string) => page.getByRole('region', { name, exact: true })

  async function openGeral(): Promise<void> {
    const channels = page.getByRole('button', { name: /^Canais$/u }).first()
    if (await conversationRows('channel').count() === 0 && await channels.count() > 0) await channels.click()
    const geral = conversationRows('channel').filter({ hasText: /geral/i }).first()
    await geral.waitFor({ state: 'visible', timeout: 30_000 })
    await geral.click()
    await composer().waitFor({ state: 'visible', timeout: 30_000 })
  }

  beforeAll(async () => {
    v11 = await openV11Session({ navPlaces: true, viewport: { width: 1440, height: 900 }, engine: { turnMs: 1_500 } })
    page = v11.page
    team = await personasOf(page, await v11Tenant(page))
  }, 420_000)

  afterAll(async () => { await v11?.close() }, 60_000)

  it('CV-1: the bar has the 6 compact places and NO "Conversas" place — the conversations ARE the bar (Canais + Pessoas, a row per persona)', async () => {
    for (const place of PLACES) expect(await page.locator(`[data-nav-place="${place}"]`).count(), `place ${place}`).toBeGreaterThan(0)
    expect(await page.locator('[data-nav-place="conversations"]').count(), '"Conversas" is not a place any more').toBe(0)
    expect(await page.getByRole('button', { name: /^Conversas$/u }).count()).toBe(0)
    await page.getByRole('button', { name: /^Canais$/u }).first().waitFor({ state: 'visible', timeout: 15_000 })
    await page.getByRole('button', { name: /^Pessoas$/u }).first().waitFor({ state: 'visible', timeout: 15_000 })
    const rows = conversationRows('dm')
    expect(await rows.count(), 'one conversation row per persona').toBeGreaterThanOrEqual(team.length)
    const rowIds = await rows.evaluateAll(nodes => nodes.map(node => node.getAttribute('data-persona-id')))
    for (const persona of team) expect(rowIds, `row of ${persona.name}`).toContain(persona.id)
  })

  it('CV-1: a row opens the DM with that persona (the main area becomes the thread), and Ctrl+K + name + Enter does the same', async () => {
    const target = team.find(persona => persona.name === 'Criação') ?? team[0]!
    await conversationRows('dm').filter({ has: page.locator(`xpath=self::*[@data-persona-id="${target.id}"]`) }).first().click().catch(async () => {
      await page.locator(`[data-conversation-row][data-persona-id="${target.id}"]`).first().click()
    })
    await dmWith(target.name).first().waitFor({ state: 'visible', timeout: 30_000 })
    const other = team.find(persona => persona.id !== target.id && persona.name !== target.name)!
    await page.keyboard.press('Control+K')
    await page.waitForTimeout(500)
    await page.keyboard.type(other.name)
    await page.waitForTimeout(700)
    await page.keyboard.press('Enter')
    await dmWith(other.name).first().waitFor({ state: 'visible', timeout: 30_000 })
  }, 120_000)

  it('CV-1: Alt+↓ / Alt+↑ walk the conversation list', async () => {
    // The open conversation is the row the rail marks `aria-current="page"` (the main heading is the section's, "Mensagens diretas", in every DM).
    const heading = async (): Promise<string> => {
      const active = page.locator('[data-conversation-row][aria-current="page"]').first()
      return `${await active.getAttribute('data-conversation-kind').catch(() => '')}:${await active.getAttribute('data-persona-id').catch(() => '')}:${(await active.getAttribute('aria-label').catch(() => '')) ?? ''}`
    }
    await conversationRows('dm').first().click()
    await page.waitForTimeout(800)
    const first = await heading()
    await page.keyboard.press('Alt+ArrowDown')
    await page.waitForTimeout(800)
    const second = await heading()
    expect(second, 'Alt+↓ moved to another conversation').not.toBe(first)
    await page.keyboard.press('Alt+ArrowUp')
    await page.waitForTimeout(800)
    expect(await heading(), 'Alt+↑ came back').toBe(first)
  }, 60_000)

  it('CV-3: in a channel the composer says "Quem responde: Coordenação"; the DM has NO "Quem responde" (CV-2)', async () => {
    await openGeral()
    expect(await composer().innerText()).toMatch(/Quem responde\s+Coordenação/u)
    await composer().getByRole('button', { name: 'Persona que responde' }).waitFor({ state: 'visible', timeout: 15_000 })
    const firstRow = conversationRows('dm').first()
    const firstId = await firstRow.getAttribute('data-persona-id')
    await firstRow.click()
    await dmWith(team.find(persona => persona.id === firstId)?.name ?? team[0]!.name).first().waitFor({ state: 'visible', timeout: 30_000 })
    expect(await composer().getByRole('button', { name: 'Persona que responde' }).count(), 'a DM answers by the persona herself: no selector').toBe(0)
  }, 90_000)

  it('CV-3: "Quem responde" lists the whole team, picks with the keyboard, and goes back to the Coordenação after ONE message', async () => {
    await openGeral()
    await composer().getByRole('button', { name: 'Persona que responde' }).click()
    await page.getByText('Quem responde aqui', { exact: false }).first().waitFor({ state: 'visible', timeout: 15_000 })
    for (const persona of team.filter(row => row.name !== 'Coordenação')) {
      expect(await page.getByRole('option', { name: new RegExp(persona.name, 'u') }).count() + await page.getByRole('button', { name: new RegExp(persona.name, 'u') }).count(), `${persona.name} is in the popover`).toBeGreaterThan(0)
    }
    expect(await page.getByText(/Enter responde aqui/u).count(), 'the footer teaches Enter / Ctrl+Enter').toBeGreaterThan(0)
    await page.keyboard.press('ArrowDown')
    await page.keyboard.press('Enter')
    await page.waitForTimeout(600)
    const chosen = (await composer().innerText()).match(/Quem responde\s+(\S+)/u)?.[1] ?? ''
    expect(chosen, 'the chip now names someone else').not.toBe('Coordenação')
    const textarea = page.locator('[data-persona-area="composer"] textarea').first()
    await textarea.focus()
    await textarea.fill('só uma pergunta rápida sobre o cartaz')
    await textarea.press('Enter')
    await page.waitForTimeout(1_500)
    expect(await composer().innerText(), 'after sending, the chip is back on the Coordenação').toMatch(/Quem responde\s+Coordenação/u)
  }, 120_000)

  it('CV-3: "@" opens the same list filtered by what follows, and the choice becomes a chip in the text', async () => {
    await openGeral()
    const textarea = page.locator('[data-persona-area="composer"] textarea').first()
    await textarea.focus()
    await textarea.fill('@Mí')
    await page.waitForTimeout(800)
    // only the popover's options (the rail also has a "Conversar com Mídia" button, which is not the list under test)
    const option = page.getByRole('option', { name: /Mídia/u }).first()
    await option.waitFor({ state: 'visible', timeout: 15_000 })
    expect(await page.getByRole('option', { name: /Criação|Atendimento/u }).count(), 'the list is filtered by what follows the "@"').toBe(0)
    await page.keyboard.press('Enter')
    await page.waitForTimeout(500)
    expect(await composer().innerText() + (await textarea.inputValue()), 'the mention is in the composer').toMatch(/@Mídia/u)
  }, 60_000)

  it('CV-1: at 960 px the bar becomes a 64 px rail (labels hidden, the place buttons still reachable by name)', async () => {
    await page.setViewportSize({ width: 960, height: 720 })
    await page.waitForTimeout(1_200)
    const overview = page.locator('[data-nav-place="overview"]').first()
    await overview.waitFor({ state: 'attached', timeout: 15_000 })
    const box = await overview.boundingBox()
    expect(box, 'the place button is laid out').not.toBeNull()
    expect(box!.width, 'compact rail: the button is an icon, not a 280 px row').toBeLessThanOrEqual(96)
    await page.setViewportSize({ width: 1440, height: 900 })
    await page.waitForTimeout(800)
  }, 60_000)

  it('CV-7: the empty channel of a team shows the team and "Este é o canal da equipe de …" (only when the host made a team channel)', async (context) => {
    await page.getByRole('button', { name: /^Canais$/u }).first().click().catch(() => {})
    const teamChannel = conversationRows('channel').filter({ hasNotText: /geral/i }).first()
    if (await teamChannel.count() === 0) context.skip('no team channel was generated for this fixture (CV-6: team channels are born from the organograma); nothing to open')
    await teamChannel.click()
    await page.getByText(/Este é o canal da equipe de/u).first().waitFor({ state: 'visible', timeout: 15_000 })
  }, 60_000)
})
