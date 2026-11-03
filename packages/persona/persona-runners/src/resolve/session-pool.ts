/** Warm runner slots per persona+project+purpose. 2nd message must not pay CLI boot. */

export type RunnerPurpose = 'talk' | 'task'

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
}

/**
 * Isolation key. Talk and task never share a slot (different model/purpose).
 * @param input - Persona, project, purpose, runner, model, cwd.
 */
export function sessionPoolKey(input: SessionPoolKey): string {
  return `${input.personaId}|${input.projectId}|${input.purpose}|${input.provider}|${input.model}|${input.cwd ?? ''}|${input.permissionMode ?? ''}|${input.toolLevel ?? ''}`
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
 * @param options - Lease, cap, clock, disposer (CLI session.close).
 */
export function createSessionPool<T>(options: {
  leaseMs?: number
  cap?: number
  now?: () => number
  dispose?: (value: T) => void | Promise<void>
} = {}): SessionPool<T> {
  const leaseMs = options.leaseMs ?? SESSION_LEASE_MS
  const cap = options.cap ?? SESSION_POOL_CAP
  const now = options.now ?? Date.now
  const dispose = options.dispose
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
      for (const [, slot] of entries) {
        if (dispose === undefined) continue
        try {
          await dispose(slot.value)
        } catch (error) {
          void error
        }
      }
    },
    size: () => {
      for (const key of [...slots.keys()]) live(key)
      return slots.size
    },
  }
}
