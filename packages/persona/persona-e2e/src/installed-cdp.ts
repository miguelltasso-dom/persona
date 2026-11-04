/**
 * Launch argv for an installed or `--dir` Persona.exe (copy kept inside e2e
 * so host compiler rootDir does not pull apps/desktop).
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
export function installedDesktopLaunch(input: {
  exe: string
  home: string
  userData: string
  rendererPort: number
  mainPort?: number
}): InstalledCdpLaunch {
  const mainPort = input.mainPort ?? input.rendererPort + 1
  return {
    exe: input.exe,
    args: [
      `--remote-debugging-port=${String(input.rendererPort)}`,
      `--inspect=${String(mainPort)}`,
      `--user-data-dir=${input.userData}`,
    ],
    env: {
      PERSONA_HOME: input.home,
      DSH_HOME: input.home,
      DSH_PROFILE: 'persona',
      DSH_DESKTOP_USER_DATA_DIR: input.userData,
      DSH_TELEMETRY_DISABLED: '1',
      DSH_DESKTOP_OPEN_DEVTOOLS: '0',
      DSH_DESKTOP_UPDATES: '0',
      DSH_DESKTOP_WELCOME: '0',
      DSH_DESKTOP_RENDERER_DEBUG_PORT: String(input.rendererPort),
    },
    rendererPort: input.rendererPort,
  }
}

/**
 * Poll Chromium `/json/version` until the renderer CDP is up.
 * @param port - `--remote-debugging-port`.
 * @param timeoutMs - Deadline.
 * @param fetchImpl - Injected fetch (fake in tests).
 */
export async function waitForInstalledCdp(
  port: number,
  timeoutMs: number,
  fetchImpl: typeof fetch = fetch,
): Promise<string> {
  const deadline = Date.now() + timeoutMs
  let last = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetchImpl(`http://127.0.0.1:${String(port)}/json/version`)
      if (response.ok) {
        const body: unknown = await response.json()
        const ws = body !== null && typeof body === 'object' && 'webSocketDebuggerUrl' in body
          ? String((body as { webSocketDebuggerUrl: unknown }).webSocketDebuggerUrl)
          : ''
        if (ws !== '') return ws
        last = 'missing webSocketDebuggerUrl'
      } else last = `${String(response.status)}`
    } catch (error) {
      last = error instanceof Error ? error.message : String(error)
    }
    await new Promise((done) => {
      setTimeout(done, 40)
    })
  }
  throw new Error(`CDP not ready on ${String(port)}: ${last}`)
}
