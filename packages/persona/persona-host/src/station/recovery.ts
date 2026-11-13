/**
 * M4 (Marco Dogfood, critério 4): the dedicated station decides by itself whether the app comes back from a fall. The decision is
 * a pure function of what happened, how many falls came before and how long the last run lasted, so the desktop shell, the
 * watchdog outside the app and the overnight soak (M7, accelerated clock) all ask the same rule.
 *
 * Policy (Keel, 12/11 14:44): backoff 2 s, 4 s, 8 s … capped at 60 s; five falls in a row stop the station and tell the person; the
 * budget refills after a run that stayed up for ten minutes ("the fourth fall of the app's life" must not exist on a 24 h machine);
 * a computer nobody paired never relaunches itself after a fall; leaving on purpose never relaunches.
 */

/** Why the app stopped. */
export type RecoveryReason = 'crash' | 'renderer-gone' | 'host-failed' | 'update' | 'user-quit'

/** Falls in a row that stop the station. */
export const MAX_CRASHES_IN_WINDOW = 5
/** The span the person reads in the notice ("em 10 min"). */
export const RECOVERY_WINDOW_MS = 10 * 60_000
/** A run this long counts as stable: the budget of falls refills. */
export const STABLE_MS = 10 * 60_000
/** First wait; each fall doubles it. */
export const RECOVERY_BASE_DELAY_MS = 2_000
/** The wait never grows past this. */
export const RECOVERY_MAX_DELAY_MS = 60_000

/** What `station.json` remembers about the previous run (all optional: a fresh install has none). */
export interface LaunchMemory {
  /** Epoch ms of the previous launch. */
  readonly lastStartAt?: number
  /** Falls in a row recorded so far. */
  readonly crashes?: number
  /** `clean` when the previous run left on purpose (the Quit item, an installed update); anything else, or nothing after a launch, is a fall. */
  readonly lastExit?: 'clean'
}

/** What the launch learned about the previous run. */
export interface LaunchPlan {
  /** The previous run ended in a fall (no clean exit recorded after a launch). */
  readonly wasCrash: boolean
  /** How long the previous run lasted; absent on a first launch. */
  readonly previousRunMs?: number
  /** Falls in a row BEFORE the one `wasCrash` reports: feed it to {@link decideRecovery} as `crashesInWindow`. */
  readonly crashesBefore: number
  /** What to write back: the new count of falls in a row, and this launch instant. `lastExit` is cleared. */
  readonly next: { readonly crashes: number; readonly lastStartAt: number }
}

/**
 * Read the memory of the previous run at launch (shell or watchdog): was it a fall, how long did it last, how many falls in a row.
 * A clean exit never counts; a stable run (≥ `stableMs`) refills the budget before the new fall is counted.
 * @param memory - What `station.json` held.
 * @param now - This launch's instant (epoch ms).
 * @param stableMs - Stable run length; default {@link STABLE_MS}.
 * @returns The plan and what to write back.
 */
export function planLaunch(memory: LaunchMemory, now: number, stableMs = STABLE_MS): LaunchPlan {
  const previousRunMs = memory.lastStartAt === undefined ? undefined : Math.max(0, now - memory.lastStartAt)
  const first = memory.lastStartAt === undefined
  const wasCrash = !first && memory.lastExit !== 'clean'
  const recorded = Math.max(0, memory.crashes ?? 0)
  const stable = previousRunMs !== undefined && previousRunMs >= stableMs
  const crashesBefore = memory.lastExit === 'clean' || stable ? 0 : recorded
  return { wasCrash, ...(previousRunMs === undefined ? {} : { previousRunMs }), crashesBefore, next: { crashes: wasCrash ? crashesBefore + 1 : crashesBefore, lastStartAt: now } }
}

/** What the caller knows about the fall. */
export interface RecoveryInput {
  readonly reason: RecoveryReason
  /** Falls in a row before this one (0 for the first). */
  readonly crashesInWindow: number
  /** How long the run that just ended lasted; a stable run refills the budget. */
  readonly previousRunMs?: number
  /** Stable run length; default {@link STABLE_MS}. */
  readonly stableMs?: number
  /** Falls in a row that stop the station; default {@link MAX_CRASHES_IN_WINDOW}. */
  readonly maxCrashes?: number
  /** Clock of the caller (kept for the audit line; the rule never reads the real clock). */
  readonly now: number
  /** Whether this machine is the paired station. */
  readonly paired: boolean
}

/** What to do. */
export interface RecoveryDecision {
  readonly action: 'relaunch' | 'giveup'
  /** Wait before relaunching (0 for none). */
  readonly delayMs: number
  /** The budget ran out: the caller stops the station and tells the person. */
  readonly pauseStation: boolean
  /** One sentence, ready for the audit line or the notice. */
  readonly note: string
}

/**
 * @param input - What happened and the history of falls.
 * @returns Whether to relaunch, after how long, and whether to stop the station.
 */
export function decideRecovery(input: RecoveryInput): RecoveryDecision {
  if (input.reason === 'user-quit') return { action: 'giveup', delayMs: 0, pauseStation: false, note: 'A pessoa saiu de propósito: o app não volta sozinho.' }
  if (input.reason === 'update') return { action: 'relaunch', delayMs: 0, pauseStation: false, note: 'Atualização instalada: o app volta agora.' }
  if (!input.paired) return { action: 'giveup', delayMs: 0, pauseStation: false, note: 'Este computador não é uma estação: o app não volta sozinho depois de uma queda.' }
  const stable = input.previousRunMs !== undefined && input.previousRunMs >= (input.stableMs ?? STABLE_MS)
  const falls = stable ? 0 : Math.max(0, input.crashesInWindow)
  if (falls >= (input.maxCrashes ?? MAX_CRASHES_IN_WINDOW)) {
    return {
      action: 'giveup',
      delayMs: 0,
      pauseStation: true,
      note: `A equipe parou: o app caiu ${String(falls)} vezes em 10 min (quedas demais). Ligue de novo quando quiser.`,
    }
  }
  return { action: 'relaunch', delayMs: Math.min(RECOVERY_MAX_DELAY_MS, RECOVERY_BASE_DELAY_MS * 2 ** falls), pauseStation: false, note: 'O app caiu e volta sozinho.' }
}
