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
  /** O toque num cartão de escolha do fim da vez (colheita item 11); um host sem ele deixa o cartão só em leitura. */
  answerChoice?(request: Record<string, unknown>): unknown
}

const CHOICE_PREFIX = 'choice:'

/** A mensagem da persona que carrega o cartão do fim da vez, a partir do `askId` (`choice:<id da mensagem>`). */
export function choiceMessageIdOf(askId: string): string | undefined {
  return askId.startsWith(CHOICE_PREFIX) && askId.length > CHOICE_PREFIX.length ? askId.slice(CHOICE_PREFIX.length) : undefined
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
export async function answerChoiceCard(
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

/**
 * O toque numa opção do cartão do fim da vez: o host posta a mensagem curta da pessoa (`✓ B · …`) e ela abre o turno novo.
 * Falha (já escolhida, opção inválida, sem host) lança com a frase do host.
 * @param askId - O `askId` do cartão (`choice:<id da mensagem>`).
 * @param optionId - A opção (`a`..`f`).
 */
export async function answerEndOfTurnChoice(remote: PersonaAsksRemote, scope: PersonaAsksScope, askId: string, optionId: string): Promise<void> {
  const messageId = choiceMessageIdOf(askId)
  if (messageId === undefined) throw new Error('cartão inválido')
  await call<boolean>(remote, 'answerChoice', { workspaceId: scope.workspaceId, projectId: scope.projectId, messageId, optionId })
}
