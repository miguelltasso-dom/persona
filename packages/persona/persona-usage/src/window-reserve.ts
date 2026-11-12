/**
 * Reserve of the last 5% of a subscription window (ADR 0118, harvest 10).
 *
 * Long work and routines pause when the 5-hour or weekly window reaches 95%: the last 5% belongs to short answers to
 * the owner. At 100% nothing runs until the window renews. The decision is pure and reads only official figures; a
 * window the vendor did not publish never pauses anything (absence is not 0%).
 */

import type { UsageOrigin } from './types.ts'

/** A window at or above this percentage pauses the team's own work. */
export const WINDOW_RESERVE_PERCENT = 95

/** `reserve` = the last 5% (owner answers only); `exhausted` = the window is spent. */
export type WindowReserveState = 'reserve' | 'exhausted'

/** The official window that paused the team, and how much of it was used. */
export interface WindowReserve {
  readonly state: WindowReserveState
  readonly provider: string
  readonly accountId?: string
  readonly windowId: string
  readonly usedPercent: number
  readonly resetsAt?: string
}

/** One stored official quota row (persona-store `StoredOfficialQuota` fits). */
export interface ReserveQuotaRow {
  readonly provider: string
  readonly accountId?: string
  readonly origin: UsageOrigin
  readonly windows: readonly {
    readonly id: string
    readonly origin: UsageOrigin
    readonly usedPercent?: number
    readonly resetsAt?: string
  }[]
}

/**
 * The window that triggers the reserve: the most used official window at or above 95% that has not renewed yet.
 * A window whose `resetsAt` already passed is ignored (its figure belongs to the previous cycle).
 * @param quotas - Stored official quota rows (one per provider and account).
 * @param nowMs - Host clock.
 * @returns The reserve, or `undefined` when every published window has room.
 */
export function windowReserveOf(quotas: readonly ReserveQuotaRow[], nowMs: number): WindowReserve | undefined {
  let best: WindowReserve | undefined
  for (const quota of quotas) {
    if (quota.origin !== 'official') continue
    for (const window of quota.windows) {
      if (window.origin !== 'official') continue
      const used = window.usedPercent
      if (used === undefined || used < WINDOW_RESERVE_PERCENT) continue
      if (window.resetsAt !== undefined) {
        const resets = Date.parse(window.resetsAt)
        if (Number.isFinite(resets) && resets <= nowMs) continue
      }
      const candidate: WindowReserve = {
        state: used >= 100 ? 'exhausted' : 'reserve',
        provider: quota.provider,
        ...(quota.accountId === undefined ? {} : { accountId: quota.accountId }),
        windowId: window.id,
        usedPercent: used,
        ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
      }
      if (best === undefined || moreConstrained(candidate, best)) best = candidate
    }
  }
  return best
}

/**
 * Long work and routines run only while the whole window is free.
 * @param reserve - Current reserve, if any.
 * @returns Whether the team's own work may run.
 */
export function backgroundWorkAllowed(reserve: WindowReserve | undefined): boolean {
  return reserve === undefined
}

/**
 * Short answers to the owner keep the last 5%; at 100% nothing runs.
 * @param reserve - Current reserve, if any.
 * @returns Whether a short answer to the owner may run.
 */
export function ownerAnswerAllowed(reserve: WindowReserve | undefined): boolean {
  return reserve === undefined || reserve.state === 'reserve'
}

/**
 * Human name of the window, for the one line the owner reads.
 * @param reserve - Current reserve.
 * @returns `5 h`, `da semana` or `da assinatura`.
 */
export function reserveWindowLabel(reserve: WindowReserve): string {
  if (/5h|five/iu.test(reserve.windowId)) return '5 h'
  if (/week|semana|7d/iu.test(reserve.windowId)) return 'semanal'
  return 'da assinatura'
}

function moreConstrained(candidate: WindowReserve, best: WindowReserve): boolean {
  if (candidate.usedPercent !== best.usedPercent) return candidate.usedPercent > best.usedPercent
  if (candidate.resetsAt === undefined) return false
  if (best.resetsAt === undefined) return true
  return candidate.resetsAt < best.resetsAt
}
