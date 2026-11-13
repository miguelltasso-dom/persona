/**
 * Marco DOGFOOD (M7): the accelerated clock and the seeded random of the soak. No wall time anywhere:
 * the host reads `now()` (set as `host.orchestration.now`), the driver moves it one step at a time.
 */

/** Small seeded PRNG (mulberry32): same seed, same night. */
export function seeded(seed: number): () => number {
  let state = seed >>> 0
  return () => {
    state = (state + 0x6D2B79F5) >>> 0
    let mixed = Math.imul(state ^ (state >>> 15), state | 1)
    mixed ^= mixed + Math.imul(mixed ^ (mixed >>> 7), mixed | 61)
    return ((mixed ^ (mixed >>> 14)) >>> 0) / 4294967296
  }
}

/** The clock of the night. */
export interface SoakClock {
  /** The host's clock reader. */
  now: () => string
  /** Move one step ahead. */
  advance: () => void
  /** Steps taken. */
  readonly step: () => number
  /** Simulated milliseconds since the start. */
  readonly elapsedMs: () => number
  /** Local day (YYYY-MM-DD) at the given UTC offset, in minutes (Sao Paulo = -180). */
  readonly localDay: (offsetMinutes: number) => string
  /** Local hour (0..23.99) at the given offset. */
  readonly localHour: (offsetMinutes: number) => number
}

/**
 * @param startIso - First instant.
 * @param stepMs - Size of a step (the soak uses 5 minutes).
 */
export function soakClock(startIso: string, stepMs: number): SoakClock {
  const start = Date.parse(startIso)
  if (!Number.isFinite(start)) throw new Error(`soakClock: invalid start ${startIso}`)
  if (!(stepMs > 0)) throw new Error('soakClock: step must be positive')
  let steps = 0
  const at = (): number => start + steps * stepMs
  const local = (offsetMinutes: number): Date => new Date(at() + offsetMinutes * 60_000)
  return {
    now: () => new Date(at()).toISOString(),
    advance: () => { steps += 1 },
    step: () => steps,
    elapsedMs: () => steps * stepMs,
    localDay: offsetMinutes => local(offsetMinutes).toISOString().slice(0, 10),
    localHour: (offsetMinutes) => { const date = local(offsetMinutes); return date.getUTCHours() + date.getUTCMinutes() / 60 },
  }
}

/** One thing that happens at a simulated hour (hours since the start), once. */
export interface NightEvent {
  readonly atHour: number
  readonly name: string
  readonly run: () => void | Promise<void>
}

/** Fires each event the first step whose elapsed time reaches its hour; never twice. */
export function nightScript(events: readonly NightEvent[]): { due: (elapsedMs: number) => NightEvent[]; pending: () => string[] } {
  const done = new Set<NightEvent>()
  return {
    due: (elapsedMs) => {
      const ready = events.filter(event => !done.has(event) && event.atHour * 3_600_000 <= elapsedMs)
      for (const event of ready) done.add(event)
      return ready
    },
    pending: () => events.filter(event => !done.has(event)).map(event => event.name),
  }
}
