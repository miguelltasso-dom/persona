/**
 * Carbon P0-04 (Tally, 12/11), REPRODUCED BEFORE FIXED: the command gate let a write or a delete OUTSIDE the draft, a read of a secret and a script written into `.git/hooks` through as
 * "inside the draft", and the Codex sandbox mode leaked between concurrent sessions. Each case below is the Carbon's repro with the paths of a temporary folder (nothing touches the real
 * machine: `judgeCommand` only READS the text of a command).
 *
 *  1. an option VALUE (`-Destination:C:\…`, `-Path:C:\…`, `--target-directory=C:\…`) is a path like any operand, not a harmless flag;
 *  2. a path with a space is a path (a `git worktree add "C:\…\Meus Documentos\x"` left the draft unseen); with NO draft known nothing is "inside" it;
 *  3. a raw write into `.git/` (a hook, the config) is a way to run code later: never a draft change;
 *  4. a glob that can reach outside the draft or a hidden/secret name (`C:\Users\x\.ss?\id_ed25519`, `.e*`), and the Win32 trailing dot (`.ssh.`), are not a plain read;
 *  5. the native `Grep`/`Glob` on the HOME folder (or above it) sweeps every secret under it;
 *  6. a Codex sandbox mode is per session and never stays in the process environment after the session opens;
 *  7. OpenCode denies by default (`"*": "deny"`) and then allows only what the product relies on.
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { dirname, join, parse } from 'node:path'
import type { Runtime, SessionOptions } from '@botiverse/oar'
import { scriptedRuntime } from '@botiverse/oar/testing'
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest'
import { judgeCommand } from '../src/authority/command-policy.ts'
import { opencodePermission } from '../src/authority/opencode-config.ts'
import type { ActionKind } from '../src/authority/authority-table.ts'
import { CODEX_CAPABILITIES, createOarRunner } from '../src/index.ts'
import { cliPolicyOf } from '../src/resolve/cli-policy.ts'
import { GATE_TOKEN_HEADER, PermissionGate } from '../src/resolve/permission-gate.ts'

let base = ''
let draft = ''
let outside = ''
const slash = (path: string): string => path.replace(/\\/gu, '/')
const backslash = (path: string): string => path.replace(/\//gu, '\\')

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'persona-p004-'))
  draft = join(base, 'draft')
  outside = slash(join(base, 'person-folder'))
  mkdirSync(join(draft, 'sub'), { recursive: true })
  mkdirSync(outside, { recursive: true })
})
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

const inDraft = (command: string): ActionKind => judgeCommand(command, { draftRoot: draft, cwd: draft }).kind

describe('P0-04 (1) an option value is a path, not a harmless flag', () => {
  it.each([
    ['PowerShell -Destination:', () => `Copy-Item a.txt -Destination:${outside}/fora.txt`, 'outside-change'],
    ['PowerShell -Destination: with backslashes', () => `Copy-Item a.txt -Destination:${backslash(outside)}\\fora.txt`, 'outside-change'],
    ['PowerShell -Path: on Remove-Item', () => `Remove-Item -Path:${outside}/importante.docx build`, 'delete'],
    ['PowerShell -Path: on Set-Content', () => `Set-Content -Path:${outside}/x.txt -Value hi`, 'outside-change'],
    ['cp --target-directory=', () => `cp --target-directory=${outside} a b`, 'outside-change'],
    ['mv --target-directory=', () => `mv --target-directory=${outside} a`, 'outside-change'],
  ] as const)('%s', (_label, command, expected) => {
    expect(inDraft(command())).toBe(expected)
  })

  it('the same option values INSIDE the draft are still a draft change (no regression)', () => {
    expect(inDraft('Copy-Item a.txt -Destination:sub/b.txt')).toBe('draft-change')
    expect(inDraft('cp --target-directory=sub a b')).toBe('draft-change')
    expect(inDraft('Remove-Item -Path:build/old.txt')).toBe('draft-change')
    expect(inDraft('Remove-Item -Recurse -Force build')).toBe('draft-change')
    expect(inDraft('cp a b')).toBe('draft-change')
  })
})

describe('P0-04 (2) a path with a space is a path; with no draft nothing is inside it', () => {
  it('git worktree add / add / mv with a quoted path that leaves the draft', () => {
    expect(inDraft(`git worktree add "${slash(base)}/Meus Documentos/escape"`)).toBe('outside-change')
    expect(inDraft(`git add "${outside}/some dir/file.txt"`)).toBe('outside-change')
    expect(inDraft(`git mv a.txt "${outside}/dir with space/a.txt"`)).toBe('outside-change')
  })

  it('with NO draft known a git change is not a draft change', () => {
    expect(judgeCommand('git add ../x', {}).kind).toBe('outside-change')
    expect(judgeCommand('git restore ../../etc/hosts', {}).kind).toBe('outside-change')
  })

  it('in the draft the usual git work is untouched', () => {
    expect(inDraft('git commit -m x')).toBe('draft-change')
    expect(inDraft('git add -A')).toBe('draft-change')
    expect(inDraft('git add src/a.ts')).toBe('draft-change')
    expect(inDraft('git status')).toBe('read')
  })
})

describe('P0-04 (3) a raw write into .git/ is code that runs later', () => {
  it.each([
    'echo "#!/bin/sh" > .git/hooks/pre-commit',
    'Set-Content .git/hooks/pre-commit -Value "x"',
    'cp a .git/hooks/post-commit',
    'tee .git/hooks/pre-push',
    'cp a .git/config',
    'echo x >> .git/config',
    'Set-Content -Path:.git/hooks/pre-commit -Value x',
  ])('%s is never a draft change', (command) => {
    expect(inDraft(command)).not.toBe('draft-change')
    expect(inDraft(command)).toBe('outside-change')
  })

  it('git itself still works (it manages its own files)', () => {
    expect(inDraft('git config user.name Ana')).not.toBe('outside-change')
    expect(inDraft('git commit --allow-empty -m x')).toBe('draft-change')
  })
})

describe('P0-04 (4) globs that can reach a secret, and the Win32 trailing dot', () => {
  it('a glob in a hidden or absolute path is not a plain read (it waits, it is not allowed)', () => {
    expect(inDraft(`cat ${outside}/.ss?/id_ed25519`)).not.toBe('read')
    expect(inDraft(`cat ${outside}/*`)).not.toBe('read')
    expect(inDraft('cat .e*')).not.toBe('read')
    expect(inDraft('cat ../*')).not.toBe('read')
    expect(inDraft('Get-Content "C:\\Users\\*\\.ssh\\id_rsa"')).not.toBe('read')
  })

  it('a trailing dot or space of a path segment (Windows ignores it) does not hide a secret', () => {
    expect(inDraft(`type ${backslash(outside)}\\.ssh.\\id_rsa.`)).toBe('secret')
    expect(inDraft(`cat ${outside}/.ssh./id_rsa`)).toBe('secret')
    expect(inDraft(`cat ${outside}/.ssh /id_rsa`)).toBe('secret')
    expect(inDraft(`cat ${outside}/.env.`)).toBe('secret')
  })

  it('an ordinary glob inside the draft is still a read (no regression)', () => {
    expect(inDraft('ls *.md')).toBe('read')
    expect(inDraft('cat src/*.ts')).toBe('read')
    expect(inDraft('grep -rn foo sub/*')).toBe('read')
    expect(inDraft('rm build/*.tmp')).toBe('draft-change')
    expect(inDraft('echo *')).toBe('read')
  })
})

describe('P0-04 (5) the native Grep/Glob on the HOME folder (or above) sweeps every secret under it', () => {
  const realHome = { USERPROFILE: process.env.USERPROFILE, HOME: process.env.HOME }
  let fakeHome = ''
  const gates: PermissionGate[] = []
  beforeAll(() => {
    fakeHome = join(base, 'Users', 'migue')
    mkdirSync(join(fakeHome, 'Documents'), { recursive: true })
    process.env.USERPROFILE = fakeHome
    process.env.HOME = fakeHome
  })
  afterAll(() => {
    if (realHome.USERPROFILE === undefined) delete process.env.USERPROFILE
    else process.env.USERPROFILE = realHome.USERPROFILE
    if (realHome.HOME === undefined) delete process.env.HOME
    else process.env.HOME = realHome.HOME
  })
  afterEach(async () => { await Promise.all(gates.splice(0).map(async gate => gate.close())) })

  async function decide(tool: string, input: Record<string, unknown>): Promise<'allow' | 'deny' | 'no-opinion'> {
    const gate = await PermissionGate.start({ token: 'tok-1' })
    gates.push(gate)
    gate.arm({ draftRoot: draft })
    const response = await fetch(gate.url, {
      method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-1' },
      body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: tool, tool_input: input, tool_use_id: 'tu', cwd: draft }),
    })
    const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: 'allow' | 'deny' } }
    return body.hookSpecificOutput?.permissionDecision ?? 'no-opinion'
  }

  it('Grep/Glob with the home folder, a folder above it, or a drive root as the path is refused', async () => {
    expect(homedir()).toBe(fakeHome)
    expect(await decide('Grep', { path: fakeHome, pattern: '.*' })).toBe('deny')
    expect(await decide('Glob', { path: fakeHome, pattern: '**/*' })).toBe('deny')
    expect(await decide('Grep', { path: dirname(fakeHome), pattern: 'password' })).toBe('deny')
    expect(await decide('Grep', { path: parse(base).root, pattern: 'token' })).toBe('deny')
  })

  it('a folder UNDER the home (documents, the draft) and the usual no-path call are left to the CLI (no regression)', async () => {
    expect(await decide('Grep', { path: join(fakeHome, 'Documents'), pattern: 'x' })).toBe('no-opinion')
    expect(await decide('Grep', { path: draft, pattern: 'x' })).toBe('no-opinion')
    expect(await decide('Glob', { pattern: '**/*.md' })).toBe('no-opinion')
    expect(await decide('Read', { file_path: join(draft, 'a.md') })).toBe('no-opinion')
  })
})

describe('P0-04 (6) the Codex sandbox mode is per session, never left in the process environment', () => {
  function recordingRuntime(seen: Array<string | undefined>): Runtime {
    const base = scriptedRuntime({ id: 'fake-codex', turn: (turn) => { turn.say('ok') } })
    return new Proxy(base, {
      get(target, prop) {
        if (prop === 'session') {
          return async (installation: never, options: SessionOptions) => {
            // OAR's Codex adapter reads the variable synchronously on the call, as this fake does
            seen.push(process.env.OAR_CODEX_SANDBOX)
            await new Promise<void>((resolve) => { setTimeout(resolve, 40) }) // the session takes a while to open: other sessions start meanwhile
            return target.session(installation, options)
          }
        }
        const value = Reflect.get(target, prop) as unknown
        return typeof value === 'function' ? (value as (...args: unknown[]) => unknown).bind(target) : value
      },
    })
  }
  const input = (cwd: string) => ({ ticketId: 't', assignmentId: 'a', personaId: 'nina', cwd, prompt: 'oi', model: 'default', permissionMode: 'deny' as const })

  it('two concurrent sessions (a read-only talk and a workspace-write task) each open with their own mode, and the variable is back to what it was', async () => {
    const before = process.env.OAR_CODEX_SANDBOX
    const seenTalk: Array<string | undefined> = []
    const seenTask: Array<string | undefined> = []
    const talk = createOarRunner({ runtime: recordingRuntime(seenTalk), capabilities: CODEX_CAPABILITIES, policy: cliPolicyOf('codex', {}, 'deny') })
    const task = createOarRunner({ runtime: recordingRuntime(seenTask), capabilities: CODEX_CAPABILITIES, policy: cliPolicyOf('codex', { files: 'write' }, 'allow-once') })
    await Promise.all([talk.start(input(join(base, 'a'))), task.start({ ...input(join(base, 'b')), permissionMode: 'allow-once' })])
    expect(seenTalk).toEqual(['read-only'])
    expect(seenTask).toEqual(['workspace-write'])
    expect(process.env.OAR_CODEX_SANDBOX).toBe(before) // not the other session's value, left behind for the next one
  })

  it('a session that pins NOTHING never inherits the mode another session is opening with', async () => {
    const seenPinned: Array<string | undefined> = []
    const seenFree: Array<string | undefined> = []
    const pinned = createOarRunner({ runtime: recordingRuntime(seenPinned), capabilities: CODEX_CAPABILITIES, policy: cliPolicyOf('codex', { files: 'write' }, 'allow-once') })
    const free = createOarRunner({ runtime: recordingRuntime(seenFree), capabilities: CODEX_CAPABILITIES })
    const first = pinned.start({ ...input(join(base, 'c')), permissionMode: 'allow-once' })
    await new Promise<void>((resolve) => { setTimeout(resolve, 10) }) // the pinned session is in the middle of opening
    await Promise.all([first, free.start(input(join(base, 'd')))])
    expect(seenPinned).toEqual(['workspace-write'])
    expect(seenFree).toEqual([undefined])
  })
})

describe('P0-04 (7) OpenCode denies by default', () => {
  it('the permission block starts from "*": "deny" and then allows only what the product relies on', () => {
    const permission = opencodePermission({ files: 'write', web: 'read' }, true)
    expect(permission['*']).toBe('deny')
    expect(Object.keys(permission)[0]).toBe('*') // the LAST matching rule wins: the default comes first
    expect(permission.bash).toBe('deny')
    expect(permission.external_directory).toBe('deny')
    expect(permission.edit).toMatchObject({ '*': 'allow' }) // S4: allow in the draft, deny for `.git` (p0-b-s4-opencode-git.spec.ts)
    // reading is what the product relies on today (it is not held back, said on the screen): still allowed explicitly
    for (const reader of ['read', 'glob', 'grep', 'list'] as const) expect(permission[reader]).toBe('allow')
  })

  it('a call that may not write, or a persona with no web grant, stays closed', () => {
    expect(opencodePermission({ files: 'write', web: 'none' }, false)).toMatchObject({ '*': 'deny', edit: 'deny', webfetch: 'deny' })
  })
})
