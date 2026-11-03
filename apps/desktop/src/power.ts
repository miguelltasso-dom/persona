/** Sleep/energy: block suspension only while a run is live; catch-up after a clock jump. */

export const CATCH_UP_BURST = 3
export const CLOCK_JUMP_MS = 60_000

export interface PowerSaveBlockerPort {
  start(type: 'prevent-app-suspension'): number
  stop(id: number): boolean
}

export interface DesktopPowerOptions {
  readonly blocker: PowerSaveBlockerPort
  readonly onCatchUp: (limit: number) => void
  readonly clock?: () => number
  readonly burst?: number
}

/**
 * Hold `prevent-app-suspension` only while an assignment is running (never the screen).
 */
export class DesktopPower {
  private blockId: number | undefined
  private lastTick: number
  private running = 0

  /** @param options - Electron powerSaveBlocker and Vigia catch-up sink. */
  constructor(private readonly options: DesktopPowerOptions) {
    this.lastTick = (options.clock ?? Date.now)()
  }

  /**
   * Update how many assignments are live.
   * @param count - Running assignments.
   */
  setRunningAssignments(count: number): void {
    this.running = Math.max(0, count)
    if (this.running > 0) this.ensureBlock()
    else this.releaseBlock()
  }

  /**
   * Resume or a jumped clock: ask the host for a burst-limited Vigia catch-up.
   * @param at - Optional instant (tests).
   */
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

  /** Drop the blocker (quit). */
  dispose(): void {
    this.releaseBlock()
  }

  private ensureBlock(): void {
    if (this.blockId !== undefined) return
    this.blockId = this.options.blocker.start('prevent-app-suspension')
  }

  private releaseBlock(): void {
    if (this.blockId === undefined) return
    this.options.blocker.stop(this.blockId)
    this.blockId = undefined
  }
}
