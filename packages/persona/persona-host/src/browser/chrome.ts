/**
 * Item 17 (colheita): the personas' browser is the Google Chrome the person already has. This module finds it, reads its
 * version from disk and builds the launch flags. Nothing here bundles a browser, downloads one or opens the person's own
 * profile: each persona (or shared profile) gets its own `--user-data-dir` under the product's folder.
 *
 * The filesystem is injected (`exists`, `readdir`) so the rules are testable without a Chrome installed; the launcher
 * passes Node's own.
 */

import { existsSync, readdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

/** Where Chrome is installed on this machine, as the product needs it. */
export interface ChromeInstall {
  /** `chrome.exe`. */
  readonly path: string
  /** The version on disk (the newest version folder next to `chrome.exe`), when it can be read. */
  readonly version: string | undefined
}

/**
 * The standard install paths, in the order Windows itself looks: machine-wide first, then the per-user install.
 * @param env - Environment with `ProgramFiles`, `ProgramFiles(x86)` and `LOCALAPPDATA`.
 * @returns Absolute `chrome.exe` paths that may exist.
 */
export function chromeCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const roots = [env.ProgramFiles, env['ProgramFiles(x86)'], env.LOCALAPPDATA]
  return roots
    .filter((root): root is string => typeof root === 'string' && root !== '')
    .map(root => join(root, 'Google', 'Chrome', 'Application', 'chrome.exe'))
}

/** Numeric parts of a Chrome version (`157.0.8103.51` → `[157, 0, 8103, 51]`). */
function versionParts(version: string): number[] {
  return version.split('.').map(part => Number.parseInt(part, 10)).filter(part => Number.isFinite(part))
}

/** Compare two versions by their numeric parts; `undefined` when either has none. */
function compareVersions(left: string, right: string): number | undefined {
  const a = versionParts(left)
  const b = versionParts(right)
  if (a.length === 0 || b.length === 0) return undefined
  for (let index = 0; index < Math.max(a.length, b.length); index += 1) {
    const difference = (a[index] ?? 0) - (b[index] ?? 0)
    if (difference !== 0) return difference
  }
  return 0
}

/**
 * The version folder next to `chrome.exe` (Windows keeps one folder per installed version and `chrome.exe` prints nothing).
 * @param chromePath - Absolute `chrome.exe`.
 * @param readdir - Directory reader.
 * @returns The newest version on disk, or `undefined` when no version folder is readable.
 */
export function chromeVersionAt(chromePath: string, readdir: (path: string) => readonly string[] = readdirSync): string | undefined {
  let entries: readonly string[]
  try {
    entries = readdir(dirname(chromePath))
  } catch (error) {
    void error
    return undefined
  }
  const versions = entries.filter(entry => /^\d+(\.\d+)+$/u.test(entry))
  versions.sort((left, right) => (compareVersions(right, left) ?? 0))
  return versions[0]
}

/**
 * The first standard path that exists.
 * @param env - Environment with the install roots.
 * @param exists - File probe.
 * @returns The install, or `undefined` when Chrome is not installed (the feature then says so; there is no fallback browser).
 */
export function findChrome(env: NodeJS.ProcessEnv = process.env, exists: (path: string) => boolean = existsSync): ChromeInstall | undefined {
  for (const path of chromeCandidates(env)) {
    if (!exists(path)) continue
    return { path, version: chromeVersionAt(path) }
  }
  return undefined
}

/** The major version of a Chrome version (`157.0.8103.51` → `157`). */
export function chromeMajor(version: string | undefined): number | undefined {
  if (version === undefined) return undefined
  const major = Number.parseInt(version.split('.')[0] ?? '', 10)
  return Number.isFinite(major) ? major : undefined
}

/**
 * True when the Chrome on disk is a MAJOR version older than the one that last ran on the profile: an older Chrome cannot
 * read what a newer one wrote, and the persona would look signed out. Such a launch is refused in words, never attempted.
 * @param onDisk - Version found next to `chrome.exe`.
 * @param lastUsed - Version the profile recorded on its last launch.
 */
export function chromeIsOlder(onDisk: string | undefined, lastUsed: string | undefined): boolean {
  const older = chromeMajor(onDisk)
  const newer = chromeMajor(lastUsed)
  return older !== undefined && newer !== undefined && older < newer
}

/** What a launch needs. */
export interface ChromeLaunchInput {
  /** The profile folder (`--user-data-dir`); never the person's own Chrome profile. */
  readonly profileDir: string
  /** The DevTools port, already chosen free by the caller. */
  readonly port: number
  /** Headless launches are the default for shared profiles; a headed one shows the persona working. */
  readonly headless: boolean
  /** Version on disk, used for the headless user agent. */
  readonly version?: string
  /** Host platform (default `process.platform`). */
  readonly platform?: NodeJS.Platform
}

/**
 * The flags of one launch. `about:blank` is the first page: the persona navigates from there.
 * @param input - Profile, port, mode.
 * @returns The argument list after `chrome.exe`.
 */
export function chromeLaunchArgs(input: ChromeLaunchInput): string[] {
  const platform = input.platform ?? process.platform
  const version = input.version ?? '0'
  const userAgent = `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${version} Safari/537.36`
  return [
    `--user-data-dir=${input.profileDir}`,
    `--remote-debugging-port=${String(input.port)}`,
    '--remote-debugging-address=127.0.0.1',
    '--no-first-run',
    '--no-default-browser-check',
    '--disable-component-update',
    '--disable-blink-features=AutomationControlled',
    '--disable-updater-scheduler',
    '--disable-search-engine-choice-screen',
    ...(input.headless ? ['--headless=new', `--user-agent=${userAgent}`] : ['--test-type']),
    // Logins must survive the switch from a testing build: a fixed key on Linux, the fake keychain on macOS, and on
    // Windows Chrome's own DPAPI key in the profile's Local State (no flag).
    ...(platform === 'linux' ? ['--password-store=basic'] : []),
    ...(platform === 'darwin' ? ['--use-mock-keychain'] : []),
    'about:blank',
  ]
}
