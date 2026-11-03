/** Windows login-item: off until the owner opts in. */

export interface LoginItemSettings {
  openAtLogin: boolean
}

export interface DesktopLoginItemOptions {
  readonly apply: (settings: LoginItemSettings) => void
  readonly read?: () => LoginItemSettings
}

/**
 * Start-with-Windows preference. Default is off; enabling needs an explicit true.
 */
export class DesktopLoginItem {
  private enabled = false

  /** @param options - Electron `setLoginItemSettings` and optional reader. */
  constructor(private readonly options: DesktopLoginItemOptions) {
    this.apply(false)
  }

  /** Current consent. */
  get openAtLogin(): boolean {
    return this.enabled
  }

  /**
   * Apply the preference. `false` (and any non-true) turns it off.
   * @param enabled - Explicit consent.
   */
  setOpenAtLogin(enabled: boolean): void {
    this.apply(enabled === true)
  }

  private apply(enabled: boolean): void {
    this.enabled = enabled
    this.options.apply({ openAtLogin: enabled })
  }
}
