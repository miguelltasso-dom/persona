/**
 * Kanban column projection aligned with persona-core `ticketStage` (docs/003).
 * Host RPC will call persona-core; preview uses the same rules on mock stages.
 */
import type { KanbanColumnId } from './types.ts'

/** Mirror of {@link TicketStage} from persona-core (avoid runtime dep in client bundle). */
export type TicketStageProjection =
  | { stage: 'person'; action: 'delivery' | 'answer' | 'review' | 'blocked' | 'failed' }
  | { stage: 'working'; action?: 'queued' }
  | { stage: 'idle' }
  | { stage: 'ended' }

/** Column for a classified ticket stage. */
export function columnFromTicketStage(stage: TicketStageProjection): KanbanColumnId {
  if (stage.stage === 'ended') return 'done'
  if (stage.stage === 'person') {
    if (stage.action === 'review') return 'in_review'
    return 'blocked'
  }
  if (stage.stage === 'working') return stage.action === 'queued' ? 'todo' : 'in_progress'
  return 'in_progress'
}

/** Show “aguardando evento” when idle between turns. */
export function waitingEventFromStage(stage: TicketStageProjection): boolean {
  return stage.stage === 'idle'
}

/** Show blocked chip for person-stage blocked/failed. */
export function blockedChipFromStage(stage: TicketStageProjection): boolean {
  return stage.stage === 'person' && (stage.action === 'blocked' || stage.action === 'failed')
}
