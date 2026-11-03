/**
 * Global and per-project execution slots. A noisy project cannot exhaust the others.
 */

const DEFAULT_GLOBAL = 4
const DEFAULT_PER_PROJECT = 2

/** Fair scheduler for concurrent runner sessions. */
export class ExecutionBudget {
  readonly maxGlobal: number
  readonly maxPerProject: number
  readonly running: Map<string, number> = new Map<string, number>()

  /**
   * @param maxGlobal - Total concurrent executions.
   * @param maxPerProject - Cap per project.
   */
  constructor(maxGlobal: number = DEFAULT_GLOBAL, maxPerProject: number = DEFAULT_PER_PROJECT) {
    this.maxGlobal = maxGlobal
    this.maxPerProject = maxPerProject
  }

  /**
   * @returns Current occupied slots.
   */
  total(): number {
    let sum = 0
    for (const count of this.running.values()) sum += count
    return sum
  }

  /**
   * @param projectId - Tenant.
   */
  of(projectId: string): number {
    return this.running.get(projectId) ?? 0
  }

  /**
   * @param projectId - Tenant.
   * @returns false when global or per-project cap is hit.
   */
  acquire(projectId: string): boolean {
    if (this.total() >= this.maxGlobal) return false
    if (this.of(projectId) >= this.maxPerProject) return false
    this.running.set(projectId, this.of(projectId) + 1)
    return true
  }

  /**
   * @param projectId - Tenant.
   */
  release(projectId: string): void {
    const next = this.of(projectId) - 1
    if (next <= 0) this.running.delete(projectId)
    else this.running.set(projectId, next)
  }
}
