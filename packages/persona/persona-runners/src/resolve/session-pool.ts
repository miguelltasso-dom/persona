/** Warm runner slots per persona+project+purpose. 2nd message must not pay CLI boot. */

export type RunnerPurpose = 'talk' | 'task'

/** Cheap work reuses the talk model and talk pool slot (OPT-5). */
export const CHEAP_WORK = ['talk', 'triage', 'librarian', 'watchdog', 'initiative'] as const

/** Work kinds that must not open a heavy persona model. */
export type CheapWork = (typeof CHEAP_WORK)[number]

/**
 * True for triage / librarian / watchdog / initiative / talk.
 * @param work - Host purpose or cheap kind.
 */
export function isCheapWork(work: string): boolean {
  return (CHEAP_WORK as readonly string[]).includes(work)
}

/**
 * Pool/resolve purpose: cheap work shares the talk slot; everything else is task.
 * @param work - Host purpose or cheap kind.
 */
export function poolPurposeFor(work: string): RunnerPurpose {
  return work === 'task' || !isCheapWork(work) ? 'task' : 'talk'
}

/**
 * Idle team with no goal must not open a model (OPT-5).
 * @param hasObjective - Coordination has an open goal.
 */
export function idleTeamMayCallModel(hasObjective: boolean): boolean {
  return hasObjective
}

/** OPT-5: one cheap model call per message that needs a decision. */
export const TRIAGE_CALL_CAP = 1

/**
 * True while triage is still under the one-call cap.
 * @param already - Cheap calls already spent on this message.
 */
export function triageCallsAllowed(already: number): boolean {
  return already < TRIAGE_CALL_CAP
}

/** Idle TTL. Anvil "Sair de vez" / pauseTeam call `disposeAll`. */
export const SESSION_LEASE_MS = 10 * 60_000

/** Global cap (one Coordination + a few workers). */
export const SESSION_POOL_CAP = 8

export interface SessionPoolKey {
  personaId: string
  projectId: string
  purpose: RunnerPurpose
  provider: string
  model: string
  cwd?: string
  permissionMode?: string
  toolLevel?: string
  accountId?: string
  /** EFF-1: the persona's effort. A runner opened with another effort must not be handed back. */
  effort?: string
  /** ISO-5: fingerprint of the account connectors asked for. A runner opened with other ones must not be handed back. */
  connectors?: string
  /** HT-11: the person's skills are on. A runner opened with them must not be handed to a call that has them off. */
  skills?: boolean
  /** P0-05: the URL of the permission gate the runner's hook points at (a gate lives and dies with its Task: a runner opened for another one talks to a closed port). */
  gate?: string
  /** P0-05: the runner carries the product's browser server (a persona with a profile grant): one opened without it must not serve a call that has it, nor the reverse. */
  browser?: boolean
}

/**
 * Isolation key. Talk and task never share a slot (different model/purpose).
 * @param input - Persona, project, purpose, runner, model, cwd.
 */
export function sessionPoolKey(input: SessionPoolKey): string {
  return `${input.personaId}|${input.projectId}|${input.purpose}|${input.provider}|${input.model}|${input.cwd ?? ''}|${input.permissionMode ?? ''}|${input.toolLevel ?? ''}|${input.accountId ?? ''}${input.effort === undefined ? '' : `|${input.effort}`}${input.connectors === undefined ? '' : `|c:${input.connectors}`}${input.skills === true ? '|k:1' : ''}${input.gate === undefined ? '' : `|g:${input.gate}`}${input.browser === true ? '|b:1' : ''}`
}

interface Slot<T> {
  value: T
  leaseUntil: number
  lastUsed: number
}

export interface SessionPool<T> {
  get(key: string): T | undefined
  set(key: string, value: T): void
  touch(key: string): void
  drop(key: string): void
  prewarm(key: string, factory: () => Promise<T>): Promise<T>
  disposeAll(): Promise<void>
  size(): number
}

/**
 * In-memory lease pool with a concurrency cap. Expired / evicted slots run `dispose`.
 * @param options - Lease, cap, clock, disposer (CLI session.close), dispose concurrency.
 */
export function createSessionPool<T>(options: {
  leaseMs?: number
  cap?: number
  now?: () => number
  dispose?: (value: T) => void | Promise<void>
  disposeConcurrency?: number
} = {}): SessionPool<T> {
  const leaseMs = options.leaseMs ?? SESSION_LEASE_MS
  const cap = options.cap ?? SESSION_POOL_CAP
  const now = options.now ?? Date.now
  const dispose = options.dispose
  const disposeConcurrency = options.disposeConcurrency ?? SESSION_DISPOSE_CONCURRENCY
  const slots = new Map<string, Slot<T>>()

  const forget = async (key: string, value: T): Promise<void> => {
    slots.delete(key)
    if (dispose === undefined) return
    try {
      await dispose(value)
    } catch (error) {
      void error
    }
  }

  const live = (key: string): Slot<T> | undefined => {
    const slot = slots.get(key)
    if (slot === undefined) return undefined
    if (slot.leaseUntil <= now()) {
      void forget(key, slot.value)
      return undefined
    }
    return slot
  }

  const evictOldest = async (): Promise<void> => {
    let oldest: { key: string; at: number } | undefined
    for (const [key, slot] of slots) {
      if (oldest === undefined || slot.lastUsed < oldest.at) oldest = { key, at: slot.lastUsed }
    }
    if (oldest === undefined) return
    const slot = slots.get(oldest.key)
    if (slot !== undefined) await forget(oldest.key, slot.value)
  }

  return {
    get: key => live(key)?.value,
    set: (key, value) => {
      if (slots.size >= cap && !slots.has(key)) void evictOldest()
      const at = now()
      slots.set(key, { value, leaseUntil: at + leaseMs, lastUsed: at })
    },
    touch: (key) => {
      const slot = live(key)
      if (slot === undefined) return
      const at = now()
      slot.lastUsed = at
      slot.leaseUntil = at + leaseMs
    },
    drop: (key) => {
      const slot = slots.get(key)
      if (slot !== undefined) void forget(key, slot.value)
    },
    prewarm: async (key, factory) => {
      const hit = live(key)?.value
      if (hit !== undefined) return hit
      const value = await factory()
      if (slots.size >= cap && !slots.has(key)) await evictOldest()
      const at = now()
      slots.set(key, { value, leaseUntil: at + leaseMs, lastUsed: at })
      return value
    },
    disposeAll: async () => {
      const entries = [...slots.entries()]
      slots.clear()
      if (dispose === undefined) return
      await forEachBounded(entries, disposeConcurrency, async ([, slot]) => {
        await dispose(slot.value)
      })
    },
    size: () => {
      for (const key of [...slots.keys()]) live(key)
      return slots.size
    },
  }
}

/**
 * Default concurrent disposals during host shutdown or warm eviction; clears 13+ warm CLI sessions under the watchdog without unbounded spawn fanout.
 */
export const SESSION_DISPOSE_CONCURRENCY = 16

/**
 * Runs `work` over `items` with at most `concurrency` workers in flight at once, swallowing per-item errors so one broken teardown never stalls the rest.
 * @param items - Items to process.
 * @param concurrency - Maximum simultaneous invocations clamped to at least 1.
 * @param work - Async callback invoked once per item.
 * @returns Resolves after all items settle.
 */
export async function forEachBounded<T>(
  items: readonly T[],
  concurrency: number,
  work: (item: T) => Promise<void>,
): Promise<void> {
  if (items.length === 0) return
  const bound = Number.isFinite(concurrency)
    ? Math.floor(concurrency)
    : concurrency === Number.POSITIVE_INFINITY ? items.length : 1
  const width = Math.min(items.length, Math.max(1, bound))
  const iterator = items.values()
  const worker = async (): Promise<void> => {
    for (const item of iterator) {
      try {
        await work(item)
      } catch (error) {
        void error
      }
    }
  }
  await Promise.all(Array.from({ length: width }, () => worker()))
}
