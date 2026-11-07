/**
 * FL-11 / IV-5 (persona-spec/contracts/working-control.md, Bolt): o lado do cliente da fila por item, do "Direcionar agora" e do Parar.
 * Só chama o host e traduz: nenhuma regra de produto aqui (a fila é do host; a tela só desenha). Cada chamada devolve o valor do host ou
 * lança {@link WorkingControlError} com o `code` tipado ('invalid-payload' | 'not-found' | 'forbidden' | 'unknown') e a MENSAGEM pt-BR que o
 * host já manda pronta ("Essa mensagem já saiu da fila." etc.): a UI usa o texto do host, não inventa um.
 */
import type {
  FlushWorkingQueueRequest,
  QueuedMessageView,
  SteerWorkingTurnView,
  StopTurnView,
} from '@deepseek-ai/dsh-persona-host/types'
import { DEFAULT_CONVERSATION_SUBJECT_ID } from '../chat/conversation-subjects.ts'
import type { QueuedMessageItem } from '../chat/QueuedMessageBubble.tsx'
import { isRemoteResult } from './persona-remote-unwrap.ts'

export type WorkingControlErrorCode = 'invalid-payload' | 'not-found' | 'forbidden' | 'unknown'

export class WorkingControlError extends Error {
  override readonly name = 'WorkingControlError'

  constructor(
    readonly method: string,
    readonly code: WorkingControlErrorCode,
    /** A mensagem pt-BR do host (pode vir vazia). */
    readonly hostMessage: string,
  ) {
    super(hostMessage.length > 0 ? hostMessage : `${method}: ${code}`)
  }
}

/** O escopo de uma fila: o projeto, a persona que está trabalhando, a conversa (o assunto no canal, o id da DM na DM). */
export interface WorkingScope {
  readonly workspaceId: string
  readonly projectId: string
  readonly personaId: string
  /** Canal: o assunto da conversa; DM: o id da DM (o host trata `subjectId === ownerId` como "sem tópico"). */
  readonly subjectId: string
  readonly streamKind: 'channel' | 'dm'
  /** O id do canal ou da DM onde o balão vai quando sair da fila. */
  readonly ownerId: string
}

/**
 * O assunto como o HOST o chama. O assunto padrão "Geral" do cliente (`subject-geral`) é o fio geral do canal; no host o geral é `''`, o id do próprio
 * canal ou `geral` (persona-host `working-control.ts` `sendAs`) e QUALQUER outro id vira TÓPICO. Mandar `subject-geral` cru fazia (1) a fila daqui nunca
 * casar com a que o host (e o E2E-V11) chama de `geral` e (2) as mensagens do "Direcionar agora"/"Mandar agora" saírem com `topicId: 'subject-geral'`,
 * um tópico que não existe (o contexto da persona sairia do fio geral). O id do canal é único por canal (no #geral é `geral`, como o host o cria); na DM o id
 * da DM já é o dono; um assunto criado pela pessoa (tópico de verdade) segue como está.
 */
export function hostSubjectId(subjectId: string, ownerId: string): string {
  return subjectId === DEFAULT_CONVERSATION_SUBJECT_ID ? ownerId : subjectId
}

/** Os 8 remotes do IV-5, como o cliente os enxerga (qualquer um pode faltar num host antigo). */
export interface WorkingControlRemote {
  enqueueWorkingMessage?(request: Record<string, unknown>): unknown
  listWorkingQueue?(request: Record<string, unknown>): unknown
  editQueuedMessage?(request: Record<string, unknown>): unknown
  dropQueuedMessage?(request: Record<string, unknown>): unknown
  restoreQueuedMessage?(request: Record<string, unknown>): unknown
  flushWorkingQueue?(request: Record<string, unknown>): unknown
  steerWorkingTurn?(request: Record<string, unknown>): unknown
  stopTurn?(request: Record<string, unknown>): unknown
}

const REMOTE_METHODS: readonly (keyof WorkingControlRemote)[] = [
  'enqueueWorkingMessage', 'listWorkingQueue', 'editQueuedMessage', 'dropQueuedMessage',
  'restoreQueuedMessage', 'flushWorkingQueue', 'steerWorkingTurn', 'stopTurn',
]

/** O Remote do host como o IV-5 o enxerga, ou `undefined` se ele não tem NENHUMA das chamadas (host antigo/fake: a tela fica como era). */
export function workingRemoteFrom(remote: object | undefined): WorkingControlRemote | undefined {
  if (remote === undefined) return undefined
  const wire = remote as Record<string, unknown>
  return REMOTE_METHODS.some(method => typeof wire[method] === 'function') ? (remote as WorkingControlRemote) : undefined
}

function codeOf(raw: unknown): WorkingControlErrorCode {
  return raw === 'invalid-payload' || raw === 'not-found' || raw === 'forbidden' ? raw : 'unknown'
}

/** Chama um remote e entrega o valor, ou lança o erro tipado. Host sem o método: erro `unknown` (a UI cai para o que já fazia). */
async function call<T>(remote: WorkingControlRemote, method: keyof WorkingControlRemote, request: Record<string, unknown>): Promise<T> {
  const fn = remote[method]
  if (typeof fn !== 'function') throw new WorkingControlError(method, 'unknown', '')
  const result = await Promise.resolve(fn.call(remote, request))
  if (!isRemoteResult(result)) return result as T
  if (result.ok) return result.value as T
  const error = (result.error ?? {}) as { readonly code?: unknown; readonly message?: unknown }
  throw new WorkingControlError(method, codeOf(error.code), typeof error.message === 'string' ? error.message : '')
}

const base = (scope: WorkingScope): Record<string, unknown> => ({
  workspaceId: scope.workspaceId,
  projectId: scope.projectId,
  personaId: scope.personaId,
  subjectId: scope.subjectId,
})

const where = (scope: WorkingScope): Record<string, unknown> => ({ streamKind: scope.streamKind, ownerId: scope.ownerId })

export function listQueue(remote: WorkingControlRemote, scope: WorkingScope): Promise<readonly QueuedMessageView[]> {
  return call(remote, 'listWorkingQueue', base(scope))
}

/** `reason: 'quota'` = espera a cota voltar (o host NÃO solta o balão quando a persona fica ociosa; Bolt 17:49). */
export function enqueueMessage(remote: WorkingControlRemote, scope: WorkingScope, text: string, reason?: 'quota'): Promise<QueuedMessageView> {
  return call(remote, 'enqueueWorkingMessage', { ...base(scope), ...where(scope), text, ...(reason === undefined ? {} : { reason }) })
}

export function editQueued(remote: WorkingControlRemote, scope: WorkingScope, id: string, text: string): Promise<unknown> {
  return call(remote, 'editQueuedMessage', { ...base(scope), id, text })
}

/** "Tirar": devolve a fila que sobrou. */
export function dropQueued(remote: WorkingControlRemote, scope: WorkingScope, id: string): Promise<readonly QueuedMessageView[]> {
  return call(remote, 'dropQueuedMessage', { ...base(scope), id })
}

/** O "Desfazer" do Tirar: volta com o MESMO id e na posição original (idempotente). */
export function restoreQueued(remote: WorkingControlRemote, scope: WorkingScope, item: QueuedMessageView): Promise<readonly QueuedMessageView[]> {
  return call(remote, 'restoreQueuedMessage', { ...base(scope), item })
}

/** "Mandar agora": só o balão `queueItemId`, ou a fila toda em ordem (sem id). */
export function flushQueue(remote: WorkingControlRemote, scope: WorkingScope, queueItemId?: string): Promise<readonly unknown[]> {
  const request: FlushWorkingQueueRequest & Record<string, unknown> = {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    personaId: scope.personaId,
    subjectId: scope.subjectId,
    ...(queueItemId === undefined ? {} : { queueItemId }),
  }
  return call(remote, 'flushWorkingQueue', request)
}

/** "Direcionar agora": `steer` = o turno aberto recebeu; `sent` = não havia turno, foi envio normal (NÃO é erro). */
export function steerTurn(remote: WorkingControlRemote, scope: WorkingScope, text: string): Promise<SteerWorkingTurnView> {
  return call(remote, 'steerWorkingTurn', { ...base(scope), ...where(scope), text })
}

/** Parar: a resposta em andamento (`eventId` = a mensagem da pessoa respondida) e/ou a Tarefa aberta (`ticketId`). `none` não é erro. */
export function stopTurn(
  remote: WorkingControlRemote,
  scope: Pick<WorkingScope, 'workspaceId' | 'projectId' | 'personaId' | 'subjectId'>,
  target: { readonly ticketId?: string; readonly eventId?: string },
): Promise<StopTurnView> {
  return call(remote, 'stopTurn', {
    workspaceId: scope.workspaceId,
    projectId: scope.projectId,
    personaId: scope.personaId,
    ...(target.ticketId === undefined ? {} : { ticketId: target.ticketId }),
    ...(target.eventId === undefined ? {} : { eventId: target.eventId }),
    ...(target.ticketId === undefined && target.eventId === undefined ? { subjectId: scope.subjectId } : {}),
  })
}

/**
 * Uma linha da fila do host → o balão tracejado. `reason: 'quota'` vira "Na fila · sai quando a cota voltar" (e o host não a solta
 * sozinho quando a persona fica ociosa). `restored` fica de fora: o balão vem do host, não do `localStorage`.
 */
export function queuedViewToItem(view: QueuedMessageView, personaName: string): QueuedMessageItem {
  return {
    id: view.id,
    text: view.text,
    targetPersonaName: personaName,
    targetPersonaId: view.personaId,
    ...(view.reason === 'quota' ? { heldForQuota: true } : {}),
  }
}

/** O texto do erro para a tela: o que o host mandou, se mandou; senão `null` (a UI só atualiza a fila, sem inventar frase). */
export function workingErrorText(error: unknown): string | null {
  if (error instanceof WorkingControlError && error.hostMessage.length > 0) return error.hostMessage
  return null
}
