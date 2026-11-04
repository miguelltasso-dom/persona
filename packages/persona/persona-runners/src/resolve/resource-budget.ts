/**
 * Process / connection budget so Chromium does not hit ERR_INSUFFICIENT_RESOURCES.
 */

import { SESSION_POOL_CAP } from './session-pool.ts'

/** Concurrent model turns (Coordination + workers). */
export const RESOURCE_TURN_CAP = 5

/** Child CLI/host processes the desktop should keep alive at once. */
export const RESOURCE_CHILD_CAP = 6

/** In-flight HTTP/WS connections from the host UI. */
export const RESOURCE_CONNECTION_CAP = 8

/** Concurrent source polls (telegram/email/slack/discord/caldav). */
export const SOURCE_REQUEST_CAP = 4

export interface ResourceSnapshot {
  rssMb: number
  heapMb: number
  childCap: number
  turnCap: number
  connectionCap: number
  poolCap: number
}

/**
 * Sample this process. Caps are the policy; Anvil/desktop must enforce them.
 */
export function measureResourceBudget(): ResourceSnapshot {
  const mem = process.memoryUsage()
  return {
    rssMb: Math.round(mem.rss / (1024 * 1024)),
    heapMb: Math.round(mem.heapUsed / (1024 * 1024)),
    childCap: RESOURCE_CHILD_CAP,
    turnCap: RESOURCE_TURN_CAP,
    connectionCap: RESOURCE_CONNECTION_CAP,
    poolCap: SESSION_POOL_CAP,
  }
}

/**
 * True when opening another turn would exceed the budget.
 * @param liveTurns - Currently running model turns.
 */
export function wouldExceedTurnBudget(liveTurns: number): boolean {
  return liveTurns >= RESOURCE_TURN_CAP
}

export interface ProcessBudget {
  tryAcquire(): boolean
  release(): void
  live(): number
  cap: number
}

/**
 * Counting semaphore for child processes / in-flight connections.
 * @param cap - Maximum live slots.
 */
export function createProcessBudget(cap: number = RESOURCE_CHILD_CAP): ProcessBudget {
  let live = 0
  return {
    cap,
    tryAcquire: () => {
      if (live >= cap) return false
      live += 1
      return true
    },
    release: () => {
      live = Math.max(0, live - 1)
    },
    live: () => live,
  }
}

/**
 * Run one source poll under the request cap. Over-cap returns `empty` (no fetch).
 * @param budget - Shared slot counter; omitted → no cap (tests / single call).
 * @param empty - Value when the cap is already full.
 * @param work - The poll body.
 */
export async function withSourceRequest<T>(
  budget: ProcessBudget | undefined,
  empty: T,
  work: () => Promise<T>,
): Promise<T> {
  if (budget === undefined) return work()
  if (!budget.tryAcquire()) return empty
  try {
    return await work()
  } finally {
    budget.release()
  }
}
