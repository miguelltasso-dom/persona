/**
 * M4 / 24 h: the host's resident runners, kept to a ceiling and let go of when idle. The policy is pure (`warm-pool-policy.ts`); this is the part that watches the runners (busy / idle by their own events), runs the sweep on an
 * unref'd timer and drops through ONE door, the host's own `dropWarm` (browser lease, station, approval gate and the CLI itself are released there, exactly as when a persona is paused).
 */

import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { DEFAULT_WARM_LIMITS, parseWarmKey, planWarmEviction, type WarmEntry, type WarmEviction, type WarmLimits } from './warm-pool-policy.ts'

/** How long a runner just handed to a turn is safe from a sweep while the turn has not reported `running` yet. */
const CLAIM_MS = 60_000
/** The sweep period. */
export const WARM_SWEEP_MS = 60_000

/**
 * The safety key: `PERSONA_WARM_SWEEP=0` keeps every runner resident, as before (the sweep is on in production, never under Vitest).
 * @param env - The environment (default `process.env`).
 * @returns Whether the idle sweep may run.
 */
export function warmSweepEnabled(env: NodeJS.ProcessEnv = process.env): boolean {
  return env.PERSONA_WARM_SWEEP !== '0'
}

/**
 * @param env - The environment (default `process.env`).
 * @returns The boot line a verifier reads next to the flags and the surfaces.
 */
export function warmSweepBootLine(env: NodeJS.ProcessEnv = process.env): string {
  return `[persona-host] warmSweep ${warmSweepEnabled(env) ? 'on' : 'off'} (PERSONA_WARM_SWEEP=0 turns it off; idle 15 min, 1 conversation + 1 Task per persona, ceiling by RAM)`
}

interface Meta {
  lastUsedAt: number
  busy: boolean
  claimedUntil: number
}

/** What the pool needs from the host. */
export interface WarmPoolDeps {
  /** The resident runners (`Orchestration.warmRunners`). */
  readonly list: () => Iterable<readonly [string, Runner]>
  /** Let one go through the host's single door (`dropWarm`). */
  readonly drop: (key: string) => void
  /** The host clock (ms). */
  readonly now: () => number
  /** The limits at this moment (the RAM cap is known only when the host starts). */
  readonly limits?: () => Partial<WarmLimits>
  /** Told once per eviction (the trail, the tests). */
  readonly onEvict?: (eviction: WarmEviction) => void
  /** Timer seam; default `setInterval` (unref'd: it never keeps the host alive). */
  readonly schedule?: (run: () => void, ms: number) => unknown
  readonly cancel?: (handle: unknown) => void
}

/** The ceiling and the idle sweep of the resident runners. */
export class WarmPool {
  private readonly meta = new WeakMap<object, Meta>()
  private timer: unknown

  /** @param deps - The host's runners, door and clock. */
  constructor(private readonly deps: WarmPoolDeps) {}

  /**
   * Follow a runner: its own events say when it works and when it stops. Idempotent.
   * @param runner - A runner the host just opened or is handing out.
   */
  track(runner: Runner): void {
    if (this.meta.has(runner)) return
    const meta: Meta = { lastUsedAt: this.deps.now(), busy: false, claimedUntil: this.deps.now() + CLAIM_MS }
    this.meta.set(runner, meta)
    runner.onEvent((event) => {
      if (event.type === 'running') {
        meta.busy = true
        return
      }
      if (event.type === 'idle' || event.type === 'error') {
        meta.busy = false
        meta.claimedUntil = 0
        meta.lastUsedAt = this.deps.now()
      }
    })
  }

  /**
   * A warm runner is being handed to a turn: it is in use from now on, even before it reports `running`.
   * @param runner - The runner handed out.
   */
  touch(runner: Runner): void {
    this.track(runner)
    const meta = this.meta.get(runner)
    if (meta === undefined) return
    meta.lastUsedAt = this.deps.now()
    meta.claimedUntil = meta.lastUsedAt + CLAIM_MS
  }

  /** @returns The resident runners as the policy sees them. */
  entries(): WarmEntry[] {
    const now = this.deps.now()
    const out: WarmEntry[] = []
    for (const [key, runner] of this.deps.list()) {
      const parts = parseWarmKey(key)
      if (parts === undefined) continue
      this.track(runner)
      const meta = this.meta.get(runner)
      out.push({ key, ...parts, lastUsedAt: meta?.lastUsedAt ?? now, busy: (meta?.busy ?? false) || now < (meta?.claimedUntil ?? 0) })
    }
    return out
  }

  /** @returns How many runners are resident (what the Station shows). */
  resident(): number {
    return this.entries().length
  }

  /** @returns How many of them are working (or about to). */
  busy(): number {
    return this.entries().filter(entry => entry.busy).length
  }

  /** @returns The resident CLIs for the station's RAM admission: when each one last did anything (a working one counts as now). */
  warmClis(): { readonly id: string; readonly idleSince: number }[] {
    const now = this.deps.now()
    return this.entries().map(entry => ({ id: entry.key, idleSince: entry.busy ? now : entry.lastUsedAt }))
  }

  /** @returns The limits in force: the defaults, narrowed by the host. */
  limits(): WarmLimits {
    return { ...DEFAULT_WARM_LIMITS, ...(this.deps.limits?.() ?? {}) }
  }

  /**
   * One sweep: let go of what the policy says. Never a working runner.
   * @returns What was evicted.
   */
  sweep(): WarmEviction[] {
    const plan = planWarmEviction(this.entries(), this.deps.now(), this.limits())
    for (const eviction of plan) this.evict(eviction)
    return plan
  }

  /**
   * The station asks for room (RAM): close these idle runners, oldest first, and never a working one.
   * @param keys - The ids `admit` returned.
   * @returns The keys that were closed.
   */
  evictIdle(keys: readonly string[]): string[] {
    const idle = new Set(this.entries().filter(entry => !entry.busy).map(entry => entry.key))
    const closed = keys.filter(key => idle.has(key))
    for (const key of closed) this.evict({ key, reason: 'global-cap' })
    return closed
  }

  /** Start the periodic sweep (production only: a test sweeps by hand). */
  start(everyMs: number = WARM_SWEEP_MS): void {
    if (this.timer !== undefined) return
    const run = (): void => { this.sweep() }
    if (this.deps.schedule !== undefined) {
      this.timer = this.deps.schedule(run, everyMs)
      return
    }
    const handle = setInterval(run, everyMs)
    handle.unref()
    this.timer = handle
  }

  /** Stop the periodic sweep. */
  stop(): void {
    if (this.timer === undefined) return
    if (this.deps.cancel !== undefined) this.deps.cancel(this.timer)
    else clearInterval(this.timer as ReturnType<typeof setInterval>)
    this.timer = undefined
  }

  private evict(eviction: WarmEviction): void {
    this.deps.drop(eviction.key)
    this.deps.onEvict?.(eviction)
  }
}
