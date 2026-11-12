/**
 * COLHEITA 5 — the motor of "Segure para enviar" and the deadline a card shows. Pure and clock-free: the timers and the clock are injected,
 * so the rules are tested without a browser.
 *
 *  - The hold completes only when the press lasts the whole `HOLD_APPROVE_MS` (1,2 s). Letting go earlier cancels, and a short click never
 *    completes: it only earns the hint. A completed hold fires `onComplete` once; the machine then stays `done` until `reset()`, so a second
 *    press (or a double click) cannot approve twice.
 *  - The deadline is read from the host's `expiresAt`: "Vale até hoje, 18h" · "Vale até amanhã, 9h" · "Vence em 40 min" (under 1 h) · vencido.
 */

/** How long the press must last (Muse, COLHEITA §5). */
export const HOLD_APPROVE_MS = 1200
/** How long the "Segure o botão até encher." hint stays when nothing else happens. */
export const HOLD_HINT_MS = 4000
/** Under this time left the deadline turns amber. */
export const DEADLINE_SOON_MS = 3_600_000

/** What the machine needs from the environment (a timer pair; the clock is never read). */
export interface HoldTimers {
  readonly set: (callback: () => void, ms: number) => unknown
  readonly clear: (handle: unknown) => void
}

/** `idle` → `holding` → `done` (terminal until `reset`). */
export type HoldPhase = 'idle' | 'holding' | 'done'

export interface HoldMachineOptions {
  readonly durationMs?: number
  readonly timers: HoldTimers
  /** Every phase change (the UI mirrors it into `data-phase` and the fill). */
  readonly onPhase?: (phase: HoldPhase) => void
  /** The press lasted the whole time. Fired once per `reset()`. */
  readonly onComplete: () => void
}

export interface HoldMachine {
  readonly phase: () => HoldPhase
  /** Start the press. Ignored unless `idle`. */
  readonly press: () => void
  /**
   * The person let go. @returns `early` when a running press was cut short (the UI shows the hint), `none` otherwise (nothing was running, or it already completed).
   */
  readonly release: () => 'early' | 'none'
  /** The press was interrupted by something other than letting go (focus lost, pointer left): the same cancel, no hint. */
  readonly cancel: () => void
  /** The decision did not go through: the button may be held again. A completed hold is not reopened by anything else. */
  readonly reset: () => void
}

/** @param options - Timers, duration and callbacks. @returns The machine. */
export function createHoldMachine(options: HoldMachineOptions): HoldMachine {
  const durationMs = options.durationMs ?? HOLD_APPROVE_MS
  let phase: HoldPhase = 'idle'
  let handle: unknown
  const enter = (next: HoldPhase): void => {
    phase = next
    options.onPhase?.(next)
  }
  const stop = (): void => {
    if (handle !== undefined) options.timers.clear(handle)
    handle = undefined
  }
  const abort = (): boolean => {
    if (phase !== 'holding') return false
    stop()
    enter('idle')
    return true
  }
  return {
    phase: () => phase,
    press: () => {
      if (phase !== 'idle') return
      enter('holding')
      handle = options.timers.set(() => {
        handle = undefined
        if (phase !== 'holding') return
        enter('done')
        options.onComplete()
      }, durationMs)
    },
    release: () => (abort() ? 'early' : 'none'),
    cancel: () => { abort() },
    reset: () => {
      stop()
      if (phase !== 'idle') enter('idle')
    },
  }
}

/** What the deadline seal says, as data (the words are the UI's). */
export type DeadlineView =
  | { readonly state: 'normal'; readonly day: 'today' | 'tomorrow' | 'date'; readonly time: string; readonly date: string }
  | { readonly state: 'soon'; readonly minutes: number }
  | { readonly state: 'expired' }

const pad = (value: number): string => String(value).padStart(2, '0')

/** "18h" · "18h30" (the hour of the deadline in the person's clock). */
export function deadlineTime(at: Date): string {
  const minutes = at.getMinutes()
  return minutes === 0 ? `${String(at.getHours())}h` : `${String(at.getHours())}h${pad(minutes)}`
}

const dayNumber = (at: Date): number => Date.UTC(at.getFullYear(), at.getMonth(), at.getDate()) / 86_400_000

/**
 * @param expiresAt - The host's ISO deadline; without a valid one there is no seal.
 * @param nowMs - The clock.
 * @returns The seal, or `undefined` when the host sent no deadline.
 */
export function approvalDeadline(expiresAt: string | undefined, nowMs: number): DeadlineView | undefined {
  if (expiresAt === undefined) return undefined
  const end = Date.parse(expiresAt)
  if (Number.isNaN(end)) return undefined
  const left = end - nowMs
  if (left <= 0) return { state: 'expired' }
  if (left < DEADLINE_SOON_MS) return { state: 'soon', minutes: Math.max(1, Math.ceil(left / 60_000)) }
  const at = new Date(end)
  const apart = dayNumber(at) - dayNumber(new Date(nowMs))
  return {
    state: 'normal',
    day: apart <= 0 ? 'today' : apart === 1 ? 'tomorrow' : 'date',
    time: deadlineTime(at),
    date: `${pad(at.getDate())}/${pad(at.getMonth() + 1)}`,
  }
}

/** How often the seal must be re-read: a minute is enough to keep "40 min" honest, and the label cannot change faster. */
export const DEADLINE_REFRESH_MS = 30_000
