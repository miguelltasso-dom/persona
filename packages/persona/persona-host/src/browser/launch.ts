/**
 * Item 17 (colheita): start the person's own Google Chrome on a product profile and wait until its DevTools endpoint
 * answers. One Chrome per profile folder; a stale `Singleton*` lock left by a crash is removed first, or Chrome would
 * hand the launch to a process that no longer exists and the profile would look busy forever.
 *
 * The browser is never bundled and the person's own profile is never opened: the caller passes a folder under the
 * product's data directory.
 */

import { spawn } from 'node:child_process'
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
  const port = await freePort()
  clearProfileLocks(input.profileDir)
  disablePasswordManager(input.profileDir)
  const args = chromeLaunchArgs({
    profileDir: input.profileDir,
    port,
    headless: input.headless ?? true,
    ...(input.chrome.version === undefined ? {} : { version: input.chrome.version }),
  })
  const child = spawn(input.chrome.path, args, { stdio: 'ignore', windowsHide: true })
  const exit = { done: false }
  child.once('exit', () => { exit.done = true })
  const deadline = Date.now() + (input.waitMs ?? 20_000)
  let version: string | undefined
  while (Date.now() < deadline) {
    if (exit.done) throw new Error('o Chrome fechou antes de abrir a porta de depuração')
    version = await devtoolsVersion(port)
    if (version !== undefined) break
    await new Promise(resolve => setTimeout(resolve, 120))
  }
  if (version === undefined) {
    child.kill()
    throw new Error('o Chrome não abriu a porta de depuração a tempo')
  }
  let closed = false
  const close = async (): Promise<void> => {
    if (closed) return
    closed = true
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
  return { port, pid: child.pid ?? -1, version, close }
}
