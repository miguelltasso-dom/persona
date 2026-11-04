/**
 * IV-10: answer a persona's question with text and files, inside the thread (`answerAttention` Remote).
 * Pure checks here; the Remote in `index.ts` posts the person's message, binds the files and wakes the worker.
 */

import { RemoteFault } from './remote-guard.ts'

/** Longest answer text the host keeps. */
export const ATTENTION_ANSWER_MAX = 8000

/** A checked answer: trimmed text (never empty) and the bound file ids. */
export interface CheckedAnswer {
  readonly text: string
  readonly attachmentIds: readonly string[]
}

/**
 * Text and/or files. A files-only answer gets a plain sentence so the thread never shows an empty message.
 * @param text - Wire text.
 * @param attachmentIds - Wire file ids from `attachFile`.
 */
export function checkAttentionAnswer(text: unknown, attachmentIds: unknown): CheckedAnswer {
  if (text !== undefined && typeof text !== 'string') throw new RemoteFault('invalid-payload', 'Escreva a resposta em texto.')
  const ids = attachmentIds === undefined ? [] : attachmentIds
  if (!Array.isArray(ids) || ids.some(id => typeof id !== 'string' || id === '' || id.length > 200)) {
    throw new RemoteFault('invalid-payload', 'Os arquivos da resposta não são válidos.')
  }
  const files = [...new Set(ids as string[])]
  const body = (text ?? '').trim()
  if (body === '' && files.length === 0) throw new RemoteFault('invalid-payload', 'Escreva a resposta ou anexe um arquivo.')
  if (body.length > ATTENTION_ANSWER_MAX) throw new RemoteFault('invalid-payload', `A resposta passa de ${String(ATTENTION_ANSWER_MAX)} caracteres.`)
  return {
    text: body !== '' ? body : files.length === 1 ? 'Segue o arquivo.' : 'Seguem os arquivos.',
    attachmentIds: files,
  }
}
