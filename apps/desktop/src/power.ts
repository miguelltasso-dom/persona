/**
 * Sleep/energy on the desktop side: catch-up after a clock jump or an OS resume. The desktop NO LONGER holds Windows awake (D Keel
 * 14:44): the
 * only sleep blocker is the host's `PowerKeeper`, which decides by the station state (paired and running, a live turn or an open card). Two
 * independent blockers had two owners and the renderer's one, fed by a window that may be hidden in the tray, was wrong for a 24 h machine
 * and held Windows awake for every ordinary user (contradicting "only with a paired station").
 */

export const CATCH_UP_BURST = 3
export const CLOCK_JUMP_MS = 60_000

export interface DesktopPowerOptions {
  readonly onCatchUp: (limit: number) => void
  readonly clock?: () => number
  readonly burst?: number
}

/**
 * Catch-up requests for the host's scheduler; it never asks the OS to stay awake.
 */
export class DesktopPower {
  private lastTick: number
  private running = 0

  /** @param options - The Vigia catch-up sink and an optional clock. */
  constructor(private readonly options: DesktopPowerOptions) {
    this.lastTick = (options.clock ?? Date.now)()
  }

  /** How many assignments the renderer reported live (informational: nothing here holds the machine awake). */
  get runningAssignments(): number {
    return this.running
  }

  /**
   * Record how many assignments are live.
   * @param count - Running assignments.
   */
  setRunningAssignments(count: number): void {
    this.running = Math.max(0, count)
  }

  /**
   * OS resume: always ask the host for a burst-limited Vigia catch-up.
   * @param at - Optional instant (tests).
   */
  onResume(at?: number): void {
    this.lastTick = at ?? (this.options.clock ?? Date.now)()
    this.options.onCatchUp(this.options.burst ?? CATCH_UP_BURST)
  }

  /** Poll used to detect a clock jump without an OS resume event. */
  poll(): void {
    const now = (this.options.clock ?? Date.now)()
    const jumped = now - this.lastTick >= CLOCK_JUMP_MS || now < this.lastTick
    this.lastTick = now
    if (jumped) this.options.onCatchUp(this.options.burst ?? CATCH_UP_BURST)
  }

  /** Quit: nothing is held, so nothing to release. */
  dispose(): void {
    this.running = 0
  }
}
