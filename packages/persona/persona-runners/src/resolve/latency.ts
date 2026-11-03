/** Resolve / first-token timings for the latency budget (meta <30 s / 1st token <5 s). */

export interface RunnerTiming {
  spawnMs?: number
  authMs?: number
  modelsMs?: number
  handshakeMs?: number
  firstTokenMs?: number
  cachedAuth?: boolean
  cachedModels?: boolean
  warmed?: boolean
}

/**
 * Elapsed ms from `started`.
 * @param started - `Date.now()` at the step start.
 */
export function elapsedMs(started: number, now: () => number = Date.now): number {
  return Math.max(0, now() - started)
}
