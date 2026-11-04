/**
 * Local product insights. No external telemetry — fold events the host already stores.
 */

export type InsightEventKind =
  | 'onboarded'
  | 'useful_reply'
  | 'task_done'
  | 'session'
  | 'proposal_accepted'

export interface InsightEvent {
  kind: InsightEventKind
  at: number
  personaId?: string
  durationMs?: number
}

export type FunnelStage = 'empty' | 'onboarding' | 'first_reply' | 'first_task' | 'returned'

export interface ActivationFunnel {
  onboarded: boolean
  firstUsefulReply: boolean
  firstTaskDone: boolean
  returnedIn7Days: boolean
  stage: FunnelStage
}

export interface PersonaImpact {
  personaId: string
  tasksCompleted: number
  timeToReadyMs: number
  proposalsAccepted: number
  hoursSavedEstimate: number
  hoursSavedLabel: 'estimativa'
}

const DAY = 86_400_000
const HOURS_PER_TASK = 0.5

/**
 * @param events - Local workspace events, oldest first or any order.
 */
export function computeActivationFunnel(events: readonly InsightEvent[]): ActivationFunnel {
  const onboarded = events.some(row => row.kind === 'onboarded')
  const firstUsefulReply = events.some(row => row.kind === 'useful_reply')
  const firstTaskDone = events.some(row => row.kind === 'task_done')
  const sessions = events.filter(row => row.kind === 'session' || row.kind === 'onboarded')
    .map(row => row.at)
    .sort((a, b) => a - b)
  const first = sessions[0]
  const returnedIn7Days = first !== undefined && sessions.some(at => at > first && at - first <= 7 * DAY && at - first >= DAY)
  let stage: FunnelStage = 'empty'
  if (onboarded) stage = 'onboarding'
  if (firstUsefulReply) stage = 'first_reply'
  if (firstTaskDone) stage = 'first_task'
  if (returnedIn7Days) stage = 'returned'
  return { onboarded, firstUsefulReply, firstTaskDone, returnedIn7Days, stage }
}

/**
 * Impact for one persona. Hours saved is always labeled `estimativa`.
 * @param events - Local events.
 * @param personaId - Persona row.
 */
export function computePersonaImpact(events: readonly InsightEvent[], personaId: string): PersonaImpact {
  const mine = events.filter(row => row.personaId === personaId)
  const done = mine.filter(row => row.kind === 'task_done')
  const durations = done
    .map(row => row.durationMs)
    .filter((ms): ms is number => ms !== undefined && ms >= 0)
  const timeToReadyMs = durations.length === 0
    ? 0
    : Math.round(durations.reduce((sum, ms) => sum + ms, 0) / durations.length)
  const tasksCompleted = done.length
  const proposalsAccepted = mine.filter(row => row.kind === 'proposal_accepted').length
  const hoursSavedEstimate = Math.round((tasksCompleted * HOURS_PER_TASK) * 10) / 10
  return {
    personaId,
    tasksCompleted,
    timeToReadyMs,
    proposalsAccepted,
    hoursSavedEstimate,
    hoursSavedLabel: 'estimativa',
  }
}

/**
 * @param events - Local events.
 * @param personaIds - Roster.
 */
export function listPersonaImpact(
  events: readonly InsightEvent[],
  personaIds: readonly string[],
): PersonaImpact[] {
  return personaIds.map(id => computePersonaImpact(events, id))
}
