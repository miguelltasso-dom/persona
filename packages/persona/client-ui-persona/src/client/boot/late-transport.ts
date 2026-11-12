/**
 * boot-estatico (persona-spec/contracts/boot-estatico.md): the LATE transport of the static shell. The renderer mounts without the host; every Remote call made while the host has not answered
 * waits here instead of failing, and goes out when the host says it is ready. Pure: no DOM, no Electron, no `fetch` of its own (the real carrier is injected as `send`), so the whole state
 * machine is tested with a fake clock. It is installed where `ClientTransportHooks.fetch` / `openStream` already are (packages/client/connection), before `bootClient`.
 *
 * Three states: `waking` (the host has not answered), `ready`, `failed`. ONLY `failed` is an error to show; `waking` is a calm state of the screen.
 *  - the ready signal is a PUSH (`markReady`); when none arrives in `probeAfterMs` the optional `probe` is asked at 250 → 500 → 1000 ms (a ceiling);
 *  - in `waking` every call is queued (at most `maxQueue`) and leaves in order at `ready`, `concurrency` at a time;
 *  - a failure that PROVES the call never reached the host (connection refused, HTTP 503 `host-starting`) is retried with backoff and never surfaces while `waking`, nor for `retryWindowMs`
 *    after `ready`; a failure that does not prove it (`unknown`) is retried only when the call is idempotent, so a write is never sent twice;
 *  - `failed` happens only when the main says the host exited (`markFailed`) or after `wakeTimeoutMs` without a ready; `retry()` (the existing `personaBoot.retry` flow) goes back to `waking`.
 */

/** The state of the link with the host. */
export type HostLinkState = 'waking' | 'ready' | 'failed'

/** What a failed `send` tells about the call: it never reached the host, it did and was answered (a real fault), or nobody knows. */
export type Delivery = 'not-delivered' | 'delivered' | 'unknown'

/** The link is `failed`: the host did not come up (or exited). The UI shows its boot-failure flow, never a red panel. */
export class HostLinkFailed extends Error {
  readonly code = 'host-link-failed'
  constructor(readonly reason: string) {
    super(`o host não respondeu: ${reason}`)
    this.name = 'HostLinkFailed'
  }
}

/** More calls waited for the host than the queue holds. */
export class HostLinkQueueFull extends Error {
  readonly code = 'host-link-queue-full'
  constructor() {
    super('muitas chamadas esperando o host acordar')
    this.name = 'HostLinkQueueFull'
  }
}

/** Timers, injected so a test owns the clock. */
export interface LinkTimers {
  readonly set: (run: () => void, ms: number) => unknown
  readonly clear: (handle: unknown) => void
}

export interface HostLinkOptions<Req, Res> {
  /** The real carrier, used once the host is reachable. */
  readonly send: (request: Req) => Promise<Res>
  /** What a REJECTED `send` means for the call (default: `unknown`). */
  readonly classify?: (error: unknown) => Delivery
  /** Plan B for a ready push that never comes: asked on a schedule while `waking`. */
  readonly probe?: () => Promise<HostLinkState>
  /** No `ready` in this time = `failed` (default 90 s). */
  readonly wakeTimeoutMs?: number
  /** Calls started at once when the queue drains (default 4). */
  readonly concurrency?: number
  /** Calls that may wait in `waking` (default 50). */
  readonly maxQueue?: number
  /** How long after `ready` (or after the call, when later) a not-delivered call is still retried (default 30 s). */
  readonly retryWindowMs?: number
  /** Backoff of the retries: first wait, factor, ceiling (default 200 ms × 2 up to 2 s, with ±25 % jitter). */
  readonly backoff?: { readonly firstMs: number; readonly factor: number; readonly maxMs: number }
  /** Wait before the plan B probe starts, and its steps (default 1000 ms; 250, 500, then 1000 repeating). */
  readonly probeAfterMs?: number
  readonly probeStepsMs?: readonly number[]
  readonly timers?: LinkTimers
  /** Jitter source in [0, 1) (default `Math.random`). */
  readonly random?: () => number
}

/** Per call. */
export interface CallOptions {
  /** True when sending it twice is harmless (a read). A non-idempotent call is retried only when the failure PROVES it never reached the host. */
  readonly idempotent?: boolean
}

export interface HostLink<Req, Res> {
  state(): HostLinkState
  /** The state changes, synchronously; returns the unsubscribe. */
  subscribe(listener: (state: HostLinkState) => void): () => void
  call(request: Req, options?: CallOptions): Promise<Res>
  /** The host said it is ready (the push). */
  markReady(): void
  /** The host will not come (the main says it exited) or the wait ran out. */
  markFailed(reason: string): void
  /** `failed` → `waking` again (the person pressed "Tentar de novo"). */
  retry(): void
  dispose(): void
}

interface Waiting<Req, Res> {
  readonly request: Req
  readonly idempotent: boolean
  readonly at: number
  readonly resolve: (value: Res) => void
  readonly reject: (error: unknown) => void
}

const DEFAULT_TIMERS: LinkTimers = { set: (run, ms) => setTimeout(run, ms), clear: (handle) => { clearTimeout(handle as ReturnType<typeof setTimeout>) } }

/**
 * Create the link, `waking`.
 * @param options - The carrier, the classification of failures and the limits.
 * @returns The link.
 */
export function createHostLink<Req, Res>(options: HostLinkOptions<Req, Res>): HostLink<Req, Res> {
  const timers = options.timers ?? DEFAULT_TIMERS
  const random = options.random ?? Math.random
  const classify = options.classify ?? ((): Delivery => 'unknown')
  const wakeTimeoutMs = options.wakeTimeoutMs ?? 90_000
  const concurrency = options.concurrency ?? 4
  const maxQueue = options.maxQueue ?? 50
  const retryWindowMs = options.retryWindowMs ?? 30_000
  const backoff = options.backoff ?? { firstMs: 200, factor: 2, maxMs: 2000 }
  const probeAfterMs = options.probeAfterMs ?? 1000
  const probeSteps = options.probeStepsMs ?? [250, 500, 1000]
  const listeners = new Set<(state: HostLinkState) => void>()
  let state: HostLinkState = 'waking'
  let readyAt = 0
  let failure = ''
  let wakeTimer: unknown
  let probeTimer: unknown
  let probeStep = 0
  let draining = 0
  let disposed = false
  const queue: Waiting<Req, Res>[] = []
  const clock = (): number => Date.now()

  const set = (next: HostLinkState): void => {
    if (state === next) return
    state = next
    for (const listener of [...listeners]) listener(next)
  }
  const stopTimers = (): void => {
    if (wakeTimer !== undefined) timers.clear(wakeTimer)
    if (probeTimer !== undefined) timers.clear(probeTimer)
    wakeTimer = undefined
    probeTimer = undefined
  }
  const failQueue = (): void => {
    for (const waiting of queue.splice(0)) waiting.reject(new HostLinkFailed(failure))
  }
  const wait = (ms: number): Promise<void> => new Promise((resolve) => { timers.set(() => { resolve() }, ms) })
  const delayOf = (attempt: number): number => {
    const base = Math.min(backoff.maxMs, backoff.firstMs * backoff.factor ** attempt)
    return Math.round(base * (0.75 + random() * 0.5)) // ±25 % jitter
  }

  /** One call, with its retries. */
  const run = async (waiting: Waiting<Req, Res>): Promise<void> => {
    const deadline = Math.max(readyAt, waiting.at) + retryWindowMs
    for (let attempt = 0; ; attempt += 1) {
      try {
        waiting.resolve(await options.send(waiting.request))
        return
      } catch (error: unknown) {
        const delivery = classify(error)
        const safeToRetry = delivery === 'not-delivered' || (delivery === 'unknown' && waiting.idempotent)
        if (!safeToRetry || disposed || state === 'failed' || clock() >= deadline) {
          waiting.reject(error)
          return
        }
        await wait(delayOf(attempt))
      }
    }
  }
  const drain = (): void => {
    while (state === 'ready' && draining < concurrency && queue.length > 0) {
      const next = queue.shift()
      if (next === undefined) return
      draining += 1
      void run(next).finally(() => { draining -= 1; drain() })
    }
  }
  const startWaiting = (): void => {
    stopTimers()
    wakeTimer = timers.set(() => { markFailed('o host não ficou pronto a tempo') }, wakeTimeoutMs)
    if (options.probe === undefined) return
    probeStep = 0
    const schedule = (ms: number): void => {
      probeTimer = timers.set(() => {
        if (state !== 'waking' || disposed) return
        const step = probeSteps[Math.min(probeStep, probeSteps.length - 1)] ?? 1000
        probeStep += 1
        void options.probe?.().then((seen) => {
          if (seen === 'ready') markReady()
          else if (seen === 'failed') markFailed('o main avisou que o host não subiu')
          else schedule(step)
        }, () => { schedule(step) })
      }, ms)
    }
    schedule(probeAfterMs)
  }
  function markReady(): void {
    if (disposed || state !== 'waking') return
    stopTimers()
    readyAt = clock()
    set('ready')
    drain()
  }
  function markFailed(reason: string): void {
    if (disposed || state === 'failed') return
    stopTimers()
    failure = reason
    set('failed')
    failQueue()
  }

  startWaiting()
  return {
    state: () => state,
    subscribe: (listener) => {
      listeners.add(listener)
      return () => { listeners.delete(listener) }
    },
    call: (request, callOptions = {}) => new Promise<Res>((resolve, reject) => {
      if (state === 'failed') { reject(new HostLinkFailed(failure)); return }
      const waiting: Waiting<Req, Res> = { request, idempotent: callOptions.idempotent === true, at: clock(), resolve, reject }
      if (state === 'ready' && queue.length === 0) {
        void run(waiting)
        return
      }
      if (queue.length >= maxQueue) { reject(new HostLinkQueueFull()); return }
      queue.push(waiting)
      drain()
    }),
    markReady,
    markFailed,
    retry: () => {
      if (disposed || state !== 'failed') return
      failure = ''
      set('waking')
      startWaiting()
    },
    dispose: () => {
      disposed = true
      stopTimers()
      listeners.clear()
      failure = 'o link foi encerrado'
      failQueue()
    },
  }
}
