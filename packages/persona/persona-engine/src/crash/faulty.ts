/**
 * Count repository writes and abort after N. Memory atomic rolls the open
 * transaction back; Anvil's SQLite tx must do the same.
 */

import type { Decision, Thread, Ticket, Trigger, TriggerDisposition } from '../core/model.ts'
import type { Repositories } from '../core/ports.ts'

export class CrashError extends Error {
  /**
   * @param writeIndex - 1-based write that did not finish.
   */
  constructor(readonly writeIndex: number) {
    super(`CRASH_AFTER_WRITE_${String(writeIndex)}`)
    this.name = 'CrashError'
  }
}

/**
 * Delegates to an inner store; throws {@link CrashError} on write `crashAfter + 1`.
 */
export class FaultyRepositories implements Repositories {
  writes = 0
  crashAfter: number | undefined

  constructor(private readonly inner: Repositories) {}

  get projectId(): string {
    return this.inner.projectId
  }

  /**
   * @param work - One engine command.
   */
  atomic<T>(work: () => T): T {
    return this.inner.atomic(work)
  }

  /**
   * @param action - After the outermost commit.
   */
  afterCommit(action: () => void): void {
    this.inner.afterCommit(action)
  }

  /**
   * Reset the counter between prefix and the step under test.
   */
  resetWrites(): void {
    this.writes = 0
  }

  private note(): void {
    this.writes += 1
    if (this.crashAfter !== undefined && this.writes > this.crashAfter) {
      throw new CrashError(this.writes)
    }
  }

  readonly triggers = {
    get: (id: string): Trigger | undefined => this.inner.triggers.get(id),
    save: (trigger: Trigger): void => {
      this.note()
      this.inner.triggers.save(trigger)
    },
    disposition: (id: string): TriggerDisposition | undefined => this.inner.triggers.disposition(id),
    saveDisposition: (id: string, value: TriggerDisposition): void => {
      this.note()
      this.inner.triggers.saveDisposition(id, value)
    },
  }

  readonly threads = {
    get: (key: string): Thread | undefined => this.inner.threads.get(key),
    save: (thread: Thread): void => {
      this.note()
      this.inner.threads.save(thread)
    },
    list: (): Thread[] => this.inner.threads.list(),
    active: (): Thread[] => this.inner.threads.active(),
  }

  readonly tickets = {
    get: (id: string): Ticket | undefined => this.inner.tickets.get(id),
    save: (ticket: Ticket): void => {
      this.note()
      this.inner.tickets.save(ticket)
    },
    list: (): Ticket[] => this.inner.tickets.list(),
    open: (): Ticket[] => this.inner.tickets.open(),
    active: (): Ticket[] => this.inner.tickets.active(),
  }

  readonly decisions = {
    get: (id: string): Decision | undefined => this.inner.decisions.get(id),
    save: (decision: Decision): void => {
      this.note()
      this.inner.decisions.save(decision)
    },
    byThread: (key: string): Decision[] => this.inner.decisions.byThread(key),
  }
}
