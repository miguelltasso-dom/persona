/**
 * Harvest item 16 (Anvil), first slice, in the REAL app: real `persona` profile, real message path, a fake CLI that plays the model.
 *
 *   (1) the owner says "Pessoal, lembrem disso: …" in #geral → it is a team memory; the persona's profile › Memória shows it with its source
 *       ("Você disse no #geral hoje:") and the owner's words word for word in curly quotes; the chip reads "Toda a equipe"
 *   (2) "Regra da casa: …" is kept as a rule ("Regra da casa" chip)
 *   (3) a long message is cut at four lines, closed like a quote ("…”"), with "Ver tudo" that opens it
 *   (4) said in a DM to the persona, it is HER memory: "Você disse numa conversa direta com Probe hoje:" and "Só para Probe"
 *
 * Opt-in `PERSONA_E2E=1` (one host boot, ~3 min). Evidence: `artifacts/first-delivery/owner-memory-item16/` (a shot per step + proof.json).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { converseInGeral, createFirstDeliveryRecorder, runHappyFirstDelivery, walkOnboardingToStep5, type ConversationOutcome, type FirstDeliveryRecorder } from '../src/first-delivery-flow.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

const FACT = 'Pessoal, lembrem disso: a padaria abre às 7h'
const RULE = 'Regra da casa: nunca prometer entrega no mesmo dia'
const LONG = 'Pessoal, lembrem disso: a promoção de sábado é 2 pães de queijo por R$ 9, vale só para retirada no balcão, não vale em feriado, não soma com nenhum outro desconto e o cliente precisa mostrar a mensagem do WhatsApp na hora de pagar; se ele pedir entrega, cobramos a taxa normal e avisamos que a promoção não vale para entrega, nem para encomenda grande, nem para pedido feito depois das 17h; o pão sai quente às 7h, às 11h e às 16h e, quando acabar o pão de queijo, a gente oferece o pão de batata no mesmo preço, sem perguntar ao cliente se ele quer esperar.'
const DM = 'Lembra que a Ana Souza prefere pão sem sal'

/** The cut quote beside a "Ver tudo": it ends "…”" (the closing mark is never lost), has no doubled punctuation, and nothing is left for the line clamp to clip. */
async function expectClosedLikeAQuote(more: { locator(selector: string): { textContent(): Promise<string | null>; evaluate<T>(fn: (node: HTMLElement) => T): Promise<T> } }): Promise<void> {
  const quote = more.locator('xpath=preceding-sibling::blockquote[1]')
  const text = (await quote.textContent()) ?? ''
  expect(text.endsWith('…”'), `the cut quote must close with …” — got: ${text.slice(-40)}`).toBe(true)
  expect(text).not.toMatch(/[.,;:!?]…/u)
  expect(await quote.evaluate(node => node.scrollHeight <= node.clientHeight + 1)).toBe(true)
}

describe.skipIf(!runPersonaE2e).sequential('item 16 — memory that proves itself: the owner\'s words, kept with their source (fake CLI, real app)', () => {
  let session: RealPersonaSession
  let rec: FirstDeliveryRecorder
  const outcomes: ConversationOutcome[] = []

  beforeAll(async () => {
    session = await openRealPersonaApp({
      engine: { kind: 'fake', turnMs: 300, reply: 'Anotado.' },
      liveRunner: true,
      keepOnboarding: true,
      viewport: { width: 1280, height: 720 },
    })
    rec = await createFirstDeliveryRecorder(session.page, 'owner-memory-item16')
  }, 360_000)

  afterAll(async () => {
    await rec?.write({ stage: 'afterAll', outcomes }).catch(() => {})
    await session?.close()
  }, 60_000)

  it('setup: onboarding, first delivery, then the owner says what the team must remember (channel and DM)', async () => {
    await walkOnboardingToStep5(session.page, 'Probe', rec.shot, rec.notes)
    await runHappyFirstDelivery(session.page, rec, { fakeTurnMs: 300, deadlineMs: 180_000 })
    for (const text of [FACT, RULE, LONG]) outcomes.push(await converseInGeral(session.page, rec, text, 45_000))
    // A DM with the persona: the face in the rail opens it; the composer is the same one.
    await session.page.getByRole('button', { name: 'Conversar com Probe' }).first().click({ timeout: 30_000 })
    const composer = session.page.locator('textarea').last()
    await composer.waitFor({ state: 'visible', timeout: 30_000 })
    await composer.fill(DM)
    await composer.press('Enter')
    await session.page.waitForTimeout(2_500)
  }, 360_000)

  /** The rail ⋯ ("Sobre Probe") or Shift+F10 on her row opens her card; the card's menu has "Abrir perfil". Tries both, in that order. */
  async function openProfileOfProbe(): Promise<void> {
    const page = session.page
    const openItem = page.getByRole('menuitem', { name: 'Abrir perfil', exact: true }).first()
    const seen = (locator: ReturnType<typeof page.locator>, timeout: number): Promise<boolean> => locator.waitFor({ state: 'visible', timeout }).then(() => true, () => false)
    const row = page.getByRole('button', { name: /Conversar com Probe/u }).first()
    const profile = page.locator('[data-persona-surface="profile"]').first()
    // The "Equipe" page lists the people and opens a profile by click (the rail no longer has a ⋯ per person).
    await page.getByRole('button', { name: 'Equipe', exact: true }).first().click({ timeout: 15_000 })
    const person = page.getByRole('button', { name: /^(?!Conversar com).*Probe/u }).first()
    if (await seen(person, 15_000)) {
      await person.click({ timeout: 10_000 })
      if (await seen(profile, 30_000)) return
    }
    const ways = [
      // the rail ⋯ shows when the row is hovered
      async () => { await row.hover({ timeout: 10_000 }); await page.getByRole('button', { name: 'Sobre Probe', exact: true }).first().click({ timeout: 10_000 }) },
      // a long hover on her face opens the card
      async () => { await row.hover({ timeout: 10_000 }); await page.waitForTimeout(1_800) },
      async () => { await row.focus(); await page.keyboard.press('Shift+F10') },
    ]
    for (const way of ways) {
      await page.keyboard.press('Escape').catch(() => undefined)
      try { await way() } catch { continue }
      if (!(await seen(openItem, 5_000))) {
        const more = page.getByRole('button', { name: 'Mais ações para Probe', exact: true }).first()
        if (await seen(more, 8_000)) await more.click({ timeout: 10_000 })
      }
      if (await seen(openItem, 8_000)) {
        await openItem.click({ timeout: 10_000 })
        await page.locator('[data-persona-surface="profile"]').first().waitFor({ state: 'visible', timeout: 60_000 })
        return
      }
    }
    rec.notes.push(`diag: ${JSON.stringify(await page.evaluate(() => [...document.querySelectorAll('button,[role="menuitem"]')].map(node => (node.getAttribute('aria-label') ?? node.textContent ?? '').trim().slice(0, 40)).filter(label => /Probe|perfil|Mais/iu.test(label))))}`)
    await rec.shot('diag-profile-not-opened')
    throw new Error('could not open the profile of Probe from the rail card (see diag-profile-not-opened.png)')
  }

  it('(1)–(4) the persona\'s profile › Memória lists them with the source line and the owner\'s words', async () => {
    const page = session.page
    await openProfileOfProbe()
    await page.getByRole('tab', { name: 'Memória' }).click({ timeout: 30_000 })
    await page.locator('[data-memory-proof]').first().waitFor({ state: 'visible', timeout: 30_000 })
    const lines = await page.locator('[data-memory-proof] figcaption').allInnerTexts()
    expect(lines).toContain('Você disse no #geral hoje:')
    expect(lines).toContain('Você disse numa conversa direta com Probe hoje:') // no article: the product keeps no gender for a persona
    const quotes = await page.locator('[data-memory-proof] blockquote').allInnerTexts()
    expect(quotes).toContain(`“${FACT}”`)
    expect(quotes).toContain(`“${RULE}”`)
    expect(quotes).toContain(`“${DM}”`)
    // (vitest's expect has no locator matchers: wait for the element the Playwright way)
    for (const text of ['Regra da casa', 'Só para Probe', 'Toda a equipe']) {
      await page.getByText(text, { exact: true }).first().waitFor({ state: 'visible', timeout: 15_000 })
    }
    await page.locator('[data-memory-proof]').first().scrollIntoViewIfNeeded()
    await rec.shot('memory-1-list')

    // The long one is cut at four lines and opens by "Ver tudo".
    const more = page.getByRole('button', { name: 'Ver tudo' }).first()
    await more.waitFor({ state: 'visible', timeout: 15_000 })
    await more.scrollIntoViewIfNeeded()
    await expectClosedLikeAQuote(more)
    await rec.shot('memory-2-long-closed')
    await more.click()
    await page.getByRole('button', { name: 'Ver menos' }).first().waitFor({ state: 'visible', timeout: 15_000 })
    await rec.shot('memory-3-long-open')
  }, 240_000)

  // Muse's acceptance matrix (light/dark × 100%/200%): a long quote (5+ lines) closed and open, and the one said in a DM. The 200% cell is the
  // layout of a 640×360 window (what a 200% zoom of 1280×720 lays out), so the wrapping is the real one.
  it('acceptance matrix: light and dark at 100% and 200%, the long quote closed and open, the DM one, and no sideways scroll', async () => {
    const page = session.page
    const cells = [
      { scheme: 'light', width: 1280, height: 720, zoom: '100' },
      { scheme: 'dark', width: 1280, height: 720, zoom: '100' },
      { scheme: 'light', width: 640, height: 360, zoom: '200' },
      { scheme: 'dark', width: 640, height: 360, zoom: '200' },
    ] as const
    for (const cell of cells) {
      await page.setViewportSize({ width: cell.width, height: cell.height })
      await page.emulateMedia({ colorScheme: cell.scheme })
      await page.evaluate((dark) => {
        if (dark) document.body.setAttribute('data-ds-dark-theme', 'true')
        else document.body.removeAttribute('data-ds-dark-theme')
      }, cell.scheme === 'dark')
      await page.waitForTimeout(700)
      const tag = `matrix-${cell.scheme}-${cell.zoom}`
      // closed state first: a quote left open by the step before is closed again
      const less = page.getByRole('button', { name: 'Ver menos' }).first()
      if (await less.isVisible().catch(() => false)) await less.click()
      const more = page.getByRole('button', { name: 'Ver tudo' }).first()
      await more.waitFor({ state: 'visible', timeout: 15_000 })
      await more.scrollIntoViewIfNeeded()
      await expectClosedLikeAQuote(more) // at every width the cut is OUR cut: "…”" and nothing left for the line clamp to clip
      await rec.shot(`${tag}-long-closed`)
      await more.click()
      await page.getByRole('button', { name: 'Ver menos' }).first().waitFor({ state: 'visible', timeout: 15_000 })
      await rec.shot(`${tag}-long-open`)
      await page.getByRole('button', { name: 'Ver menos' }).first().click()
      const dm = page.locator('[data-memory-proof]').filter({ hasText: 'numa conversa direta' }).first()
      await dm.scrollIntoViewIfNeeded()
      await rec.shot(`${tag}-dm`)
      // no sideways scroll of the page, and the quotes never wider than their card
      const overflow = await page.evaluate(() => ({
        page: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        quotes: [...document.querySelectorAll('[data-memory-proof] blockquote')].filter(node => node.scrollWidth > node.clientWidth + 1).length,
      }))
      expect(overflow, `${tag}: sideways scroll`).toEqual({ page: 0, quotes: 0 })
    }
  }, 240_000)
})
