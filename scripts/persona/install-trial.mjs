/**
 * Silent install -> inspect the INSTALLED app -> silent uninstall -> clean up, for a Persona NSIS Setup.
 *
 *   node scripts/persona/install-trial.mjs [--setup C:\p8c\Persona-Setup.exe] [--out C:\p8c\install-trial.json]
 *
 * Never repackages. Exit 0 when the install worked and the installed app has what a real run needs; 1 otherwise.
 * Cleaning the temporary directory is best effort (a warning, never a failure): the NSIS uninstaller used to copy itself to %TEMP%
 * and exit at once, leaving the directory in use, and a plain rmSync then died with EPERM and took the whole pack run with it.
 * NSIS is per user and writes the same HKCU key everywhere: do not run this while someone else installs Persona.
 */

import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdirSync, mkdtempSync, openSync, readSync, readdirSync, rmSync, rmdirSync, statSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

/** What the installed app.asar must carry: the real-turn cap (D-069 real run) and the mid-turn quota typing. */
export const REQUIRED_LITERALS = ['PERSONA_REAL_TURN_CAP', 'PERSONA_REAL_TURN_LEDGER', 'real_turn_cap', 'quota_exhausted']

const TRANSIENT = new Set(['EPERM', 'EBUSY', 'ENOTEMPTY', 'EACCES'])

/** @param ms - Milliseconds to block this process (a synchronous pause between cleanup attempts). */
export function sleepSync(ms) {
  Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)
}

/**
 * Remove a directory tree, tolerating the short-lived locks Windows leaves behind (the uninstaller, Defender, the indexer).
 * @param path - Directory to remove.
 * @param options - Injectable `rm`, `sleep`, number of `tries` and base `delayMs`.
 * @returns `{ removed, attempts, warning? }`; gives up with a warning instead of throwing on a transient error.
 * @throws For an error that is not a transient lock.
 */
export function removeTreeSoft(path, options = {}) {
  const rm = options.rm ?? ((target) => rmSync(target, { recursive: true, force: true }))
  const sleep = options.sleep ?? sleepSync
  const tries = options.tries ?? 8
  const delayMs = options.delayMs ?? 400
  let last
  for (let attempt = 1; attempt <= tries; attempt += 1) {
    try {
      rm(path)
      return { removed: true, attempts: attempt }
    } catch (error) {
      if (!TRANSIENT.has(error?.code)) throw error
      last = error
      if (attempt < tries) sleep(delayMs * attempt)
    }
  }
  return { removed: false, attempts: tries, warning: `could not remove ${path}: ${String(last?.code)} (left behind; delete it by hand)` }
}

/**
 * Count occurrences of literals in a (possibly huge) file without loading it, across chunk boundaries.
 * @param file - File to scan.
 * @param literals - Strings to look for.
 * @param chunkBytes - Read size (small in tests).
 * @returns Occurrences per literal.
 */
export function countLiterals(file, literals, chunkBytes = 8 * 1024 * 1024) {
  const counts = Object.fromEntries(literals.map(literal => [literal, 0]))
  const needles = literals.map(literal => [literal, Buffer.from(literal)])
  const overlap = Math.max(0, ...needles.map(([, needle]) => needle.length)) - 1
  const fd = openSync(file, 'r')
  try {
    const chunk = Buffer.alloc(chunkBytes + overlap)
    let carry = 0
    for (;;) {
      const read = readSync(fd, chunk, carry, chunkBytes, null)
      if (read === 0) break
      const view = chunk.subarray(0, carry + read)
      for (const [literal, needle] of needles) {
        let at = view.indexOf(needle)
        // A match that starts inside the carried overlap was already counted with the previous chunk's tail.
        while (at !== -1) {
          if (at + needle.length > carry || carry === 0) counts[literal] += 1
          at = view.indexOf(needle, at + 1)
        }
      }
      carry = Math.min(overlap, view.length)
      view.copy(chunk, 0, view.length - carry)
    }
  } finally {
    closeSync(fd)
  }
  return counts
}

/**
 * Look at an installed copy of the app.
 * @param dest - Install directory.
 * @returns What is there: app.asar size and required literals, MinGit pieces, notification avatars.
 */
export function inspectInstalled(dest) {
  const resources = join(dest, 'resources')
  const asar = join(resources, 'app.asar')
  const avatars = join(resources, 'notify-avatars')
  return {
    exe: existsSync(join(dest, 'Persona.exe')),
    asarBytes: existsSync(asar) ? statSync(asar).size : 0,
    literals: existsSync(asar) ? countLiterals(asar, REQUIRED_LITERALS) : Object.fromEntries(REQUIRED_LITERALS.map(literal => [literal, 0])),
    mingit: {
      cmdGit: existsSync(join(resources, 'mingit', 'cmd', 'git.exe')),
      ucrtGit: existsSync(join(resources, 'mingit', 'ucrt64', 'bin', 'git.exe')),
      license: existsSync(join(resources, 'mingit', 'LICENSE.txt')) || existsSync(join(resources, 'mingit', 'LICENSE')),
    },
    notifyAvatars: existsSync(avatars) ? readdirSync(avatars).filter(name => name.endsWith('.png')).length : 0,
  }
}

/**
 * Judge a trial result.
 * @param result - From {@link runInstallTrial}.
 * @returns `{ ok, problems }`; a leftover temp directory is a warning, not a problem.
 */
export function trialVerdict(result) {
  const problems = []
  if (result.installExit !== 0) problems.push(`installer exited ${String(result.installExit)}`)
  if (!result.installed?.exe) problems.push('Persona.exe missing after install')
  for (const [literal, count] of Object.entries(result.installed?.literals ?? {})) {
    if (!(count > 0)) problems.push(`app.asar lacks ${literal}`)
  }
  if (!result.installed?.mingit?.cmdGit || !result.installed?.mingit?.ucrtGit) problems.push('MinGit incomplete')
  if (result.uninstaller === null) problems.push('no uninstaller was installed')
  else if (result.uninstallExit !== 0) problems.push(`uninstaller exited ${String(result.uninstallExit)}`)
  if (result.dataKept === false) problems.push('the uninstaller deleted the person\'s data (%APPDATA%\\Persona): deleteAppDataOnUninstall is on')
  return { ok: problems.length === 0, problems }
}

/**
 * Plants a file where `deleteAppDataOnUninstall` would delete it: the app's userData (`%APPDATA%\Persona`). The person's team and conversations
 * live in `~/.persona`, which the uninstaller never touches; this is the worst case it could reach.
 * @param appData - The roaming app-data folder (default: the real one).
 * @returns The planted file, or `undefined` where there is no app-data folder.
 */
export function plantDataSentinel(appData = process.env.APPDATA) {
  if (appData === undefined || appData === '') return undefined
  const dir = join(appData, 'Persona')
  const createdDir = !existsSync(dir)
  mkdirSync(dir, { recursive: true })
  const path = join(dir, `.install-trial-${String(Date.now())}.txt`)
  writeFileSync(path, 'planted by install-trial: if the uninstaller deletes this file it also deletes the person\'s data\n')
  return { path, dir, createdDir }
}

/**
 * Takes the sentinel away, and the folder only when this trial created it and it is empty. Never throws.
 * @param sentinel - From {@link plantDataSentinel}.
 */
export function dropDataSentinel(sentinel) {
  if (sentinel === undefined) return
  try { rmSync(sentinel.path, { force: true }) } catch { /* best effort */ }
  if (sentinel.createdDir) { try { rmdirSync(sentinel.dir) } catch { /* not empty: something else was put there */ } }
}

/**
 * Install, inspect, uninstall, clean.
 * @param setup - Path of the NSIS Setup.
 * @param deps - Injectable `run(cmd, args, timeoutMs)`, `inspect`, `remove`, `mkdtemp`, `now`.
 */
export function runInstallTrial(setup, deps = {}) {
  const run = deps.run ?? ((cmd, args, timeout) => spawnSync(cmd, args, { encoding: 'utf8', windowsHide: true, timeout }))
  const inspect = deps.inspect ?? inspectInstalled
  const remove = deps.remove ?? removeTreeSoft
  const now = deps.now ?? Date.now
  const dest = (deps.mkdtemp ?? (() => mkdtempSync(join(tmpdir(), 'persona-nsis-'))))()
  const t0 = now()
  const installed = run(setup, ['/S', `/D=${dest}`], 10 * 60_000)
  const installMs = now() - t0
  const installedState = inspect(dest)
  const uninstaller = ['Uninstall Persona.exe', 'Uninstall.exe'].map(name => join(dest, name)).find(path => (deps.exists ?? existsSync)(path))
  // Data planted where an uninstaller could delete it. Only a REAL run plants (a test with a fake `run` never touches the developer's APPDATA).
  const sentinel = deps.plantSentinel === undefined ? (deps.run === undefined ? plantDataSentinel() : undefined) : deps.plantSentinel()
  let uninstallMs = null
  let uninstallExit = null
  if (uninstaller !== undefined) {
    const u0 = now()
    // `_?=<dir>` makes the NSIS uninstaller run in place and in the foreground (it must be the last argument, unquoted).
    // Without it the uninstaller copies itself to %TEMP%, exits at once, and the real uninstall finishes behind our back.
    const undone = run(uninstaller, ['/S', `_?=${dest}`], 180_000)
    uninstallMs = now() - u0
    uninstallExit = undone.status
  }
  const dataKept = sentinel === undefined || uninstaller === undefined ? null : (deps.exists ?? existsSync)(sentinel.path)
  ;(deps.dropSentinel ?? dropDataSentinel)(sentinel)
  const cleanup = remove(dest)
  const result = {
    dest,
    installMs,
    installExit: installed.status,
    installed: installedState,
    uninstaller: uninstaller ?? null,
    uninstallMs,
    uninstallExit,
    dataKept,
    cleanup,
  }
  return { ...result, verdict: trialVerdict(result) }
}

if (process.argv[1] !== undefined && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2)
  const flag = (name, fallback) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : fallback)
  const setup = resolve(flag('--setup', 'C:\\p8c\\Persona-Setup.exe'))
  const out = resolve(flag('--out', 'C:\\p8c\\install-trial.json'))
  if (!existsSync(setup)) {
    console.error(`install-trial: Setup not found: ${setup}`)
    process.exit(2)
  }
  const result = { setup, setupBytes: statSync(setup).size, at: new Date().toISOString(), ...runInstallTrial(setup) }
  writeFileSync(out, `${JSON.stringify(result, null, 2)}\n`)
  console.log(JSON.stringify({ ok: result.verdict.ok, problems: result.verdict.problems, installMs: result.installMs,
    uninstallMs: result.uninstallMs, cleanup: result.cleanup, literals: result.installed.literals, out }, null, 2))
  process.exit(result.verdict.ok ? 0 : 1)
}
