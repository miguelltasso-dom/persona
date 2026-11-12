#!/usr/bin/env node
// Pre-push entry (Keel; D-060). Replaces the bare `pnpm run typecheck` of lefthook's pre-push job:
//  - pushes made by the Persona publish flow (PERSONA_PUSH_GATE=persona) are checked by the PERSONA GATE (scripts/persona/persona-gate.mjs):
//    a stamp from a successful gate run on the SAME tree is accepted, otherwise the gate runs now;
//  - every other push keeps the upstream behaviour: the full-monorepo typecheck.
// The full typecheck on persona-dev becomes a nightly/informative job (scripts/persona/nightly-typecheck.mjs).
import { spawnSync } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const run = (cmd, args) => spawnSync(cmd, args, { cwd: root, stdio: 'inherit', shell: process.platform === 'win32' && cmd === 'pnpm' })

if (process.env.PERSONA_PUSH_GATE !== 'persona') {
  process.exit(run('pnpm', ['run', 'typecheck']).status ?? 1)
}

// Head closure (Gauge, Keel 12/11): a stamp covers the tree the gate ran on, but the COMMIT is what leaves. Every relative import of HEAD must resolve inside HEAD (a new file
// left without `git add` builds here and breaks the push). A few seconds of pure git, so it runs on EVERY persona push, stamp or not.
if (run('node', ['scripts/persona/check-head-closure.mjs']).status !== 0) {
  console.error('[pre-push] head closure FAILED: a relative import of HEAD does not resolve inside HEAD (a new file not added to the commit?). Fix and commit.')
  process.exit(1)
}

const stampPath = join(root, '.maestri', 'tmp', 'persona-gate-ok.json')
const tree = spawnSync('git', ['rev-parse', 'HEAD^{tree}'], { cwd: root, encoding: 'utf8' }).stdout.trim()
if (existsSync(stampPath)) {
  try {
    const stamp = JSON.parse(readFileSync(stampPath, 'utf8'))
    if (stamp.tree === tree && stamp.skippedSmoke !== true && stamp.content === true) { // content: a stamp from before the clean-room/lint steps existed is not enough
      console.log(`[pre-push] persona gate already passed for tree ${tree.slice(0, 10)} (${stamp.at}); accepting`)
      process.exit(0)
    }
  } catch { /* unreadable stamp: run the gate */ }
}
console.log('[pre-push] no valid persona gate stamp for this tree; running the persona gate')
process.exit(run('node', ['scripts/persona/persona-gate.mjs']).status ?? 1)
