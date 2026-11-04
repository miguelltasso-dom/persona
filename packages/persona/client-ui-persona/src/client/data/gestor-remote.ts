import type {
  ApproveGestorPlanRequest,
  CommentGestorPlanRequest,
  GestorPlanView,
  ListGestorPlansRequest,
} from '@deepseek-ai/dsh-persona-host/types'
import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import { isRemoteResult } from '../remote/persona-remote-unwrap.ts'
import { unwrapRemote } from './remote-call.ts'

async function settleGestorWire<T>(result: unknown): Promise<T> {
  if (isRemoteResult(result)) return unwrapRemote(result as RemoteResult<T>)
  return result as T
}

/** Wire subset (avoid full Typert namespace on PersonaRemote). */
export interface GestorWire {
  readonly listGestorPlans?: (request: ListGestorPlansRequest) => unknown
  readonly approveGestorPlan?: (request: ApproveGestorPlanRequest) => unknown
  readonly rejectGestorPlan?: (request: RejectGestorPlanRequest) => unknown
  readonly commentGestorPlan?: (request: CommentGestorPlanRequest) => unknown
}

export interface RejectGestorPlanRequest {
  readonly workspaceId: string
  readonly planId: string
}

export async function listGestorPlansRemote(
  client: GestorWire,
  workspaceId: string,
): Promise<readonly GestorPlanView[]> {
  if (client.listGestorPlans === undefined) return []
  return settleGestorWire<readonly GestorPlanView[]>(await client.listGestorPlans({ workspaceId }))
}

export async function approveGestorPlanRemote(
  client: GestorWire,
  request: ApproveGestorPlanRequest,
): Promise<GestorPlanView> {
  if (client.approveGestorPlan === undefined) throw new Error('gestor-not-supported')
  return settleGestorWire<GestorPlanView>(await client.approveGestorPlan(request))
}

export async function rejectGestorPlanRemote(
  client: GestorWire,
  request: RejectGestorPlanRequest,
): Promise<GestorPlanView> {
  if (client.rejectGestorPlan === undefined) throw new Error('gestor-not-supported')
  return settleGestorWire<GestorPlanView>(await client.rejectGestorPlan(request))
}

/** GES-3: second Gestor comments; original plan stays proposed. */
export async function commentGestorPlanRemote(
  client: GestorWire,
  request: CommentGestorPlanRequest,
): Promise<GestorPlanView> {
  if (client.commentGestorPlan === undefined) throw new Error('gestor-not-supported')
  return settleGestorWire<GestorPlanView>(await client.commentGestorPlan(request))
}
