/**
 * In-memory {@link SyncLog} for the contract suite. Anvil plugs SQLite/D1
 * behind the same methods.
 */

import type { SyncEnvelope, SyncLog } from './types.ts'

/** Durable-object stand-in: one ordered stream map. */
export class MemorySyncLog implements SyncLog {
  private readonly rows: SyncEnvelope[] = []

  append(envelope: SyncEnvelope): void {
    this.rows.push(envelope)
  }

  after(streamId: string, afterSeq: number): readonly SyncEnvelope[] {
    return this.rows.filter(row => row.streamId === streamId && row.seq > afterSeq)
      .slice()
      .sort((a, b) => a.seq - b.seq)
  }

  byIdempotency(key: string): SyncEnvelope | undefined {
    return this.rows.find(row => row.idempotencyKey === key)
  }

  head(streamId: string): number {
    let max = 0
    for (const row of this.rows) {
      if (row.streamId === streamId && row.seq > max) max = row.seq
    }
    return max
  }

  /** Snapshot for replica-convergence tests. */
  snapshot(): readonly SyncEnvelope[] {
    return this.rows.slice()
  }
}
