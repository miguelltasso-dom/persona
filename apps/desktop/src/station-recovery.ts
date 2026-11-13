/**
 * The desktop's copy of the station's fall policy (`persona-host/src/station/recovery.ts`, M4 criterion 4).
 * The desktop cannot import the Host's source (its own `rootDir` is `src`), and when the Host is crash-looping nobody answers: the shell
 * must decide by itself whether to relaunch or to pause the station. A spec pins this file to the Host's, input by input, so the two
 * cannot drift. Keep it a pure function: no clock, no file, no import.
 *
 * Policy (Keel, 12/11 14:44): backoff 2 s, 4 s, 8 s … capped at 60 s; five falls in a row stop the station and tell the person; the budget
 * refills after a run that stayed up for ten minutes; a computer nobody paired never relaunches itself after a fall; leaving on purpose
 * never relaunches.
 */

/** Why the app stopped. */
export type RecoveryReason = 'crash' | 'renderer-gone' | 'host-failed' | 'update' | 'user-quit'

/** Falls in a row that stop the station. */
export const MAX_CRASHES_IN_WINDOW = 5
/** A run this long counts as stable: the budget of falls refills. */
export const STABLE_MS = 10 * 60_000
/** First wait; each fall doubles it. */
export const RECOVERY_BASE_DELAY_MS = 2_000
/** The wait never grows past this. */
export const RECOVERY_MAX_DELAY_MS = 60_000

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
  if (!input.paired) {
    return { action: 'giveup', delayMs: 0, pauseStation: false, note: 'Este computador não é uma estação: o app não volta sozinho depois de uma queda.' }
  }
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
