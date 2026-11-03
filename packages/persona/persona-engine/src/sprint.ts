/**
 * Sprint close + dsh-goal binding (PB-2). Domain Sprint lives in persona-core.
 */

import {
  openSprint,
  planSprint,
  type Sprint,
  type SprintRollover,
} from '@deepseek-ai/dsh-persona-core'
import { ticketStage, type Ticket } from './core/index.ts'
import { ticketGoal, type PersonaGoal } from './goals.ts'
import { stageCategory } from './workflow.ts'

/**
 * Goal the host binds to `dsh-goal` / `dsh-goal-round-driver`.
 * @param sprint - Sprint whose objective is the coordination goal.
 * @param maxRounds - Round cap.
 */
export function sprintGoal(sprint: Sprint, maxRounds: number = 256): PersonaGoal {
  const goal = ticketGoal(sprint.id, sprint.projectId, sprint.objective, maxRounds)
  return {
    ...goal,
    id: sprint.goalId,
    phase: sprint.status === 'encerrado' ? 'complete' : 'active',
    activation: sprint.status === 'encerrado' ? 'disarmed' : 'armed',
  }
}

/**
 * Tickets in the sprint that are not in a `done` category.
 * @param sprint - Sprint.
 * @param tickets - Ticket snapshots (missing ids are treated as unfinished).
 */
export function unfinishedInSprint(sprint: Sprint, tickets: readonly Ticket[]): string[] {
  const byId = new Map(tickets.map(ticket => [ticket.id, ticket]))
  return sprint.ticketIds.filter((id) => {
    const ticket = byId.get(id)
    if (ticket === undefined) return true
    return stageCategory(ticketStage(ticket)) !== 'done'
  })
}

/**
 * Peak-end sprint digest for the project channel.
 * @param sprint - Closed or closing sprint.
 * @param tickets - Tickets that were in the sprint.
 */
export function sprintMilestone(sprint: Sprint, tickets: readonly Ticket[]): string {
  const inSprint = tickets.filter(ticket => sprint.ticketIds.includes(ticket.id))
  const done = inSprint.filter(ticket => stageCategory(ticketStage(ticket)) === 'done')
  const late = unfinishedInSprint(sprint, inSprint)
  const who = [...new Set(done.map(ticket => ticket.execution?.name).filter((name): name is string => name !== undefined))]
  const whoBit = who.length === 0 ? '' : ` Quem: ${who.join(', ')}.`
  return `Sprint ${sprint.name}: entregue ${done.length}; atrasado ${late.length}.${whoBit}`
}

/** Result of ending a sprint. */
export interface CloseSprintResult {
  closed: Sprint
  rolledIds: string[]
  next?: Sprint
  summary: string
  goal: PersonaGoal
  pending?: true
}

/**
 * Close the sprint. Unfinished work rolls to the next sprint or back to the backlog.
 * Requires `confirmed` (the person accepted the leftover destination).
 * @param sprint - Active or planning sprint.
 * @param tickets - Current tickets (for the summary and leftover set).
 * @param leftover - Where unfinished tickets go.
 * @param now - ISO now.
 * @param confirmed - Person confirmed the rollover.
 * @param next - Existing next sprint when rolling forward; created when omitted and leftover is `next`.
 */
export function closeSprint(
  sprint: Sprint,
  tickets: readonly Ticket[],
  leftover: SprintRollover,
  now: string,
  confirmed: boolean = true,
  next?: Sprint,
): CloseSprintResult {
  const rolledIds = unfinishedInSprint(sprint, tickets)
  const summary = sprintMilestone(sprint, tickets)
  if (!confirmed) {
    return { closed: sprint, rolledIds, summary, goal: sprintGoal(sprint), pending: true }
  }
  const kept = sprint.ticketIds.filter(id => !rolledIds.includes(id))
  const closed: Sprint = {
    ...sprint,
    ticketIds: kept,
    status: 'encerrado',
    endsAt: sprint.endsAt ?? now,
  }
  const goal = { ...sprintGoal(closed), phase: 'complete' as const, activation: 'disarmed' as const }
  if (leftover === 'backlog') {
    return { closed, rolledIds, summary, goal }
  }
  const following = next ?? openSprint({
    id: `${sprint.id}-next`,
    projectId: sprint.projectId,
    name: 'Próximo',
    objective: sprint.objective,
    ticketIds: rolledIds,
    status: 'planejado',
  })
  const merged = planSprint(following, [...new Set([...following.ticketIds, ...rolledIds])])
  return { closed, rolledIds, next: merged, summary, goal }
}

export { openSprint, planSprint, sprintDaysLeft, MemorySprintBoard } from '@deepseek-ai/dsh-persona-core'
export type { Sprint, SprintBoard, SprintRollover, SprintStatus } from '@deepseek-ai/dsh-persona-core'
