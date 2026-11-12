/**
 * End-of-turn choice card (colheita item 11): a persona that ends her turn offering 2 to 6 clear paths writes ONE marker line,
 * `[[escolha: pergunta curta | primeira opção | segunda opção | …]]`, and the host turns it into a card with the options A..F.
 * Nothing waits for the card: the turn is over, the Task is not blocked. When the person taps an option her tap becomes a new,
 * short message (`✓ B · Post para o Instagram`) that opens a new turn.
 *
 * Pure rules, no clock, no store. The question is at most 300 characters (the explanation goes in the message, the question stays
 * short); an option is at most 90 characters on one line; a card has 2 to 6 options, none repeated.
 */

/** Options of one card: the letters A..F. */
export const CHOICE_MIN_OPTIONS = 2
export const CHOICE_MAX_OPTIONS = 6
/** Longest question and longest option, in characters. */
export const CHOICE_QUESTION_MAX = 300
export const CHOICE_LABEL_MAX = 90
/** The letter of each option, in order. The option id is the same letter in lower case. */
export const CHOICE_LETTERS = ['A', 'B', 'C', 'D', 'E', 'F'] as const

/** One option of a card: `id` is the lower-case letter (`a`..`f`). */
export interface ChoiceOption {
  readonly id: string
  readonly letter: string
  readonly label: string
}

/** A valid card. */
export interface ChoiceCard {
  readonly question: string
  readonly options: readonly ChoiceOption[]
}

/** Why a marker did not become a card. */
export type ChoiceRefusal = 'question_too_long' | 'too_few_options' | 'too_many_options' | 'label_too_long' | 'duplicate_option' | 'empty'

/** What {@link readChoiceMarker} found in a message. */
export interface ChoiceReading {
  /** The words of the message without the marker (an unfinished marker, as in a streaming reply, is cut too). */
  readonly text: string
  /** The card, when the marker is valid. */
  readonly card?: ChoiceCard
  /** The reason, when there was a marker that is not a card. The person still reads the options (see `text`). */
  readonly refused?: ChoiceRefusal
}

/** Safe Portuguese line for the model (or a log) for each refusal. */
export const CHOICE_REFUSAL_TEXT: Readonly<Record<ChoiceRefusal, string>> = {
  question_too_long: `A pergunta do cartão passa de ${String(CHOICE_QUESTION_MAX)} caracteres: explique no texto da mensagem e deixe no cartão só a pergunta curta.`,
  too_few_options: `Um cartão de escolha precisa de pelo menos ${String(CHOICE_MIN_OPTIONS)} opções.`,
  too_many_options: `Um cartão de escolha tem no máximo ${String(CHOICE_MAX_OPTIONS)} opções: junte as parecidas.`,
  label_too_long: `Cada opção do cartão tem no máximo ${String(CHOICE_LABEL_MAX)} caracteres, em uma linha.`,
  duplicate_option: 'Há opções repetidas no cartão.',
  empty: 'O cartão de escolha está vazio.',
}

const MARKER = /\[\[escolha:([\s\S]*?)\]\]/giu
/** A marker the model has not closed yet (a reply that is still arriving): hidden, never shown half-written. */
const OPEN_MARKER = /\[\[escolha:(?:(?!\]\])[\s\S])*$/iu

function flat(value: string): string {
  return value.replace(/\s+/gu, ' ').trim()
}

function cardOf(inner: string): { card?: ChoiceCard; refused?: ChoiceRefusal; question: string; labels: string[] } {
  const parts = inner.split('|').map(flat)
  const question = parts[0] ?? ''
  const labels = parts.slice(1).filter(label => label !== '')
  if (question === '' && labels.length === 0) return { refused: 'empty', question, labels }
  if (question === '' || question.length > CHOICE_QUESTION_MAX) return { refused: 'question_too_long', question, labels }
  if (labels.length < CHOICE_MIN_OPTIONS) return { refused: 'too_few_options', question, labels }
  if (labels.length > CHOICE_MAX_OPTIONS) return { refused: 'too_many_options', question, labels }
  if (labels.some(label => label.length > CHOICE_LABEL_MAX)) return { refused: 'label_too_long', question, labels }
  if (new Set(labels.map(label => label.toLowerCase())).size !== labels.length) return { refused: 'duplicate_option', question, labels }
  const options = labels.map((label, index): ChoiceOption => {
    const letter = CHOICE_LETTERS[index] ?? 'F'
    return { id: letter.toLowerCase(), letter, label }
  })
  return { card: { question, options }, question, labels }
}

/** The plain words a person reads when the marker is not a card: the question and the options, lettered. */
function plainOffer(question: string, labels: readonly string[]): string {
  const lines = labels.slice(0, CHOICE_LETTERS.length).map((label, index) => `${CHOICE_LETTERS[index] ?? ''}) ${label}`)
  return [question, ...lines].filter(line => line !== '').join('\n')
}

/**
 * Read the choice marker of a persona's message. The LAST valid marker is the card; every marker is removed from the words; a marker
 * that is not a valid card is replaced by its question and lettered options as plain words, so the person is never left without them.
 * @param body - The message as the persona wrote it.
 * @returns The words, and the card or the reason there is none.
 */
export function readChoiceMarker(body: string): ChoiceReading {
  if (!/\[\[escolha:/iu.test(body)) return { text: body }
  let card: ChoiceCard | undefined
  let refused: ChoiceRefusal | undefined
  const replaced = body.replace(MARKER, (_whole, inner: string) => {
    const read = cardOf(inner)
    if (read.card !== undefined) {
      card = read.card
      refused = undefined
      return ''
    }
    if (card === undefined) refused = read.refused
    return `\n${plainOffer(read.question, read.labels)}\n`
  })
  const text = replaced.replace(OPEN_MARKER, '').replace(/[ \t]+\n/gu, '\n').replace(/\n{3,}/gu, '\n\n').trim()
  return { text, ...(card === undefined ? {} : { card }), ...(refused === undefined ? {} : { refused }) }
}

/**
 * The short message a tap becomes: `✓ B · Post para o Instagram`.
 * @param card - The card.
 * @param optionId - The tapped option (`a`..`f`).
 * @returns The message, or undefined when the option is not the card's.
 */
export function choiceAnswerText(card: ChoiceCard, optionId: string): string | undefined {
  const option = card.options.find(item => item.id === optionId)
  return option === undefined ? undefined : `✓ ${option.letter} · ${option.label}`
}

/** The one line of the prompt that teaches a persona the marker (kept here so the format and its limits live in one place). */
export const CHOICE_PROMPT_LINE = `Para oferecer 2 a ${String(CHOICE_MAX_OPTIONS)} caminhos, termine com [[escolha: pergunta curta | opção | opção]] (pergunta até ${String(CHOICE_QUESTION_MAX)} caracteres).`
