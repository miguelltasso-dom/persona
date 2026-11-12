/**
 * Boot marks by phase (v1.1.1, opening time): one line per phase in the persona log (`<PERSONA_HOME>/logs/boot-YYYY-MM-DD.log`)
 * with the milliseconds since the process started and since the previous phase, so the opening time is measured by phase (main start,
 * host answered, window opened, boot IPC answered) instead of by one number from outside. A mark never throws and never waits:
 * a log that cannot be written costs the boot nothing.
 */

/** One phase reached. */
export interface BootMark {
  readonly phase: string
  /** Milliseconds since the process started. */
  readonly at: number
  /** Milliseconds since the previous mark (0 for the first). */
  readonly since: number
}

export interface BootMarks {
  /** Record `phase` once: the first call counts, later calls with the same name are ignored (a reload keeps the first boot's story). */
  mark(phase: string): void
  readonly marks: readonly BootMark[]
}

/**
 * @param write - The persona logger's `write(scope, line)`.
 * @param now - Milliseconds since the process started (`performance.now()` in the Electron main process).
 */
export function createBootMarks(
  write: (scope: string, line: string) => Promise<unknown>,
  now: () => number = () => performance.now(),
): BootMarks {
  const marks: BootMark[] = []
  const seen = new Set<string>()
  return {
    marks,
    mark(phase) {
      if (seen.has(phase)) return
      seen.add(phase)
      const at = Math.round(now())
      const since = at - (marks.at(-1)?.at ?? at)
      marks.push({ phase, at, since })
      try {
        void Promise.resolve(write('boot', `${phase} +${String(at)}ms (+${String(since)}ms)`)).catch(() => undefined)
      } catch {
        // The log is a diagnosis aid: it never gets in the way of the boot.
      }
    },
  }
}
