import { createRequire } from 'node:module'
import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { spawn, type ChildProcess } from 'node:child_process'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { chromium, type Page } from 'playwright'
import { E2E_TMP_ROOT, REPO_ROOT } from './paths.ts'
import { probeFreePort } from './ports.ts'
import { killProcessTree } from './process-tree.ts'

const execFileAsync = promisify(execFile)

export interface StartDesktopOptions {
  home?: string
  userData?: string
  env?: Record<string, string>
}

export interface DesktopHostHandle {
  readonly page: Page
  readonly home: string
  readonly userData: string
  readonly rendererPort: number
  stop(): Promise<void>
}

/**
 * Resolve the Electron executable installed by `install-electron`, if present.
 */
export function resolveElectronBinary(): string | undefined {
  try {
    const require = createRequire(join(REPO_ROOT, 'apps', 'desktop', 'package.json'))
    const electron: unknown = require('electron')
    return typeof electron === 'string' ? electron : undefined
  } catch {
    return undefined
  }
}

async function waitForCdpVersion(port: number, deadlineMs: number): Promise<void> {
  const deadline = Date.now() + deadlineMs
  let lastError = ''
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`http://127.0.0.1:${String(port)}/json/version`)
      if (response.ok) return
      lastError = `${String(response.status)} ${response.statusText}`
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error)
    }
    await new Promise((done) => { setTimeout(done, 500) })
  }
  throw new Error(`CDP endpoint not ready on port ${String(port)}: ${lastError}`)
}

/**
 * Boot `pnpm start:desktop` under the build lock and attach to `dsh-app://app/` (Tier 2).
 * @param options - disposable homes and extra env.
 */
export async function startDesktop(options: StartDesktopOptions = {}): Promise<DesktopHostHandle> {
  const electron = resolveElectronBinary()
  if (electron === undefined) {
    throw new Error(
      'Electron binary not installed — run `pnpm --filter @deepseek-ai/dsh-desktop exec install-electron` (Rivet A3a)',
    )
  }

  const id = randomUUID()
  const runRoot = join(E2E_TMP_ROOT, `e2e-desktop-${id}`)
  const home = options.home ?? join(runRoot, 'home')
  const userData = options.userData ?? join(runRoot, 'user-data')
  await mkdir(home, { recursive: true })
  await mkdir(userData, { recursive: true })

  const mainPort = await probeFreePort()
  const rendererPort = await probeFreePort()
  const hostPort = await probeFreePort()

  const env: NodeJS.ProcessEnv = {
    ...process.env,
    ...options.env,
    DSH_HOME: home,
    PERSONA_HOME: home,
    DSH_DESKTOP_USER_DATA_DIR: userData,
    DSH_TELEMETRY_DISABLED: '1',
    DSH_DESKTOP_OPEN_DEVTOOLS: '0',
    DSH_DESKTOP_MAIN_INSPECT_PORT: String(mainPort),
    DSH_DESKTOP_RENDERER_DEBUG_PORT: String(rendererPort),
    DSH_DESKTOP_HOST_INSPECT_PORT: String(hostPort),
  }

  const lockArgs = [
    join(REPO_ROOT, 'scripts', 'persona', 'with-lock.mjs'),
    'Probe persona-e2e startDesktop',
    '--',
    'pnpm',
    'start:desktop',
  ]

  const child: ChildProcess = spawn(process.execPath, lockArgs, {
    cwd: REPO_ROOT,
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let stderr = ''
  child.stderr?.setEncoding('utf8')
  child.stderr?.on('data', (chunk: string) => { stderr += chunk })

  child.on('exit', (code) => {
    if (code !== 0 && code !== null) {
      stderr += `\ndesktop launcher exited with code ${String(code)}`
    }
  })

  await waitForCdpVersion(rendererPort, 300_000)

  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${String(rendererPort)}`)
  const deadline = Date.now() + 120_000
  let page: Page | undefined
  while (Date.now() < deadline) {
    for (const context of browser.contexts()) {
      for (const candidate of context.pages()) {
        if (candidate.url().startsWith('dsh-app://app/')) {
          page = candidate
          break
        }
      }
      if (page !== undefined) break
    }
    if (page !== undefined) break
    await new Promise((done) => { setTimeout(done, 500) })
  }
  if (page === undefined) {
    await browser.close()
    if (child.pid !== undefined) await killProcessTree(child.pid)
    throw new Error(`no dsh-app://app/ page found within timeout\n${stderr}`)
  }

  async function stop(): Promise<void> {
    await browser.close().catch(() => {})
    if (child.pid !== undefined) await killProcessTree(child.pid)
    if (options.home === undefined && options.userData === undefined) {
      await rm(runRoot, { recursive: true, force: true }).catch(() => {})
    }
  }

  return { page, home, userData, rendererPort, stop }
}

/**
 * Capture the primary display using PowerShell (`CopyFromScreen`) for native chrome (Tier 2).
 * @param path - absolute `.png` output path.
 */
export async function osScreenshot(path: string): Promise<void> {
  if (process.platform !== 'win32') {
    throw new Error('osScreenshot is implemented for Windows only')
  }
  const script = [
    'Add-Type -AssemblyName System.Windows.Forms,System.Drawing',
    '$bounds = [System.Windows.Forms.Screen]::PrimaryScreen.Bounds',
    '$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height',
    '$graphics = [System.Drawing.Graphics]::FromImage($bitmap)',
    '$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)',
    `$bitmap.Save('${path.replace(/'/g, "''")}')`,
    '$graphics.Dispose()',
    '$bitmap.Dispose()',
  ].join('; ')
  await execFileAsync('powershell.exe', ['-NoProfile', '-Command', script], { windowsHide: true })
}
