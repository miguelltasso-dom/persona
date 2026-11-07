/**
 * IV-10 · o lado do cliente da pergunta estruturada (contracts/structured-question.md + attention-answer.md, Forge). Só chama o host e
 * traduz: nenhuma regra de produto aqui (a sequência, as opções e o "uma resposta por pergunta" são do host).
 *
 * `listPersonaAsks` = o estado vivo (aberta · respondida · cancelada); `answerAttention` com `optionIds` = a resposta pelos chips.
 * Qualquer um dos dois pode faltar num host antigo ou num fake: sem eles o cartão nem é montado e o fio fica como era.
 */
import type { PersonaAskView } from '@deepseek-ai/dsh-persona-host/types'
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'
import { mapPersonaAskLive, type PersonaAskLiveUi } from './persona-ask-model.ts'

export interface PersonaAsksRemote {
  listPersonaAsks?(request: Record<string, unknown>): unknown
  answerAttention?(request: Record<string, unknown>): unknown
}

export interface PersonaAsksScope {
  readonly workspaceId: string
  readonly projectId: string
}

/** O Remote do host como o IV-10 o enxerga, ou `undefined` se faltar qualquer uma das duas chamadas (host antigo/fake: a tela fica como era). */
export function personaAsksRemoteFrom(remote: object | undefined): PersonaAsksRemote | undefined {
  if (remote === undefined) return undefined
  const wire = remote as Record<string, unknown>
  return typeof wire.listPersonaAsks === 'function' && typeof wire.answerAttention === 'function' ? (remote as PersonaAsksRemote) : undefined
}

/** Chama um remote e entrega o valor, ou lança com a MENSAGEM pt-BR que o host já manda pronta ("Essa pergunta já foi respondida."). */
async function call<T>(remote: PersonaAsksRemote, method: keyof PersonaAsksRemote, request: Record<string, unknown>): Promise<T> {
  const fn = remote[method]
  if (typeof fn !== 'function') throw new Error(method)
  const result = await Promise.resolve(fn.call(remote, request))
  if (!isRemoteResult(result)) return result as T
  if (result.ok) return result.value as T
  const error = (result.error ?? {}) as { readonly code?: unknown; readonly message?: unknown }
  throw new Error(typeof error.message === 'string' && error.message.length > 0 ? error.message : typeof error.code === 'string' ? error.code : method)
}

/** O estado vivo de todas as perguntas do projeto, por `askId`. */
export async function listAskStates(remote: PersonaAsksRemote, scope: PersonaAsksScope): Promise<Readonly<Record<string, PersonaAskLiveUi>>> {
  const rows = await call<readonly PersonaAskView[] | undefined>(remote, 'listPersonaAsks', { workspaceId: scope.workspaceId, projectId: scope.projectId })
  const byId: Record<string, PersonaAskLiveUi> = {}
  for (const row of rows ?? []) {
    const live = mapPersonaAskLive(row)
    if (live !== undefined) byId[row.askId] = live
  }
  return byId
}

/**
 * Responde pelos chips. `true` = o Ticket não espera mais a pessoa (o worker acorda); `false` = a sequência avançou e a próxima pergunta
 * já está aberta. Falha (a pergunta já foi respondida, escolha inválida, sem rede) lança com a frase do host.
 */
export async function answerAskChoices(
  remote: PersonaAsksRemote,
  scope: PersonaAsksScope,
  ticketId: string,
  optionIds: readonly string[],
): Promise<boolean> {
  const done = await call<boolean | undefined>(remote, 'answerAttention', {
    workspaceId: scope.workspaceId, projectId: scope.projectId, ticketId, text: '', optionIds: [...optionIds],
  })
  return done !== false
}
