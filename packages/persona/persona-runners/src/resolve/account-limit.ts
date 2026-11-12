/**
 * D-103b: at most 2 simultaneous calls per subscription account, and a 400-800 ms jitter on the calls of a fan-out.
 *
 * A team that answers a request fans out: the coordination turn, the colleagues' turns and their triage calls all hit the SAME subscription at once. Without a ceiling the burst
 * looks like a robot to the vendor and burns the account's rate window in a second. This is a counter and a FIFO queue per account key (`provider:accountId`), nothing else:
 *  - a call on an idle account starts at once (a lone call is not a fan-out, so no jitter);
 *  - a call that finds the account busy takes its slot at once (if one is free) or waits its turn (FIFO), and then waits a jitter inside 400-800 ms BEFORE it starts, so the starts of
 *    a burst are spread out instead of landing together. The slot is already its own while it waits, so the ceiling holds during the jitter too;
 *  - the slot is held from the start of a turn to the end of its stream (`withAccountLimit`): ended, cancelled, abandoned by the reader, or the runner disposed;
 *  - a lease nobody gives back (a handle never streamed nor cancelled) frees itself after `holdLimitMs`, so two forgotten turns cannot starve an account for ever.
 * Pure policy: no session, no OAR, no process. The clock and the random are injected, so the tests run without waiting.
 */

import type { RunEvent, RunHandle, Runner, StartTurnInput } from '../contract.ts'

/** Calls that may run at once on one subscription account. */
export const ACCOUNT_MAX_CONCURRENT = 2
/** The jitter of a fan-out call, inclusive bounds. */
export const FANOUT_JITTER_MIN_MS = 400
export const FANOUT_JITTER_MAX_MS = 800
/** A lease never given back frees itself after this (the longest turn is far below it). */
export const LEASE_HOLD_LIMIT_MS = 30 * 60_000

/**
 * The key of one subscription account.
 * @param provider - CLI / provider id (`claude`, `codex`...).
 * @param accountId - The account (WAVE2); a person with one account and no id is `default`.
 */
export function accountKeyOf(provider: string, accountId?: string): string {
  return `${provider}:${accountId === undefined || accountId === '' ? 'default' : accountId}`
}

/** A slot on one account. `release` is idempotent. */
export interface AccountLease {
  release(): void
}

export interface AccountLimiterOptions {
  /** Ceiling per account. Default 2; never below 1. */
  readonly max?: number
  readonly minJitterMs?: number
  readonly maxJitterMs?: number
  /** `[0, 1)`; default `Math.random`. */
  readonly random?: () => number
  /** Default: a timer that also stops when the signal aborts. */
  readonly sleep?: (ms: number, signal?: AbortSignal) => Promise<void>
  /** Default {@link LEASE_HOLD_LIMIT_MS}. */
  readonly holdLimitMs?: number
}

interface Waiter {
  grant(): void
  reject(error: Error): void
}

interface Slot {
  active: number
  readonly queue: Waiter[]
}

function abortedError(): Error {
  const error = new Error('A chamada foi abandonada antes de começar.')
  error.name = 'AbortError'
  return error
}

async function timerSleep(ms: number, signal?: AbortSignal): Promise<void> {
  if (signal?.aborted === true) throw abortedError()
  await new Promise<void>((resolve, reject) => {
    const done = (): void => { signal?.removeEventListener('abort', onAbort); resolve() }
    const timer = setTimeout(done, ms)
    const onAbort = (): void => { clearTimeout(timer); reject(abortedError()) }
    signal?.addEventListener('abort', onAbort, { once: true })
  })
}

export class AccountLimiter {
  private readonly slots = new Map<string, Slot>()
  private readonly max: number
  private readonly minJitterMs: number
  private readonly maxJitterMs: number
  private readonly random: () => number
  private readonly sleep: (ms: number, signal?: AbortSignal) => Promise<void>
  private readonly holdLimitMs: number

  constructor(options: AccountLimiterOptions = {}) {
    this.max = Math.max(1, Math.floor(options.max ?? ACCOUNT_MAX_CONCURRENT))
    this.minJitterMs = options.minJitterMs ?? FANOUT_JITTER_MIN_MS
    this.maxJitterMs = Math.max(this.minJitterMs, options.maxJitterMs ?? FANOUT_JITTER_MAX_MS)
    this.random = options.random ?? Math.random
    this.sleep = options.sleep ?? timerSleep
    this.holdLimitMs = options.holdLimitMs ?? LEASE_HOLD_LIMIT_MS
  }

  /**
   * Take a slot on one account; resolves when the call may START (after its jitter, for a fan-out call).
   * @param key - {@link accountKeyOf}.
   * @param options - `signal`: abandon the wait (rejects; a slot already taken is given back).
   */
  async acquire(key: string, options: { readonly signal?: AbortSignal } = {}): Promise<AccountLease> {
    const signal = options.signal
    if (signal?.aborted === true) throw abortedError()
    const slot = this.slotOf(key)
    let fanout = slot.active > 0 || slot.queue.length > 0
    if (slot.active < this.max && slot.queue.length === 0) {
      slot.active += 1
    } else {
      fanout = true
      await this.wait(slot, signal) // the slot is handed over by `release`: `active` already counts it
    }
    const lease = this.leaseOf(key, slot)
    if (fanout) {
      try {
        await this.sleep(this.jitter(), signal)
      } catch (error) {
        lease.release()
        throw error
      }
    }
    return lease
  }

  /**
   * What an account holds right now.
   * @param key - {@link accountKeyOf}.
   */
  snapshot(key: string): { active: number; waiting: number } {
    const slot = this.slots.get(key)
    return { active: slot?.active ?? 0, waiting: slot?.queue.length ?? 0 }
  }

  private jitter(): number {
    const span = this.maxJitterMs - this.minJitterMs
    return this.minJitterMs + Math.min(span, Math.floor(this.random() * (span + 1)))
  }

  private slotOf(key: string): Slot {
    let slot = this.slots.get(key)
    if (slot === undefined) {
      slot = { active: 0, queue: [] }
      this.slots.set(key, slot)
    }
    return slot
  }

  private async wait(slot: Slot, signal: AbortSignal | undefined): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        const at = slot.queue.indexOf(waiter)
        if (at >= 0) slot.queue.splice(at, 1)
        reject(abortedError())
      }
      const waiter: Waiter = {
        grant: () => { signal?.removeEventListener('abort', onAbort); resolve() },
        reject,
      }
      slot.queue.push(waiter)
      signal?.addEventListener('abort', onAbort, { once: true })
    })
  }

  private leaseOf(key: string, slot: Slot): AccountLease {
    let released = false
    const release = (): void => {
      if (released) return
      released = true
      clearTimeout(timer) // (`timer` is set right below, before `release` can ever be called)
      const next = slot.queue.shift()
      if (next === undefined) {
        slot.active = Math.max(0, slot.active - 1)
        if (slot.active === 0) this.slots.delete(key)
      } else {
        next.grant() // the slot passes to the next call in line: `active` stays
      }
    }
    const timer = setTimeout(release, this.holdLimitMs)
    ;(timer as { unref?: () => void }).unref?.()
    return { release }
  }
}

/** The one limiter of the process: every runner shares it, so the ceiling is per ACCOUNT, not per runner. */
export const defaultAccountLimiter = new AccountLimiter()

/**
 * Hold a slot of the account from the start of each turn to the end of its stream.
 * @param inner - Resolved runner.
 * @param limiter - The limiter shared by the runners of the process.
 * @param key - {@link accountKeyOf}.
 */
export function withAccountLimit(inner: Runner, limiter: AccountLimiter, key: string): Runner {
  const leases = new Map<string, AccountLease>()
  const release = (runId: string): void => {
    const lease = leases.get(runId)
    if (lease === undefined) return
    leases.delete(runId)
    lease.release()
  }
  const open = async (opener: () => Promise<RunHandle>): Promise<RunHandle> => {
    const lease = await limiter.acquire(key)
    try {
      const handle = await opener()
      release(handle.runId) // a handle that comes back again means the turn before it is over
      leases.set(handle.runId, lease)
      return handle
    } catch (error) {
      lease.release()
      throw error
    }
  }
  const play = (source: (handle: RunHandle) => AsyncIterable<RunEvent>) => async function *(handle: RunHandle): AsyncIterable<RunEvent> {
    try {
      for await (const event of source(handle)) {
        // free the slot BEFORE the reader sees the end: the next call in line starts as the previous one reports
        if (event.type === 'ended') release(handle.runId)
        yield event
      }
    } finally {
      release(handle.runId)
    }
  }
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: async (input: StartTurnInput) => open(async () => inner.start(input)),
    startTurn: async (input: StartTurnInput) => open(async () => inner.startTurn(input)),
    stream: play(handle => inner.stream(handle)),
    events: play(handle => inner.events(handle)),
    cancel: async (handle) => {
      try {
        await inner.cancel(handle)
      } finally {
        release(handle.runId)
      }
    },
    resume: async (input: StartTurnInput) => open(async () => inner.resume(input)),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(input) }),
    ...(inner.steer === undefined ? {} : { steer: (...args: Parameters<NonNullable<Runner['steer']>>) => inner.steer!(...args) }),
    dispose: async () => {
      for (const runId of [...leases.keys()]) release(runId)
      await inner.dispose?.()
    },
  }
}
