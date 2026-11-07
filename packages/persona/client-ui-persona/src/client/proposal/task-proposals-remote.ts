/**
 * P1-9 · o lado do cliente da "Proposta de {persona}" (contracts/task-proposals.md, Forge). Só chama o host e traduz: nenhuma regra de produto
 * aqui (o teto, a taxa de aceite, a idempotência e o "só uma recusada reabre" são do host).
 *
 * `listTaskProposals` = o estado vivo; `decideTaskProposal` = Aceitar / Agora não; `reopenTaskProposal` = o Desfazer do "Agora não".
 * Qualquer um dos três pode faltar num host antigo ou num fake: sem eles o cartão nem é montado e o fio fica como era.
 */
import type { TaskProposalView } from '@deepseek-ai/dsh-persona-host/types'
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'
import { mapProposalLive, type ProposalLiveUi } from './task-proposal-model.ts'

export interface TaskProposalsRemote {
  listTaskProposals?(request: Record<string, unknown>): unknown
  decideTaskProposal?(request: Record<string, unknown>): unknown
  reopenTaskProposal?(request: Record<string, unknown>): unknown
}

export interface TaskProposalsScope {
  readonly workspaceId: string
  readonly projectId: string
}

/** O Remote do host como a P1-9 o enxerga, ou `undefined` se faltar qualquer uma das chamadas (host antigo/fake: a tela fica como era). */
export function taskProposalsRemoteFrom(remote: object | undefined): TaskProposalsRemote | undefined {
  if (remote === undefined) return undefined
  const wire = remote as Record<string, unknown>
  const all = ['listTaskProposals', 'decideTaskProposal', 'reopenTaskProposal'].every(name => typeof wire[name] === 'function')
  return all ? (remote as TaskProposalsRemote) : undefined
}

/** Chama um remote e entrega o valor, ou lança com a MENSAGEM pt-BR que o host já manda pronta. */
async function call<T>(remote: TaskProposalsRemote, method: keyof TaskProposalsRemote, request: Record<string, unknown>): Promise<T> {
  const fn = remote[method]
  if (typeof fn !== 'function') throw new Error(method)
  const result = await Promise.resolve(fn.call(remote, request))
  if (!isRemoteResult(result)) return result as T
  if (result.ok) return result.value as T
  const error = (result.error ?? {}) as { readonly code?: unknown; readonly message?: unknown }
  throw new Error(typeof error.message === 'string' && error.message.length > 0 ? error.message : typeof error.code === 'string' ? error.code : method)
}

/** O estado vivo de todas as propostas do projeto, por id do item. */
export async function listProposalStates(remote: TaskProposalsRemote, scope: TaskProposalsScope): Promise<Readonly<Record<string, ProposalLiveUi>>> {
  const rows = await call<readonly TaskProposalView[] | undefined>(remote, 'listTaskProposals', { workspaceId: scope.workspaceId, projectId: scope.projectId })
  const byId: Record<string, ProposalLiveUi> = {}
  for (const row of rows ?? []) {
    const live = mapProposalLive(row)
    if (live !== undefined) byId[row.id] = live
  }
  return byId
}

/** Aceitar (`accept: true`, cria UMA tarefa; idempotente no host) ou "Agora não". Devolve o estado vivo do item. */
export async function decideProposal(remote: TaskProposalsRemote, scope: TaskProposalsScope, id: string, accept: boolean): Promise<ProposalLiveUi | undefined> {
  const view = await call<TaskProposalView | undefined>(remote, 'decideTaskProposal', { workspaceId: scope.workspaceId, projectId: scope.projectId, id, accept })
  return mapProposalLive(view)
}

/** O Desfazer do "Agora não": só uma recusada reabre; o host devolve o estado. */
export async function reopenProposal(remote: TaskProposalsRemote, scope: TaskProposalsScope, id: string): Promise<ProposalLiveUi | undefined> {
  const view = await call<TaskProposalView | undefined>(remote, 'reopenTaskProposal', { workspaceId: scope.workspaceId, projectId: scope.projectId, id })
  return mapProposalLive(view)
}
