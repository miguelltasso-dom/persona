/**
 * Item 12: a Task that passes 4 minutes of active work (or 20 tool calls) moves itself to the background, and the persona
 * is free in the main channel. The decision and the bookkeeping live here; the host only calls {@link BackgroundWork.run}
 * where it used to await the Task, and asks {@link BackgroundWork.isBackground} before absorbing a new message into it.
 *
 * The work chain is freed at the threshold, not when the Task ends: `run` resolves on whichever comes first (the Task
 * ending or the detach), while the Task itself keeps running and is tracked until it settles.
 */

/** Active work after which a Task moves to the background. */
export const BACKGROUND_AFTER_MS = 4 * 60_000

/** The other trigger: this many tool calls in the open turn also move the Task to the background. */
export const BACKGROUND_AFTER_TOOL_CALLS = 20

export interface BackgroundWorkOptions {
  /** Clock in milliseconds (injectable). */
  readonly nowMs?: () => number
  /** Threshold in milliseconds; default {@link BACKGROUND_AFTER_MS}. */
  readonly afterMs?: number
  /** Tool-call threshold; default {@link BACKGROUND_AFTER_TOOL_CALLS}. */
  readonly afterToolCalls?: number
  /** Called once per Task when it moves to the background (the host posts its line here). */
  readonly onDetach?: (ticketId: string) => void
}

/**
 * Which Tasks are running in the background, and the Tasks themselves so shutdown can wait for them.
 */
export class BackgroundWork {
  private readonly background = new Set<string>()
  private readonly tasks = new Map<string, Promise<void>>()
  /** Tool calls seen in the open turn of each tracked Task (the 20th moves it to the background). */
  private readonly seen = new Map<string, number>()
  /** Per tracked Task: the way out of its wait for the clock (the tool-call trigger). */
  private readonly detachers = new Map<string, () => void>()
  private readonly nowMs: () => number
  private readonly afterMs: number
  private readonly afterToolCalls: number
  private readonly onDetach: ((ticketId: string) => void) | undefined

  /**
   * @param options - Clock, thresholds and the detach callback.
   */
  constructor(options: BackgroundWorkOptions = {}) {
    this.nowMs = options.nowMs ?? Date.now
    this.afterMs = options.afterMs ?? BACKGROUND_AFTER_MS
    this.afterToolCalls = options.afterToolCalls ?? BACKGROUND_AFTER_TOOL_CALLS
    this.onDetach = options.onDetach
  }

  /**
   * Whether the Task is already running in the background (a new message must not be absorbed into it).
   * @param ticketId - Task.
   */
  isBackground(ticketId: string): boolean {
    return this.background.has(ticketId)
  }

  /** The Tasks running in the background right now (the host asks whether ANOTHER Task of the same persona is among them before it hands a runner out). */
  ids(): string[] {
    return [...this.background]
  }

  /** How many Tasks are in the background right now. */
  size(): number {
    return this.background.size
  }

  /**
   * Run one Task on the host's work chain, freeing the chain when it passes the threshold.
   * @param ticketId - Task.
   * @param task - The Task's own run (already started; it keeps running after a detach).
   * @param startedAt - When the open turn began (ISO); absent starts the clock now.
   * @param toolCalls - Tool calls already seen in this turn.
   * @param onDetach - Called once when THIS Task moves to the background (overrides the book's callback).
   * @returns Resolves when the Task ends or when it moves to the background, whichever comes first.
   */
  run(ticketId: string, task: Promise<void>, startedAt?: string, toolCalls = 0, onDetach?: (ticketId: string) => void): Promise<void> {
    this.tasks.set(ticketId, task)
    this.seen.set(ticketId, toolCalls)
    const settle = (): void => {
      // A newer run of the same Task may already own the entry: only the promise that is still stored may clear it.
      if (this.tasks.get(ticketId) !== task) return
      this.tasks.delete(ticketId)
      this.background.delete(ticketId)
      this.seen.delete(ticketId)
      this.detachers.delete(ticketId)
    }
    task.then(settle, settle)
    if (this.isBackground(ticketId)) return Promise.resolve()
    const remaining = this.remainingMs(startedAt, toolCalls)
    if (remaining <= 0) {
      this.detach(ticketId, onDetach)
      return Promise.resolve()
    }
    const { promise, resolve } = Promise.withResolvers<void>()
    const timer = setTimeout(() => {
      this.detach(ticketId, onDetach)
      resolve()
    }, remaining)
    timer.unref()
    this.detachers.set(ticketId, () => { clearTimeout(timer); this.detach(ticketId, onDetach); resolve() })
    task.then(() => { clearTimeout(timer); resolve() }, () => { clearTimeout(timer); resolve() })
    return promise
  }

  /**
   * How long until this Task moves to the background.
   * @param startedAt - When the open turn began (ISO); absent starts the clock now.
   * @param toolCalls - Tool calls already seen in this turn.
   * @returns Milliseconds left; 0 when it is due now.
   */
  remainingMs(startedAt: string | undefined, toolCalls: number): number {
    if (toolCalls >= this.afterToolCalls) return 0
    if (startedAt === undefined || startedAt === '') return this.afterMs
    const started = Date.parse(startedAt)
    if (!Number.isFinite(started)) return this.afterMs
    return Math.max(0, this.afterMs - (this.nowMs() - started))
  }

  /**
   * One tool call in the open turn of a Task, as the runner streams it. The 20th moves the Task to the background even before the 4 minutes (the time
   * trigger alone never saw a Task that works fast and long). A Task the book does not track (a talk turn, a triage) counts for nothing.
   * @param ticketId - Task whose turn called the tool.
   */
  toolCalled(ticketId: string): void {
    if (!this.tasks.has(ticketId)) return
    const next = (this.seen.get(ticketId) ?? 0) + 1
    this.seen.set(ticketId, next)
    if (next >= this.afterToolCalls) this.detachers.get(ticketId)?.()
  }

  /** Wait for every Task that is still running in the background (tests and any caller that must wait). Shutdown does not wait:
   * a Task cut by the app closing is recovered on the next boot, the same as any interrupted Task.
   */
  async whenIdle(): Promise<void> {
    while (this.tasks.size > 0) await Promise.allSettled([...this.tasks.values()])
  }

  /** Forget every tracked Task: the book belongs to the runtimes that a host reset just dropped. */
  reset(): void {
    this.tasks.clear()
    this.background.clear()
    this.seen.clear()
    this.detachers.clear()
  }

  private detach(ticketId: string, onDetach?: (ticketId: string) => void): void {
    if (this.background.has(ticketId)) return
    this.background.add(ticketId)
    const notify = onDetach ?? this.onDetach
    notify?.(ticketId)
  }
}

const books = new WeakMap<object, BackgroundWork>()

/**
 * The background book of one host (created on first use).
 * @param owner - The host instance.
 * @param options - Used only when the book is created.
 */
export function backgroundWorkOf(owner: object, options?: BackgroundWorkOptions): BackgroundWork {
  const existing = books.get(owner)
  if (existing !== undefined) return existing
  const created = new BackgroundWork(options)
  books.set(owner, created)
  return created
}
