#!/usr/bin/env node
// Keel: publish the current local HEAD to origin/persona-dev from a CLEAN worktree (D-049).
// The shared checkout is never green at one instant (8 agents edit it), but a commit is a fixed snapshot: typecheck the snapshot in
// an isolated worktree, then push from there (its pre-push hook typechecks again). Usage: node scripts/persona/publish.mjs [commit]
// Exit codes: 0 pushed, 1 typecheck red (errors grouped by package are printed), 2 setup/push failure.
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const main = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const wt = resolve(main, '..', 'persona-ship')
const run = (cwd, cmd, args, options = {}) => spawnSync(cmd, args, { cwd, encoding: 'utf8', shell: process.platform === 'win32' && cmd === 'pnpm', maxBuffer: 1 << 28, ...options })
const log = (message) => console.log(`[publish ${new Date().toISOString()}] ${message}`)

const target = run(main, 'git', ['rev-parse', process.argv[2] ?? 'HEAD']).stdout.trim()
if (!target) { log('cannot resolve target commit'); process.exit(2) }
log(`target ${target.slice(0, 10)} ${run(main, 'git', ['log', '-1', '--format=%s', target]).stdout.trim()}`)

if (!existsSync(wt)) {
  const created = run(main, 'git', ['worktree', 'add', '--detach', wt, target])
  if (created.status !== 0) { log(`worktree add failed: ${created.stderr.slice(-300)}`); process.exit(2) }
}
const previous = run(wt, 'git', ['rev-parse', 'HEAD']).stdout.trim()
// Remove emit junk that failed composite builds leave next to sources (only untracked files with a TypeScript sibling).
const untracked = run(wt, 'git', ['status', '--short', '-uall']).stdout.split('\n').filter((l) => l.startsWith('?? ')).map((l) => l.slice(3))
for (const file of untracked) {
  const base = file.replace(/\.d\.ts\.map$|\.js\.map$|\.d\.ts$|\.js$/, '')
  if (base !== file && (existsSync(resolve(wt, `${base}.ts`)) || existsSync(resolve(wt, `${base}.tsx`)))) run(wt, 'node', ['-e', `require('fs').rmSync(${JSON.stringify(resolve(wt, file))}, { force: true })`])
}
const checkout = run(wt, 'git', ['checkout', '--detach', '--force', target])
if (checkout.status !== 0) { log(`checkout failed: ${checkout.stderr.slice(-300)}`); process.exit(2) }

const lockChanged = previous !== target && run(main, 'git', ['diff', '--quiet', previous, target, '--', 'pnpm-lock.yaml']).status !== 0
const needsInstall = lockChanged || !existsSync(resolve(wt, 'node_modules'))
if (needsInstall) {
  log('installing dependencies (frozen lockfile)')
  const install = run(wt, 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline'])
  if (install.status !== 0) { log(`install failed:\n${`${install.stdout}${install.stderr}`.slice(-600)}`); process.exit(2) }
}

log('typecheck in the clean worktree')
const check = run(wt, 'pnpm', ['run', 'typecheck'])
const output = `${check.stdout}${check.stderr}`
if (check.status !== 0) {
  let lines = output.split('\n').filter((l) => /error TS|TypertAnalysisError/.test(l) && !/TS6059|TS6307/.test(l))
  // TS6059/TS6307 are normally cascades, but when they are the only errors they ARE the failure (a file outside rootDir/include).
  if (lines.length === 0) lines = output.split('\n').filter((l) => /error TS/.test(l))
  if (lines.length === 0) lines = output.split('\n').filter((l) => /FAILED|error/i.test(l)).slice(0, 12)
  const byPackage = new Map()
  for (const line of lines) {
    const owner = /^(packages\/persona\/[^/]+|apps\/[^/]+|packages\/[^/]+\/[^/]+)/.exec(line.replace(/^.*?(packages\/|apps\/)/, '$1'))?.[1] ?? 'other'
    byPackage.set(owner, [...(byPackage.get(owner) ?? []), line.slice(0, 260)])
  }
  log(`typecheck RED: ${lines.length} errors in ${byPackage.size} package(s)`)
  for (const [pkg, entries] of byPackage) console.log(`  ${pkg} (${entries.length})\n${entries.slice(0, 6).map((e) => `    ${e}`).join('\n')}`)
  process.exit(1)
}
log('typecheck green; pushing from the worktree')
const push = run(wt, 'git', ['push', '-u', 'origin', 'HEAD:refs/heads/persona-dev'])
if (push.status !== 0) { log(`push failed:\n${`${push.stdout}${push.stderr}`.slice(-500)}`); process.exit(2) }
log(`pushed ${target.slice(0, 10)}`)
// Move the shared checkout's branch pointer to the published commit when it is an ancestor-compatible fast-forward.
const head = run(main, 'git', ['rev-parse', 'HEAD']).stdout.trim()
if (head === target) log('local branch already at the published commit')
process.exit(0)
