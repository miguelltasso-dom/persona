/**
 * Item 13, "conferindo" honesto (Tally, 11/11): an engine whose login check ran out of time is NOT logged out. On a plain Windows laptop the CLI's first spawn can take longer than the
 * probe waits, and the product used to say "conferindo…" forever (never a false "sem login", but never an honest "não consegui conferir" either).
 *
 * The rule (Muse, COLHEITA-MUSE §13.4): a check that ran out of time shows "conferindo…" the first time; after TWO in a row it is "não consegui conferir" (with a way to try again),
 * in the muted ink, never the red of a confirmed logout. A check that really answered (logged in OR logged out) clears the count. The name in code is ours: `unconfirmed`.
 *
 * Pure counters, no I/O, no model. The probe feeds it one observation per engine per pass; a pass that failed as a whole (the detector threw or timed out) counts for every engine.
 */

/** Checks that ran out of time, in a row, before the card says it could not tell. */
export const UNCONFIRMED_AFTER = 2

export class CheckTracker {
  private readonly runs = new Map<string, number>()
  private failedPasses = 0

  /**
   * One pass answered for this engine.
   * @param id - The engine (`claude`, `codex`…).
   * @param unknown - The engine's own check ran out of time or could not tell (`authUnknown`); false = it answered (logged in or out).
   */
  note(id: string, unknown: boolean): void {
    this.failedPasses = 0
    this.runs.set(id, unknown ? (this.runs.get(id) ?? 0) + 1 : 0)
  }

  /** The whole pass failed (the detector threw or timed out): nothing is known about any engine. */
  failPass(): void {
    this.failedPasses += 1
  }

  /** @returns Whether this engine's check has run out of time {@link UNCONFIRMED_AFTER} times in a row (or the whole pass has). */
  isUnconfirmed(id: string): boolean {
    return (this.runs.get(id) ?? 0) >= UNCONFIRMED_AFTER || this.failedPasses >= UNCONFIRMED_AFTER
  }

  /** @returns Whether whole passes keep failing (what placeholders may say about every engine). */
  passesFailing(): boolean {
    return this.failedPasses >= UNCONFIRMED_AFTER
  }

  /** The person asked to try again: start counting from zero. */
  reset(): void {
    this.runs.clear()
    this.failedPasses = 0
  }
}
