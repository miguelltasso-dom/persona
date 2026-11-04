/**
 * Map engine reports and tool rows onto T3 §9 activity events.
 * Persistence / RPC = Anvil; ActivityGroup = Muse/Prism.
 */

import { activitySuccessRate, groupTurnActivity, type ActivityGroupFold, type TurnActivityEvent, type TurnActivityKind, type TurnActivityStatus } from '@deepseek-ai/dsh-persona-core'
import type { DomainEvent } from './core/ports.ts'
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
  if (kind === 'hire' || kind === 'gestor_hire' || kind === 'assemble') return 'hire'
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
/**
 * Loop hook: one report/tool row → persist via Anvil `recordTurnActivity`.
 * @param input - Same as {@link activityFromReport}.
 * @returns Append-ready event (never empty-fold).
 */
export function recordTurnActivity(input: {
  readonly id: string
  readonly personaId: string
  readonly threadId: string
  readonly title: string
  readonly at: string
  readonly state?: ReportState
  readonly tool?: string
  readonly status?: TurnActivityStatus
}): TurnActivityEvent {
  return activityFromReport(input)
}

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
 * Loop hook: `Engine.report` emits `assignment.reported`; host persist the row.
 * @param event - Domain event from `EngineOptions.emit`.
 * @returns Activity row, or undefined for other event types.
 */
export function activityFromDomainEvent(event: DomainEvent): TurnActivityEvent | undefined {
  if (event.type !== 'assignment.reported') return undefined
  return recordTurnActivity({
    id: `${event.data.ticketId}:${event.data.assignmentId}:${event.at}`,
    personaId: event.data.personaId,
    threadId: event.data.threadId,
    title: event.data.summary,
    at: event.at,
    state: event.data.state,
  })
}

/**
 * Host `EngineOptions.emit`. Persist reported rows; forward every event.
 * @param persist - Anvil `recordTurnActivity` (or a test sink).
 * @param next - Existing emit, if any.
 * @returns Combined emit.
 */
export function withTurnActivityEmit(
  persist: (row: TurnActivityEvent) => void,
  next?: (event: DomainEvent) => void,
): (event: DomainEvent) => void {
  return (event) => {
    const row = activityFromDomainEvent(event)
    if (row !== undefined) persist(row)
    next?.(event)
  }
}

export interface TurnActivityBook {
  readonly folds: readonly ActivityGroupFold[]
  readonly successRate: number | null
}

/**
 * Folds plus success rate. Empty / unfinished-only = `null`, never 0%.
 * @param events - Turn rows.
 * @returns Book for `listTurnActivity`.
 */
export function foldTurnActivityBook(events: readonly TurnActivityEvent[]): TurnActivityBook {
  return { folds: groupTurnActivity(events), successRate: activitySuccessRate(events) }
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
