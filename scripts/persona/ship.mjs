#!/usr/bin/env node
// Keel: commit + push the shared working tree when a full typecheck is green.
//
// Eight agents edit one checkout, so any single typecheck can land on a half-written file. This loop reruns the
// typecheck (under the build lock) until it passes, commits immediately, then pushes (the pre-push hook typechecks again).
// Usage: node scripts/persona/ship.mjs "<commit subject>" [attempts]
// Excludes persona-assets/ (the artist's output; committed separately by decision of the Tech Lead/CTO).
import { spawnSync } from 'node:child_process'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const subject = process.argv[2]
const attempts = Number(process.argv[3] ?? 8)
if (!subject) { console.error('usage: node scripts/persona/ship.mjs "<subject>" [attempts]'); process.exit(2) }

const identity = ['-c', 'user.name=miguelltasso-dom', '-c', 'user.email=miguelltasso04@gmail.com']
const run = (cmd, args, options = {}) => spawnSync(cmd, args, { cwd: root, encoding: 'utf8', shell: false, ...options })
const log = (message) => console.log(`[ship ${new Date().toISOString()}] ${message}`)
const sleep = (ms) => Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, ms)

for (let attempt = 1; attempt <= attempts; attempt += 1) {
  log(`attempt ${attempt}/${attempts}: typecheck under lock`)
  const check = run(process.execPath, ['scripts/persona/with-lock.mjs', 'Keel ship typecheck', '--', 'pnpm', 'run', 'typecheck'], { stdio: ['ignore', 'pipe', 'pipe'] })
  if (check.status !== 0) {
    const errors = `${check.stdout}${check.stderr}`.split('\n').filter((line) => /error TS|TypertAnalysisError/.test(line)).slice(0, 6)
    log(`typecheck red (${check.status}); first errors:\n${errors.join('\n') || '(see log)'}`)
    sleep(60_000)
    continue
  }
  log('typecheck green; staging')
  run('git', ['add', '-A', '--', '.', ':!persona-assets', ':!.maestri'])
  const staged = run('git', ['diff', '--cached', '--name-only']).stdout.trim()
  if (staged) {
    const messageFile = join(mkdtempSync(join(tmpdir(), 'ship-')), 'msg.txt')
    writeFileSync(messageFile, `${subject}\n\nTree verified with pnpm run typecheck immediately before this commit.\n\nCo-Authored-By: Claude Sonnet 5.5 <noreply@anthropic.com>\n`)
    const commit = run('git', [...identity, 'commit', '-F', messageFile])
    if (commit.status !== 0) {
      log(`commit failed (hook?):\n${`${commit.stdout}${commit.stderr}`.split('\n').filter((l) => !l.startsWith('warning')).slice(-14).join('\n')}`)
      run('git', ['reset', '--quiet'])
      sleep(60_000)
      continue
    }
    log(`committed ${staged.split('\n').length} files`)
  } else {
    log('nothing new to commit; pushing existing commits')
  }
  const push = run('git', ['push', '-u', 'origin', 'persona-dev'], { stdio: ['ignore', 'pipe', 'pipe'] })
  if (push.status === 0) { log(`pushed:\n${push.stderr.split('\n').slice(-5).join('\n')}`); process.exit(0) }
  log(`push failed:\n${`${push.stdout}${push.stderr}`.split('\n').filter((l) => /error TS|TypertAnalysisError|rejected|fatal|error:/.test(l)).slice(0, 8).join('\n')}`)
  sleep(45_000)
}
log('gave up; tree never settled')
process.exit(1)
