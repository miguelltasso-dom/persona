/**
 * Harvest item 4 (Anvil), proved in the REAL app: the real `persona` profile, the real runner path, a fake CLI that plays the model.
 *
 *   (1) a model that writes a folder path and "a pessoa" reaches the person as simple speech: the plain sentence first (você, no path),
 *       and ONE collapsed "Detalhes" fold that opens by click and holds the path
 *   (2) "pode ser técnico" in the conversation switches the register: the next answer keeps the path in the text, no fold
 *   (3) "fala mais simples" switches it back
 *   (4) a model that answers with the pass token never shows it: the person still gets one plain line (D-079), the token is nowhere on screen
 *
 * Opt-in `PERSONA_E2E=1` (one host boot, ~3 min). Evidence: `artifacts/first-delivery/speech-item4/` (a shot per step + proof.json).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { converseInGeral, createFirstDeliveryRecorder, runHappyFirstDelivery, walkOnboardingToStep5, type ConversationOutcome, type FirstDeliveryRecorder } from '../src/first-delivery-flow.ts'
import { openRealPersonaApp, type RealPersonaSession } from '../src/real-app-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

const PATH = 'C:\\Users\\ana\\padaria\\horario.json'
// The only persona is named "Probe" (the company name of the onboarding); "@Probe" makes her the one who answers, as a person does.
const QUESTION = '@Probe Qual o horário de abertura da padaria?'
const QUESTION_AGAIN = '@Probe E qual o horário de abertura da padaria no domingo?'
const PASS_TOKEN = '[[passar-a-vez]]'
const PASSED_LINE = 'Li sua mensagem e não tenho nada a acrescentar agora.'
const FIRST_DELIVERY_REPLY = 'Entrega do Probe (item 4): resumo da Agência Ponto em 5 pontos. Tarefa da semana: revisar o cardápio.'
const RULES = [
  { match: 'Bom dia, time', reply: PASS_TOKEN },
  { match: 'horário de abertura', reply: `Abrimos às 7h todos os dias e a pessoa já pode conferir. O horário está em ${PATH}.` },
  { match: 'cartaz', reply: JSON.stringify({ state: 'ready', summary: 'Texto do cartaz da promoção pronto, com o pão de queijo.' }) },
] as const

describe.skipIf(!runPersonaE2e).sequential('item 4 — simple speech, folded detail and the right to stay silent (fake CLI, real app)', () => {
  let session: RealPersonaSession
  let rec: FirstDeliveryRecorder
  const outcomes: ConversationOutcome[] = []

  const replyBox = (id: string) => session.page.locator(`[data-message-id="${id}"]`)
  const must = <T>(value: T | null, what: string): T => {
    if (value === null) throw new Error(what)
    return value
  }

  beforeAll(async () => {
    session = await openRealPersonaApp({
      engine: { kind: 'fake', turnMs: 400, rules: RULES, reply: FIRST_DELIVERY_REPLY },
      liveRunner: true,
      keepOnboarding: true,
      viewport: { width: 1280, height: 720 },
    })
    rec = await createFirstDeliveryRecorder(session.page, 'speech-item4')
  }, 360_000)

  afterAll(async () => {
    await rec?.write({ stage: 'afterAll', outcomes }).catch(() => {})
    await session?.close()
  }, 60_000)

  it('setup: onboarding and the first delivery leave ONE persona (named like the company) in #geral; a message that @-names her is answered by her', async () => {
    await walkOnboardingToStep5(session.page, 'Probe', rec.shot, rec.notes)
    await runHappyFirstDelivery(session.page, rec, { fakeTurnMs: 400, deadlineMs: 180_000 })
    // Leave the celebration for #geral the way a person does.
    outcomes.push(await converseInGeral(session.page, rec, 'obrigado'))
  }, 360_000)

  it('(1) a path and "a pessoa" reach the person as simple speech: você, no path in the text, ONE collapsed fold with the path inside', async () => {
    const out = await converseInGeral(session.page, rec, QUESTION, 90_000, { expectReply: true })
    outcomes.push(out)
    const reply = must(out.reply, '(1) no visible answer')
    const box = replyBox(reply.id)
    await box.locator('details').first().waitFor({ state: 'attached', timeout: 20_000 })
    expect(await box.locator('details').count()).toBe(1)
    expect(await box.locator('details').first().evaluate(node => (node as HTMLDetailsElement).open)).toBe(false)
    const visible = await box.locator('[data-persona-markdown] > p').allInnerTexts()
    expect(visible.join(' ')).toContain('Abrimos às 7h todos os dias e você já pode conferir.')
    expect(visible.join(' ')).not.toMatch(/C:\\|horario\.json|a pessoa/u)
    await box.scrollIntoViewIfNeeded()
    await rec.shot('speech-1-folded')
    await box.locator('summary').first().click()
    await expect.poll(async () => box.locator('details').first().evaluate(node => (node as HTMLDetailsElement).open)).toBe(true)
    expect(await box.locator('details').first().innerText()).toContain(PATH)
    await rec.shot('speech-1-open')
  }, 180_000)

  it('(2) "pode ser técnico" switches the register: the next answer keeps the path in the text', async () => {
    outcomes.push(await converseInGeral(session.page, rec, '@Probe pode ser técnico', 60_000, { expectReply: true }))
    const out = await converseInGeral(session.page, rec, QUESTION_AGAIN, 90_000, { expectReply: true })
    outcomes.push(out)
    const reply = must(out.reply, '(2) no visible answer')
    const box = replyBox(reply.id)
    await expect.poll(async () => (await box.innerText()).includes(PATH)).toBe(true)
    expect(await box.locator('details').count()).toBe(0)
    await rec.shot('speech-2-technical')
  }, 240_000)

  it('(3) "fala mais simples" switches it back: the path folds again', async () => {
    outcomes.push(await converseInGeral(session.page, rec, '@Probe fala mais simples', 60_000, { expectReply: true }))
    const out = await converseInGeral(session.page, rec, `${QUESTION_AGAIN} (e na segunda?)`, 90_000, { expectReply: true })
    outcomes.push(out)
    const reply = must(out.reply, '(3) no visible answer')
    const box = replyBox(reply.id)
    await box.locator('details').first().waitFor({ state: 'attached', timeout: 20_000 })
    expect(await box.locator('[data-persona-markdown] > p').allInnerTexts()).not.toContain(PATH)
    await rec.shot('speech-3-simple-again')
  }, 240_000)

  it('(4) the pass token never shows: the person gets one plain line and the token is nowhere on screen', async () => {
    const out = await converseInGeral(session.page, rec, '@Probe Bom dia, time. Como estão as coisas por aí hoje?', 90_000, { expectReply: true })
    outcomes.push(out)
    // the captured text carries the author header too ("Probe · Probe · 22:28"): the line itself is what matters
    expect(must(out.reply, '(4) no visible answer').text).toContain(PASSED_LINE)
    const page = await session.page.locator('body').innerText()
    expect(page).not.toMatch(/\[\[|passar-a-vez|NO_REPLY/u)
    await rec.shot('speech-4-pass')
  }, 180_000)
})
