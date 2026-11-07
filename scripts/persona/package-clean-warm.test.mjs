// node --test scripts/persona/package-clean-warm.test.mjs
import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  dependencyInputsChanged, isPackWorktreePath, listProcesses, parseProcessListing, parseWorktrees, planWarm, prepareWarmWorktree, processesUnder, readMarker, writeMarker,
} from './package-clean-warm.mjs'

const run = (cwd, cmd, args) => spawnSync(cmd, args, { cwd, encoding: 'utf8', windowsHide: true })
const git = (cwd, ...args) => {
  const ran = run(cwd, 'git', args)
  assert.equal(ran.status, 0, `git ${args.join(' ')} failed: ${ran.stderr}`)
  return String(ran.stdout).trim()
}
/** Pack worktrees live at <drive>:\p8w<10 hex>; the tests use a temp folder, so only the tail of the name is checked. */
const TEST_PATTERN = /[\\/]p8w[0-9a-f]{10}$/iu
const SHA_A = 'a'.repeat(40)
const SHA_B = 'b'.repeat(40)

test('only the worktrees package-clean creates are ever candidates', () => {
  assert.equal(isPackWorktreePath('C:\\p8wbc28dac5c2'), true)
  assert.equal(isPackWorktreePath('c:/p8wbc28dac5c2/'), true)
  for (const nope of ['C:\\Users\\migue\\dev\\persona', 'C:\\Users\\migue\\dev\\persona-push', 'C:\\Users\\migue\\dev\\persona-ship', 'C:\\p8c', 'C:\\p8w', 'C:\\p8wbc28dac5c2x', 'C:\\p8wBC28DAC5C2\\apps', 'C:\\p8wzzzzzzzzzz']) {
    assert.equal(isPackWorktreePath(nope), false, nope)
  }
})

test('what blocks a warm start: anything that decides node_modules, nothing else', () => {
  assert.deepEqual(dependencyInputsChanged([
    'package.json', 'apps/desktop/package.json', 'packages/persona/persona-host/package.json', 'pnpm-lock.yaml', 'pnpm-workspace.yaml', '.npmrc', '.pnpmfile.cjs', 'patches/exceljs@4.4.0.patch',
  ]).length, 8)
  assert.deepEqual(dependencyInputsChanged([
    'packages/persona/persona-host/src/index.ts', 'apps/desktop/src/main.ts', 'docs/package.json.md', 'pnpm-lock.yaml.bak', 'packages/x/package.json5', 'persona-spec/PLAN.md', 'scripts/persona/package-clean.mjs',
  ]), [])
})

test('parses git worktree list --porcelain', () => {
  const rows = parseWorktrees(['worktree C:/repo', 'HEAD ' + SHA_A, 'branch refs/heads/main', '', 'worktree C:/p8w0123456789', 'HEAD ' + SHA_B, 'detached', 'locked reason', '', 'worktree C:/gone', 'HEAD ' + SHA_A, 'detached', 'prunable gitdir file points to non-existent location', ''].join('\n'))
  assert.deepEqual(rows.map(row => [row.path, row.head === SHA_A ? 'A' : 'B', row.detached, row.locked, row.prunable]), [
    ['C:/repo', 'A', false, false, false], ['C:/p8w0123456789', 'B', true, true, false], ['C:/gone', 'A', true, false, true],
  ])
})

test('finds processes running from a folder, whatever the slashes or the case', () => {
  const rows = [
    { ProcessId: 10, Name: 'node.exe', CommandLine: 'node C:\\p8wbc28dac5c2\\scripts\\x.mjs', ExecutablePath: 'C:\\Program Files\\nodejs\\node.exe' },
    { ProcessId: 11, Name: 'Persona.exe', CommandLine: null, ExecutablePath: 'c:/P8WBC28DAC5C2/apps/desktop/.desktop-build/x/Persona.exe' },
    { ProcessId: 12, Name: 'node.exe', CommandLine: 'node C:\\p8wbc28dac5c2-other\\x.mjs', ExecutablePath: null },
    { ProcessId: 13, Name: 'explorer.exe', CommandLine: null, ExecutablePath: 'C:\\Windows\\explorer.exe' },
    // the pack that is ABOUT to reuse the folder names it as a value: that is not a process running from it (the first rehearsal refused itself over this)
    { ProcessId: 14, Name: 'cmd.exe', CommandLine: 'cmd /c "node package-clean.mjs --dir --warm-from C:\\p8wbc28dac5c2 --low-priority > C:\\p8c\\x.out"', ExecutablePath: null },
    { ProcessId: 15, Name: 'node.exe', CommandLine: 'node package-clean.mjs --warm-from "C:\\p8wbc28dac5c2"', ExecutablePath: null },
    { ProcessId: 16, Name: 'node.exe', CommandLine: 'node package-clean.mjs --warm-from C:\\p8wbc28dac5c2', ExecutablePath: null },
  ]
  assert.deepEqual(processesUnder(['C:\\p8wbc28dac5c2'], rows).map(row => row.ProcessId), [10, 11])
  assert.deepEqual(processesUnder(['C:\\p8w4b2c752b47'], rows), [])
})

test('a command line with a raw control character does not break the listing (found at the cut: it made every warm start refuse)', () => {
  const rows = Array.from({ length: 25 }, (_, index) => ({ ProcessId: index + 1, Name: 'x.exe', CommandLine: `x --n ${String(index)}`, ExecutablePath: null }))
  rows[3] = { ProcessId: 4, Name: 'node.exe', CommandLine: `node tell.mjs "linha um\u0001linha dois\u001b[0m\r\ntres"`, ExecutablePath: null }
  // PowerShell's ConvertTo-Json -Compress left the control characters RAW inside the string: build the same text by hand
  const raw = JSON.stringify(rows).replace('linha um\\u0001linha dois\\u001b[0m\\r\\ntres', 'linha um\u0001linha dois\u001b[0m\r\ntres')
  assert.throws(() => JSON.parse(raw), /control character/u)
  const parsed = parseProcessListing(raw)
  assert.equal(parsed.length, 25)
  assert.match(parsed[3].CommandLine, /linha um linha dois/u)
  assert.throws(() => parseProcessListing(JSON.stringify(rows.slice(0, 5))), /implausibly short/u)
})

test('the process listing of this machine is real, or it fails loudly', () => {
  if (process.platform !== 'win32') return
  const rows = listProcesses()
  assert.ok(rows.length >= 20)
  assert.ok(rows.some(row => row.ProcessId === process.pid))
})

const worktrees = [{ path: 'C:/p8w0123456789', head: SHA_A, detached: true, locked: false, prunable: false }]
const good = { candidate: 'C:\\p8w0123456789', worktrees, base: SHA_A, changedPaths: ['packages/persona/persona-host/src/index.ts'], busy: [] }

test('planWarm: every doubt is a refusal with the reason, never a guess', () => {
  assert.deepEqual(planWarm(good), { ok: true, warmHead: SHA_A, changedFiles: 1 })
  const reason = input => { const plan = planWarm({ ...good, ...input }); assert.equal(plan.ok, false); return plan.reason }
  assert.match(reason({ candidate: 'C:\\Users\\migue\\dev\\persona-push' }), /not a pack worktree/u)
  assert.match(reason({ worktrees: [] }), /not a registered worktree/u)
  assert.match(reason({ worktrees: [{ ...worktrees[0], locked: true }] }), /locked/u)
  assert.match(reason({ worktrees: [{ ...worktrees[0], prunable: true }] }), /prunable/u)
  assert.match(reason({ worktrees: [{ ...worktrees[0], detached: false }] }), /branch/u)
  assert.match(reason({ worktrees: [{ ...worktrees[0], head: '' }] }), /no HEAD/u)
  assert.match(reason({ base: undefined }), /no completed pack is recorded/u)
  assert.match(reason({ busy: undefined }), /could not tell whether a process/u)
  assert.match(reason({ busy: [{ ProcessId: 7, Name: 'Persona.exe' }] }), /processes are running from it: 7 Persona\.exe/u)
  assert.match(reason({ changedPaths: undefined }), /could not compare/u)
  assert.match(reason({ changedPaths: ['pnpm-lock.yaml', 'apps/desktop/package.json'] }), /dependency inputs changed since aaaaaaaaaa: pnpm-lock\.yaml, apps\/desktop\/package\.json/u)
})

/** A real repository: A -> B (sources only) -> C (a package.json changes); a pack worktree at A with ignored build output, node_modules and a hand-modified tracked file. */
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'pack-warm-'))
  const main = join(root, 'main')
  mkdirSync(main)
  git(main, 'init', '-q', '-b', 'trunk')
  git(main, 'config', 'user.email', 'rivet@example.invalid')
  git(main, 'config', 'user.name', 'rivet')
  writeFileSync(join(main, '.gitignore'), 'lib/\nnode_modules/\n')
  writeFileSync(join(main, 'package.json'), '{"name":"x"}\n')
  writeFileSync(join(main, 'pnpm-lock.yaml'), 'lock: 1\n')
  mkdirSync(join(main, 'src'))
  writeFileSync(join(main, 'src', 'a.txt'), 'A\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'A')
  const a = git(main, 'rev-parse', 'HEAD')
  writeFileSync(join(main, 'src', 'a.txt'), 'B\n')
  writeFileSync(join(main, 'src', 'b.txt'), 'new in B\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'B')
  const b = git(main, 'rev-parse', 'HEAD')
  writeFileSync(join(main, 'package.json'), '{"name":"x","dependencies":{"y":"1"}}\n')
  git(main, 'add', '-A')
  git(main, 'commit', '-q', '-m', 'C')
  const c = git(main, 'rev-parse', 'HEAD')
  const wt = join(root, 'p8w0123456789')
  git(main, 'worktree', 'add', '-q', '--detach', wt, a)
  mkdirSync(join(wt, 'lib'))
  writeFileSync(join(wt, 'lib', 'out.js'), 'built\n')
  mkdirSync(join(wt, 'node_modules'))
  writeFileSync(join(wt, 'node_modules', '.modules.yaml'), 'ok\n')
  writeFileSync(join(wt, 'src', 'a.txt'), 'overlay edit by the previous pack\n')
  return { root, main, wt, a, b, c }
}

test('warm start: checks out the target in place, keeps ignored build output, resets tracked files', () => {
  const f = fixture()
  try {
    writeMarker(run, f.wt, f.a)
    assert.equal(readMarker(run, f.wt)?.commit, f.a)
    const advanced = prepareWarmWorktree({ main: f.main, candidate: f.wt, target: f.b, run, processes: () => [], pattern: TEST_PATTERN })
    assert.deepEqual({ ...advanced }, { ok: true, path: f.wt, from: f.a, to: f.b, changedFiles: 2 })
    assert.equal(git(f.wt, 'rev-parse', 'HEAD'), f.b)
    // Git for Windows may check files out with CRLF (core.autocrlf): compare the content, not the line endings.
    const text = path => readFileSync(path, 'utf8').replace(/\r\n/gu, '\n')
    assert.equal(text(join(f.wt, 'src', 'a.txt')), 'B\n', 'a tracked file the previous pack had modified is exactly the target again')
    assert.equal(text(join(f.wt, 'src', 'b.txt')), 'new in B\n')
    assert.equal(text(join(f.wt, 'lib', 'out.js')), 'built\n', 'ignored build output survives: that is the point of a warm start')
    assert.equal(existsSync(join(f.wt, 'node_modules', '.modules.yaml')), true)
    // the marker still names the last COMPLETED pack: a pack that dies after the checkout must not make HEAD the new base
    assert.equal(readMarker(run, f.wt)?.commit, f.a)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})

test('warm start refuses (and touches nothing) when a dependency input changed, no pack is recorded, or the worktree is busy', () => {
  const f = fixture()
  try {
    const attempt = (target, options = {}) => prepareWarmWorktree({ main: f.main, candidate: f.wt, target, run, processes: () => [], pattern: TEST_PATTERN, ...options })
    const headBefore = git(f.wt, 'rev-parse', 'HEAD')
    const modifiedBefore = readFileSync(join(f.wt, 'src', 'a.txt'), 'utf8')
    const untouched = () => { assert.equal(git(f.wt, 'rev-parse', 'HEAD'), headBefore); assert.equal(readFileSync(join(f.wt, 'src', 'a.txt'), 'utf8'), modifiedBefore) }

    const noMarker = attempt(f.b)
    assert.equal(noMarker.ok, false)
    assert.match(noMarker.reason, /no completed pack is recorded/u)
    untouched()

    writeMarker(run, f.wt, f.a)
    const changedDeps = attempt(f.c)
    assert.equal(changedDeps.ok, false)
    assert.match(changedDeps.reason, /dependency inputs changed since .*package\.json/u)
    untouched()

    const busy = attempt(f.b, { processes: () => [{ ProcessId: 99, Name: 'Persona.exe', CommandLine: `${f.wt}\\Persona.exe`, ExecutablePath: null }] })
    assert.equal(busy.ok, false)
    assert.match(busy.reason, /processes are running from it/u)
    untouched()

    const blind = attempt(f.b, { processes: () => { throw new Error('process listing failed') } })
    assert.equal(blind.ok, false)
    assert.match(blind.reason, /could not tell whether a process/u)
    untouched()

    const notPack = prepareWarmWorktree({ main: f.main, candidate: f.main, target: f.b, run, processes: () => [] })
    assert.equal(notPack.ok, false)
    assert.match(notPack.reason, /not a pack worktree/u)
  } finally { rmSync(f.root, { recursive: true, force: true }) }
})
