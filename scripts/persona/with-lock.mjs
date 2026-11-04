#!/usr/bin/env node
// Serialize heavy shared-checkout work (builds, desktop launches, packaging) across agents.
//
// Usage: node scripts/persona/with-lock.mjs <label> [--lock <name>] [--slots N] [--exclusive] [--release-on <regex>] [--wait-max ms] -- <command> [args...]
//   e.g. node scripts/persona/with-lock.mjs "Anvil app real" -- node scripts/persona/real-app-shots.mjs
//   App launches: add --release-on so the slot is freed as soon as the app prints its ready line
//   and keeps running without blocking builds, e.g.
//   node scripts/persona/with-lock.mjs "Probe web host" --release-on "dsh web:|DevTools listening" -- pnpm start:web
//
// Independent locks (D-062, D-065, D-067); each one can be held at the same time as the others:
//   `check` (3 slots) = LIGHT work of ONE package: check-pkg, vitest of a package, typert.
//   `build` (2 slots) = starting the app, E2E, client bundle, app build on the MAIN tree. Every app launch MUST use a temp
//                       home and a free port (never the fixed 3080); two of them can run at once.
//                       The publish GATE and anything that rebuilds shared outputs takes the lock with `--exclusive`
//                       (all slots: nobody else runs while it does).
//   `pack`  (1 slot)  = installer packaging in its own worktree (`persona-push` / `C:\p8*`); package-clean.mjs takes it by itself.
// Default slots come from the lock name (override with `--slots N`, 1..8).
//
// A slot is the directory `.maestri/locks/<name>.lock` (slot 0) or `<name>.<i>.lock` (i > 0); mkdir is atomic. It records the
// owner label and pid; a slot whose pid is gone is stolen. Default wait is 12 minutes (`--wait-max ms`). Waiters are served
// FIFO (tickets in `.maestri/locks/<name>.q`). Memory guard: a job only starts with >= 6 GB free RAM (`PERSONA_LOCK_MIN_FREE_GB`).
// When the command ends the slot is released and stale persona vitest trees are reaped (`reap-orphans --kill`).
// Queue pulse every 15s → stderr + `.maestri/locks/<name>.queue.json`. The child gets `PERSONA_LOCK=<name>`.
// While you wait, do NOT sit idle: work the next item of your queue (D-065).
import { spawn, spawnSync } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readFileSync, readdirSync, existsSync } from 'node:fs'
import { freemem } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const DEFAULT_SLOTS = { build: 2, check: 3, pack: 1 }

const sep = process.argv.indexOf('--')
if (sep < 3 || sep === process.argv.length - 1) {
  console.error('usage: node scripts/persona/with-lock.mjs <label> [--lock build|check|pack] [--slots N] [--exclusive] -- <command> [args...]')
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
const exclusiveIndex = head.indexOf('--exclusive')
const exclusive = exclusiveIndex >= 0
if (exclusive) head.splice(exclusiveIndex, 1)
const slotsIndex = head.indexOf('--slots')
const explicitSlots = slotsIndex >= 0 ? Number(head[slotsIndex + 1]) : undefined
if (slotsIndex >= 0) head.splice(slotsIndex, 2)
const lockIndex = head.indexOf('--lock')
const lockName = lockIndex >= 0 ? String(head[lockIndex + 1] ?? '') : 'build'
if (lockIndex >= 0) head.splice(lockIndex, 2)
if (!/^[a-z0-9][a-z0-9-]*$/u.test(lockName)) {
  console.error(`[with-lock] invalid --lock name "${lockName}" (use lowercase letters, digits and dashes; known: build, check, pack)`)
  process.exit(2)
}
const slots = explicitSlots ?? DEFAULT_SLOTS[lockName] ?? 1
if (!Number.isInteger(slots) || slots < 1 || slots > 8) {
  console.error(`[with-lock] invalid --slots "${slots}" (1..8)`)
  process.exit(2)
}
const locksRoot = join(root, '.maestri', 'locks')
// slot 0 keeps the legacy name `<name>.lock` so holders/waiters running older copies of this script still exclude each other there
const slotDirs = Array.from({ length: slots }, (_, index) => join(locksRoot, index === 0 ? `${lockName}.lock` : `${lockName}.${index}.lock`))
const label = head.join(' ')
const command = process.argv.slice(sep + 1)
const queueFile = join(locksRoot, `${lockName}.queue.json`)
const minFreeBytes = (Number(process.env.PERSONA_LOCK_MIN_FREE_GB) || 6) * 1024 ** 3

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

function readOwnerOf(dir) {
  try { return JSON.parse(readFileSync(join(dir, 'owner.json'), 'utf8')) } catch { return undefined }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const deadline = Date.now() + (Number.isFinite(waitMaxMs) && waitMaxMs > 0 ? waitMaxMs : 12 * 60_000)
let lastPulse = 0

function writeQueue(state) {
  mkdirSync(dirname(queueFile), { recursive: true })
  writeFileSync(queueFile, `${JSON.stringify(state, null, 2)}\n`)
}

const held = []
let released = false
function release() {
  if (released) return
  released = true
  for (const dir of held) rmSync(dir, { recursive: true, force: true })
}

// FIFO fairness (04/11: a P0 waiter starved for 20 min because the 3 s polling races let newer waiters win): every waiter
// registers a ticket `<arrival-ms>-<pid>.json` and only the OLDEST ALIVE ticket may try to take a slot. Tickets of dead
// pids are swept; a ticket is dropped when the slots are taken, on timeout and on exit.
const waitersDir = join(locksRoot, `${lockName}.q`)
const ticketFile = join(waitersDir, `${String(Date.now()).padStart(15, '0')}-${String(process.pid).padStart(8, '0')}.json`)
function dropTicket() { try { rmSync(ticketFile, { force: true }) } catch { /* already gone */ } }
function isHead() {
  let names
  try { names = readdirSync(waitersDir).filter((name) => name.endsWith('.json')).sort() } catch { return true }
  for (const name of names) {
    const pid = Number(name.slice(16, 24))
    if (!Number.isInteger(pid) || (pid !== process.pid && !alive(pid))) { try { rmSync(join(waitersDir, name), { force: true }) } catch { /* raced */ } continue }
    return pid === process.pid
  }
  return true
}
mkdirSync(waitersDir, { recursive: true })
writeFileSync(ticketFile, JSON.stringify({ pid: process.pid, label, since: new Date().toISOString() }))
process.on('exit', () => { dropTicket(); release() })
for (const signal of ['SIGINT', 'SIGTERM', 'SIGBREAK']) process.on(signal, () => { dropTicket(); release(); process.exit(130) })

/**
 * One pass over the slots: take a free one (all of them in exclusive mode), steal a stale one, or report who holds them.
 * @returns {{ acquired: boolean, retry?: boolean, settle?: string, holders?: object[] }}
 */
function tryAcquire() {
  const holders = []
  for (const dir of slotDirs) {
    if (held.includes(dir)) continue
    try {
      mkdirSync(dir)
      held.push(dir)
      const since = new Date().toISOString()
      writeFileSync(join(dir, 'owner.json'), JSON.stringify({ label, pid: process.pid, since, command: command.join(' ') }))
      if (!exclusive) { writeQueue({ holding: label, pid: process.pid, since, command: command.join(' ') }); return { acquired: true } }
    } catch (error) {
      if (error.code !== 'EEXIST') throw error
      const owner = readOwnerOf(dir)
      if (owner && !alive(owner.pid)) {
        console.error(`[with-lock:${lockName}] stealing stale lock from "${owner.label}" (pid ${owner.pid} is gone)`)
        rmSync(dir, { recursive: true, force: true })
        return { acquired: false, retry: true }
      }
      // The owner file is written right after mkdir; give the winner a moment before judging it stale.
      if (!owner && existsSync(dir)) return { acquired: false, settle: dir }
      holders.push(owner)
    }
  }
  if (exclusive && held.length === slotDirs.length) {
    writeQueue({ holding: label, pid: process.pid, since: new Date().toISOString(), command: command.join(' '), exclusive: true })
    return { acquired: true }
  }
  return { acquired: false, holders }
}

mkdirSync(locksRoot, { recursive: true })
for (;;) {
  if (!isHead()) {
    const owner = slotDirs.map(readOwnerOf).find(Boolean)
    if (Date.now() > deadline) {
      console.error(`[with-lock:${lockName}] timed out after ${Math.round(waitMaxMs / 1000)}s in the queue behind older waiters`)
      dropTicket()
      release()
      process.exit(75)
    }
    if (Date.now() - lastPulse > 15_000) {
      lastPulse = Date.now()
      console.error(`[with-lock:${lockName}] fila (ordem de chegada): "${label}" espera a vez; segurando: "${owner?.label ?? 'ninguém'}"`)
    }
    await sleep(2000)
    continue
  }
  // memory guard: do not start a heavy job on a starved machine (the head waits, so the order is kept)
  if (held.length === 0 && freemem() < minFreeBytes) {
    if (Date.now() > deadline) {
      console.error(`[with-lock:${lockName}] timed out after ${Math.round(waitMaxMs / 1000)}s waiting for free memory (>= ${Math.round(minFreeBytes / 1024 ** 3)} GB)`)
      dropTicket()
      process.exit(75)
    }
    if (Date.now() - lastPulse > 15_000) {
      lastPulse = Date.now()
      console.error(`[with-lock:${lockName}] memória livre ${(freemem() / 1024 ** 3).toFixed(1)} GB < ${Math.round(minFreeBytes / 1024 ** 3)} GB: "${label}" espera`)
    }
    await sleep(3000)
    continue
  }
  const pass = tryAcquire()
  if (pass.acquired) { dropTicket(); break }
  if (pass.retry) continue
  if (pass.settle !== undefined) {
    await sleep(500)
    if (existsSync(pass.settle) && readOwnerOf(pass.settle) === undefined) rmSync(pass.settle, { recursive: true, force: true })
    continue
  }
  const holders = pass.holders ?? []
  const owner = holders[0]
  const remain = Math.max(0, deadline - Date.now())
  writeQueue({
    waiting: label,
    pid: process.pid,
    since: new Date().toISOString(),
    remainMs: remain,
    holder: owner ?? null,
    ...(holders.length > 1 ? { holders } : {}),
    ...(exclusive ? { exclusive: true, slotsHeldByMe: held.length } : {}),
  })
  if (Date.now() > deadline) {
    console.error(`[with-lock:${lockName}] timed out after ${Math.round(waitMaxMs / 1000)}s waiting for "${owner?.label ?? 'unknown'}" (pid ${owner?.pid})`)
    dropTicket()
    release()
    process.exit(75)
  }
  if (Date.now() - lastPulse > 15_000) {
    lastPulse = Date.now()
    console.error(`[with-lock:${lockName}] fila: "${label}"${exclusive ? ' (exclusivo)' : ''} espera "${owner?.label}" desde ${owner?.since} (${Math.round(remain / 1000)}s restantes): ${owner?.command}`)
  }
  await sleep(3000)
}

/** Best effort: kill persona vitest trees that outlived their job (reap-orphans never touches hosts, Maestri or agent CLIs). */
function reapOrphans() {
  if (process.env.PERSONA_LOCK_NO_REAP === '1') return
  try { spawnSync(process.execPath, [join(root, 'scripts', 'persona', 'reap-orphans.mjs'), '--kill'], { cwd: root, stdio: 'ignore', timeout: 30_000, windowsHide: true }) } catch { /* informative only */ }
}

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
  reapOrphans()
  process.exit(code ?? (signal ? 1 : 0))
})
child.on('error', (error) => {
  console.error(`[with-lock] failed to start: ${error.message}`)
  release()
  process.exit(127)
})
