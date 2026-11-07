/**
 * Warm start for scripts/persona/package-clean.mjs (Rivet, 07/11, ordered by Keel/Atlas: "pack do corte final, incremental se der").
 *
 * A COLD pack builds a brand-new worktree: `git worktree add` + `pnpm install` (3,3 min measured on H2 #4) and a TypeScript build from nothing
 * (the 10 gates took 14,2 min; `tsc -b` alone ~8 of them). When the dependency inputs did not change between the last pack and the new commit,
 * the previous pack worktree already has the right node_modules, the `.tsbuildinfo` files and the extracted Electron, so the new commit can be
 * checked out IN PLACE and `tsc -b` only rebuilds what changed.
 *
 * What makes this safe (every check below falls back to the cold pack, it never guesses):
 *   - only a PACK worktree is ever reused (`C:\p8w<10 hex>`, the ones package-clean creates), registered, detached, unlocked; never the shared
 *     checkout or the publish/ship worktrees;
 *   - no process may be running from it (a failed or implausibly short process listing counts as "busy", never as "none");
 *   - NOTHING that decides node_modules may differ between its HEAD and the target: no package.json, pnpm-lock.yaml, pnpm-workspace.yaml,
 *     .npmrc, .pnpmfile or patches/ change. A new dependency anywhere is a cold pack;
 *   - the checkout is forced (`checkout -f --detach`): tracked files become EXACTLY the target's (including the files the previous pack's overlay
 *     had modified); only git-ignored build outputs survive, and those are what `tsc -b` / the bundlers rebuild or reuse on purpose.
 * The worktree is NOT moved or renamed: pnpm's node_modules junctions are absolute paths into the old location and would dangle.
 */
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

/** The pack worktrees package-clean itself creates: a drive root + `p8w` + the first 10 hex digits of the commit. Nothing else is reused. */
export const PACK_WORKTREE = /^[a-z]:[\\/]p8w[0-9a-f]{10}$/iu

/**
 * @param path - Candidate worktree path.
 * @param pattern - Overridable only by tests.
 * @returns whether it looks like a worktree package-clean created.
 */
export function isPackWorktreePath(path, pattern = PACK_WORKTREE) {
  return pattern.test(String(path).replace(/[\\/]+$/u, ''))
}

/**
 * Paths whose change means the node_modules (or the runtime lockfile derived from the workspace) of the warm worktree may no longer match the target.
 * @param paths - Changed paths (`git diff --name-only`, forward slashes).
 * @returns the ones that block a warm start.
 */
export function dependencyInputsChanged(paths) {
  return paths.filter(path => /(^|\/)package\.json$/u.test(path)
    || /^pnpm-(lock|workspace)\.yaml$/u.test(path)
    || /^\.npmrc$/u.test(path)
    || /^\.pnpmfile\.c?js$/u.test(path)
    || /^patches\//u.test(path))
}

/**
 * @param text - `git worktree list --porcelain`.
 * @returns one row per worktree.
 */
export function parseWorktrees(text) {
  const rows = []
  let row
  for (const line of text.split(/\r?\n/u)) {
    if (line.startsWith('worktree ')) {
      row = { path: line.slice('worktree '.length).trim(), head: '', detached: false, locked: false, prunable: false }
      rows.push(row)
    } else if (row === undefined) continue
    else if (line.startsWith('HEAD ')) row.head = line.slice('HEAD '.length).trim()
    else if (line === 'detached') row.detached = true
    else if (line.startsWith('locked')) row.locked = true
    else if (line.startsWith('prunable')) row.prunable = true
  }
  return rows
}

const normalized = path => String(path).replace(/\\/gu, '/').replace(/\/+$/u, '').toLowerCase()

/**
 * Where the "a pack finished here" marker lives: inside the worktree's private git dir, so it is invisible to `git status`, to the build and to the installer.
 * @param run - spawnSync-like runner.
 * @param worktree - Pack worktree.
 * @returns the marker file path.
 */
export function markerPath(run, worktree) {
  const where = run(worktree, 'git', ['rev-parse', '--git-path', 'pack-warm.json'])
  if (where.status !== 0) throw new Error(`cannot locate the git dir of ${worktree}: ${String(where.stderr).slice(0, 160)}`)
  return resolve(worktree, String(where.stdout).trim())
}

/**
 * @param run - spawnSync-like runner.
 * @param worktree - Pack worktree.
 * @returns `{ commit }` of the last pack that COMPLETED in it, or `undefined`.
 */
export function readMarker(run, worktree) {
  try {
    const file = markerPath(run, worktree)
    if (!existsSync(file)) return undefined
    const parsed = JSON.parse(readFileSync(file, 'utf8'))
    return typeof parsed?.commit === 'string' && /^[0-9a-f]{40}$/u.test(parsed.commit) ? parsed : undefined
  } catch {
    return undefined
  }
}

/**
 * Record that a `--dir` pack of `commit` finished in the worktree: its node_modules, `.tsbuildinfo` files and extracted Electron are then a known-good base.
 * @param run - spawnSync-like runner.
 * @param worktree - Pack worktree.
 * @param commit - Full sha that was packed.
 * @param extra - Extra fields kept for humans (when, how long).
 */
export function writeMarker(run, worktree, commit, extra = {}) {
  const file = markerPath(run, worktree)
  mkdirSync(dirname(file), { recursive: true })
  writeFileSync(file, `${JSON.stringify({ commit, at: new Date().toISOString(), ...extra }, null, 2)}\n`)
}

/**
 * Processes whose command line or executable lives INSIDE one of `roots` (a path below it: `root/...`). A command line that only NAMES the folder as a value
 * (this very pack's `--warm-from C:\p8w...`) is not a process running from it: counting it made the first rehearsal refuse itself and fall back to a cold pack.
 * @param roots - Directories.
 * @param processes - `{ ProcessId, Name, CommandLine, ExecutablePath }` rows.
 * @returns the matches.
 */
export function processesUnder(roots, processes) {
  const wanted = roots.map(root => `${normalized(root)}/`)
  return processes.filter((item) => {
    const text = normalized(`${item.CommandLine ?? ''} ${item.ExecutablePath ?? ''}`)
    return wanted.some(root => text.includes(root))
  })
}

/**
 * The machine-wide process listing. It must FAIL LOUDLY: an empty or failed listing read as "nothing is using the worktree" would be a false green.
 * @returns the processes.
 */
export function listProcesses() {
  const ran = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
    'Get-CimInstance Win32_Process | Select-Object ProcessId,Name,CommandLine,ExecutablePath | ConvertTo-Json -Compress'],
  { encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 26, timeout: 60_000 })
  if (ran.status !== 0) throw new Error(`process listing failed (exit ${String(ran.status)}): ${String(ran.stderr).slice(0, 200)}`)
  return parseProcessListing(String(ran.stdout))
}

/**
 * Parse the PowerShell listing. Another agent's command line can carry RAW control characters that `ConvertTo-Json` leaves unescaped (the same trap
 * reap-orphans.mjs documents): a plain JSON.parse threw on them, which made the guard refuse every warm start on a busy machine (07/11, found at the cut).
 * Compact JSON has no meaningful control character, so blanking them is safe.
 * @param text - Raw stdout of the listing command.
 * @returns the process rows; throws when the text is not a plausible whole-machine listing.
 */
export function parseProcessListing(text) {
  // eslint-disable-next-line no-control-regex -- the control characters are exactly what is being removed
  const parsed = JSON.parse(text.replace(/[\u0000-\u001f]/gu, ' ').trim())
  const rows = Array.isArray(parsed) ? parsed : [parsed]
  if (rows.length < 20) throw new Error(`process listing implausibly short (${String(rows.length)} rows): not trusting it`)
  return rows
}

/**
 * Decide whether `candidate` may be reused for `target`. Pure: every fact comes in as an argument.
 * @param input - candidate path, the worktrees of the repository, the target commit, the paths that differ between the candidate's HEAD and the target (`undefined` = could not compare) and the processes found inside it.
 * @returns `{ ok: true, warmHead }` or `{ ok: false, reason }`.
 */
export function planWarm(input) {
  const refuse = reason => ({ ok: false, reason })
  if (!isPackWorktreePath(input.candidate, input.pattern)) return refuse(`${input.candidate} is not a pack worktree (drive:\\p8w + 10 hex digits): only those are reused`)
  const row = input.worktrees.find(item => normalized(item.path) === normalized(input.candidate))
  if (row === undefined) return refuse('it is not a registered worktree of this repository')
  if (row.locked) return refuse('the worktree is locked')
  if (row.prunable) return refuse('the worktree is marked prunable (its directory is missing or broken)')
  if (!row.detached) return refuse('the worktree is on a branch, not a detached pack checkout')
  if (!/^[0-9a-f]{40}$/u.test(row.head)) return refuse('the worktree has no HEAD commit')
  // The base is the last pack that COMPLETED here (its node_modules and build state are known good), not whatever HEAD says after a pack that died midway.
  if (input.base === undefined) return refuse('no completed pack is recorded in it (run a cold --dir pack there once, or `node scripts/persona/package-clean-warm.mjs mark <worktree>`)')
  if (input.busy === undefined) return refuse(`could not tell whether a process is running from it${input.listingError === undefined ? '' : ` (${String(input.listingError).slice(0, 240)})`}`)
  if (input.busy.length > 0) return refuse(`processes are running from it: ${input.busy.slice(0, 3).map(item => `${String(item.ProcessId)} ${String(item.Name)}`).join(', ')}`)
  if (input.changedPaths === undefined) return refuse(`could not compare ${input.base.slice(0, 10)} with the target`)
  const blockers = dependencyInputsChanged(input.changedPaths)
  if (blockers.length > 0) return refuse(`dependency inputs changed since ${input.base.slice(0, 10)}: ${blockers.slice(0, 4).join(', ')}${blockers.length > 4 ? ` (+${String(blockers.length - 4)})` : ''}`)
  return { ok: true, warmHead: input.base, changedFiles: input.changedPaths.length }
}

/**
 * Check `candidate` and, if it qualifies, move its checkout to `target` in place.
 * @param options - `main` (the repository), `candidate`, `target` (full sha), `run(cwd, cmd, args)` (spawnSync-like), optional `processes` provider and `pattern` (tests).
 * @returns `{ ok: true, path, from, to, changedFiles }` after the checkout, or `{ ok: false, reason }` with nothing touched.
 */
export function prepareWarmWorktree(options) {
  const { main, candidate, target, run } = options
  const listed = run(main, 'git', ['worktree', 'list', '--porcelain'])
  if (listed.status !== 0) return { ok: false, reason: `git worktree list failed: ${String(listed.stderr).slice(0, 160)}` }
  const worktrees = parseWorktrees(String(listed.stdout))
  const row = worktrees.find(item => normalized(item.path) === normalized(candidate))
  const base = row === undefined ? undefined : readMarker(run, candidate)?.commit
  let changedPaths
  if (base !== undefined) {
    const diff = run(main, 'git', ['diff', '--name-only', base, target])
    if (diff.status === 0) changedPaths = String(diff.stdout).split(/\r?\n/u).map(line => line.trim()).filter(Boolean)
  }
  let busy
  let listingError
  // Up to three tries: PowerShell's cold start on a loaded machine has failed once for no reason we could see. A listing that never comes back stays "unknown" (a refusal), never "nobody".
  for (let attempt = 1; attempt <= 3 && busy === undefined; attempt += 1) {
    try { busy = processesUnder([candidate], (options.processes ?? listProcesses)()) } catch (error) { listingError = error instanceof Error ? error.message : String(error) }
  }
  const plan = planWarm({ candidate, worktrees, base, changedPaths, busy, listingError, ...(options.pattern === undefined ? {} : { pattern: options.pattern }) })
  if (!plan.ok) return plan
  const checkout = run(candidate, 'git', ['checkout', '-f', '--detach', target])
  if (checkout.status !== 0) return { ok: false, reason: `git checkout failed in the warm worktree: ${String(checkout.stderr).slice(0, 200)}` }
  const head = String(run(candidate, 'git', ['rev-parse', 'HEAD']).stdout).trim()
  if (head !== target) return { ok: false, reason: `the warm worktree is at ${head.slice(0, 10)} after the checkout, expected ${target.slice(0, 10)}` }
  return { ok: true, path: candidate, from: plan.warmHead, to: target, changedFiles: plan.changedFiles }
}

// CLI: `node scripts/persona/package-clean-warm.mjs mark <pack-worktree>` records a base that finished a pack BEFORE the marker existed (H2 #4).
// It only writes the marker when the evidence is on disk: a pack worktree, node_modules installed, and the win-unpacked exe a finished --dir pack leaves.
if (process.argv[1] !== undefined && import.meta.url === pathToFileURL(process.argv[1]).href && process.argv[2] === 'mark') {
  const worktree = process.argv[3]
  const run = (cwd, cmd, args) => spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true })
  if (worktree === undefined || !isPackWorktreePath(worktree)) { console.error('usage: node scripts/persona/package-clean-warm.mjs mark <drive:\\p8w<10 hex>>'); process.exit(2) }
  const head = String(run(worktree, 'git', ['rev-parse', 'HEAD']).stdout).trim()
  const evidence = {
    nodeModules: existsSync(resolve(worktree, 'node_modules', '.modules.yaml')),
    exe: existsSync(resolve(worktree, 'apps', 'desktop', '.desktop-build', 'targets', 'win-x64', 'unsigned-artifacts', 'win-unpacked', 'Persona.exe')),
  }
  if (!/^[0-9a-f]{40}$/u.test(head) || !evidence.nodeModules || !evidence.exe) { console.error(`not marking ${worktree}: ${JSON.stringify({ head, ...evidence })}`); process.exit(1) }
  writeMarker(run, worktree, head, { by: 'mark' })
  console.log(`marked ${worktree} at ${head.slice(0, 10)}`)
}
