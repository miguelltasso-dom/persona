/**
 * The Desktop runtime (`dsh/node_modules`) must carry the SAME dependency versions as the workspace lockfile (`pnpm-lock.yaml`).
 *
 * Why this exists (ENG-1, 04/11): the runtime is resolved in a disposable project, outside the workspace lockfile, and only
 * `@earendil-works/pi-ai` was pinned. `pi-coding-agent`, `pi-agent-core`, `pi-mcp`, `pi-tui`, `pi-codemode` and `pi-schema` floated
 * `^1.3.0` -> 1.5.0 while `pi-ai` stayed 1.3.0, so `import('@botiverse/oar')` threw `does not provide an export named PI_ATTRIBUTION`
 * in the INSTALLED app (and nowhere else: the workspace, the tests and the web host run the lockfile). No AI engine could start.
 *
 * What it does:
 *  - the disposable runtime resolution is SEEDED with the workspace lockfile (`seedRuntimeLockfile`), so pnpm keeps the locked versions;
 *  - {@link assertRuntimeLockfileWithinWorkspace} proves it right after the resolution (minutes into the pack): every package whose name
 *    the workspace knows must resolve to a version the workspace lockfile locks;
 *  - {@link findRuntimeDrift} / {@link assertNoRuntimeDrift} do the same on an installed `node_modules` tree (the CLI below);
 *  - names the workspace does not use at all are runtime-only: reported, never silently trusted.
 *
 * CLI: node --import tsx/esm apps/desktop/scripts/runtime-lockfile-drift.ts <node_modules dir> [pnpm-lock.yaml]
 */
import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'
import yaml from 'js-yaml'

/** package name -> every version the lockfile locks for it. */
export type LockedVersions = ReadonlyMap<string, ReadonlySet<string>>

export interface InstalledPackage {
  name: string
  version: string
  /** Path relative to the scanned `node_modules`. */
  where: string
}

export interface RuntimeDrift {
  name: string
  version: string
  where: string
  /** Versions the workspace lockfile locks for this name. */
  locked: readonly string[]
}

export interface RuntimeDriftReport {
  /** Installed at a version the workspace lockfile does not lock (the dangerous case). */
  diverging: readonly RuntimeDrift[]
  /** Installed names the workspace lockfile does not know at all (runtime-only; they float unless pinned elsewhere). */
  runtimeOnly: readonly InstalledPackage[]
  scanned: number
}

/** Registry packages only: `link:`/`file:`/git/tarball keys are not version-pinned the same way. */
const REGISTRY_VERSION = /^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.+-]+)?$/u

/**
 * Parse the `packages:` section of a pnpm v9 lockfile.
 * @param lockfileText - Content of `pnpm-lock.yaml`.
 */
export function lockedVersionsOf(lockfileText: string): LockedVersions {
  const parsed = yaml.load(lockfileText) as { packages?: Record<string, unknown> } | undefined
  const result = new Map<string, Set<string>>()
  for (const key of Object.keys(parsed?.packages ?? {})) {
    const at = key.lastIndexOf('@')
    if (at <= 0) continue
    const name = key.slice(0, at)
    const version = key.slice(at + 1)
    if (!REGISTRY_VERSION.test(version)) continue
    const set = result.get(name) ?? new Set<string>()
    set.add(version)
    result.set(name, set)
  }
  return result
}

function readManifest(dir: string): { name?: unknown; version?: unknown } | undefined {
  try {
    return JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8')) as { name?: unknown; version?: unknown }
  } catch {
    return undefined
  }
}

/**
 * Every package.json under a (dereferenced) `node_modules`, nested `node_modules` included.
 * @param root - The `node_modules` directory.
 */
export function installedPackagesIn(root: string): InstalledPackage[] {
  const found: InstalledPackage[] = []
  const walk = (modules: string, where: string): void => {
    let entries: string[]
    try { entries = readdirSync(modules) } catch { return }
    for (const entry of entries) {
      if (entry === '.bin' || entry === '.pnpm' || entry.startsWith('.')) continue
      const dirs = entry.startsWith('@')
        ? (() => { try { return readdirSync(join(modules, entry)).map(inner => `${entry}/${inner}`) } catch { return [] } })()
        : [entry]
      for (const rel of dirs) {
        const dir = join(modules, rel)
        const manifest = readManifest(dir)
        if (typeof manifest?.name === 'string' && typeof manifest.version === 'string') {
          found.push({ name: manifest.name, version: manifest.version, where: `${where}${rel}` })
        }
        const nested = join(dir, 'node_modules')
        if (existsSync(nested)) walk(nested, `${where}${rel}/node_modules/`)
      }
    }
  }
  walk(root, '')
  return found
}

/**
 * Compare what was installed with what the workspace lockfile locks.
 * @param installed - {@link installedPackagesIn}.
 * @param locked - {@link lockedVersionsOf}.
 */
export function findRuntimeDrift(installed: readonly InstalledPackage[], locked: LockedVersions): RuntimeDriftReport {
  const diverging: RuntimeDrift[] = []
  const runtimeOnly: InstalledPackage[] = []
  for (const item of installed) {
    const versions = locked.get(item.name)
    if (versions === undefined) {
      runtimeOnly.push(item)
    } else if (!versions.has(item.version)) {
      diverging.push({ name: item.name, version: item.version, where: item.where, locked: [...versions].sort() })
    }
  }
  return { diverging, runtimeOnly, scanned: installed.length }
}

/**
 * Throw when the install carries a version the workspace lockfile does not lock.
 * @param report - {@link findRuntimeDrift}.
 */
export function assertNoRuntimeDrift(report: RuntimeDriftReport): void {
  if (report.diverging.length === 0) return
  const lines = report.diverging.slice(0, 30).map(row => `  ${row.name}@${row.version} (lockfile: ${row.locked.join(', ')}) at ${row.where}`)
  const more = report.diverging.length > 30 ? `\n  ... and ${String(report.diverging.length - 30)} more` : ''
  throw new Error(`desktop runtime: ${String(report.diverging.length)} package(s) drifted from the workspace lockfile (the installed app would run code nobody tested):\n${lines.join('\n')}${more}`)
}

/**
 * Drift of the runtime's own RESOLVED lockfile (before anything is installed) against the workspace lockfile: every package whose
 * name the workspace knows must resolve to a version the workspace locks. Cheap enough to fail the pack minutes in, not 40 minutes in.
 * @param runtimeLockText - `pnpm-lock.yaml` the disposable runtime project resolved.
 * @param workspaceLockText - `pnpm-lock.yaml` of the workspace.
 */
export function lockfileDrift(runtimeLockText: string, workspaceLockText: string): { diverging: RuntimeDrift[]; runtimeOnlyNames: string[]; checked: number } {
  const workspace = lockedVersionsOf(workspaceLockText)
  const runtime = lockedVersionsOf(runtimeLockText)
  const diverging: RuntimeDrift[] = []
  const runtimeOnlyNames: string[] = []
  let checked = 0
  for (const [name, versions] of runtime) {
    const locked = workspace.get(name)
    if (locked === undefined) { runtimeOnlyNames.push(name); continue }
    for (const version of versions) {
      checked += 1
      if (!locked.has(version)) diverging.push({ name, version, where: 'pnpm-lock.yaml', locked: [...locked].sort() })
    }
  }
  return { diverging, runtimeOnlyNames: runtimeOnlyNames.sort(), checked }
}

/**
 * Throw when the runtime lockfile resolved a version the workspace lockfile does not lock (see the file header: ENG-1).
 * @param runtimeLockText - Runtime project's resolved lockfile.
 * @param workspaceLockText - Workspace lockfile.
 */
export function assertRuntimeLockfileWithinWorkspace(runtimeLockText: string, workspaceLockText: string): { checked: number; runtimeOnly: number } {
  const drift = lockfileDrift(runtimeLockText, workspaceLockText)
  assertNoRuntimeDrift({ diverging: drift.diverging, runtimeOnly: [], scanned: drift.checked })
  return { checked: drift.checked, runtimeOnly: drift.runtimeOnlyNames.length }
}

/**
 * Convenience: scan an installed runtime against a lockfile file.
 * @param modulesDir - `node_modules` of the runtime.
 * @param lockfilePath - Workspace `pnpm-lock.yaml`.
 */
export function runtimeDriftOf(modulesDir: string, lockfilePath: string): RuntimeDriftReport {
  return findRuntimeDrift(installedPackagesIn(modulesDir), lockedVersionsOf(readFileSync(lockfilePath, 'utf8')))
}

if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const modules = process.argv[2]
  if (modules === undefined) {
    process.stderr.write('usage: runtime-lockfile-drift.ts <node_modules dir> [pnpm-lock.yaml]\n')
    process.exit(2)
  }
  const lockfile = resolve(process.argv[3] ?? join(import.meta.dirname, '..', '..', '..', 'pnpm-lock.yaml'))
  const report = runtimeDriftOf(resolve(modules), lockfile)
  process.stdout.write(`scanned ${String(report.scanned)} installed packages against ${lockfile}\n`)
  process.stdout.write(`DIVERGING from the lockfile: ${String(report.diverging.length)}\n`)
  for (const row of report.diverging) process.stdout.write(`  ${row.name}@${row.version}  (lockfile: ${row.locked.join(', ')})  ${row.where}\n`)
  const names = [...new Set(report.runtimeOnly.map(item => `${item.name}@${item.version}`))].sort()
  process.stdout.write(`runtime-only (name unknown to the workspace lockfile): ${String(names.length)}\n`)
  for (const name of names.slice(0, 40)) process.stdout.write(`  ${name}\n`)
  if (names.length > 40) process.stdout.write(`  ... and ${String(names.length - 40)} more\n`)
  process.exit(report.diverging.length === 0 ? 0 : 1)
}
