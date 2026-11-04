/**
 * Map engine reports and tool rows onto T3 §9 activity events.
 * Persistence / RPC = Anvil; ActivityGroup = Muse/Prism.
 */

import { groupTurnActivity, type ActivityGroupFold, type TurnActivityEvent, type TurnActivityKind, type TurnActivityStatus } from '@deepseek-ai/dsh-persona-core'
import type { ReportState } from './core/model.ts'

export type ToolActivityKind = TurnActivityKind

/**
 * @param state - Assignment report.
 * @returns UI status. waiting/blocked stay unfinished; failed is not done.
 */
export function activityStatusOfReport(state: ReportState): TurnActivityStatus {
  if (state === 'ready' || state === 'dropped') return 'done'
  if (state === 'failed') return 'failed'
  if (state === 'waiting' || state === 'blocked') return 'waiting'
  return 'running'
}

/**
 * @param kind - Tool or hire name.
 */
export function activityKindOfTool(kind: string): TurnActivityKind {
  if (kind === 'hire' || kind === 'gestor_hire') return 'hire'
  if (kind === 'write' || kind === 'file' || kind === 'patch') return 'file'
  if (kind === 'read' || kind === 'recall' || kind === 'brain_read') return 'read'
  if (kind === 'check' || kind === 'test') return 'check'
  if (kind === 'message' || kind === 'reply') return 'message'
  return 'command'
}

/**
 * @param input - One report or tool row.
 * @returns Append-ready event.
 */
export function activityFromReport(input: {
  readonly id: string
  readonly personaId: string
  readonly threadId: string
  readonly title: string
  readonly at: string
  readonly state?: ReportState
  readonly tool?: string
  readonly status?: TurnActivityStatus
}): TurnActivityEvent {
  return {
    id: input.id,
    personaId: input.personaId,
    threadId: input.threadId,
    kind: activityKindOfTool(input.tool ?? 'command'),
    title: input.title,
    status: input.status ?? activityStatusOfReport(input.state ?? 'progress'),
    at: input.at,
  }
}

/**
 * @param events - Turn rows.
 * @returns Folds for listTurnActivity.
 */
export function foldTurnActivity(events: readonly TurnActivityEvent[]): ActivityGroupFold[] {
  return groupTurnActivity(events)
}

/**
 * Burst of Router events: one next-eval batch per thread (OPT-6).
 * @param events - Triggers that arrived during an in-flight eval.
 * @returns Held batches; empty threads stay omitted.
 */
export function batchRouterBurst(events: readonly { readonly id: string; readonly threadId: string }[]): {
  readonly threadId: string
  readonly ids: readonly string[]
}[] {
  const order: string[] = []
  const groups = new Map<string, string[]>()
  for (const row of events) {
    const hit = groups.get(row.threadId)
    if (hit === undefined) {
      order.push(row.threadId)
      groups.set(row.threadId, [row.id])
      continue
    }
    hit.push(row.id)
  }
  return order.map(threadId => ({ threadId, ids: groups.get(threadId) ?? [] }))
}
