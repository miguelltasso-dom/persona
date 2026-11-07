/**
 * The thread card of a persona's structured question (contracts/structured-question.md) lives in the message body: the plain
 * sentence first (a client that does not know the card still reads the question and its options), the marker last —
 * `[[persona-ask:{json}]]`, like `[[task-proposal:…]]` and `[[account-ask:…]]`. Only what never changes is in the body; whether
 * it is open or answered, and with which chips, is `listPersonaAsks`.
 */

import type { AskOptionView, PersonaAskCardView } from './types.ts'

const MARKER = /\[\[persona-ask:([\s\S]+?)\]\]\s*$/u

/**
 * @param card - The card.
 * @param sentence - The plain sentence shown before the marker.
 * @returns The body to store.
 */
export function personaAskBody(card: PersonaAskCardView, sentence: string): string {
  return `${sentence}\n[[persona-ask:${JSON.stringify(card)}]]`
}

/**
 * The sentence an old client shows: the question, and the options on a new line (“Opções: A · B · C”).
 * @param personaName - Who asks.
 * @param question - The question.
 * @param options - Chips, when there are any.
 */
export function personaAskSentence(personaName: string, question: string, options: readonly AskOptionView[] | undefined): string {
  const head = `${personaName} pergunta: ${question}`
  return options === undefined || options.length === 0 ? head : `${head}\nOpções: ${options.map(option => option.label).join(' · ')}`
}

function text(row: Record<string, unknown>, key: string): string | undefined {
  const value = row[key]
  return typeof value === 'string' && value !== '' ? value : undefined
}

function optionsOf(value: unknown): AskOptionView[] | undefined | null {
  if (value === undefined) return undefined
  if (!Array.isArray(value)) return null
  const options: AskOptionView[] = []
  for (const item of value) {
    if (item === null || typeof item !== 'object') return null
    const row = item as Record<string, unknown>
    const id = text(row, 'id')
    const label = text(row, 'label')
    if (id === undefined || label === undefined) return null
    options.push({ id, label })
  }
  return options
}

/**
 * @param body - Stored message body.
 * @returns The card when the marker is valid, else undefined.
 */
export function personaAskFromBody(body: string): PersonaAskCardView | undefined {
  const raw = MARKER.exec(body)?.[1]?.trim()
  if (raw === undefined || raw === '') return undefined
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return undefined
  }
  if (parsed === null || typeof parsed !== 'object') return undefined
  const row = parsed as Record<string, unknown>
  const askId = text(row, 'askId')
  const ticketId = text(row, 'ticketId')
  const personaId = text(row, 'personaId')
  const personaName = text(row, 'personaName')
  const question = text(row, 'question')
  const options = optionsOf(row.options)
  if (askId === undefined || ticketId === undefined || personaId === undefined || personaName === undefined || question === undefined || options === null) return undefined
  const stepRow = row.step
  const step = stepRow !== null && typeof stepRow === 'object'
    && Number.isInteger((stepRow as Record<string, unknown>).index) && Number.isInteger((stepRow as Record<string, unknown>).total)
    ? { index: (stepRow as { index: number }).index, total: (stepRow as { total: number }).total }
    : undefined
  return {
    askId, ticketId, personaId, personaName, question,
    ...(options === undefined ? {} : { options }),
    multiple: row.multiple === true,
    ...(step === undefined ? {} : { step }),
  }
}
