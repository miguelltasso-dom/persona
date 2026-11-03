/**
 * Watchdog (Vigia) session driver. Assignable function (D-043 / D-032).
 * Reads Forge signals only — never writes tickets.
 */

import {
  vigiaTick,
  watchdogSignals,
  watchdogWarnings,
  type VigiaAction,
  type VigiaAudit,
  type VigiaRules,
  type VigiaSnapshot,
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

export interface WatchdogAuditEntry {
  version: number
  ruleVersion: number
  at: string
  warnings: readonly WatchdogWarning[]
  actions: readonly VigiaAction[]
  audit: readonly VigiaAudit[]
  adjustment: string
}

export interface WatchdogDriverOptions {
  runner: Runner
  persona: WatchdogPersona
  cwd: string
  projectId: string
  claimDue: ClaimDue
  snapshot: () => WatchdogSnapshot
  vigia?: () => VigiaSnapshot
  rules?: VigiaRules
  now?: () => string
}

export interface WatchdogDriver {
  sessionId: string
  start(): Promise<void>
  tick(leaseUntil: string): Promise<WatchdogWarning[]>
  audit(): readonly WatchdogAuditEntry[]
}

/**
 * Bind a cheap scheduled watchdog session. A tick only runs when `claimDue`
 * returns work. Warnings are deduplicated by Forge `watchdogWarnings`.
 * @param options - runner, persona holding the function, and Anvil claim hook.
 */
export function createWatchdogDriver(options: WatchdogDriverOptions): WatchdogDriver {
  const now = options.now ?? (() => new Date().toISOString())
  const trail: WatchdogAuditEntry[] = []
  let version = 0
  let ruleVersion = 1
  let lastRules = JSON.stringify(options.rules ?? { noProgressMs: 600_000, loopCount: 3 })
  return {
    sessionId: WATCHDOG_SESSION_ID,
    start: async () => {
      await options.runner.ensureSession(WATCHDOG_SESSION_ID, options.cwd, options.persona.name, 'watchdog')
    },
    tick: async (leaseUntil: string) => {
      const due = options.claimDue(options.projectId, leaseUntil)
      if (due.length === 0) return []
      const snapshot = options.snapshot()
      const warnings = watchdogWarnings(watchdogSignals(snapshot))
      const vigia = options.vigia === undefined ? undefined : vigiaTick(options.vigia(), options.rules)
      const actions = vigia?.actions ?? []
      const audit = vigia?.audit ?? []
      const merged = vigia === undefined
        ? warnings
        : watchdogWarnings([...watchdogSignals(snapshot), ...vigia.signals])
      if (merged.length === 0 && actions.length === 0) return []
      const rulesKey = JSON.stringify(options.rules ?? { noProgressMs: 600_000, loopCount: 3 })
      if (rulesKey !== lastRules) {
        ruleVersion += 1
        lastRules = rulesKey
      }
      version += 1
      const adjustment = actions.map(item => `${item.kind}:${item.subjectId}`).join(',')
        || merged.map(item => item.kind).join(',')
      trail.push({
        version,
        ruleVersion,
        at: now(),
        warnings: merged,
        actions,
        audit,
        adjustment,
      })
      const text = [
        `audit v${String(version)} rules=${String(ruleVersion)}`,
        ...merged.map(item => `${item.kind} ${item.subjectId}: ${item.detail}`),
        ...actions.map(item => `action ${item.kind} ${item.subjectId}: ${item.detail}`),
      ].join('\n')
      await options.runner.deliver(WATCHDOG_SESSION_ID, `watchdog:${now()}`, text, 'queue')
      return merged
    },
    audit: () => trail,
  }
}
