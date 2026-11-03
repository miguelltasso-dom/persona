/**
 * MasterAssessor over a ThreadContext port (P9). Queues one assessment per eval.
 */

import type { Assessor, Candidate } from '../core/ports.ts'

/** Bounded facts the assessor may read; never authority. */
export interface ThreadContext {
  /**
   * @param threadKey - Thread to read.
   * @param limit - Max messages.
   */
  window(threadKey: string, limit: number): readonly { id: string; text: string }[]
}

/**
 * Assessor that records requests and reads a bounded thread window.
 */
export class MasterAssessor implements Assessor {
  readonly requested: string[] = []
  readonly released: string[] = []

  /**
   * @param context - Thread window port.
   * @param decide - Called with the candidate after the window is read.
   */
  constructor(
    private readonly context: ThreadContext,
    private readonly decide: (candidate: Candidate, window: readonly { id: string; text: string }[]) => void = () => {},
  ) {}

  request(candidate: Candidate): void {
    this.requested.push(candidate.evalId)
    const window = this.context.window(candidate.thread.key, 20)
    this.decide(candidate, window)
  }

  release(evalId: string): void {
    this.released.push(evalId)
  }
}
