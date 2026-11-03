#!/usr/bin/env node
// Serialize heavy shared-checkout work (builds, desktop launches, packaging) across agents.
//
// Usage: node scripts/persona/with-lock.mjs <label> [--release-on <regex>] -- <command> [args...]
//   e.g. node scripts/persona/with-lock.mjs build -- pnpm run build:artifacts
//   App launches: add --release-on so the lock is freed as soon as the app prints its ready line
//   and keeps running without blocking builds, e.g.
//   node scripts/persona/with-lock.mjs "Probe web host" --release-on "dsh web:|DevTools listening" -- pnpm start:web
//
// The lock is the directory `.maestri/locks/build.lock` (mkdir is atomic). It records the owner
// label and pid; a lock whose pid is gone is stolen. Waits up to 45 minutes.
import { spawn } from 'node:child_process'
import { mkdirSync, rmSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const lockDir = join(root, '.maestri', 'locks', 'build.lock')
const ownerFile = join(lockDir, 'owner.json')

const sep = process.argv.indexOf('--')
if (sep < 3 || sep === process.argv.length - 1) {
  console.error('usage: node scripts/persona/with-lock.mjs <label> -- <command> [args...]')
  process.exit(2)
}
const head = process.argv.slice(2, sep)
const releaseIndex = head.indexOf('--release-on')
let releasePattern
if (releaseIndex >= 0) {
  releasePattern = new RegExp(head[releaseIndex + 1] ?? '', 'i')
  head.splice(releaseIndex, 2)
}
const label = head.join(' ')
const command = process.argv.slice(sep + 1)

function alive(pid) {
  try { process.kill(pid, 0); return true } catch (error) { return error.code === 'EPERM' }
}

function readOwner() {
  try { return JSON.parse(readFileSync(ownerFile, 'utf8')) } catch { return undefined }
}

const sleep = (ms) => new Promise((done) => setTimeout(done, ms))
const deadline = Date.now() + 45 * 60_000
let announced = false

mkdirSync(dirname(lockDir), { recursive: true })
for (;;) {
  try {
    mkdirSync(lockDir)
    writeFileSync(ownerFile, JSON.stringify({ label, pid: process.pid, since: new Date().toISOString(), command: command.join(' ') }))
    break
  } catch (error) {
    if (error.code !== 'EEXIST') throw error
    const owner = readOwner()
    if (owner && !alive(owner.pid)) {
      console.error(`[with-lock] stealing stale lock from "${owner.label}" (pid ${owner.pid} is gone)`)
      rmSync(lockDir, { recursive: true, force: true })
      continue
    }
    if (!owner && existsSync(lockDir)) {
      // The owner file is written right after mkdir; give the winner a moment before judging it stale.
      await sleep(500)
      if (!readOwner()) rmSync(lockDir, { recursive: true, force: true })
      continue
    }
    if (Date.now() > deadline) {
      console.error(`[with-lock] timed out waiting for "${owner?.label ?? 'unknown'}"`)
      process.exit(75)
    }
    if (!announced) {
      console.error(`[with-lock] waiting for "${owner?.label}" (since ${owner?.since}): ${owner?.command}`)
      announced = true
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
