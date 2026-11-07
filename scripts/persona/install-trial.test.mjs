// node --test scripts/persona/install-trial.test.mjs
import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import { REQUIRED_LITERALS, countLiterals, inspectInstalled, removeTreeSoft, runInstallTrial, trialVerdict } from './install-trial.mjs'

const err = (code) => Object.assign(new Error(code), { code })

test('removeTreeSoft: retries a transient lock until it clears, backing off between tries', () => {
  let calls = 0
  const sleeps = []
  const result = removeTreeSoft('X', {
    rm: () => { calls += 1; if (calls < 3) throw err('EPERM') },
    sleep: (ms) => sleeps.push(ms),
    delayMs: 100,
  })
  assert.deepEqual(result, { removed: true, attempts: 3 })
  assert.deepEqual(sleeps, [100, 200])
})

test('removeTreeSoft: gives up with a WARNING, never an exception, when the lock does not clear (the EPERM that killed the pack)', () => {
  let calls = 0
  const result = removeTreeSoft('C:/tmp/persona-nsis-x', { rm: () => { calls += 1; throw err('EPERM') }, sleep: () => {}, tries: 4 })
  assert.equal(calls, 4)
  assert.equal(result.removed, false)
  assert.equal(result.attempts, 4)
  assert.match(result.warning, /could not remove C:\/tmp\/persona-nsis-x: EPERM/u)
  for (const code of ['EBUSY', 'ENOTEMPTY', 'EACCES']) {
    assert.equal(removeTreeSoft('X', { rm: () => { throw err(code) }, sleep: () => {}, tries: 2 }).removed, false)
  }
})

test('removeTreeSoft: an error that is not a lock is a real bug and still throws', () => {
  assert.throws(() => removeTreeSoft('X', { rm: () => { throw err('EINVAL') }, sleep: () => {} }), /EINVAL/u)
})

test('countLiterals: finds literals, counts repeats, and sees one that straddles a chunk boundary exactly once', () => {
  const dir = mkdtempSync(join(tmpdir(), 'install-trial-'))
  try {
    const file = join(dir, 'blob.bin')
    // 10-byte chunks; "PERSONA_REAL_TURN_CAP" (21 bytes) crosses several boundaries.
    writeFileSync(file, `aaaa PERSONA_REAL_TURN_CAP bbbb PERSONA_REAL_TURN_CAP real_turn_cap ${'z'.repeat(31)}quota_exhausted`)
    const counts = countLiterals(file, ['PERSONA_REAL_TURN_CAP', 'real_turn_cap', 'quota_exhausted', 'ABSENT_LITERAL'], 10)
    assert.deepEqual(counts, { PERSONA_REAL_TURN_CAP: 2, real_turn_cap: 1, quota_exhausted: 1, ABSENT_LITERAL: 0 })
    // Same answer whatever the chunk size.
    for (const size of [1, 7, 21, 64, 4096]) assert.deepEqual(countLiterals(file, ['PERSONA_REAL_TURN_CAP', 'real_turn_cap'], size), { PERSONA_REAL_TURN_CAP: 2, real_turn_cap: 1 })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

test('inspectInstalled: reads a real directory layout', () => {
  const dir = mkdtempSync(join(tmpdir(), 'install-trial-'))
  try {
    mkdirSync(join(dir, 'resources', 'mingit', 'cmd'), { recursive: true })
    mkdirSync(join(dir, 'resources', 'mingit', 'ucrt64', 'bin'), { recursive: true })
    mkdirSync(join(dir, 'resources', 'notify-avatars'), { recursive: true })
    writeFileSync(join(dir, 'Persona.exe'), 'x')
    writeFileSync(join(dir, 'resources', 'app.asar'), `junk ${REQUIRED_LITERALS.join(' | ')} junk`)
    writeFileSync(join(dir, 'resources', 'mingit', 'cmd', 'git.exe'), 'x')
    writeFileSync(join(dir, 'resources', 'mingit', 'ucrt64', 'bin', 'git.exe'), 'x')
    writeFileSync(join(dir, 'resources', 'mingit', 'LICENSE.txt'), 'x')
    writeFileSync(join(dir, 'resources', 'notify-avatars', 'atlas.png'), 'x')
    writeFileSync(join(dir, 'resources', 'notify-avatars', 'notes.txt'), 'x')
    const found = inspectInstalled(dir)
    assert.equal(found.exe, true)
    assert.deepEqual(Object.values(found.literals), [1, 1, 1, 1])
    assert.deepEqual(found.mingit, { cmdGit: true, ucrtGit: true, license: true })
    assert.equal(found.notifyAvatars, 1)
    assert.deepEqual(inspectInstalled(join(dir, 'nowhere')).literals, { PERSONA_REAL_TURN_CAP: 0, PERSONA_REAL_TURN_LEDGER: 0, real_turn_cap: 0, quota_exhausted: 0 })
  } finally { rmSync(dir, { recursive: true, force: true }) }
})

const goodInstalled = {
  exe: true, asarBytes: 1,
  literals: Object.fromEntries(REQUIRED_LITERALS.map(literal => [literal, 1])),
  mingit: { cmdGit: true, ucrtGit: true, license: true }, notifyAvatars: 18,
}

function trial(overrides = {}) {
  const calls = []
  const clock = (() => { let at = 0; return () => (at += 1000) })()
  const result = runInstallTrial('C:/p8c/Persona-Setup.exe', {
    mkdtemp: () => 'C:/tmp/persona-nsis-x',
    now: clock,
    exists: (path) => String(path).endsWith('Uninstall Persona.exe'),
    inspect: () => overrides.installed ?? goodInstalled,
    run: (cmd, args, timeout) => { calls.push({ cmd, args, timeout }); return { status: calls.length === 1 ? (overrides.installExit ?? 0) : (overrides.uninstallExit ?? 0) } },
    remove: () => overrides.cleanup ?? { removed: true, attempts: 1 },
  })
  return { result, calls }
}

test('runInstallTrial: silent install into the temp dir, inspect BEFORE uninstalling, synchronous in-place uninstall with _?=', () => {
  const { result, calls } = trial()
  assert.deepEqual(calls[0], { cmd: 'C:/p8c/Persona-Setup.exe', args: ['/S', '/D=C:/tmp/persona-nsis-x'], timeout: 600_000 })
  assert.match(calls[1]?.cmd ?? '', /persona-nsis-x[\\/]Uninstall Persona\.exe$/u)
  assert.deepEqual(calls[1]?.args, ['/S', '_?=C:/tmp/persona-nsis-x'])
  assert.equal(result.verdict.ok, true)
  assert.deepEqual(result.verdict.problems, [])
})

test('runInstallTrial: a temp directory that cannot be removed is a warning, the verdict stays green', () => {
  const { result } = trial({ cleanup: { removed: false, attempts: 8, warning: 'could not remove X: EPERM' } })
  assert.equal(result.verdict.ok, true)
  assert.equal(result.cleanup.removed, false)
  assert.match(result.cleanup.warning, /EPERM/u)
})

test('trialVerdict: names every way the installed app falls short', () => {
  assert.deepEqual(trial({ installExit: 2 }).result.verdict.problems, ['installer exited 2'])
  assert.deepEqual(trial({ uninstallExit: 5 }).result.verdict.problems, ['uninstaller exited 5'])
  const bad = trial({ installed: { ...goodInstalled, exe: false, literals: { ...goodInstalled.literals, PERSONA_REAL_TURN_CAP: 0 }, mingit: { ...goodInstalled.mingit, ucrtGit: false } } })
  assert.deepEqual(bad.result.verdict.problems, ['Persona.exe missing after install', 'app.asar lacks PERSONA_REAL_TURN_CAP', 'MinGit incomplete'])
  assert.equal(trialVerdict({ installExit: 0, installed: goodInstalled, uninstaller: null, uninstallExit: null }).problems[0], 'no uninstaller was installed')
})
