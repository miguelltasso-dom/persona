/**
 * Project / ticket goals. Host binds this port to `dsh-goal` +
 * `dsh-goal-round-driver` + `dsh-tool-goal`. Engine stays free of Cordis.
 */

export type GoalPhase = 'active' | 'paused' | 'blocked' | 'complete'
export type GoalActivation = 'armed' | 'disarmed'

export interface PersonaGoal {
  id: string
  projectId: string
  objective: string
  phase: GoalPhase
  maxRounds: number
  roundsStarted: number
  revision: number
  activation: GoalActivation
  ticketId?: string
}

export type QueueDecision = 'work' | 'plan' | 'rest'

/**
 * Empty queue + open objective ⇒ coordination plans (creates/distributes tickets).
 * Empty queue + no open objective ⇒ rest, no model calls.
 * @param queueLength - Eligible unassigned tickets.
 * @param goals - Project goals.
 */
export function emptyQueueDecision(queueLength: number, goals: readonly PersonaGoal[]): QueueDecision {
  if (queueLength > 0) return 'work'
  if (goals.some(goal => goal.phase === 'active')) return 'plan'
  return 'rest'
}

/**
 * @param decision - {@link emptyQueueDecision}.
 */
export function spendsModel(decision: QueueDecision): boolean {
  return decision !== 'rest'
}

/**
 * A large ticket becomes the executor's current goal (one per session, as in dsh-goal).
 * @param ticketId - Ticket id.
 * @param projectId - Tenant.
 * @param objective - Ready criterion in prose.
 * @param maxRounds - Round cap (dsh-goal default 256).
 */
export function ticketGoal(ticketId: string, projectId: string, objective: string, maxRounds: number = 256): PersonaGoal {
  return {
    id: `goal-ticket-${ticketId}`,
    projectId,
    ticketId,
    objective,
    phase: 'active',
    maxRounds,
    roundsStarted: 0,
    revision: 1,
    activation: 'armed',
  }
}

export interface GoalBoard {
  /**
   * @param projectId - Tenant.
   */
  list(projectId: string): PersonaGoal[]
  /**
   * @param goal - New or replacement snapshot.
   */
  save(goal: PersonaGoal): void
}

/** In-memory board for tests and ephemeral hosts. */
export class MemoryGoalBoard implements GoalBoard {
  private readonly rows = new Map<string, PersonaGoal>()

  list(projectId: string): PersonaGoal[] {
    return [...this.rows.values()].filter(goal => goal.projectId === projectId)
  }

  save(goal: PersonaGoal): void {
    this.rows.set(goal.id, { ...goal })
  }

  /** Drop every row (host test reset). */
  clear(): void {
    this.rows.clear()
  }
}
