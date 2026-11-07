/**
 * IV-10 · a ponta do "Responder": o texto (e os arquivos já subidos na conversa da pergunta) vai ao host como a resposta da pessoa
 * (`answerAttention({ticketId, text, attachmentIds})`, contracts/attention-answer.md). Só chama e traduz: "uma resposta por pergunta" e os
 * limites de arquivo são do host, que devolve a frase pt-BR pronta ("Essa pergunta já foi respondida.", "… tem N MB. O limite é M MB. …").
 */
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'

export interface AnswerRemote {
  answerAttention?(request: Record<string, unknown>): unknown
}

export interface AnswerScope {
  readonly workspaceId: string
  readonly projectId: string
}

/** O host como o "Responder" o enxerga, ou `undefined` sem `answerAttention` (host antigo/fake: o botão nem existe). */
export function answerRemoteFrom(remote: object | undefined): AnswerRemote | undefined {
  if (remote === undefined) return undefined
  return typeof (remote as Record<string, unknown>).answerAttention === 'function' ? (remote as AnswerRemote) : undefined
}

/**
 * Responde com palavras e/ou arquivos. `true` = a pergunta foi liberada (o worker acorda); `false` = a sequência avançou e a próxima já está
 * aberta. Sem texto e sem arquivo não chama o host. Falha lança com a frase do host.
 */
export async function answerWithText(
  remote: AnswerRemote,
  scope: AnswerScope,
  ticketId: string,
  text: string,
  attachmentIds: readonly string[] = [],
): Promise<boolean> {
  const words = text.trim()
  if (words === '' && attachmentIds.length === 0) throw new Error('Escreva a resposta, escolha uma opção ou anexe um arquivo.')
  if (typeof remote.answerAttention !== 'function') throw new Error('answerAttention')
  const result = await Promise.resolve(remote.answerAttention({
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    ticketId,
    text: words,
    ...(attachmentIds.length === 0 ? {} : { attachmentIds: [...attachmentIds] }),
  }))
  if (!isRemoteResult(result)) return result !== false
  if (result.ok) return result.value !== false
  const error = (result.error ?? {}) as { readonly code?: unknown; readonly message?: unknown }
  throw new Error(typeof error.message === 'string' && error.message.length > 0 ? error.message : typeof error.code === 'string' ? error.code : 'answerAttention')
}
