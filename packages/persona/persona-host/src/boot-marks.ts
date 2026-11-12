/**
 * Boot diet (Forge 10:26 / Keel 10:31): the host's OWN part of the boot, measured, never guessed. Marks are ms since the PROCESS started (`performance.now()`), so a verifier can put them
 * on the same line as the main-side marks (applyRelease, prepareHostEnvironment, authenticateWebHost, window shown) and the child's `starting`/`ready`. The host writes ONE `bootMarks` line to
 * stderr next to `flagsBootLine`/`surfacesBootLine` (never under Vitest), plus one `first-call` line the first time a screen asks it something.
 */

/** Rounded to 0.1 ms: finer would be noise. */
const round = (ms: number): number => Math.round(ms * 10) / 10

export class BootMarks {
  private readonly marks = new Map<string, number>()
  private readonly sums = new Map<string, { ms: number; n: number }>()
  private firstCallDone = false
  private readonly now: () => number

  /** @param now - Milliseconds since the process started (default `performance.now()`). */
  constructor(now: () => number = () => performance.now()) {
    this.now = now
  }

  /**
   * The FIRST time a name is marked wins (a second pass never moves it).
   * @param name - A stable name ("ctor-start", "store-open", "projects-done").
   */
  mark(name: string): void {
    if (!this.marks.has(name)) this.marks.set(name, this.now())
  }

  /**
   * Run `work` and add its duration to a named bucket (the sum and the count, so "reconcile: 10 projects, 42 ms" reads at once).
   * @param bucket - A stable name ("reconcile").
   * @param work - What to time; its result (or its throw) is untouched.
   */
  time<T>(bucket: string, work: () => T): T {
    const start = this.now()
    try {
      return work()
    } finally {
      const sum = this.sums.get(bucket) ?? { ms: 0, n: 0 }
      this.sums.set(bucket, { ms: sum.ms + (this.now() - start), n: sum.n + 1 })
    }
  }

  /** @returns The one boot line: the marks (ms since process start, in the order they were made) and the buckets (total ms and count). */
  line(): string {
    const marks: Record<string, number> = {}
    for (const [name, ms] of this.marks) marks[name] = round(ms)
    const sums: Record<string, { ms: number; n: number }> = {}
    for (const [name, sum] of this.sums) sums[name] = { ms: round(sum.ms), n: sum.n }
    return `[persona-host] bootMarks ${JSON.stringify({ marks, sums })}`
  }

  /** @returns The line of the FIRST screen call (once; later calls get undefined). */
  firstCallLine(): string | undefined {
    if (this.firstCallDone) return undefined
    this.firstCallDone = true
    return `[persona-host] bootMarks ${JSON.stringify({ marks: { 'first-call': round(this.now()) } })}`
  }
}
