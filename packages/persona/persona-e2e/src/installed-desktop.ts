import { mkdir, rm } from 'node:fs/promises'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import { spawn, type ChildProcess } from 'node:child_process'
import { chromium, type Page } from 'playwright'
import { cleanChildEnv, testModeVariablesIn } from './clean-env.ts'
import { installedDesktopLaunch, waitForInstalledCdp } from './installed-cdp.ts'
import { E2E_TMP_ROOT } from './paths.ts'
import { probeFreePort } from './ports.ts'
import { killProcessTree } from './process-tree.ts'

export interface StartInstalledDesktopOptions {
  readonly exe: string
  readonly home?: string
  readonly userData?: string
  readonly env?: Readonly<Record<string, string>>
  /** When true, do not delete runRoot on stop (debug failures). */
  readonly keepRunRoot?: boolean
}

export interface InstalledDesktopHandle {
  readonly page: Page
  readonly home: string
  readonly userData: string
  readonly rendererPort: number
  readonly exe: string
  /** Everything the Electron main + host printed so far (stdout and stderr), for failure evidence. */
  log(): string
  stop(): Promise<void>
}

async function pickAppPage(deadlineMs: number, rendererPort: number): Promise<{ page: Page; browser: Awaited<ReturnType<typeof chromium.connectOverCDP>> }> {
  const browser = await chromium.connectOverCDP(`http://127.0.0.1:${String(rendererPort)}`)
  const deadline = Date.now() + deadlineMs
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
    throw new Error('no dsh-app://app/ page found within timeout')
  }
  return { page, browser }
}

/**
 * Spawn a packaged or NSIS-installed `Persona.exe` with CDP and attach Playwright (D8 Tier 2).
 * Uses {@link installedDesktopLaunch} (`DSH_DESKTOP_WELCOME=0` skips DeepSeek Welcome only).
 */
export async function startInstalledDesktop(options: StartInstalledDesktopOptions): Promise<InstalledDesktopHandle> {
  const id = randomUUID()
  const runRoot = join(E2E_TMP_ROOT, `e2e-installed-${id}`)
  const home = options.home ?? join(runRoot, 'home')
  const userData = options.userData ?? join(runRoot, 'user-data')
  await mkdir(home, { recursive: true })
  await mkdir(userData, { recursive: true })

  const rendererPort = await probeFreePort()
  const launch = installedDesktopLaunch({ exe: options.exe, home, userData, rendererPort })
  // The test process carries VITEST=true / NODE_ENV=test; the product reads them to run its scripted FAKE (forced-ready engine, 0-turn
  // delivery, in-memory db). The installed exe must run as a user's would: scrub them, and refuse to launch if anything test-mode is left.
  const env: NodeJS.ProcessEnv = { ...cleanChildEnv(process.env), ...launch.env, ...options.env }
  const leftover = testModeVariablesIn(env)
  if (leftover.length > 0) throw new Error(`refusing to launch the installed exe with test-mode variables in its environment: ${leftover.join(', ')}`)

  const child: ChildProcess = spawn(launch.exe, [...launch.args], {
    env,
    stdio: ['ignore', 'pipe', 'pipe'],
    windowsHide: true,
  })

  let bootLog = ''
  child.stdout?.on('data', (chunk: Buffer) => { bootLog += chunk.toString('utf8') })
  child.stderr?.on('data', (chunk: Buffer) => { bootLog += chunk.toString('utf8') })

  const bootDeadline = Date.now() + 300_000
  await waitForInstalledCdp(rendererPort, Math.max(5_000, bootDeadline - Date.now())).catch(async (error) => {
    child.kill('SIGTERM')
    throw new Error(`${error instanceof Error ? error.message : String(error)}\n${bootLog.slice(-2000)}`)
  })

  if (child.exitCode !== null) {
    throw new Error(`Persona.exe exited early (code ${String(child.exitCode)})\n${bootLog.slice(-2000)}`)
  }

  const { page, browser } = await pickAppPage(120_000, rendererPort)

  async function stop(): Promise<void> {
    await browser.close().catch(() => {})
    if (child.exitCode === null) {
      // Kill the whole tree (host, plugin processes and any warm CLI session such as a real `claude`): `kill('SIGTERM')`
      // only ends the Electron main process on Windows and used to leave its children running.
      if (child.pid !== undefined) await killProcessTree(child.pid)
      child.kill('SIGTERM')
      await new Promise<void>((resolve) => {
        const timer = setTimeout(() => {
          child.kill('SIGKILL')
          resolve()
        }, 15_000)
        child.once('exit', () => {
          clearTimeout(timer)
          resolve()
        })
      })
    }
    if (options.keepRunRoot !== true && options.home === undefined && options.userData === undefined) {
      await rm(runRoot, { recursive: true, force: true }).catch(() => {})
    }
  }

  return { page, home, userData, rendererPort, exe: options.exe, log: () => bootLog, stop }
}
