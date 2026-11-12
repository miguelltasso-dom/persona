/**
 * Item 17 (colheita): start the person's own Google Chrome on a product profile and wait until its DevTools endpoint
 * answers. One Chrome per profile folder; a stale `Singleton*` lock left by a crash is removed first, or Chrome would
 * hand the launch to a process that no longer exists and the profile would look busy forever.
 *
 * The browser is never bundled and the person's own profile is never opened: the caller passes a folder under the
 * product's data directory.
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { createServer } from 'node:net'
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { chromeLaunchArgs, type ChromeInstall } from './chrome.ts'

/** A running Chrome on one profile. */
export interface ChromeSession {
  /** The DevTools port it listens on. */
  readonly port: number
  /** The process id (the tree root on Windows). */
  readonly pid: number
  /** The version the endpoint reports (`Browser`), when it answered. */
  readonly version: string | undefined
  /** Stop the whole tree; idempotent. */
  close(): Promise<void>
}

/** What a launch needs. */
export interface LaunchChromeInput {
  /** The install found by {@link findChrome}. */
  readonly chrome: ChromeInstall
  /** The profile folder (`--user-data-dir`). */
  readonly profileDir: string
  /** Headless is the default for shared profiles. */
  readonly headless?: boolean
  /** How long to wait for the DevTools endpoint (default 20 s). */
  readonly waitMs?: number
  /** How the process is started (tests stand a fake Chrome in here); the default is `spawn` with no stdio and no window. */
  readonly spawnImpl?: (command: string, args: readonly string[]) => ChildProcess
}

/** The lock files Chrome leaves in a profile folder. */
const SINGLETON_FILES = ['SingletonLock', 'SingletonCookie', 'SingletonSocket'] as const

/** A free TCP port on 127.0.0.1. */
async function freePort(): Promise<number> {
  const server = createServer()
  const listening = Promise.withResolvers<number>()
  server.once('error', () => { listening.reject(new Error('no free port')) })
  server.listen(0, '127.0.0.1', () => {
    const address = server.address()
    if (address === null || typeof address === 'string') { listening.reject(new Error('no free port')); return }
    listening.resolve(address.port)
  })
  const port = await listening.promise
  const closed = Promise.withResolvers<void>()
  server.close(() => { closed.resolve() })
  await closed.promise
  return port
}

/**
 * Turn Chrome's own password manager off in the product's profile: the Cofre is the only place a password lives, and a
 * second copy saved by the browser would outlive the login the person asked for.
 * @param profileDir - The profile folder (never the person's own).
 */
function disablePasswordManager(profileDir: string): void {
  const dir = join(profileDir, 'Default')
  mkdirSync(dir, { recursive: true })
  const path = join(dir, 'Preferences')
  let prefs: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as unknown
    if (parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)) prefs = parsed as Record<string, unknown>
  } catch (error) { void error }
  const profile = prefs.profile !== null && typeof prefs.profile === 'object' && !Array.isArray(prefs.profile)
    ? prefs.profile as Record<string, unknown>
    : {}
  profile.password_manager_enabled = false
  prefs.profile = profile
  prefs.credentials_enable_service = false
  writeFileSync(path, JSON.stringify(prefs))
}

/** Remove a crashed launch's lock files; a live Chrome rewrites them at startup. */
function clearProfileLocks(profileDir: string): void {
  for (const name of SINGLETON_FILES) {
    const path = join(profileDir, name)
    if (!existsSync(path)) continue
    try { rmSync(path, { force: true }) } catch (error) { void error }
  }
}

/** The DevTools answer, or `undefined` while Chrome is not ready. */
async function devtoolsVersion(port: number): Promise<string | undefined> {
  try {
    const response = await fetch(`http://127.0.0.1:${String(port)}/json/version`)
    if (!response.ok) return undefined
    const body = await response.json() as { Browser?: unknown }
    return typeof body.Browser === 'string' ? body.Browser : 'unknown'
  } catch (error) {
    void error
    return undefined
  }
}

/**
 * Launch Chrome and wait for DevTools.
 * @param input - Install, profile folder, mode.
 * @returns The live session; `close()` kills the tree.
 * @throws Error when Chrome exits before answering or the wait times out (the message is for the log, the screen has its own words).
 */
export async function launchChrome(input: LaunchChromeInput): Promise<ChromeSession> {
  // Test hygiene (Gauge 12/11): under Vitest a REAL Chrome only opens in a spec that marked itself with `allowRealChrome()` (tests/host-harness.ts sets PERSONA_TEST_REAL_CHROME).
  // Any other spec that ends up here (a grant left behind, a missing fake) fails loudly instead of popping a browser window on the person's desktop.
  if (input.spawnImpl === undefined && process.env.VITEST !== undefined && process.env.PERSONA_TEST_REAL_CHROME !== '1') {
    throw new Error('real Chrome launch blocked in a test: this spec is not marked as a real-Chrome spec (allowRealChrome() from host-harness.ts) and gave no spawnImpl')
  }
  const port = await freePort()
  clearProfileLocks(input.profileDir)
  disablePasswordManager(input.profileDir)
  const args = chromeLaunchArgs({
    profileDir: input.profileDir,
    port,
    headless: input.headless ?? true,
    ...(input.chrome.version === undefined ? {} : { version: input.chrome.version }),
  })
  const child = (input.spawnImpl ?? ((command, argv) => spawn(command, [...argv], { stdio: 'ignore', windowsHide: true })))(input.chrome.path, args)
  const exit = { done: false }
  child.once('exit', () => { exit.done = true })
  // P0-12: a Chrome that cannot start (the file vanished, EPERM) is an 'error' event; with nobody listening it is an uncaught exception that takes the host down.
  child.on('error', () => { exit.done = true })
  const deadline = Date.now() + (input.waitMs ?? 20_000)
  let version: string | undefined
  while (Date.now() < deadline) {
    if (exit.done) throw new Error('o Chrome fechou antes de abrir a porta de depuração')
    version = await devtoolsVersion(port)
    if (version !== undefined) break
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  if (version === undefined) {
    await killTree(child) // P0-12: the renderer, GPU and utility processes are children of this one; killing only it leaves them orphaned
    throw new Error('o Chrome não abriu a porta de depuração a tempo')
  }
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
    await killTree(child)
  }
  return { port, pid: child.pid ?? -1, version, close }
}

/**
 * Stop a Chrome and everything it started. On Windows the browser's renderer, GPU and utility processes are its children and `child.kill()` ends only the first one,
 * so the tree goes with `taskkill /T /F`; elsewhere the process itself.
 * @param child - The Chrome process this module started.
 */
async function killTree(child: ChildProcess): Promise<void> {
  if (process.platform === 'win32' && child.pid !== undefined) {
    await new Promise<void>((resolve) => {
      const killer = spawn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { stdio: 'ignore', windowsHide: true })
      killer.once('exit', () => { resolve() })
      killer.once('error', () => { resolve() })
    })
    return
  }
  child.kill()
}
