/**
 * IV-10: answer a persona's question with text, chips and files, inside the thread (`answerAttention` Remote).
 * Pure checks here; the Remote in `index.ts` posts the person's message, binds the files and wakes the worker.
 */

import { RemoteFault } from './remote-guard.ts'

/** Longest answer text the host keeps. */
export const ATTENTION_ANSWER_MAX = 8000

/** A checked answer: the person's words (empty only when chips were chosen), the chips and the bound file ids. */
export interface CheckedAnswer {
  readonly text: string
  readonly attachmentIds: readonly string[]
  readonly optionIds: readonly string[]
}

function idsOf(value: unknown, message: string): string[] {
  const ids = value === undefined ? [] : value
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || id === '' || id.length > 200)) throw new RemoteFault('invalid-payload', message)
  return [...new Set(ids as string[])]
}

/**
 * Words, chips and/or files. A files-only answer (no words, no chips) gets a plain sentence so the thread never shows an empty
 * message; whether the chips belong to the OPEN question is checked by the caller, which knows it.
 * @param text - Wire text.
 * @param attachmentIds - Wire file ids from `attachFile`.
 * @param optionIds - Wire chip ids of a structured question.
 */
export function checkAttentionAnswer(text: unknown, attachmentIds: unknown, optionIds?: unknown): CheckedAnswer {
  if (text !== undefined && typeof text !== 'string') throw new RemoteFault('invalid-payload', 'Escreva a resposta em texto.')
  const files = idsOf(attachmentIds, 'Os arquivos da resposta não são válidos.')
  const chips = idsOf(optionIds, 'As opções escolhidas não são válidas.')
  const body = (text ?? '').trim()
  if (body === '' && files.length === 0 && chips.length === 0) {
    throw new RemoteFault('invalid-payload', 'Escreva a resposta, escolha uma opção ou anexe um arquivo.')
  }
  if (body.length > ATTENTION_ANSWER_MAX) throw new RemoteFault('invalid-payload', `A resposta passa de ${String(ATTENTION_ANSWER_MAX)} caracteres.`)
  return {
    text: body !== '' || chips.length > 0 ? body : files.length === 1 ? 'Segue o arquivo.' : 'Seguem os arquivos.',
    attachmentIds: files,
    optionIds: chips,
  }
}
