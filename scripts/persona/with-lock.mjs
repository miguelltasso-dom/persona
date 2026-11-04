#!/usr/bin/env node
// Serialize heavy shared-checkout work (builds, desktop launches, packaging) across agents.
//
// Usage: node scripts/persona/with-lock.mjs <label> [--lock <name>] [--release-on <regex>] [--wait-max ms] -- <command> [args...]
//   e.g. node scripts/persona/with-lock.mjs build -- pnpm run build:artifacts
//   App launches: add --release-on so the lock is freed as soon as the app prints its ready line
//   and keeps running without blocking builds, e.g.
//   node scripts/persona/with-lock.mjs "Probe web host" --release-on "dsh web:|DevTools listening" -- pnpm start:web
//
// D-062: there are TWO independent locks, at most one holder of each at a time, so they can run together:
//   `build` (default) = builds, E2E, app launches and the publish gate on the MAIN tree (`.maestri/locks/build.lock`);
//   `pack`            = installer packaging in its own worktree (`persona-push` / `C:\p8*`; `.maestri/locks/pack.lock`).
//   Use `--lock pack` only for packaging (scripts/persona/package-clean.mjs does it by itself).
//
// The lock is the directory `.maestri/locks/<name>.lock` (mkdir is atomic). It records the owner
// label and pid; a lock whose pid is gone is stolen. Default wait is 12 minutes (`--wait-max ms`).
// Queue pulse every 15s → stderr + `.maestri/locks/<name>.queue.json`. The child gets `PERSONA_LOCK=<name>`.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')

const sep = process.argv.indexOf('--')
if (sep < 3 || sep === process.argv.length - 1) {
  console.error('usage: node scripts/persona/with-lock.mjs <label> [--lock build|pack] -- <command> [args...]')
  process.exit(2)
}
const head = process.argv.slice(2, sep)
const releaseIndex = head.indexOf('--release-on')
let releasePattern
if (releaseIndex >= 0) {
  releasePattern = new RegExp(head[releaseIndex + 1] ?? '', 'i')
  head.splice(releaseIndex, 2)
}
const waitMaxIndex = head.indexOf('--wait-max')
const waitMaxMs = waitMaxIndex >= 0 ? Number(head[waitMaxIndex + 1]) : 12 * 60_000
if (waitMaxIndex >= 0) head.splice(waitMaxIndex, 2)
const lockIndex = head.indexOf('--lock')
const lockName = lockIndex >= 0 ? String(head[lockIndex + 1] ?? '') : 'build'
if (lockIndex >= 0) head.splice(lockIndex, 2)
if (!/^[a-z0-9][a-z0-9-]*$/u.test(lockName)) {
  console.error(`[with-lock] invalid --lock name "${lockName}" (use lowercase letters, digits and dashes; known: build, pack)`)
  process.exit(2)
}
const lockDir = join(root, '.maestri', 'locks', `${lockName}.lock`)
const ownerFile = join(lockDir, 'owner.json')
const label = head.join(' ')
const command = process.argv.slice(sep + 1)
const queueFile = join(root, '.maestri', 'locks', `${lockName}.queue.json`)

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

function readOwner() {
  try { return JSON.parse(readFileSync(ownerFile, 'utf8')) } catch { return undefined }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const deadline = Date.now() + (Number.isFinite(waitMaxMs) && waitMaxMs > 0 ? waitMaxMs : 12 * 60_000)
let lastPulse = 0

function writeQueue(state) {
  mkdirSync(dirname(queueFile), { recursive: true })
  writeFileSync(queueFile, `${JSON.stringify(state, null, 2)}\n`)
}

mkdirSync(dirname(lockDir), { recursive: true })
for (;;) {
  try {
    mkdirSync(lockDir)
    writeFileSync(ownerFile, JSON.stringify({ label, pid: process.pid, since: new Date().toISOString(), command: command.join(' ') }))
    writeQueue({ holding: label, pid: process.pid, since: new Date().toISOString(), command: command.join(' ') })
    break
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const owner = readOwner()
    if (owner && !alive(owner.pid)) {
      console.error(`[with-lock:${lockName}] stealing stale lock from "${owner.label}" (pid ${owner.pid} is gone)`)
      rmSync(lockDir, { recursive: true, force: true })
      continue
    }
    if (!owner && existsSync(lockDir)) {
      // The owner file is written right after mkdir; give the winner a moment before judging it stale.
      await sleep(500)
      if (!readOwner()) rmSync(lockDir, { recursive: true, force: true })
      continue
    }
    const remain = Math.max(0, deadline - Date.now())
    writeQueue({
      waiting: label,
      pid: process.pid,
      since: new Date().toISOString(),
      remainMs: remain,
      holder: owner ?? null,
    })
    if (Date.now() > deadline) {
      console.error(`[with-lock:${lockName}] timed out after ${Math.round(waitMaxMs / 1000)}s waiting for "${owner?.label ?? 'unknown'}" (pid ${owner?.pid})`)
      process.exit(75)
    }
    if (Date.now() - lastPulse > 15_000) {
      lastPulse = Date.now()
      console.error(`[with-lock:${lockName}] fila: "${label}" espera "${owner?.label}" desde ${owner?.since} (${Math.round(remain / 1000)}s restantes): ${owner?.command}`)
    }
    await sleep(3000)
  }
}

let released = false
function release() {
  if (released) return
  released = true
  rmSync(lockDir, { recursive: true, force: true })
}
process.on('exit', release)
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => { release(); process.exit(130) })

const child = spawn(command[0], command.slice(1), {
  cwd: root,
  env: { ...process.env, PERSONA_LOCK: lockName },
  stdio: releasePattern ? ['inherit', 'pipe', 'pipe'] : 'inherit',
  shell: process.platform === 'win32',
})
if (releasePattern) {
  const watch = (stream, sink) => {
    let buffer = ''
    stream.on('data', (chunk) => {
      sink.write(chunk)
      buffer = (buffer + chunk.toString()).slice(-4096)
      if (!released && releasePattern.test(buffer)) {
        console.error('[with-lock] ready line seen; releasing the lock while the process keeps running')
        release()
      }
    })
  }
  watch(child.stdout, process.stdout)
  watch(child.stderr, process.stderr)
}
child.on('exit', (code, signal) => {
  release()
  process.exit(code ?? (signal ? 1 : 0))
})
child.on('error', (error) => {
  console.error(`[with-lock] failed to start: ${error.message}`)
  release()
  process.exit(127)
})
