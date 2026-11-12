/**
 * Item 7 (colheita): the ONE-click "Continuar" card. When the extra rounds of the end-of-turn controller did not fix a turn
 * (`cartao-continuar`: she said she did something no tool did, or the budget of continuations ran out), her words are NOT posted. The
 * honest sentence the controller wrote is posted instead, as a card with two chips: "Continuar" (one click = a new round) and "Parar
 * por aqui". It replaces the technical "limit reached" error the person used to read.
 *
 * It reuses the structured question of the product (contracts/structured-question.md): the card, its answer, the worker that wakes
 * with the choice and the read-only state afterwards are the ones every persona question already has. What it does NOT use is the
 * persona's daily budget of questions and the "already asked" guard: this card is the host's, not an interruption the persona chose.
 * Idempotent: a Ticket with a question already open gets no second card. The one exception is the PLAIN form of the very sentence the
 * controller wrote (it reports the Task as waiting with that sentence as the question, before calling the card): that question is
 * upgraded to the card, replacing it, so the person sees one question with two chips and the Task never waits on a question with no buttons.
 *
 * "Continuar" is the answer every question has: the persona wakes and reads it (a new round). "Parar por aqui" is different on purpose
 * (Keel, 11/11): it only ENDS the Task as stopped by the person, with the short line "Parar" always writes, and wakes nobody: no turn is
 * spent to say goodbye. The host does that in `deliverAttentionAnswer` (see {@link isContinueStop}).
 *
 * Never used for the D-069 cap of a real run (`RealTurnCapError`): that one must keep refusing, a click is not an authorization.
 */

import { ASK_QUESTION_MAX, normalizeAskQuestions, type Ticket, type WorkerReport } from '@deepseek-ai/dsh-persona-engine'

/** Chip ids: the host reads them back to know what the person chose. */
export const CONTINUE_CHIP = 'continuar'
export const STOP_CHIP = 'parar'

const ASK_TAIL = 'Quer que eu continue?'

/**
 * Whether the person's chips on this open question are "Parar por aqui" of the Continuar card ITSELF: a question that merely has a chip with
 * the same id is not it (both chips must be there, and nothing else is chosen).
 * @param attention - The open question, read BEFORE the answer clears it.
 * @param optionIds - What the person chose.
 */
export function isContinueStop(
  attention: {
    readonly id?: string
    readonly question?: string
    readonly ask?: { readonly multiple?: boolean; readonly options?: readonly { readonly id: string; readonly label?: string }[] }
  } | undefined,
  optionIds: readonly string[],
): boolean {
  const ids = attention?.ask?.options?.map(option => option.id) ?? []
  return ids.length === 2 && ids.includes(CONTINUE_CHIP) && ids.includes(STOP_CHIP) && optionIds.length === 1 && optionIds[0] === STOP_CHIP
}

/**
 * The short line of a Task stopped by the person (the same sentence "Parar" writes).
 * @param title - The Task's title.
 */
export function stoppedLineOf(title: string): string {
  return `Parado. “${title}” ficou parada. É só pedir de novo.`
}
/**
 * A structured question allows {@link ASK_QUESTION_MAX} characters, tail included: the sentence is clipped to leave room for " Quer que eu continue?".
 * (S1 P1-06: it used to be 470, so a sentence of 278–470 characters made the engine refuse the question and the card vanished without a word.)
 */
const SENTENCE_MAX = ASK_QUESTION_MAX - ASK_TAIL.length - 1

export type ContinueCardResult =
  | { readonly ok: true; readonly askId: string }
  | { readonly ok: false; readonly reason: 'ended' | 'already-open' | 'failed' }

/** The host parts the card needs (the same ones `PersonaAsks` uses). */
export interface ContinueCardDeps {
  readonly orchestration: {
    runtime(projectId: string): {
      readonly repo: { readonly tickets: { get(id: string): Ticket | undefined } }
      readonly engine: { report(ticketId: string, report: WorkerReport): Ticket }
    }
  }
  readonly asks: { openCard(projectId: string, ticket: Ticket): void }
}

/**
 * The question the card shows: the honest sentence, then the one-click question.
 * @param fala - What the controller wrote (plain Portuguese, no technical detail).
 */
export function continueQuestionOf(fala: string): string {
  const flat = fala.replace(/\s+/gu, ' ').trim()
  const clipped = flat.length <= SENTENCE_MAX ? flat : `${flat.slice(0, SENTENCE_MAX - 1).trimEnd()}…`
  return clipped === '' ? ASK_TAIL : `${clipped} ${ASK_TAIL}`
}

const flat = (value: string): string => value.replace(/\s+/gu, ' ').trim()

/**
 * Open the "Continuar" card on a Ticket whose turn the controller refused to close.
 * @param deps - Host parts.
 * @param input - Where, and the honest sentence the end-of-turn controller wrote (`fala`). `sentenceShown`: that sentence is already a line
 *   in the thread, so the card asks only "Quer que eu continue?" (the sentence is not said twice).
 * @returns The id of the question, or why nothing was opened (never throws).
 */
export function offerContinueCard(
  deps: ContinueCardDeps,
  input: { readonly projectId: string; readonly ticketId: string; readonly fala: string; readonly sentenceShown?: boolean },
): ContinueCardResult {
  const rt = deps.orchestration.runtime(input.projectId)
  const ticket = rt.repo.tickets.get(input.ticketId)
  if (ticket === undefined || ticket.ended !== undefined) return { ok: false, reason: 'ended' }
  if (ticket.attention !== undefined && !(ticket.attention.ask === undefined && flat(ticket.attention.question) === flat(input.fala))) {
    return { ok: false, reason: 'already-open' }
  }
  let opened: Ticket
  try {
    const questions = normalizeAskQuestions([{
      question: input.sentenceShown === true ? ASK_TAIL : continueQuestionOf(input.fala),
      options: [{ id: CONTINUE_CHIP, label: 'Continuar' }, { id: STOP_CHIP, label: 'Parar por aqui' }],
    }])
    opened = rt.engine.report(input.ticketId, {
      state: 'waiting',
      summary: 'Esperando você: continuar ou parar',
      ask: questions,
    })
  } catch {
    return { ok: false, reason: 'failed' }
  }
  if (opened.attention === undefined) return { ok: false, reason: 'failed' }
  deps.asks.openCard(input.projectId, opened)
  return { ok: true, askId: opened.attention.id }
}
