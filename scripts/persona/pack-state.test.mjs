// node --test scripts/persona/pack-state.test.mjs
import assert from 'node:assert/strict'
import { spawn, spawnSync } from 'node:child_process'
import { EventEmitter } from 'node:events'
import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { createPackState, describePackStatus, endRecords, installDeathHandlers, readJson, recordDeath } from './pack-state.mjs'

const HERE = fileURLToPath(new URL('.', import.meta.url))
const MODULE_URL = pathToFileURL(join(HERE, 'pack-state.mjs')).href
const STATUS_CLI = join(HERE, 'pack-status.mjs')

function fixture() {
  const dir = mkdtempSync(join(tmpdir(), 'pack-state-'))
  return { dir, liveFile: join(dir, 'package-clean.live.json'), reportFile: join(dir, 'package-clean.json'), cleanup: () => rmSync(dir, { recursive: true, force: true }) }
}
function clock(start = '2026-11-04T20:00:00.000Z') {
  let at = Date.parse(start)
  return { now: () => new Date(at), tick: (ms) => { at += ms } }
}
const stateFor = (f, extra = {}) => createPackState({ liveFile: f.liveFile, reportFile: f.reportFile, requested: 'H', minIntervalMs: 0, ...extra })

test('update records pid, state running, stage, start time and the commit', () => {
  const f = fixture()
  try {
    const state = stateFor(f, { pid: 4242, ...clock() })
    state.setCommit('71b87a1d18')
    state.update('install', { note: 'x' })
    assert.deepEqual(readJson(f.liveFile), {
      pid: 4242, startedAt: '2026-11-04T20:00:00.000Z', requested: 'H', resume: false, state: 'running', stage: 'install',
      at: '2026-11-04T20:00:00.000Z', commit: '71b87a1d18', note: 'x',
    })
  } finally { f.cleanup() }
})

test('streaming updates inside one stage are throttled, a new stage is always written', () => {
  const f = fixture()
  try {
    const c = clock()
    const state = createPackState({ liveFile: f.liveFile, reportFile: f.reportFile, requested: 'H', minIntervalMs: 400, ...c })
    state.update('pack', { n: 1 })
    c.tick(100)
    state.update('pack', { n: 2 })
    assert.equal(readJson(f.liveFile).n, 1)
    c.tick(400)
    state.update('pack', { n: 3 })
    assert.equal(readJson(f.liveFile).n, 3)
    c.tick(10)
    state.update('overlay', { n: 4 })
    assert.equal(readJson(f.liveFile).stage, 'overlay')
  } finally { f.cleanup() }
})

test('a normal end records ok and leaves the report the pack wrote', () => {
  const f = fixture()
  try {
    const state = stateFor(f, clock())
    state.setCommit('abc')
    state.update('pack')
    writeFileSync(f.reportFile, JSON.stringify({ ok: true, commit: 'abc', marker: 'normal-report' }))
    state.markReportWritten()
    state.finalize({ state: 'ok', stage: 'done', reason: 'ok', extra: { setup: 'S.exe', setupBytes: 7 } })
    const live = readJson(f.liveFile)
    assert.equal(live.state, 'ok')
    assert.equal(live.stage, 'done')
    assert.deepEqual(live.ended, { at: '2026-11-04T20:00:00.000Z', ok: true, reason: 'ok' })
    assert.equal(live.setup, 'S.exe')
    assert.equal(readJson(f.reportFile).marker, 'normal-report')
  } finally { f.cleanup() }
})

test('a death writes live AND the report with commit and reason; only the first end counts; updates cannot undo it', () => {
  const f = fixture()
  try {
    const state = stateFor(f, { pid: 7, ...clock() })
    state.setCommit('71b87a1d18')
    state.update('pack')
    state.finalize({ state: 'killed', reason: 'received SIGTERM' })
    state.finalize({ state: 'ok', reason: 'too late' })
    state.update('install')
    const live = readJson(f.liveFile)
    assert.equal(live.state, 'killed')
    assert.equal(live.stage, 'pack')
    assert.equal(live.ended.reason, 'received SIGTERM')
    assert.equal(live.ended.ok, false)
    const report = readJson(f.reportFile)
    assert.deepEqual({ ok: report.ok, commit: report.commit, state: report.state, stage: report.stage, reason: report.reason, pid: report.pid },
      { ok: false, commit: '71b87a1d18', state: 'killed', stage: 'pack', reason: 'received SIGTERM', pid: 7 })
  } finally { f.cleanup() }
})

test('death before the commit is known records the requested rev', () => {
  const f = fixture()
  try {
    const state = stateFor(f, { requested: 'origin/persona-dev', ...clock() })
    state.update('resolve')
    state.noteLog('cannot resolve origin/persona-dev')
    state.finalize({ state: 'failed', reason: state.exitReason(2) })
    assert.equal(readJson(f.reportFile).commit, 'origin/persona-dev')
    assert.equal(readJson(f.reportFile).reason, 'exit code 2: cannot resolve origin/persona-dev')
  } finally { f.cleanup() }
})

test('a --resume that dies keeps the earlier validated report usable (ok stays true) and records what happened', () => {
  const f = fixture()
  try {
    writeFileSync(f.reportFile, JSON.stringify({ ok: true, commit: 'abc', exe: 'C:/x/Persona.exe', overlay: ['a'] }))
    const state = stateFor(f, { resume: true, ...clock() })
    state.setCommit('abc')
    state.update('pack')
    state.finalize({ state: 'killed', reason: 'received SIGINT' })
    const report = readJson(f.reportFile)
    assert.equal(report.ok, true)
    assert.equal(report.exe, 'C:/x/Persona.exe')
    assert.equal(report.lastResume.state, 'killed')
    assert.equal(report.lastResume.reason, 'received SIGINT')
    assert.equal(readJson(f.liveFile).state, 'killed')
  } finally { f.cleanup() }
})

test('endRecords: an ok end never rewrites the report', () => {
  const records = endRecords({ pid: 1, commit: 'c', stage: 'pack' }, { state: 'ok', reason: 'ok', at: 'T' }, { ok: false }, false)
  assert.equal(records.report, undefined)
  assert.equal(records.live.state, 'ok')
})

/** A process-like emitter whose exit() is recorded instead of leaving the test runner. */
function fakeProcess() {
  const proc = new EventEmitter()
  const exits = []
  return { proc, exits, exit: (code) => { exits.push(code) } }
}

test('death handlers: signals kill the child tree, record killed and exit with the conventional code', () => {
  for (const [signal, code] of [['SIGINT', 130], ['SIGTERM', 143], ['SIGBREAK', 143]]) {
    const f = fixture()
    try {
      const state = stateFor(f, clock())
      state.setCommit('abc')
      state.update('pack')
      const { proc, exits, exit } = fakeProcess()
      let killed = 0
      installDeathHandlers(state, { proc, exit, kill: () => { killed += 1 } })
      proc.emit(signal)
      assert.equal(killed, 1)
      assert.deepEqual(exits, [code])
      assert.equal(readJson(f.liveFile).state, 'killed')
      assert.equal(readJson(f.liveFile).ended.reason, `received ${signal}`)
      assert.equal(readJson(f.reportFile).state, 'killed')
    } finally { f.cleanup() }
  }
})

test('death handlers: uncaught exception and unhandled rejection record failed with the message', () => {
  const f = fixture()
  try {
    const state = stateFor(f, clock())
    state.update('overlay')
    const { proc, exits, exit } = fakeProcess()
    installDeathHandlers(state, { proc, exit })
    proc.emit('uncaughtException', new Error('boom'))
    assert.deepEqual(exits, [1])
    assert.equal(readJson(f.liveFile).state, 'failed')
    assert.match(readJson(f.liveFile).ended.reason, /uncaught exception: boom/u)
  } finally { f.cleanup() }
  const g = fixture()
  try {
    const state = stateFor(g, clock())
    state.update('pack')
    const { proc, exit } = fakeProcess()
    installDeathHandlers(state, { proc, exit })
    proc.emit('unhandledRejection', 'nope')
    assert.match(readJson(g.liveFile).ended.reason, /unhandled rejection: nope/u)
  } finally { g.cleanup() }
})

test('death handlers: the exit backstop records a bare process.exit(n) but never overrides a final record', () => {
  const f = fixture()
  try {
    const state = stateFor(f, clock())
    state.update('install')
    state.noteLog('install failed: ERR_PNPM')
    const { proc, exit } = fakeProcess()
    installDeathHandlers(state, { proc, exit })
    proc.emit('exit', 2)
    assert.equal(readJson(f.liveFile).state, 'failed')
    assert.equal(readJson(f.liveFile).ended.reason, 'exit code 2: install failed: ERR_PNPM')
  } finally { f.cleanup() }
  const g = fixture()
  try {
    const state = stateFor(g, clock())
    state.update('pack')
    state.markReportWritten()
    state.finalize({ state: 'ok', stage: 'done', reason: 'ok' })
    const { proc, exit } = fakeProcess()
    installDeathHandlers(state, { proc, exit })
    proc.emit('exit', 0)
    proc.emit('exit', 1)
    assert.equal(readJson(g.liveFile).state, 'ok')
  } finally { g.cleanup() }
})

/** Run a real node process that installs the real handlers and then ends in the given way. */
function runChild(f, body) {
  const script = join(f.dir, 'child.mjs')
  writeFileSync(script, `
    import { createPackState, installDeathHandlers } from ${JSON.stringify(MODULE_URL)}
    const state = createPackState({ liveFile: ${JSON.stringify(f.liveFile)}, reportFile: ${JSON.stringify(f.reportFile)}, requested: 'H', minIntervalMs: 0 })
    installDeathHandlers(state)
    state.setCommit('abc123')
    state.update('pack')
    ${body}
  `)
  return spawnSync(process.execPath, [script], { encoding: 'utf8', timeout: 30_000 })
}

test('real process: process.exit(2), a throw, a rejected promise, a top-level await throw and an emitted SIGTERM all leave a final record', () => {
  const cases = [
    ['process.exit(2)', /exit code 2/u, 'failed'],
    ["setTimeout(() => { throw new Error('late boom') }, 5)", /late boom/u, 'failed'],
    ["Promise.reject(new Error('rejected boom'))", /rejected boom/u, 'failed'],
    ["await Promise.resolve(); throw new Error('tla boom')", /tla boom|exit code 1/u, 'failed'],
    ["setTimeout(() => process.emit('SIGTERM'), 5); setInterval(() => {}, 1000)", /received SIGTERM/u, 'killed'],
  ]
  for (const [body, reason, expectedState] of cases) {
    const f = fixture()
    try {
      const result = runChild(f, body)
      assert.notEqual(result.status, 0, `${body}: should exit non-zero`)
      const live = readJson(f.liveFile)
      assert.equal(live.state, expectedState, `${body}: ${JSON.stringify(live)}`)
      assert.match(live.ended.reason, reason, body)
      const report = readJson(f.reportFile)
      assert.equal(report.ok, false, body)
      assert.equal(report.commit, 'abc123', body)
    } finally { f.cleanup() }
  }
})

test('real process: a clean run finalized by the caller ends ok and exits 0', () => {
  const f = fixture()
  try {
    const result = runChild(f, "state.markReportWritten(); state.finalize({ state: 'ok', stage: 'done', reason: 'ok' })")
    assert.equal(result.status, 0)
    assert.equal(readJson(f.liveFile).state, 'ok')
    assert.equal(existsSync(f.reportFile), false)
  } finally { f.cleanup() }
})

const base = { pid: 99, stage: 'pack', at: '2026-11-04T20:00:00.000Z', commit: '71b87a1d18abcdef' }
const nowMs = Date.parse('2026-11-04T20:01:00.000Z')
const alive = () => true
const dead = () => false

test('describePackStatus covers every state', () => {
  const table = [
    [undefined, alive, 'none', 4, /no pack recorded/u],
    [{ ...base, state: 'running' }, alive, 'running', 0, /^running \(pid 99, stage pack, last update 60s ago, commit 71b87a1d18\)$/u],
    [{ ...base, state: 'running' }, dead, 'died', 2, /^died \(pid 99 gone at stage pack; last update 2026-11-04T20:00:00\.000Z/u],
    [{ ...base, state: 'running', at: '2026-11-04T19:50:00.000Z' }, alive, 'stalled', 3, /stalled\? \(pid 99 alive but no update for 11 min at stage pack/u],
    [{ ...base, state: 'ok', stage: 'done' }, dead, 'ok', 0, /^ok \(stage done/u],
    [{ ...base, state: 'failed', ended: { reason: 'pack exit 1' } }, dead, 'failed', 1, /^failed \(pack exit 1/u],
    [{ ...base, state: 'killed', ended: { reason: 'received SIGTERM' } }, dead, 'killed', 1, /^killed \(received SIGTERM/u],
    [{ stage: 'done', at: base.at }, dead, 'ok', 0, /^ok/u],
    [{ stage: 'failed', at: base.at }, dead, 'failed', 1, /^failed/u],
    [{ stage: 'pack', at: base.at }, alive, 'unknown', 4, /no pid recorded/u],
    [{ stage: 'pack', at: '2026-11-04T19:40:00.000Z' }, alive, 'died', 2, /^died \(legacy record without pid; no update for 21 min at stage pack/u],
  ]
  for (const [live, isAlive, kind, code, line] of table) {
    const status = describePackStatus(live, { alive: isAlive, now: nowMs })
    assert.equal(status.kind, kind, JSON.stringify(live))
    assert.equal(status.code, code, JSON.stringify(live))
    assert.match(status.line, line, JSON.stringify(live))
  }
})

test('recordDeath persists the end of a vanished run once, and never touches a finished one', () => {
  const f = fixture()
  try {
    writeFileSync(f.liveFile, JSON.stringify({ ...base, state: 'running', requested: 'H' }))
    assert.equal(recordDeath(f.liveFile, f.reportFile, 'process 99 gone', '2026-11-04T20:02:00.000Z'), true)
    assert.equal(readJson(f.liveFile).state, 'killed')
    assert.equal(readJson(f.reportFile).commit, '71b87a1d18abcdef')
    assert.equal(recordDeath(f.liveFile, f.reportFile, 'again'), false)
  } finally { f.cleanup() }
})

test('pack-status CLI: a hard-killed pack reads "died (pid X gone at stage Y)" and --record persists it', async () => {
  const f = fixture()
  try {
    // A real pid that is certainly gone: run a short process to completion and use its pid.
    const gone = spawn(process.execPath, ['-e', '0'])
    await new Promise(resolve => gone.on('exit', resolve))
    writeFileSync(f.liveFile, JSON.stringify({ pid: gone.pid, state: 'running', stage: 'pack', at: new Date().toISOString(), requested: 'H' }))
    const died = spawnSync(process.execPath, [STATUS_CLI, '--file', f.liveFile], { encoding: 'utf8' })
    assert.equal(died.status, 2)
    assert.match(died.stdout, new RegExp(`^died \\(pid ${String(gone.pid)} gone at stage pack`, 'u'))

    const recorded = spawnSync(process.execPath, [STATUS_CLI, '--file', f.liveFile, '--record'], { encoding: 'utf8' })
    assert.equal(recorded.status, 2)
    assert.equal(readJson(f.liveFile).state, 'killed')
    const after = spawnSync(process.execPath, [STATUS_CLI, '--file', f.liveFile], { encoding: 'utf8' })
    assert.equal(after.status, 1)
    assert.match(after.stdout, /^killed \(/u)
  } finally { f.cleanup() }
})

test('pack-status CLI: a live pack with a fresh record is running; a missing file is reported, not a crash', () => {
  const f = fixture()
  try {
    writeFileSync(f.liveFile, JSON.stringify({ pid: process.pid, state: 'running', stage: 'pack', at: new Date().toISOString() }))
    const running = spawnSync(process.execPath, [STATUS_CLI, '--file', f.liveFile], { encoding: 'utf8' })
    assert.equal(running.status, 0)
    assert.match(running.stdout, /^running \(pid \d+, stage pack/u)
    const missing = spawnSync(process.execPath, [STATUS_CLI, '--file', join(f.dir, 'nope.json')], { encoding: 'utf8' })
    assert.equal(missing.status, 4)
    assert.match(missing.stdout, /no pack recorded/u)
  } finally { f.cleanup() }
})

test('package-clean end to end: an unresolvable commit leaves a failed live record and report with the reason, and pack-status reads them', () => {
  const f = fixture()
  try {
    // PERSONA_LOCK=pack skips the lock wrapper; PERSONA_PACK_CACHE keeps the shared C:\p8c records untouched.
    const result = spawnSync(process.execPath, [join(HERE, 'package-clean.mjs'), '--commit', 'zzzz-not-a-commit'], {
      encoding: 'utf8', timeout: 60_000, env: { ...process.env, PERSONA_LOCK: 'pack', PERSONA_PACK_CACHE: f.dir },
    })
    assert.equal(result.status, 2)
    const live = readJson(join(f.dir, 'package-clean.live.json'))
    assert.equal(live.state, 'failed')
    assert.equal(live.pid > 0, true)
    assert.equal(live.ended.ok, false)
    assert.match(live.ended.reason, /^exit code 2: cannot resolve zzzz-not-a-commit/u)
    const report = readJson(join(f.dir, 'package-clean.json'))
    assert.equal(report.ok, false)
    assert.equal(report.commit, 'zzzz-not-a-commit')
    assert.equal(report.state, 'failed')
    const status = spawnSync(process.execPath, [STATUS_CLI, '--file', join(f.dir, 'package-clean.live.json')], { encoding: 'utf8' })
    assert.equal(status.status, 1)
    assert.match(status.stdout, /^failed \(exit code 2: cannot resolve/u)
  } finally { f.cleanup() }
})

test('package-clean --help and a bad --resume do not write any record', () => {
  const f = fixture()
  try {
    const env = { ...process.env, PERSONA_LOCK: 'pack', PERSONA_PACK_CACHE: f.dir }
    assert.equal(spawnSync(process.execPath, [join(HERE, 'package-clean.mjs'), '--help'], { encoding: 'utf8', env }).status, 0)
    assert.equal(spawnSync(process.execPath, [join(HERE, 'package-clean.mjs'), '--resume'], { encoding: 'utf8', env }).status, 2)
    assert.equal(existsSync(join(f.dir, 'package-clean.live.json')), false)
    assert.equal(existsSync(join(f.dir, 'package-clean.json')), false)
  } finally { f.cleanup() }
})

test('the live file stays a small record however much build output streams through it', () => {
  const f = fixture()
  try {
    const state = createPackState({ liveFile: f.liveFile, reportFile: f.reportFile, requested: 'H', minIntervalMs: 0 })
    for (let i = 0; i < 50; i += 1) state.update('pack', { last: `line ${String(i)}` })
    assert.ok(readFileSync(f.liveFile, 'utf8').length < 600)
  } finally { f.cleanup() }
})
