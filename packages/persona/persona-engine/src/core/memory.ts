/** In-memory repository implementation for testing and ephemeral engine instances. */
import { latestAssignment, type Decision, type Thread, type Ticket, type Trigger, type TriggerDisposition } from './model.ts'
import type { Repositories } from './ports.ts'

const clone = <T>(value: T): T => structuredClone(value)
/**
 * In-memory implementation of the Repositories port backed by cloned Map entries so caller mutations do not affect stored state.
 * Provides snapshot-based atomic rollback and matches the ordering semantics of the SQLite store for Engine tests.
 */
export class MemoryRepositories implements Repositories {
  private depth = 0
  private readonly committed: Array<Array<() => void>> = []
  private readonly triggerRows = new Map<string, Trigger>()
  private readonly dispositions = new Map<string, TriggerDisposition>()
  private readonly threadRows = new Map<string, Thread>()
  private readonly ticketRows = new Map<string, Ticket>()
  private readonly decisionRows = new Map<string, Decision>()

  /**
   * @param projectId - Tenant this instance holds (D-038). Defaults to `default` for the ported engine suite.
   * @param report - Receives errors thrown by `afterCommit` hooks after a successful commit.
   */
  constructor(
    readonly projectId: string = 'default',
    private readonly report: (error: unknown) => void = () => {},
  ) {}

  afterCommit(action: () => void): void {
    if (this.depth > 0) {
      const queued = this.committed[this.depth - 1]
      if (queued === undefined) throw new Error('afterCommit queue missing')
      queued.push(action)
      return
    }
    action()
  }

  atomic<T>(work: () => T): T {
    const maps: Map<string, unknown>[] = [this.triggerRows, this.dispositions, this.threadRows, this.ticketRows, this.decisionRows]
    const snapshot = maps.map(map => new Map(map))
    const level = this.depth
    this.committed[level] = []
    this.depth += 1
    try {
      const value = work()
      const actions = this.committed[level] ?? []
      this.committed[level] = []
      this.depth = level
      if (level > 0) {
        const parent = this.committed[level - 1]
        if (parent === undefined) throw new Error('afterCommit parent queue missing')
        parent.push(...actions)
      }
      else {
        for (const action of actions) {
          try { action() }
          catch (error) { this.report(error) }
        }
      }
      return value
    }
    catch (error) {
      maps.forEach((map, index) => {
        const saved = snapshot[index]
        if (saved === undefined) return
        map.clear()
        for (const [id, value] of saved) map.set(id, value)
      })
      this.committed[level] = []
      this.depth = level
      throw error
    }
  }
  readonly triggers = {
    get: (id: string) => clone(this.triggerRows.get(id)),
    save: (trigger: Trigger) => { this.triggerRows.set(trigger.id, clone(trigger)) },
    disposition: (id: string) => clone(this.dispositions.get(id)),
    saveDisposition: (id: string, value: TriggerDisposition) => { this.dispositions.set(id, clone(value)) },
  }
  readonly threads = {
    get: (key: string) => clone(this.threadRows.get(key)),
    save: (thread: Thread) => { this.threadRows.set(thread.key, clone(thread)) },
    list: () => [...this.threadRows.values()].map(clone),
    active: () => this.threads.list().filter(thread => thread.pending.length > 0 || thread.evaluating !== undefined),
  }
  readonly tickets = {
    get: (id: string) => clone(this.ticketRows.get(id)),
    save: (ticket: Ticket) => { this.ticketRows.set(ticket.id, clone(ticket)) },
    /** Newest first, matching the SQLite Store's order. */
    list: () => [...this.ticketRows.values()].reverse().map(clone),
    open: () => this.tickets.list().filter(ticket => !ticket.ended),
    active: () => this.tickets.list().filter(ticket => ticket.undelivered.length > 0 || ['pending', 'running'].includes(latestAssignment(ticket)?.state ?? '')),
  }
  readonly decisions = {
    get: (id: string) => clone(this.decisionRows.get(id)),
    save: (decision: Decision) => { this.decisionRows.set(decision.id, clone(decision)) },
    byThread: (key: string) => [...this.decisionRows.values()].filter(decision => decision.threadKey === key).map(clone),
  }
}
