/**
 * Global and per-project execution slots. A noisy project cannot exhaust the others.
 */

const DEFAULT_GLOBAL = 4
const DEFAULT_PER_PROJECT = 2

/** Fair scheduler for concurrent runner sessions. */
export class ExecutionBudget {
  maxGlobal: number
  maxPerProject: number
  readonly running: Map<string, number> = new Map<string, number>()
  /** Requests that found no slot, oldest first. */
  private readonly waiting: { readonly projectId: string; readonly start: () => void }[] = []
  /** Round-robin memory: when each project last got a slot (a counter, not a clock). */
  private readonly lastGrant = new Map<string, number>()
  private grantSeq = 0
  /** The projects that got a slot, in the order they got it (the last 200): what the fairness tests read (a Task may deliver many times; it takes ONE slot). */
  readonly granted: string[] = []

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
    this.noteGrant(projectId)
    return true
  }

  /**
   * Test seam (and the one place a host changes its slots): the limits, from now on.
   * @param limits - Total and per-project concurrent executions.
   */
  setLimits(limits: { readonly global: number; readonly perProject: number }): void {
    this.maxGlobal = limits.global
    this.maxPerProject = limits.perProject
    this.grantWaiting()
  }

  /**
   * A request that found no slot waits here. `start` runs, with the slot ALREADY taken for it, when one frees up.
   * @param projectId - Tenant.
   * @param start - What to run with the slot.
   */
  wait(projectId: string, start: () => void): void {
    this.waiting.push({ projectId, start })
  }

  /**
   * @param projectId - Tenant (omitted: all).
   * @returns How many requests wait for a slot.
   */
  waitingCount(projectId?: string): number {
    return projectId === undefined ? this.waiting.length : this.waiting.filter(item => item.projectId === projectId).length
  }

  /**
   * @param projectId - Tenant.
   */
  release(projectId: string): void {
    const next = this.of(projectId) - 1
    if (next <= 0) this.running.delete(projectId)
    else this.running.set(projectId, next)
    this.grantWaiting()
  }

  private noteGrant(projectId: string): void {
    this.grantSeq += 1
    this.lastGrant.set(projectId, this.grantSeq)
    this.granted.push(projectId)
    if (this.granted.length > 200) this.granted.shift()
  }

  /** Fair: round-robin between projects: the waiting request of the project that got a slot LEAST RECENTLY goes first (never granted = first); first come first served inside one. */
  private grantWaiting(): void {
    for (;;) {
      const eligible = this.waiting.filter(item => this.total() < this.maxGlobal && this.of(item.projectId) < this.maxPerProject)
      const next = eligible.reduce<(typeof eligible)[number] | undefined>((best, item) => (best === undefined || (this.lastGrant.get(item.projectId) ?? 0) < (this.lastGrant.get(best.projectId) ?? 0) ? item : best), undefined)
      if (next === undefined) return
      this.waiting.splice(this.waiting.indexOf(next), 1)
      this.running.set(next.projectId, this.of(next.projectId) + 1)
      this.noteGrant(next.projectId)
      try {
        next.start()
      } catch (error: unknown) {
        void error
        this.release(next.projectId)
        return
      }
    }
  }
}
