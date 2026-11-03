/**
 * Durable effect queue over a persistence interface. Anvil stores rows in SQLite;
 * tests and ephemeral hosts use {@link MemoryEffectPersistence}.
 */

/** Payload kinds the engine enqueues inside a command transaction. */
export interface EffectPayloads {
  assessment: { triggerId: string }
  launch: { ticketId: string; assignmentId: string }
  delivery: { ticketId: string }
  relay: { text: string }
  notice: { value: Record<string, unknown>; summary: string }
  reply: Record<string, never>
}

export type EffectKind = keyof EffectPayloads

/** One persisted effect row. `generation` increments when the payload is replaced. */
export interface EffectRecord {
  kind: EffectKind
  key: string
  payload: string
  seq: number
  generation: number
  attempts: number
  due: number
}

/**
 * Persistence for {@link EffectQueue}. Every method is synchronous so enqueue
 * can run inside `Repositories.atomic`.
 */
export interface EffectPersistence {
  nextSeq(): number
  upsert(kind: EffectKind, key: string, payload: string, seq: number, due: number): void
  delete(kind: EffectKind, key: string): void
  get(kind: EffectKind, key: string): EffectRecord | undefined
  due(kind: EffectKind, now: number, limit: number): EffectRecord[]
  oldest(kind: EffectKind): EffectRecord | undefined
  pending(kind: EffectKind, key?: string): boolean
  markAttempt(kind: EffectKind, key: string, attempts: number, due: number): void
}

/** Retry later without counting a failure (slot full, paused). */
export class Later extends Error {
  constructor(message: string = 'later') {
    super(message)
    this.name = 'Later'
  }
}

/** In-memory effect rows for the contract suite and ephemeral engines. */
export class MemoryEffectPersistence implements EffectPersistence {
  private seq = 0
  private readonly rows = new Map<string, EffectRecord>()

  private id(kind: EffectKind, key: string): string {
    return `${kind}:${key}`
  }

  nextSeq(): number {
    this.seq += 1
    return this.seq
  }

  upsert(kind: EffectKind, key: string, payload: string, seq: number, due: number): void {
    const id = this.id(kind, key)
    const existing = this.rows.get(id)
    if (existing === undefined) {
      this.rows.set(id, { kind, key, payload, seq, generation: 0, attempts: 0, due })
      return
    }
    this.rows.set(id, {
      ...existing,
      payload,
      generation: existing.generation + 1,
      attempts: 0,
      due,
    })
  }

  delete(kind: EffectKind, key: string): void {
    this.rows.delete(this.id(kind, key))
  }

  get(kind: EffectKind, key: string): EffectRecord | undefined {
    return this.rows.get(this.id(kind, key))
  }

  due(kind: EffectKind, now: number, limit: number): EffectRecord[] {
    return [...this.rows.values()]
      .filter(row => row.kind === kind && row.due <= now)
      .sort((a, b) => a.seq - b.seq)
      .slice(0, limit)
  }

  oldest(kind: EffectKind): EffectRecord | undefined {
    return [...this.rows.values()]
      .filter(row => row.kind === kind)
      .sort((a, b) => a.seq - b.seq)[0]
  }

  pending(kind: EffectKind, key?: string): boolean {
    if (key !== undefined) return this.rows.has(this.id(kind, key))
    return [...this.rows.values()].some(row => row.kind === kind)
  }

  markAttempt(kind: EffectKind, key: string, attempts: number, due: number): void {
    const existing = this.rows.get(this.id(kind, key))
    if (existing === undefined) return
    this.rows.set(this.id(kind, key), { ...existing, attempts, due })
  }
}

export interface EffectHandler<K extends EffectKind> {
  run: (payload: EffectPayloads[K], key: string) => Promise<void>
  limit?: () => number
  ordered?: boolean
}

type AfterCommit = { afterCommit: (action: () => void) => void }

/**
 * Enqueue inside a transaction; dispatch after {@link AfterCommit.afterCommit}.
 */
export class EffectQueue {
  private readonly handlers = new Map<EffectKind, EffectHandler<EffectKind>>()
  private readonly running = new Set<string>()
  private started = false
  private kicked = false

  constructor(
    private readonly persist: EffectPersistence,
    private readonly commits: AfterCommit,
    private readonly now: () => number = Date.now,
  ) {}

  handle<K extends EffectKind>(kind: K, handler: EffectHandler<K>): void {
    if (this.handlers.has(kind)) throw new Error(`effect ${kind} already has a handler`)
    this.handlers.set(kind, handler as EffectHandler<EffectKind>)
  }

  enqueue<K extends EffectKind>(kind: K, key: string, payload: EffectPayloads[K]): void {
    const payloadText = JSON.stringify(payload)
    const seq = this.persist.nextSeq()
    const due = this.now()
    this.commits.afterCommit(() => {
      this.persist.upsert(kind, key, payloadText, seq, due)
      this.kick()
    })
  }

  cancel(kind: EffectKind, key: string): void {
    this.persist.delete(kind, key)
  }

  pending(kind: EffectKind, key?: string): boolean {
    return this.persist.pending(kind, key)
  }

  start(): void {
    this.started = true
    this.kick()
  }

  kick(): void {
    if (this.kicked) return
    this.kicked = true
    queueMicrotask(() => {
      this.kicked = false
      void this.dispatch()
    })
  }

  async idle(): Promise<void> {
    await new Promise<void>((resolve) => { queueMicrotask(() => { resolve() }) })
    await this.dispatch()
    if (this.running.size > 0) await this.dispatch()
  }

  private async dispatch(): Promise<void> {
    if (!this.started) return
    for (const [kind, handler] of this.handlers) {
      const limit = handler.limit?.() ?? 1
      const running = [...this.running].filter(id => id.startsWith(`${kind}:`)).length
      const room = limit - running
      if (room <= 0) continue
      const rows = handler.ordered === true
        ? [this.persist.oldest(kind)].filter((row): row is EffectRecord => row !== undefined && row.due <= this.now())
        : this.persist.due(kind, this.now(), room)
      for (const row of rows.slice(0, room)) {
        const id = `${row.kind}:${row.key}`
        if (this.running.has(id)) continue
        this.running.add(id)
        try {
          await handler.run(JSON.parse(row.payload) as EffectPayloads[EffectKind], row.key)
          if (this.persist.get(kind, row.key)?.generation === row.generation) {
            this.persist.delete(kind, row.key)
          }
        }
        catch (error) {
          if (error instanceof Later) {
            this.persist.markAttempt(kind, row.key, row.attempts, this.now() + 50)
          }
          else {
            this.persist.markAttempt(kind, row.key, row.attempts + 1, this.now() + 50)
          }
        }
        finally {
          this.running.delete(id)
        }
      }
    }
  }
}
