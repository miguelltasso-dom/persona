/**
 * Structured questions of a persona (contracts/structured-question.md): answer chips, single or multiple choice, a sequence
 * of up to five questions asked one at a time, and the person's free text always allowed. Pure rules, no clock, no store.
 */

import { key } from './ids.ts'
import type { AskOption, AskQuestion, AskState, Attention, Ticket, TicketInput } from './model.ts'

/** Most questions one `persona_ask` call may bring (a sequence is shown one by one, so it is one interruption). */
export const ASK_MAX_QUESTIONS = 5
/** Answer chips of one question. */
export const ASK_MIN_OPTIONS = 2
export const ASK_MAX_OPTIONS = 8
/** Longest chip label and longest question, in characters. */
export const ASK_LABEL_MAX = 60
export const ASK_QUESTION_MAX = 300

/** Why a structured question or answer was refused. The message is Portuguese and safe to hand back to the model or the person. */
export type AskFailure =
  | 'no_questions' | 'too_many_questions' | 'empty_question' | 'question_too_long'
  | 'too_few_options' | 'too_many_options' | 'empty_label' | 'label_too_long' | 'duplicate_option' | 'bad_option_id'
  | 'unknown_option' | 'single_choice' | 'no_options' | 'empty_answer'

export class AskError extends Error {
  /** @param code - Machine-readable reason. @param message - Safe Portuguese line. */
  constructor(readonly code: AskFailure, message: string) {
    super(message)
    this.name = 'AskError'
  }
}

/** A chip as the persona wrote it: the id is optional (the host makes one from the label). */
export interface AskOptionInput { readonly id?: string; readonly label: string }
/** One question as the persona wrote it. */
export interface AskQuestionInput {
  readonly question: string
  readonly options?: readonly AskOptionInput[]
  readonly multiple?: boolean
}

const OPTION_ID = /^[a-z0-9_-]{1,40}$/u

function flat(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

/**
 * Stable chip id from a label: lower case, no accents, dashes. Never empty, never one that is already taken.
 * @param label - Chip label.
 * @param taken - Ids already used in the question.
 */
export function optionIdOf(label: string, taken: ReadonlySet<string>): string {
  const base = flat(label).normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '').slice(0, 40) || 'opcao'
  if (!taken.has(base)) return base
  for (let n = 2; ; n += 1) {
    const candidate = `${base.slice(0, 36)}-${String(n)}`
    if (!taken.has(candidate)) return candidate
  }
}

function normalizeQuestion(input: AskQuestionInput, index: number): AskQuestion {
  const question = flat(input.question)
  const where = `Pergunta ${String(index + 1)}`
  if (question === '') throw new AskError('empty_question', `${where}: escreva a pergunta.`)
  if (question.length > ASK_QUESTION_MAX) throw new AskError('question_too_long', `${where}: a pergunta passa de ${String(ASK_QUESTION_MAX)} caracteres. Explique no texto da mensagem e deixe aqui só a pergunta curta.`)
  const multiple = input.multiple === true
  if (input.options === undefined) {
    if (multiple) throw new AskError('too_few_options', `${where}: escolha múltipla precisa de opções.`)
    return { question }
  }
  if (input.options.length < ASK_MIN_OPTIONS) throw new AskError('too_few_options', `${where}: ofereça pelo menos ${String(ASK_MIN_OPTIONS)} opções (ou não ofereça nenhuma).`)
  if (input.options.length > ASK_MAX_OPTIONS) throw new AskError('too_many_options', `${where}: no máximo ${String(ASK_MAX_OPTIONS)} opções.`)
  const taken = new Set<string>()
  const labels = new Set<string>()
  const options: AskOption[] = []
  for (const option of input.options) {
    const label = flat(option.label)
    if (label === '') throw new AskError('empty_label', `${where}: toda opção precisa de um texto.`)
    if (label.length > ASK_LABEL_MAX) throw new AskError('label_too_long', `${where}: a opção “${label.slice(0, 20)}…” passa de ${String(ASK_LABEL_MAX)} caracteres.`)
    if (labels.has(label.toLowerCase())) throw new AskError('duplicate_option', `${where}: a opção “${label}” está repetida.`)
    labels.add(label.toLowerCase())
    const requested = option.id === undefined ? undefined : option.id.trim()
    if (requested !== undefined && (!OPTION_ID.test(requested) || taken.has(requested))) throw new AskError('bad_option_id', `${where}: o identificador “${requested}” não vale (use letras minúsculas, números, - ou _, sem repetir).`)
    const id = requested ?? optionIdOf(label, taken)
    taken.add(id)
    options.push({ id, label })
  }
  return { question, options, ...(multiple ? { multiple: true as const } : {}) }
}

/**
 * Validate and normalize what the persona asked: 1..5 questions, each with no options (free text) or 2..8 chips.
 * @param input - Questions as written.
 * @throws AskError with a Portuguese line for the model.
 */
export function normalizeAskQuestions(input: readonly AskQuestionInput[]): AskQuestion[] {
  if (input.length === 0) throw new AskError('no_questions', 'Escreva pelo menos uma pergunta.')
  if (input.length > ASK_MAX_QUESTIONS) throw new AskError('too_many_questions', `No máximo ${String(ASK_MAX_QUESTIONS)} perguntas de uma vez; agrupe o que é essencial.`)
  return input.map(normalizeQuestion)
}

function optionInputOf(raw: unknown): AskOptionInput | undefined {
  if (typeof raw === 'string') return { label: raw }
  if (typeof raw !== 'object' || raw === null) return undefined
  const label = (raw as { label?: unknown }).label
  const id = (raw as { id?: unknown }).id
  if (typeof label !== 'string') return undefined
  return typeof id === 'string' ? { id, label } : { label }
}

function questionInputOf(raw: unknown, index: number): AskQuestionInput {
  const where = `Pergunta ${String(index + 1)}`
  if (typeof raw === 'string') return { question: raw }
  if (typeof raw !== 'object' || raw === null) throw new AskError('empty_question', `${where}: escreva a pergunta.`)
  const { question, options, multiple } = raw as { question?: unknown; options?: unknown; multiple?: unknown }
  if (typeof question !== 'string') throw new AskError('empty_question', `${where}: escreva a pergunta.`)
  if (options === undefined || options === null) return { question, ...(multiple === true ? { multiple: true as const } : {}) }
  if (!Array.isArray(options)) throw new AskError('too_few_options', `${where}: as opções vão em uma lista (ou não ofereça nenhuma).`)
  const parsed = options.map(optionInputOf)
  if (parsed.some(item => item === undefined)) throw new AskError('empty_label', `${where}: toda opção precisa de um texto.`)
  return { question, options: parsed as AskOptionInput[], ...(multiple === true ? { multiple: true as const } : {}) }
}

/**
 * What a model wrote for `persona_ask`, in the shapes models actually produce, as {@link AskQuestionInput}s to normalize: a list
 * of questions, `{ questions: [...] }`, or one `{ question, options?, multiple? }`; a question may be a bare string and options
 * may be bare strings or `{ label, id? }`. Anything else is refused with a Portuguese line for the model. Does not validate
 * counts or lengths: {@link normalizeAskQuestions} does.
 * @param raw - Untrusted tool input (or a runner report's `ask`).
 * @throws AskError when no question can be read.
 */
export function askInputOf(raw: unknown): AskQuestionInput[] {
  const list = Array.isArray(raw)
    ? raw
    : (typeof raw === 'object' && raw !== null && Array.isArray((raw as { questions?: unknown }).questions)
      ? (raw as { questions: unknown[] }).questions
      : (typeof raw === 'object' && raw !== null && typeof (raw as { question?: unknown }).question === 'string' ? [raw] : []))
  if (list.length === 0) throw new AskError('no_questions', 'Escreva pelo menos uma pergunta.')
  return list.map(questionInputOf)
}

function stateOf(question: AskQuestion, extra: Pick<AskState, 'step' | 'later' | 'collected'>): AskState {
  return { ...(question.options === undefined ? {} : { options: question.options }), multiple: question.multiple === true, ...extra }
}

/**
 * The first question of a sequence as an open Attention: its text, and the state that remembers the rest.
 * @param questions - Already normalized (see {@link normalizeAskQuestions}).
 */
export function initialAsk(questions: readonly AskQuestion[]): { question: string; ask: AskState } {
  const [first, ...later] = questions
  if (first === undefined) throw new AskError('no_questions', 'Escreva pelo menos uma pergunta.')
  const total = questions.length
  return {
    question: first.question,
    ask: stateOf(first, {
      ...(total > 1 ? { step: { index: 1, total } } : {}),
      ...(later.length > 0 ? { later } : {}),
    }),
  }
}

/** What the person gave: chips and/or words (files are the host's business). */
export interface AskAnswerInput {
  readonly text?: string
  readonly optionIds?: readonly string[]
}

/**
 * Check an answer against the OPEN question: chips must be its own, single choice takes one, and something must be said.
 * @param attention - The open question.
 * @param answer - What the person gave.
 * @returns The cleaned chips and text.
 * @throws AskError with a Portuguese line for the person.
 */
export function checkAskAnswer(attention: Attention, answer: AskAnswerInput): { optionIds: string[]; text: string } {
  const ids = [...new Set(answer.optionIds ?? [])]
  const text = (answer.text ?? '').trim()
  const options = attention.ask?.options
  if (ids.length > 0) {
    if (options === undefined) throw new AskError('no_options', 'Esta pergunta não tem opções para escolher.')
    if (ids.some(id => !options.some(option => option.id === id))) throw new AskError('unknown_option', 'Essa opção não existe nesta pergunta.')
    if (attention.ask?.multiple !== true && ids.length > 1) throw new AskError('single_choice', 'Escolha só uma opção.')
  }
  if (ids.length === 0 && text === '') throw new AskError('empty_answer', 'Escreva a resposta, escolha uma opção ou anexe um arquivo.')
  return { optionIds: ids, text }
}

function labelsOf(options: readonly AskOption[] | undefined, ids: readonly string[]): string {
  return ids.map(id => options?.find(option => option.id === id)?.label ?? id).join(', ')
}

function wordsOf(item: { options?: readonly AskOption[]; optionIds: readonly string[]; text: string }): string {
  const chosen = labelsOf(item.options, item.optionIds)
  if (chosen === '') return item.text
  return item.text === '' ? chosen : `${chosen} — ${item.text}`
}

/**
 * The one text the worker reads when the last question is answered. A plain free-text answer stays exactly the words.
 * @param collected - Every answered question, in order.
 */
export function describeAskAnswers(collected: NonNullable<AskState['collected']>): string {
  const [only] = collected
  if (collected.length === 1 && only !== undefined) {
    return only.optionIds.length === 0 ? only.text : `Escolhi: ${labelsOf(only.options, only.optionIds)}.${only.text === '' ? '' : ` ${only.text}`}`
  }
  return `Respostas:\n${collected.map((item, index) => `${String(index + 1)}. ${item.question}: ${wordsOf(item)}`).join('\n')}`
}

/**
 * The person answered the open question. The next question of the sequence opens (the worker keeps waiting); after the last
 * one the Ticket receives ONE text input with every answer and no longer waits.
 * @param ticket - Ticket with an open Attention.
 * @param answer - Chips and/or text.
 * @param at - ISO now.
 * @returns The Ticket, and whether it stopped waiting on the person.
 * @throws AskError for an answer the open question does not allow.
 */
export function applyAskAnswer(ticket: Ticket, answer: AskAnswerInput, at: string): { ticket: Ticket; done: boolean } {
  const attention = ticket.attention
  if (attention === undefined) throw new AskError('empty_answer', 'Essa pergunta já foi respondida.')
  const given = checkAskAnswer(attention, answer)
  const ask = attention.ask
  const collected = [...ask?.collected ?? [], {
    question: attention.question,
    ...(ask?.options === undefined ? {} : { options: ask.options }),
    optionIds: given.optionIds,
    text: given.text,
  }]
  const [next, ...rest] = ask?.later ?? []
  if (next !== undefined) {
    const index = (ask?.step?.index ?? 1) + 1
    const advanced: Attention = {
      id: key('attention', ticket.id, `${String(index)}:${next.question}`, at),
      question: next.question,
      ...(attention.triggerId === undefined ? {} : { triggerId: attention.triggerId }),
      ask: stateOf(next, {
        step: { index, total: ask?.step?.total ?? collected.length + rest.length + 1 },
        ...(rest.length > 0 ? { later: rest } : {}),
        collected,
      }),
    }
    return { ticket: { ...ticket, attention: advanced, updatedAt: at }, done: false }
  }
  const input: TicketInput = { id: `ans-${ticket.id}-${at}`, kind: 'text', text: describeAskAnswers(collected), at }
  const done: Ticket = {
    ...ticket,
    inputs: [...ticket.inputs, input],
    undelivered: [...ticket.undelivered, input.id],
    updatedAt: at,
  }
  delete done.attention
  return { ticket: done, done: true }
}
