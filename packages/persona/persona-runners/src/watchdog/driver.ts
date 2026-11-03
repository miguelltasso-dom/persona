/**
 * Watchdog (Vigia) session driver. Assignable function (D-043 / D-032).
 * Reads Forge signals only — never writes tickets.
 */

import {
  watchdogSignals,
  watchdogWarnings,
  type WatchdogSnapshot,
  type WatchdogWarning,
} from '@deepseek-ai/dsh-persona-engine'
import type { Runner } from '../port.ts'

/** Session id for the project's watchdog function. */
export const WATCHDOG_SESSION_ID = 'watchdog'

export interface WatchdogPersona {
  id: string
  name: string
}

/** Anvil `RoutineRepos.claimDue` — injected so runners stay free of the store. */
export type ClaimDue = (projectId: string, leaseUntil: string) => readonly { id: string }[]

export interface WatchdogDriverOptions {
  runner: Runner
  persona: WatchdogPersona
  cwd: string
  projectId: string
  claimDue: ClaimDue
  snapshot: () => WatchdogSnapshot
  now?: () => string
}

export interface WatchdogDriver {
  sessionId: string
  start(): Promise<void>
  tick(leaseUntil: string): Promise<WatchdogWarning[]>
}

/**
 * Bind a cheap scheduled watchdog session. A tick only runs when `claimDue`
 * returns work. Warnings are deduplicated by Forge `watchdogWarnings`.
 * @param options - runner, persona holding the function, and Anvil claim hook.
 */
export function createWatchdogDriver(options: WatchdogDriverOptions): WatchdogDriver {
  const now = options.now ?? (() => new Date().toISOString())
  return {
    sessionId: WATCHDOG_SESSION_ID,
    start: async () => {
      await options.runner.ensureSession(WATCHDOG_SESSION_ID, options.cwd, options.persona.name, 'watchdog')
    },
    tick: async (leaseUntil: string) => {
      const due = options.claimDue(options.projectId, leaseUntil)
      if (due.length === 0) return []
      const warnings = watchdogWarnings(watchdogSignals(options.snapshot()))
      if (warnings.length === 0) return []
      const text = warnings.map(item => `${item.kind} ${item.subjectId}: ${item.detail}`).join('\n')
      await options.runner.deliver(WATCHDOG_SESSION_ID, `watchdog:${now()}`, text, 'queue')
      return warnings
    },
  }
}
