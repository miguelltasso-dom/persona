/**
 * What the desktop does around a "Ensinar" recording (the part the renderer cannot do for itself):
 *
 *  - on start: minimize the Persona window so it does not appear in the recording, UNLESS the person chose to record the Persona
 *    window itself, and keep its renderer running (a minimized window is throttled to one timer tick a second, and a hidden one
 *    even less, which would starve the 1.5 s frame sampling);
 *  - show the always-on-top pill (clock, Pausar/Retomar, Parar), excluded from the capture;
 *  - on pause/resume: update the pill; on stop/discard/crash: hide it and put the Persona window back.
 *
 * Pill buttons are relayed to the renderer, which owns the recorder: it must run the SAME path as its own buttons.
 */

import type { TeachPillAction, TeachPillClock } from './teach-pill.ts'

/** The slice of BrowserWindow this module drives (a double in tests). */
export interface TeachChromeWindow {
  isDestroyed(): boolean
  isMinimized(): boolean
  minimize(): void
  restore(): void
  focus(): void
  getMediaSourceId(): string
  webContents: { setBackgroundThrottling(allowed: boolean): void }
}

export interface TeachChromeOptions {
  readonly getWindow: () => TeachChromeWindow | undefined
  readonly pill: {
    show(clock: TeachPillClock): void
    update(clock: TeachPillClock): void
    hide(): void
  }
  /** Deliver a pill button to the renderer. */
  readonly relay: (action: TeachPillAction) => void
  /** The recorder stops itself at 10 minutes; if nobody ended the recording by then (renderer gone), take the pill down. Default 11 min. */
  readonly maxRecordingMs?: number
}

/** Hooks `installTeachCapture` calls around a recording. */
export interface TeachRecordingHooks {
  started(sourceId: string, clock: TeachPillClock): void
  changed(clock: TeachPillClock): void
  ended(): void
}

/**
 * @param options - Window, pill and relay.
 * @returns The recording hooks plus the handler for pill buttons.
 */
export function createTeachRecordingChrome(options: TeachChromeOptions): TeachRecordingHooks & {
  onPillAction(action: TeachPillAction): void
} {
  let active = false
  /** The pill is closed at once by its own Parar, while `teach.stop` comes later (after the narration is typed). */
  let pillVisible = false
  let weMinimized = false
  let watchdog: ReturnType<typeof setTimeout> | undefined

  const restore = (): void => {
    const window = options.getWindow()
    if (!weMinimized) return
    weMinimized = false
    if (window === undefined || window.isDestroyed()) return
    window.restore()
    window.focus()
  }

  const api: TeachRecordingHooks & { onPillAction(action: TeachPillAction): void } = {
    started(sourceId, clock) {
      if (active && pillVisible) {
        options.pill.update(clock)
        return
      }
      // A recording whose pill was closed by its Parar and whose `teach.stop` never came (discarded): this is a new one.
      if (active) api.ended()
      active = true
      pillVisible = true
      watchdog = setTimeout(() => { api.ended() }, options.maxRecordingMs ?? 11 * 60_000)
      watchdog.unref?.()
      const window = options.getWindow()
      if (window !== undefined && !window.isDestroyed()) {
        window.webContents.setBackgroundThrottling(false)
        // Recording the Persona window itself: leave it up, the person asked to teach inside it.
        if (sourceId !== window.getMediaSourceId() && !window.isMinimized()) {
          window.minimize()
          weMinimized = true
        }
      }
      options.pill.show(clock)
    },
    changed(clock) {
      if (active && pillVisible) options.pill.update(clock)
    },
    ended() {
      if (!active) return
      active = false
      pillVisible = false
      if (watchdog !== undefined) clearTimeout(watchdog)
      watchdog = undefined
      options.pill.hide()
      const window = options.getWindow()
      if (window !== undefined && !window.isDestroyed()) window.webContents.setBackgroundThrottling(true)
      restore()
    },
    onPillAction(action) {
      if (!active) return
      // Stopping from the pill ends the recording for the person: the pill goes away and the Persona comes back at once (the
      // narration is typed and the review opens there). The recorder keeps its session until `teach.stop`, which only has to
      // give the renderer its normal throttling back.
      if (action === 'stop') {
        pillVisible = false
        options.pill.hide()
        restore()
      }
      options.relay(action)
    },
  }
  return api
}
