/**
 * "The same configuration" of the team round, as one string: the git commit plus a hash of what the round actually RUNS — the host (`persona-host/src`), the runners
 * (`persona-runners/src`), the CLI entry (`apps/cli/src`), the built client (`client-ui-persona/lib`: file names and sizes) and the round's own driver. A fake rehearsal is
 * only worth anything for the real round if this string is identical; anyone saving a file the round runs invalidates it (that is the point).
 */
import { createHash } from 'node:crypto'
import { execFileSync } from 'node:child_process'
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative } from 'node:path'
import { PACKAGE_ROOT, REPO_ROOT } from './paths.ts'

/**
 * The host depends on MORE than host/runners/cli (Keel 04:53: persona-store saves the quota readings, persona-engine the history/handoff wire and the morning card), so the
 * sources are EVERY `packages/persona/<package>/src` except the client (its BUILT lib is hashed below) and the harness (its `src` is added by name), plus `apps/cli/src`.
 */
function sourceDirs(): string[] {
  const root = join(REPO_ROOT, 'packages', 'persona')
  const packages = readdirSync(root, { withFileTypes: true })
    // `persona-runners-d096` is Tally's STAGING folder (it is moved out of the tree after the round, Keel 05:00): not host code, and its move must not count as a change.
    .filter(entry => entry.isDirectory() && entry.name !== 'client-ui-persona' && entry.name !== 'persona-e2e' && entry.name !== 'persona-runners-d096' && entry.name !== 'node_modules')
    .map(entry => join(root, entry.name, 'src'))
  return [...packages, join(REPO_ROOT, 'apps', 'cli', 'src'), join(PACKAGE_ROOT, 'src')]
}
const BUILT_DIRS: readonly string[] = [join(REPO_ROOT, 'packages', 'persona', 'client-ui-persona', 'lib')]
const ROUND_TESTS: readonly string[] = [join(PACKAGE_ROOT, 'tests', 'mandatory-team-round.spec.ts')]

function* walk(dir: string): Generator<string> {
  if (!existsSync(dir)) return
  for (const entry of readdirSync(dir, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.name === 'node_modules' || entry.name.startsWith('.')) continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) yield* walk(full)
    else yield full
  }
}

export function gitCommit(): string {
  try { return execFileSync('git', ['rev-parse', 'HEAD'], { cwd: REPO_ROOT, encoding: 'utf8' }).trim() } catch { return 'unknown' }
}

/** What the round runs, file by file: the content digest of every source and the size of every built client file (sorted by path). */
export type TreeManifest = ReadonlyMap<string, string>

export function treeManifest(): TreeManifest {
  const entries: Array<[string, string]> = []
  const digest = (data: Buffer | string): string => createHash('sha256').update(data).digest('hex').slice(0, 16)
  for (const dir of sourceDirs()) {
    for (const file of walk(dir)) {
      if (!/\.(ts|tsx|mjs|json)$/u.test(file)) continue
      entries.push([relative(REPO_ROOT, file).replaceAll('\\', '/'), digest(readFileSync(file))])
    }
  }
  for (const file of ROUND_TESTS) if (existsSync(file)) entries.push([relative(REPO_ROOT, file).replaceAll('\\', '/'), digest(readFileSync(file))])
  for (const dir of BUILT_DIRS) {
    for (const file of walk(dir)) entries.push([relative(REPO_ROOT, file).replaceAll('\\', '/'), `size:${String(statSync(file).size)}`])
  }
  return new Map(entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
}

/** @returns `sha256:<hex>` over the manifest (the sources' content and the built client's names + sizes). */
export function treeFingerprint(manifest: TreeManifest = treeManifest()): string {
  const hash = createHash('sha256')
  for (const [path, value] of manifest) hash.update(`${path}\n${value}\n`)
  return `sha256:${hash.digest('hex')}`
}

const LIB_ROOT = join(REPO_ROOT, 'packages', 'persona', 'client-ui-persona', 'lib')

/**
 * The identity of the built client the harness SERVES, in the form Quill announces a bundle with ("BUNDLE 6 PRONTO (7bd08b15…)"): SHA-1 over every file of the lib, in order of
 * code unit of its path relative to the lib (with "/"), each as `path`, a zero byte, then the content. A proof that carries it says WHICH bundle the round ran on, and a spec
 * can compare it with the announcement. (The fingerprint above only needs "did it change"; this is "which one is it".)
 * @param root - The lib folder (tests pass a temporary one).
 */
export function libHash(root: string = LIB_ROOT): { readonly hash: string; readonly files: number } {
  const found: Array<[string, string]> = []
  const visit = (dir: string): void => {
    if (!existsSync(dir)) return
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      const full = join(dir, entry.name)
      if (entry.isDirectory()) visit(full)
      else found.push([relative(root, full).replaceAll('\\', '/'), full])
    }
  }
  visit(root)
  found.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  const hash = createHash('sha1')
  for (const [path, file] of found) {
    hash.update(path)
    hash.update(Buffer.from([0]))
    hash.update(readFileSync(file))
  }
  return { hash: hash.digest('hex'), files: found.length }
}

/** Which files differ between two manifests, so a refused proof can say WHO moved the tree (the first `limit` paths of each kind). */
export function manifestChanges(before: TreeManifest, after: TreeManifest, limit = 12): { readonly changed: string[]; readonly added: string[]; readonly removed: string[]; readonly total: number } {
  const changed: string[] = []
  const added: string[] = []
  const removed: string[] = []
  for (const [path, value] of after) {
    const old = before.get(path)
    if (old === undefined) added.push(path)
    else if (old !== value) changed.push(path)
  }
  for (const path of before.keys()) if (!after.has(path)) removed.push(path)
  return { changed: changed.slice(0, limit), added: added.slice(0, limit), removed: removed.slice(0, limit), total: changed.length + added.length + removed.length }
}
