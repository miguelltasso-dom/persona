#!/usr/bin/env node
/**
 * Early type-gate signal (Rivet, 07/11, asked by Keel): put a newer snapshot of the tree on the warm pack worktree and run the repository's own
 * `pnpm run typecheck` there (scripts/build.ts --scope typecheck: Typert, every package project in build mode, then BOTH aggregate programs, no bundling).
 * That is the program that reprovou the 12:45 snapshot with TS6307/TS2307, so a new error shows up here before the real pack does.
 *
 *   node scripts/persona/warm-delta-check.mjs --sha <full sha of Keel's newer backup> [--worktree C:\p8wbc28dac5c2] [--normal-priority]
 *   node scripts/persona/warm-delta-check.mjs --delta [--dry-run] ...   (no sha: copies the shared checkout's changes onto the worktree; SLOW git on this machine)
 *
 * --sha (preferred): the same guarded in-place checkout the warm pack uses (package-clean-warm.mjs: pack worktree only, no process inside, completed pack
 * recorded, no dependency input changed since it) and then the typecheck. Nothing is added that a later checkout would not reset, so there is no cleanup.
 * --delta: `git diff <worktree HEAD>` against the shared checkout plus new untracked files; the files it ADDED are removed at the end, always.
 * It runs under the `pack` lock: nothing else may use that worktree meanwhile. Errors, if any, are written to .maestri/tmp/rivet-warm-delta-check.txt.
 */
import { spawn, spawnSync } from 'node:child_process'
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from 'node:fs'
import { constants as osConstants, setPriority } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { dependencyInputsChanged, isPackWorktreePath, prepareWarmWorktree } from './package-clean-warm.mjs'

const args = process.argv.slice(2)
const flagValue = name => { const at = args.indexOf(name); return at >= 0 ? args[at + 1] : undefined }
const root = resolve(import.meta.dirname, '..', '..')
const worktree = resolve(flagValue('--worktree') ?? 'C:\\p8wbc28dac5c2')
const sha = flagValue('--sha')
const deltaMode = args.includes('--delta')
const dryRun = args.includes('--dry-run')
const log = message => console.log(`[warm-delta-check ${new Date().toISOString().slice(11, 19)}] ${message}`)

if ((sha === undefined) === !deltaMode) { console.error('give exactly one of --sha <full sha> or --delta'); process.exit(2) }
if (sha !== undefined && !/^[0-9a-f]{40}$/u.test(sha)) { console.error('--sha needs the full 40-hex sha'); process.exit(2) }
if (!isPackWorktreePath(worktree) || !existsSync(worktree)) { console.error(`${worktree} is not an existing pack worktree`); process.exit(2) }
if (process.env.PERSONA_LOCK !== 'pack' && !dryRun) {
  const locked = spawnSync(process.execPath, [join(root, 'scripts', 'persona', 'with-lock.mjs'), 'Rivet warm-delta-check', '--lock', 'pack', '--exclusive', '--wait-max', String(30 * 60_000), '--', 'node', ...process.argv.slice(1)],
    { cwd: root, stdio: 'inherit', windowsHide: true })
  process.exit(locked.status ?? 1)
}
if (!args.includes('--normal-priority')) {
  try { setPriority(0, osConstants.priority.PRIORITY_BELOW_NORMAL); log('BELOW_NORMAL priority (captures keep the machine)') } catch (error) { log(`could not lower the priority: ${String(error)}`) }
}

const run = (cwd, cmd, runArgs) => spawnSync(cmd, runArgs, { cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 28 })
const added = []

if (sha !== undefined) {
  const advanced = prepareWarmWorktree({ main: root, candidate: worktree, target: sha, run })
  if (!advanced.ok) { console.error(`warm checkout refused: ${advanced.reason}`); process.exit(3) }
  log(`worktree ${worktree} advanced ${advanced.from.slice(0, 10)} -> ${sha.slice(0, 10)} (${String(advanced.changedFiles)} files differ since the last completed pack)`)
} else {
  const head = run(worktree, 'git', ['rev-parse', 'HEAD']).stdout.trim()
  if (!/^[0-9a-f]{40}$/u.test(head)) { console.error('cannot read the worktree HEAD'); process.exit(2) }
  const PATHSPEC = ['packages', 'apps', 'scripts', 'native', 'python', 'patches', 'tsconfig.base.json', 'tsconfig.base.client.json', 'tsconfig.client.json', 'tsconfig.host.json', 'package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', 'vitest.config.ts', 'vitest.shared.ts']
  const changed = run(root, 'git', ['diff', '--name-status', '--no-renames', head, '--', ...PATHSPEC])
  const untracked = run(root, 'git', ['ls-files', '--others', '--exclude-standard', '--', ...PATHSPEC])
  if (changed.status !== 0 || untracked.status !== 0) { console.error(`git failed: ${String(changed.stderr || untracked.stderr).slice(0, 200)}`); process.exit(2) }
  const skip = path => /(^|\/)(lib|node_modules|\.desktop-build|artifacts|dist|\.maestri)(\/|$)/u.test(path)
  const edits = []
  for (const line of String(changed.stdout).split(/\r?\n/u)) {
    const match = /^([AMDTU])\t(.+)$/u.exec(line)
    if (match !== null && !skip(match[2])) edits.push({ status: match[1] === 'D' ? 'D' : 'M', path: match[2] })
  }
  for (const path of String(untracked.stdout).split(/\r?\n/u).map(item => item.trim()).filter(Boolean)) if (!skip(path)) edits.push({ status: 'A', path })
  log(`delta against ${head.slice(0, 10)}: ${String(edits.length)} paths`)
  const blockers = dependencyInputsChanged(edits.map(item => item.path))
  if (blockers.length > 0) { console.error(`dependency inputs are in the delta (${blockers.slice(0, 4).join(', ')}): the warm node_modules would be stale and this signal would lie. Stop.`); process.exit(3) }
  if (dryRun) { for (const item of edits.slice(0, 60)) console.log(`${item.status} ${item.path}`); process.exit(0) }
  let copied = 0
  let same = 0
  for (const item of edits) {
    const target = join(worktree, item.path)
    if (item.status === 'D') { rmSync(target, { force: true }); continue }
    const source = join(root, item.path)
    const wasThere = existsSync(target)
    if (wasThere && statSync(target).size === statSync(source).size && Buffer.compare(readFileSync(target), readFileSync(source)) === 0) {
      // Already the right bytes (an earlier run copied them) but possibly with an OLD mtime: `tsc -b` trusts mtimes, so stamp it anyway.
      const stamp = new Date()
      utimesSync(target, stamp, stamp)
      same += 1
      continue
    }
    mkdirSync(dirname(target), { recursive: true })
    copyFileSync(source, target)
    // Windows CopyFile KEEPS the source's modified time, and `tsc -b` trusts mtimes: an older copy than the outputs of the last build reads as "up to date" and
    // the dependents then see stale declarations (the first run of this check reported TS2305 for exports that exist). Stamp the copy with NOW.
    const now = new Date()
    utimesSync(target, now, now)
    if (!wasThere) added.push(item.path)
    copied += 1
  }
  log(`applied: ${String(copied)} copied (${String(added.length)} new to the worktree), ${String(same)} identical`)
}

try {
  const pnpm = join(worktree, 'node_modules', 'pnpm', 'bin', 'pnpm.cjs')
  const startedAt = Date.now()
  log('pnpm run typecheck (Typert, every package project, both aggregates)')
  const code = await new Promise((done) => {
    const child = spawn(process.execPath, [pnpm, 'run', 'typecheck'], { cwd: worktree, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'], env: { ...process.env, npm_execpath: pnpm } })
    let tail = ''
    const take = (chunk) => { const text = chunk.toString(); process.stdout.write(text); tail = (tail + text).slice(-80_000) }
    child.stdout.on('data', take)
    child.stderr.on('data', take)
    child.once('error', () => done(1))
    child.once('close', (status) => {
      const errors = [...tail.matchAll(/^.*error TS\d+:.*$/gmu)].map(row => row[0].trim().slice(0, 260))
      mkdirSync(join(root, '.maestri', 'tmp'), { recursive: true })
      writeFileSync(join(root, '.maestri', 'tmp', 'rivet-warm-delta-check.txt'), `exit ${String(status)}\n${errors.join('\n')}\n`)
      done(status ?? 1)
    })
  })
  log(`typecheck exit ${String(code)} in ${String(Math.round((Date.now() - startedAt) / 1000))} s (errors, if any, in .maestri/tmp/rivet-warm-delta-check.txt)`)
  process.exitCode = code
} finally {
  for (const path of added) rmSync(join(worktree, path), { force: true })
  if (added.length > 0) log(`cleanup: removed the ${String(added.length)} files this check added to the worktree`)
  if (deltaMode && !dryRun) {
    // Removing the NEW files while keeping the MODIFIED ones left the worktree inconsistent (importers of files that no longer exist). Put every tracked file
    // back exactly as its commit has it: a worktree that is only ever "its commit + ignored build output" is what the warm pack expects.
    const reset = spawnSync('git', ['checkout', '-f', '--detach', 'HEAD'], { cwd: worktree, encoding: 'utf8', windowsHide: true })
    log(reset.status === 0 ? 'cleanup: tracked files restored to the worktree commit' : `cleanup: could not restore the tracked files (${String(reset.stderr).slice(0, 160)})`)
  }
}
