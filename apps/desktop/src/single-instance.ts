/** Electron single-instance ownership before any Desktop profile lifecycle begins. */

import { launchedInBackground } from './login-item.ts'

/** Minimal Electron application operations needed for instance ownership. */
export interface DesktopSingleInstanceApplication {
  requestSingleInstanceLock(): boolean
  quit(): void
  on(event: 'second-instance', listener: (event: unknown, argv: readonly string[]) => void): unknown
}

/**
 * Claim the process-lifetime Desktop lock and route later launches to the owner.
 * @param application - Electron application singleton.
 * @param focusOwner - focus or recreate the primary window after a later launch.
 * @param onLink - a later launch that carries a `persona://` link (Windows hands a protocol click to the running app as a second launch); it gets the raw argument and decides.
 * @returns true only in the process that may access the Desktop profile.
 */
export function claimDesktopSingleInstance(
  application: DesktopSingleInstanceApplication,
  focusOwner: () => void,
  onLink?: (href: string) => void,
): boolean {
  if (!application.requestSingleInstanceLock()) {
    application.quit()
    return false
  }
  application.on('second-instance', (_event, argv) => {
    // The station's watchdog launches `Persona.exe --background` on a timer and after a failure; when the owner is alive that launch is the
    // answer "still running" and must not pull its window up in front of the person.
    if (launchedInBackground(argv ?? [])) return
    focusOwner()
    const href = (argv ?? []).find(argument => typeof argument === 'string' && argument.startsWith('persona://'))
    if (href !== undefined) onLink?.(href)
  })
  return true
}
