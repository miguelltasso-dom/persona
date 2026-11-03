/**
 * Optional sprint / phase per project (PROJECT-BOARDS.md). Domain only.
 */

/** Sprint lifecycle. */
export type SprintStatus = 'planejado' | 'ativo' | 'encerrado'

/** Where unfinished work goes when the sprint ends. */
export type SprintRollover = 'next' | 'backlog'

/** One iteration on a project board. */
export interface Sprint {
  id: string
  projectId: string
  name: string
  objective: string
  status: SprintStatus
  ticketIds: string[]
  startsAt?: string
  endsAt?: string
  goalId: string
}

/**
 * @param input - Identity, copy, and optional dates.
 */
export function openSprint(input: {
  id: string
  projectId: string
  name: string
  objective: string
  startsAt?: string
  endsAt?: string
  ticketIds?: readonly string[]
  status?: SprintStatus
}): Sprint {
  const sprint: Sprint = {
    id: input.id,
    projectId: input.projectId,
    name: input.name,
    objective: input.objective,
    status: input.status ?? 'planejado',
    ticketIds: [...(input.ticketIds ?? [])],
    goalId: `goal-sprint-${input.id}`,
  }
  if (input.startsAt !== undefined) sprint.startsAt = input.startsAt
  if (input.endsAt !== undefined) sprint.endsAt = input.endsAt
  return sprint
}

/**
 * Replace the planned set (backlog ↔ sprint).
 * @param sprint - Current sprint.
 * @param ticketIds - Tickets in this iteration.
 */
export function planSprint(sprint: Sprint, ticketIds: readonly string[]): Sprint {
  return { ...sprint, ticketIds: [...ticketIds] }
}

/**
 * Whole days remaining until `endsAt` (0 when due today, negative when late).
 * @param sprint - Dated sprint.
 * @param now - ISO now.
 */
export function sprintDaysLeft(sprint: Sprint, now: string): number | undefined {
  if (sprint.endsAt === undefined) return undefined
  const end = Date.parse(sprint.endsAt)
  const current = Date.parse(now)
  if (!Number.isFinite(end) || !Number.isFinite(current)) return undefined
  return Math.ceil((end - current) / 86_400_000)
}

/** In-memory sprint board (Anvil persists). */
export interface SprintBoard {
  /**
   * @param projectId - Tenant.
   */
  list(projectId: string): Sprint[]
  /**
   * @param sprint - New or replacement snapshot.
   */
  save(sprint: Sprint): void
}

/** Test / ephemeral sprints. */
export class MemorySprintBoard implements SprintBoard {
  private readonly rows = new Map<string, Sprint>()

  /**
   * @param projectId - Tenant.
   */
  list(projectId: string): Sprint[] {
    return [...this.rows.values()].filter(row => row.projectId === projectId)
  }

  /**
   * @param sprint - Snapshot.
   */
  save(sprint: Sprint): void {
    this.rows.set(sprint.id, { ...sprint, ticketIds: [...sprint.ticketIds] })
  }

  /**
   * Active sprint, else the latest planning one.
   * @param projectId - Tenant.
   */
  current(projectId: string): Sprint | undefined {
    const rows = this.list(projectId)
    return rows.find(row => row.status === 'ativo') ?? rows.find(row => row.status === 'planejado')
  }
}
