/**
 * D-079 (Atlas, 04/11) — INVARIANT: every message the person sends gets a reply, a reaction or a visible state line; NEVER silence.
 * The scenarios of `persona-spec/contracts/conversation.md` as reusable steps, so the web spec and the INSTALLED fake run the same ones.
 * A step throws on a broken expectation (plain `Error`, no test framework); the caller owns the page, the recorder and the fake CLI.
 *
 *   setup  the first delivery is delivered and accepted: a Task is open in #geral (see `runHappyFirstDelivery`)
 *   (a)    ANOTHER subject: "obrigado" → reaction (D-075); "quanto custou isso?" → a REPLY
 *   (b)    the persona asks a question; the person's answer CONTINUES that Task (2nd model turn, "Resposta enviada para …", final report)
 *   (c)    SAME subject while the Task is RUNNING → "Passei para …: lê assim que terminar o passo atual."
 *   (d)    no message of (a)–(c) was left without a return
 */
import type { Page } from 'playwright'
import { acknowledged, converseInGeral, type ConversationOutcome, type FirstDeliveryRecorder } from './first-delivery-flow.ts'

export const D079_QUESTION = 'Qual o preço novo do pão francês?'
export const D079_FINAL_SUMMARY = 'Cardápio atualizado: pão francês R$ 1,10.'
/** Long enough that the Task is still RUNNING when the same-subject message arrives (c). */
export const D079_FAKE_TURN_MS = 6_000
export const D079_FIRST_DELIVERY_REPLY = 'Entrega do Probe (D-079): resumo da Agência Ponto em 5 pontos. Tarefa da semana: revisar o cardápio.'

/** Exact status lines of the contract (always from the persona, no model). */
export const LINE_ANSWER_SENT = /Resposta enviada para .+: continua “.+”\./u
export const LINE_CONTINUATION = /Passei para .+: lê assim que terminar o passo atual\./u

/** Most specific rule first: later turns carry earlier messages as context. `FAKE_CLI_RULES` answers by WHAT was asked, not by turn number. */
export const D079_RULES = [
  { match: 'cartaz', reply: JSON.stringify({ state: 'ready', summary: 'Texto do cartaz da promoção pronto, com o pão de queijo.' }) },
  { match: 'R\\$ ?1,10', reply: JSON.stringify({ state: 'ready', summary: D079_FINAL_SUMMARY }) },
  { match: 'Atualize o cardápio', reply: JSON.stringify({ state: 'waiting', summary: 'Preciso do preço novo para atualizar o cardápio.', question: D079_QUESTION }) },
] as const

/** What a step needs from its caller. */
export interface D079Context {
  readonly page: Page
  readonly rec: FirstDeliveryRecorder
  /** Model turns the stub has answered so far (`scope.invocations()` with `event === 'turn'`). */
  readonly turns: () => number
  /** Every message sent so far, for (d). */
  readonly outcomes: ConversationOutcome[]
}

function must(condition: boolean, message: string): void {
  if (!condition) throw new Error(message)
}

/** (a) another subject. */
export async function d079StepA(context: D079Context): Promise<void> {
  const { page, rec, outcomes } = context
  const thanks = await converseInGeral(page, rec, 'obrigado')
  outcomes.push(thanks)
  must(thanks.sent, '(a) "obrigado" was not sent')
  must(acknowledged(thanks), '(a) "obrigado": no reaction, no reply, no state line (the conversation went mute)')
  const cost = await converseInGeral(page, rec, 'quanto custou isso?')
  outcomes.push(cost)
  must(cost.sent, '(a) "quanto custou isso?" was not sent')
  must(cost.reply !== null, '(a) "quanto custou isso?" needs a visible ANSWER from the team (a reaction alone is not enough)')
}

/** (b) the answer to the persona's question continues the Task. */
export async function d079StepB(context: D079Context): Promise<void> {
  const { page, rec, outcomes, turns } = context
  const request = await converseInGeral(page, rec, 'Atualize o cardápio com os preços novos')
  outcomes.push(request)
  must(acknowledged(request), '(b) the work request got no return')
  await page.getByText(D079_QUESTION).first().waitFor({ state: 'visible', timeout: 90_000 })
  rec.mark('persona question visible')
  const turnsBeforeAnswer = turns()

  const answer = await converseInGeral(page, rec, 'O pão francês passa a custar R$ 1,10')
  outcomes.push(answer)
  must(acknowledged(answer), '(b) the answer to the persona\'s question got no return (it must continue the Task, not vanish)')
  await page.getByText(LINE_ANSWER_SENT).first().waitFor({ state: 'visible', timeout: 30_000 })
  rec.mark('answer-sent line visible')
  await page.getByText(D079_FINAL_SUMMARY).first().waitFor({ state: 'visible', timeout: 90_000 })
  rec.mark('final report visible')
  must(turns() > turnsBeforeAnswer, '(b) the answer did not resume the Task: no further model turn ran')
}

/** (c) same subject while the Task is running. */
export async function d079StepC(context: D079Context): Promise<void> {
  const { page, rec, outcomes, turns } = context
  const turnsBeforeRequest = turns()
  const started = await converseInGeral(page, rec, 'Prepare o texto do cartaz da promoção')
  outcomes.push(started)
  must(acknowledged(started), '(c) the new request got no return')
  // Only when the Task is really RUNNING (its model turn has started and lasts D079_FAKE_TURN_MS) is a same-subject message a continuation.
  const deadline = Date.now() + 30_000
  while (turns() <= turnsBeforeRequest && Date.now() < deadline) await page.waitForTimeout(200)
  must(turns() > turnsBeforeRequest, '(c) the Task never started its model turn')
  const sentAt = Date.now()
  const more = await converseInGeral(page, rec, 'inclua também o pão de queijo no cartaz')
  outcomes.push(more)
  rec.notes.push(`continuation sent ${String(Date.now() - sentAt)} ms after the turn started; stub turns ${String(turns())}`)
  must(acknowledged(more), '(c) a same-subject message during the run was left without a return')
  await page.getByText(LINE_CONTINUATION).first().waitFor({ state: 'visible', timeout: 15_000 })
}

/** (d) nothing silent. */
export function d079StepD(context: D079Context): void {
  const { outcomes } = context
  must(outcomes.length >= 5, `(d) expected at least 5 messages, saw ${String(outcomes.length)}`)
  const silent = outcomes.filter(outcome => !acknowledged(outcome)).map(outcome => outcome.text)
  must(silent.length === 0, `(d) messages with no reaction, no reply and no state line: ${JSON.stringify(silent)}`)
}

/** All four, in order (the installed run). */
export async function runD079Scenarios(context: D079Context): Promise<void> {
  await d079StepA(context)
  await d079StepB(context)
  await d079StepC(context)
  d079StepD(context)
}
