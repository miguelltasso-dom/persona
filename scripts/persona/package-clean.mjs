#!/usr/bin/env node
/**
 * D8 packaging from a CLEAN worktree of the last published green commit
 * (origin/persona-dev), same method as scripts/persona/publish.mjs (D-049).
 *
 * Never packages the shared dirty checkout (GOVERNANCE in flight).
 * D-071: no source file is copied from the shared checkout into the worktree. Whatever the installer needs is IN the commit;
 * the few build adaptations that remain live in scripts/persona/package-clean-overlay.mjs (read its header).
 *
 *   node scripts/persona/package-clean.mjs [--commit <rev>] ...
 *     (D-062: it takes the `pack` lock by itself; do NOT wrap it in the `build` lock — that one is for builds/E2E/gate)
 *
 * Options: --commit <rev>  --dir  --resume --proof <proof.json>  --no-install  --no-overlay
 * Exit: 0 Setup/exe ready, 1 typecheck/package red, 2 setup failure.
 *
 * Final state is ALWAYS recorded (scripts/persona/pack-state.mjs): C:\p8c\package-clean.live.json carries `pid`, `state`
 * (running|ok|failed|killed) and `ended { at, ok, reason }`; any end Node can see (exit, SIGINT/SIGTERM/SIGBREAK, uncaught
 * exception, unhandled rejection) also writes C:\p8c\package-clean.json with the commit and the reason. A hard kill
 * (taskkill /F) cannot be caught: `node scripts/persona/pack-status.mjs` reports "died (pid X gone at stage Y)".
 */
import { spawn, spawnSync } from 'node:child_process'
import { appendFileSync, copyFileSync, existsSync, mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { constants as osConstants, setPriority } from 'node:os'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { applyOverlay } from './package-clean-overlay.mjs'
import { prepareWarmWorktree, writeMarker } from './package-clean-warm.mjs'
import { runInstallTrial } from './install-trial.mjs'
import { createPackState, installDeathHandlers } from './pack-state.mjs'

const main = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
// PERSONA_PACK_CACHE exists so tests can run the real script without touching the shared records in C:\p8c.
const CACHE = process.env.PERSONA_PACK_CACHE ?? 'C:\\p8c'
const argv = process.argv.slice(2)
const wantDir = argv.includes('--dir')
const wantResume = argv.includes('--resume')
const proofFlag = argv.indexOf('--proof')
const noInstall = argv.includes('--no-install')
const noOverlay = argv.includes('--no-overlay')
const commitFlag = argv.indexOf('--commit')
const requested = commitFlag >= 0 ? argv[commitFlag + 1] : 'origin/persona-dev'
// Warm start (package-clean-warm.mjs): advance an older PACK worktree in place instead of building a new one. Falls back to the clean pack on any doubt.
const warmFlag = argv.indexOf('--warm-from')
const warmFrom = warmFlag >= 0 ? argv[warmFlag + 1] : undefined
// Below-normal CPU priority for the whole pack tree (children inherit it): lets captures and tests keep the machine while a rehearsal runs.
const lowPriority = argv.includes('--low-priority')

if (wantResume && (wantDir || proofFlag < 0 || !argv[proofFlag + 1])) {
  console.error('[package-clean] --resume requires --proof <proof.json> and cannot be combined with --dir')
  process.exit(2)
}
if (warmFlag >= 0 && (warmFrom === undefined || warmFrom.startsWith('--') || wantResume)) {
  console.error('[package-clean] --warm-from needs the path of an older pack worktree and cannot be combined with --resume')
  process.exit(2)
}

const PACK_LOG = join(CACHE, 'package-clean.log')
const LIVE = join(CACHE, 'package-clean.live.json')

// D-062: packaging runs in its own worktree (persona-push / C:\p8*), so it holds ITS OWN lock (`pack`) and never the global
// `build` lock (that one belongs to builds, E2E and the publish gate on the main tree, which must keep running meanwhile).
if (process.env.PERSONA_LOCK === 'build') {
  console.error('[package-clean] do not wrap this script in the `build` lock (D-062). Run it directly: node scripts/persona/package-clean.mjs ...')
  process.exit(2)
}
if (process.env.PERSONA_LOCK !== 'pack') {
  const locked = spawnSync('node', [
    join(main, 'scripts', 'persona', 'with-lock.mjs'), 'Rivet D8 package-clean', '--lock', 'pack', '--exclusive', '--wait-max', String(90 * 60_000),
    '--', 'node', fileURLToPath(import.meta.url), ...argv,
  ], { cwd: main, stdio: 'inherit', windowsHide: true })
  process.exit(locked.status ?? 1)
}

const run = (cwd, cmd, args, options = {}) => spawnSync(cmd, args, {
  cwd, encoding: 'utf8', windowsHide: true, maxBuffer: 1 << 28,
  shell: process.platform === 'win32' && cmd === 'pnpm',
  ...options,
})
/** Created once the run really starts (not for --help or the lock wrapper), so it never clobbers another run's records. */
let packState
/** The pnpm/electron-builder process tree currently streaming; killed with the run on SIGINT/SIGTERM/SIGBREAK. */
let activeChild
const log = (message) => {
  const line = `[package-clean ${new Date().toISOString()}] ${message}`
  console.log(line)
  mkdirSync(CACHE, { recursive: true })
  appendFileSync(PACK_LOG, `${line}\n`)
  packState?.noteLog(message.split('\n')[0].slice(0, 200))
}

function live(stage, extra = {}) {
  packState?.update(stage, extra)
}

function killActiveChild() {
  if (activeChild?.pid !== undefined) spawnSync('taskkill', ['/PID', String(activeChild.pid), '/T', '/F'], { windowsHide: true })
}

/**
 * Run a long child with streamed stdout/stderr into the live log.
 * @param cwd - Working directory.
 * @param cmd - Executable.
 * @param args - argv.
 * @param timeoutMs - Kill after this many ms.
 * @param env - Extra env.
 */
function streamRun(cwd, cmd, args, timeoutMs, env = {}, stallMs = 20 * 60_000) {
  return new Promise((resolvePromise) => {
    const child = spawn(cmd, args, {
      cwd, windowsHide: true, env: { ...process.env, ...env },
      stdio: ['ignore', 'pipe', 'pipe'],
    })
    activeChild = child
    let stdout = ''
    let stderr = ''
    const startedAt = Date.now()
    let lastChunkAt = Date.now()
    const onChunk = (chunk, sink) => {
      lastChunkAt = Date.now()
      const text = chunk.toString('utf8')
      sink.write(text)
      appendFileSync(PACK_LOG, text)
      if (sink === process.stdout) stdout += text
      else stderr += text
      if (stdout.length > 1 << 20) stdout = stdout.slice(-500_000)
      if (stderr.length > 1 << 20) stderr = stderr.slice(-500_000)
      live('pack', { elapsedMs: Date.now() - startedAt, last: text.trim().slice(-160) })
    }
    child.stdout.on('data', chunk => onChunk(chunk, process.stdout))
    child.stderr.on('data', chunk => onChunk(chunk, process.stderr))
    const pulse = setInterval(() => {
      const silentMs = Date.now() - lastChunkAt
      log(`heartbeat pack ${Math.round((Date.now() - startedAt) / 1000)}s elapsed, ${Math.round(silentMs / 1000)}s since last line`)
      live('pack', { elapsedMs: Date.now() - startedAt, silentMs, last: '(heartbeat)' })
      if (silentMs > stallMs) {
        log(`stage stall ${stallMs}ms without output — killing ${cmd} ${args.join(' ')}`)
        child.kill('SIGTERM')
        setTimeout(() => child.kill('SIGKILL'), 8_000)
      }
    }, 60_000)
    const killer = setTimeout(() => {
      log(`stage timeout ${timeoutMs}ms — killing ${cmd} ${args.join(' ')}`)
      child.kill('SIGTERM')
      setTimeout(() => child.kill('SIGKILL'), 8_000)
    }, timeoutMs)
    const finish = (result) => {
      clearTimeout(killer)
      clearInterval(pulse)
      if (activeChild === child) activeChild = undefined
      resolvePromise(result)
    }
    child.on('close', (status) => finish({ status, stdout, stderr }))
    child.on('error', (error) => finish({ status: 1, stdout, stderr: `${stderr}\n${error.message}` }))
  })
}

function findArtifact(root, pattern) {
  const listed = run(root, 'cmd.exe', ['/c', 'dir', '/b', '/s', root])
  return (listed.stdout ?? '').split(/\r?\n/u).map(line => line.trim()).find(line => pattern.test(line))
}

/**
 * Silent install/uninstall check of the Setup (scripts/persona/install-trial.mjs). It must never take the pack run down with it:
 * a cleanup problem (the temp dir still in use) is a warning inside the result, and anything unexpected becomes `{ error }`.
 * @param setup - Setup path.
 */
function installTrial(setup) {
  try {
    const trial = runInstallTrial(setup)
    return { ...trial, exePresent: trial.installed.exe, exe: trial.installed.exe ? join(trial.dest, 'Persona.exe') : null }
  } catch (error) {
    log(`install trial could not run: ${error instanceof Error ? error.message : String(error)}`)
    return { error: error instanceof Error ? error.message : String(error), exePresent: false, exe: null }
  }
}

if (argv.includes('--help')) {
  process.stdout.write('usage: node scripts/persona/package-clean.mjs [--commit origin/persona-dev] [--dir] [--resume] [--no-install] [--no-overlay] [--warm-from <C:\\p8w...>] [--low-priority]\n')
  process.exit(0)
}

mkdirSync(CACHE, { recursive: true })
writeFileSync(PACK_LOG, '')
const started = Date.now()
packState = createPackState({ liveFile: LIVE, reportFile: join(CACHE, 'package-clean.json'), requested, resume: wantResume, logPath: PACK_LOG })
installDeathHandlers(packState, { kill: killActiveChild })
if (lowPriority) {
  try {
    setPriority(0, osConstants.priority.PRIORITY_BELOW_NORMAL)
    log('running at BELOW_NORMAL priority (pnpm, tsc, electron-builder inherit it)')
  } catch (error) {
    log(`could not lower the priority: ${error instanceof Error ? error.message : String(error)}`)
  }
}
live('resolve', { requested })
// `git rev-parse <unknown>` echoes its argument and fails, so check the status: --verify --quiet <rev>^{commit} prints only a real commit.
const resolvedRev = run(main, 'git', ['rev-parse', '--verify', '--quiet', `${requested}^{commit}`])
const target = resolvedRev.status === 0 ? resolvedRev.stdout.trim() : ''
if (!target) {
  log(`cannot resolve ${requested}`)
  process.exit(2)
}
packState.setCommit(target)
log(`target ${target.slice(0, 10)} ${run(main, 'git', ['log', '-1', '--format=%s', target]).stdout.trim()}`)
// D-071: the installer comes from a PUBLISHED commit. Local-only commits still pack (the isolated worktree makes that safe), but say so.
const published = run(main, 'git', ['branch', '-r', '--contains', target]).stdout.trim().length > 0
log(published ? 'commit is on a remote branch (published)' : 'WARNING: commit is not on any remote branch (D-071 expects a published, green commit)')

let wt = `C:\\p8w${target.slice(0, 10)}`
const previousReport = wantResume ? JSON.parse(readFileSync(join(CACHE, 'package-clean.json'), 'utf8')) : undefined
// A warm pack advanced an OLDER worktree in place, so its name is not the commit's: the NSIS step reuses the worktree the --dir step recorded.
if (previousReport?.commit === target && typeof previousReport.worktree === 'string' && existsSync(previousReport.worktree)) wt = previousReport.worktree
let warm = { mode: 'clean' }
if (warmFrom !== undefined && !existsSync(wt)) {
  const advanced = prepareWarmWorktree({ main, candidate: warmFrom, target, run })
  if (advanced.ok) {
    wt = advanced.path
    warm = { mode: 'warm', from: advanced.from, changedFiles: advanced.changedFiles }
    log(`warm start: ${wt} advanced ${advanced.from.slice(0, 10)} -> ${target.slice(0, 10)} in place (${String(advanced.changedFiles)} files differ, no dependency input changed)`)
  } else {
    warm = { mode: 'clean', refused: advanced.reason }
    // --warm-strict: a rehearsal that must measure the warm path stops instead of quietly building (and filling the disk with) a clean worktree.
    if (argv.includes('--warm-strict')) {
      log(`warm start refused (${advanced.reason}); --warm-strict: stopping, nothing was built`)
      packState.finalize({ state: 'failed', stage: 'warm-refused', reason: `warm refused: ${advanced.reason}`.slice(0, 200), extra: {} })
      process.exit(2)
    }
    log(`warm start refused (${advanced.reason}); falling back to a clean worktree`)
  }
}
if (!existsSync(wt)) {
  const created = run(main, 'git', ['worktree', 'add', '--detach', wt, target])
  if (created.status !== 0) {
    log(`worktree add failed: ${(created.stderr || created.stdout).slice(-400)}`)
    process.exit(2)
  }
}
const current = run(wt, 'git', ['rev-parse', 'HEAD']).stdout.trim()
if (current !== target) {
  throw new Error(`pack worktree ${wt} belongs to ${current}; expected ${target}`)
}
const short = { ok: true, path: wt, detail: 'isolated worktree at explicit commit' }
log(`worktree ${wt} junction ${short.path} (${short.detail})`)

if (!existsSync(join(wt, 'node_modules'))) {
  if (wantResume) throw new Error('Cannot resume without the prepared worktree dependencies')
  live('install', {})
  log('installing dependencies in the clean worktree (frozen lockfile)')
  const install = run(wt, 'pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], { timeout: 20 * 60_000 })
  if (install.status !== 0) {
    log(`install failed:\n${`${install.stdout}${install.stderr}`.slice(-600)}`)
    process.exit(2)
  }
}

live('overlay', {})
const previous = previousReport
const proof = wantResume ? JSON.parse(readFileSync(resolve(argv[proofFlag + 1]), 'utf8')) : undefined
if (wantResume && (previous?.ok !== true || previous.commit !== target || typeof previous.exe !== 'string'
  || !existsSync(previous.exe) || proof?.commit !== target || !Array.isArray(proof.results)
  || !proof.results.some(row => row.dark === false && row.consoleErrors?.length === 0 && row.vault?.ok === true)
  // ENG-1: the NSIS is built only from a --dir whose AI engines loaded with the exe's own node and ran a turn through resolveRunner.
  || !Array.isArray(proof.engineGate?.runtimeImports) || proof.engineGate.runtimeImports.length === 0
  || !proof.engineGate.runtimeImports.every(row => row.ok === true) || proof.engineGate.runnerTurn !== 'ok'
  || resolve(proof.archive) !== resolve(dirname(previous.exe), 'resources', 'app.asar'))) {
  throw new Error('Cannot resume: unpacked executable and successful light/vault proof (with the ENG-1 engine gate: runtime imports ok + stub turn ok) must match the requested commit')
}
const overlayResult = wantResume
  ? { applied: previous.overlay ?? [], inSource: previous.overlayInSource ?? [] }
  : noOverlay ? { applied: [], inSource: [] } : applyOverlay(wt)
const overlay = overlayResult.applied
log(`overlay applied: ${overlay.join(', ') || 'none (D-071: nothing copied from the shared checkout)'}`)
log(`overlay already in commit: ${overlayResult.inSource.join(', ') || 'none'}`)

const pnpmEntry = join(wt, 'node_modules/pnpm/bin/pnpm.cjs')
const desktop = join(wt, 'apps', 'desktop')
const packArgs = wantResume
  ? ['exec', 'electron-builder', '--config', 'electron-builder.config.mjs', '--win', 'nsis', '--x64', '--publish', 'never',
    '--prepackaged', dirname(previous.exe)]
  : ['exec', 'tsx', 'scripts/package-target.ts', 'win-x64', '--unsigned', '--skip-smoke']
if (wantDir) packArgs.push('--dir')
log(`pack ${packArgs.join(' ')} (stream → ${PACK_LOG})`)
live('pack', { args: packArgs.join(' ') })
const packed = await streamRun(desktop, process.execPath, [pnpmEntry, ...packArgs], 90 * 60_000, {
  npm_execpath: pnpmEntry,
  DSH_DESKTOP_UNSIGNED: '1',
  CSC_IDENTITY_AUTO_DISCOVERY: 'false',
  DSH_DESKTOP_PACKAGE_CACHE_DIR: CACHE,
  ...(wantResume ? { DSH_DESKTOP_APP_ID: 'com.persona.desktop', DSH_DESKTOP_TARGET_PLATFORM: 'win32',
    DSH_DESKTOP_TARGET_ARCH: 'x64', ELECTRON_BUILDER_7Z_FILTER: 'BCJ' } : {}),
})
const packLog = PACK_LOG
log(`pack exit ${packed.status}`)
const artifactRoot = join(desktop, '.desktop-build')
const setup = findArtifact(artifactRoot, /persona-.*-win-x64-unsigned\.exe$/iu)
  ?? findArtifact(artifactRoot, /Persona-Setup\.exe$/iu)
const exe = findArtifact(artifactRoot, /win-unpacked\\Persona\.exe$/iu)
const preparedDsh = join(desktop, '.desktop-build', 'targets', 'win-x64', 'dsh')
const personaRuntime = {
  root: preparedDsh,
  personaApp: existsSync(join(preparedDsh, 'node_modules/@deepseek-ai/dsh-persona-app/cordis.patch.yml')),
  clientJs: existsSync(join(preparedDsh, 'node_modules/@deepseek-ai/dsh-client-ui-persona/lib/client.js')),
}
let setupCopy
if (setup !== undefined) {
  setupCopy = join(CACHE, 'Persona-Setup.exe')
  copyFileSync(setup, setupCopy)
}

let trial
if (!noInstall && !wantDir && setup !== undefined) {
  log(`install trial ${setup}`)
  trial = installTrial(setup)
}

const packOk = packed.status === 0 && (wantDir ? exe !== undefined : setup !== undefined)
// A finished --dir pack makes this worktree a known-good base for the next --warm-from (node_modules, .tsbuildinfo, extracted Electron).
if (packOk && wantDir) {
  try { writeMarker(run, wt, target, { elapsedMs: Date.now() - started, mode: warm.mode }) } catch (error) { log(`could not record the warm-base marker: ${error instanceof Error ? error.message : String(error)}`) }
}
const report = {
  ok: packOk,
  commit: target,
  requested,
  warm,
  lowPriority,
  worktree: wt,
  shortWorktree: short,
  cache: CACHE,
  overlay,
  overlayInSource: overlayResult.inSource,
  published,
  unsigned: true,
  adminInstall: false,
  windowFrameOptional: true,
  nsis: { perMachine: false, allowElevation: false, packElevateHelper: false },
  elapsedMs: Date.now() - started,
  packageExit: packed.status,
  setup: setup ?? null,
  setupCopy: setupCopy ?? null,
  setupBytes: setup !== undefined ? statSync(setup).size : null,
  exe: exe ?? null,
  skipSmoke: true,
  personaRuntime,
  logPath: packLog,
  trial: trial ?? null,
  tail: `${packed.stderr ?? ''}\n${packed.stdout ?? ''}`.slice(-2_500),
}
writeFileSync(join(CACHE, 'package-clean.json'), `${JSON.stringify(report, null, 2)}\n`)
packState.markReportWritten()
packState.finalize({
  state: report.ok ? 'ok' : 'failed',
  stage: report.ok ? 'done' : 'failed',
  reason: report.ok ? 'ok' : `pack exit ${String(packed.status)}${report.exe === null && wantDir ? ' (no win-unpacked exe)' : ''}`,
  extra: { setup: report.setup, setupBytes: report.setupBytes },
})
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
process.exit(report.ok ? 0 : packed.status === 0 ? 2 : 1)
