/** Windows login-item: off until the owner opts in; a station can be offered a background start (no window). */

/** The argument the login item passes so the app starts with the host only, no window (modo estação, M4). */
export const BACKGROUND_ARGUMENT = '--background'

export interface LoginItemSettings {
  openAtLogin: boolean
  /** Windows only: the command line the Run entry carries. Empty for the ordinary "start with Windows". */
  args?: string[]
}

/** How the app opens when Windows starts it. */
export type LoginItemMode = 'window' | 'background'

export interface DesktopLoginItemOptions {
  readonly apply: (settings: LoginItemSettings) => void
  readonly read?: () => LoginItemSettings
}

/**
 * @param argv - The process arguments (`process.argv`).
 * @returns Whether this launch asked for the host only, with no window.
 */
export function launchedInBackground(argv: readonly string[]): boolean {
  return argv.includes(BACKGROUND_ARGUMENT)
}

/**
 * Start-with-Windows preference. Default is off; enabling needs an explicit true.
 */
export class DesktopLoginItem {
  private enabled = false
  private current: LoginItemMode = 'window'

  /** @param options - Electron `setLoginItemSettings` and optional reader. */
  constructor(private readonly options: DesktopLoginItemOptions) {
    this.apply(false, 'window')
  }

  /** Current consent. */
  get openAtLogin(): boolean {
    return this.enabled
  }

  /** How the app opens at login (meaningful only while {@link openAtLogin} is true). */
  get mode(): LoginItemMode {
    return this.current
  }

  /**
   * Apply the preference. `false` (and any non-true) turns it off.
   * @param enabled - Explicit consent.
   * @param mode - `background` only for the station offer the owner accepted; the tray toggle stays `window`.
   */
  setOpenAtLogin(enabled: boolean, mode: LoginItemMode = 'window'): void {
    this.apply(enabled === true, mode === 'background' ? 'background' : 'window')
  }

  private apply(enabled: boolean, mode: LoginItemMode): void {
    this.enabled = enabled
    this.current = enabled ? mode : 'window'
    this.options.apply(enabled && mode === 'background'
      ? { openAtLogin: true, args: [BACKGROUND_ARGUMENT] }
      : { openAtLogin: enabled })
  }
}
