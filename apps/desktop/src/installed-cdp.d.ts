/**
 * Launch argv for an installed (or unpacked) Persona.exe so Probe can attach CDP.
 * Does not spawn Electron from unit tests.
 */
export interface InstalledCdpLaunch {
  exe: string
  args: readonly string[]
  env: Readonly<Record<string, string>>
  rendererPort: number
}
/**
 * Build the process command Probe uses on a packaged or `--dir` binary.
 * @param input - Exe path, disposable homes, renderer debug port.
 */
export declare function installedDesktopLaunch(input: {
  exe: string
  home: string
  userData: string
  rendererPort: number
  mainPort?: number
}): InstalledCdpLaunch
/**
 * Poll Chromium `/json/version` until the renderer CDP is up.
 * @param port - `--remote-debugging-port`.
 * @param timeoutMs - Deadline.
 * @param fetchImpl - Injected fetch (fake in tests).
 */
export declare function waitForInstalledCdp(port: number, timeoutMs: number, fetchImpl?: typeof fetch): Promise<string>
//# sourceMappingURL=installed-cdp.d.ts.map
