/**
 * Carbon P0-05b (round 2, Tally), REPRODUCED BEFORE FIXED: three escapes the first fix of the command gate (P0-04) left. `judgeCommand` only READS the text of a command (nothing touches the machine).
 *
 *  1. short options of `cp`/`mv`/`install`/`ln` glued together or to their value: `cp -rt DIR a` (the `t` takes the next word), `cp -tDIR a b`, `mv -tDIR a`; and `sort -oFILE a` (the output file glued to `-o`);
 *  2. the NTFS suffix `::$DATA` (and `:stream`, `:stream:$DATA`) opens the SAME file: `cat ~/.env::$DATA` is a read of the secret, as is the native `Read` of `.claude.json::$DATA`;
 *  3. `git config -f <file> --list` READS that file: a secret operand is a secret (`~/.aws/credentials`).
 */
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { isSecretPath, judgeCommand } from '../src/authority/command-policy.ts'
import type { ActionKind } from '../src/authority/authority-table.ts'
import { GATE_TOKEN_HEADER, PermissionGate } from '../src/resolve/permission-gate.ts'

let base = ''
let draft = ''
let outside = ''
const slash = (path: string): string => path.replace(/\\/gu, '/')
const home = (): string => slash(homedir())

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'persona-p005b-'))
  draft = join(base, 'draft')
  outside = slash(join(base, 'person-folder'))
  mkdirSync(join(draft, 'sub'), { recursive: true })
  mkdirSync(outside, { recursive: true })
})
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

const inDraft = (command: string): ActionKind => judgeCommand(command, { draftRoot: draft, cwd: draft }).kind

describe('P0-05b (1) short options glued together or to their value', () => {
  it.each([
    ['cp -rt DIR a', () => `cp -rt ${outside} a`, 'outside-change'],
    ['cp -tDIR a b (glued)', () => `cp -t${outside} a b`, 'outside-change'],
    ['cp -rtDIR a (cluster and glued)', () => `cp -rt${outside} a`, 'outside-change'],
    ['cp -t DIR a (spaced: the case that already worked)', () => `cp -t ${outside} a`, 'outside-change'],
    ['mv -tDIR a', () => `mv -t${outside} a`, 'outside-change'],
  ] as const)('%s', (_label, command, expected) => {
    expect(inDraft(command())).toBe(expected)
  })

  it.each([
    ['install -tDIR a', () => `install -t${outside} a`],
    ['ln -stDIR a', () => `ln -st${outside} a`],
  ] as const)('%s is never a draft change (a program the gate does not list waits for a decision)', (_label, command) => {
    expect(['unknown', 'outside-change']).toContain(inDraft(command()))
  })

  it('the same options INSIDE the draft are still a draft change (no regression)', () => {
    expect(inDraft('cp -rt sub a b')).toBe('draft-change')
    expect(inDraft('cp -tsub a b')).toBe('draft-change')
    expect(inDraft('mv -tsub a')).toBe('draft-change')
    expect(inDraft('cp -r a sub')).toBe('draft-change')
    expect(inDraft('cp -rv a sub')).toBe('draft-change')
  })

  it.each([
    ['sort -oFILE a (glued)', () => `sort -o${outside}/out.txt a`],
    ['sort -rnoFILE a (cluster and glued)', () => `sort -rno${outside}/out.txt a`],
    ['sort -o FILE a (spaced: the case that already held)', () => `sort -o ${outside}/out.txt a`],
  ] as const)('%s is not a plain read', (_label, command) => {
    expect(inDraft(command())).not.toBe('read')
  })

  it('a plain sort is still a read (no regression)', () => {
    expect(inDraft('sort a.txt')).toBe('read')
    expect(inDraft('sort -rn a.txt')).toBe('read')
    expect(inDraft('sort -u a.txt b.txt')).toBe('read')
  })
})

describe('P0-05b (2) the NTFS suffix opens the same file', () => {
  it.each([
    ['.env::$DATA', () => `${home()}/.env::$DATA`],
    ['.env:stream', () => `${home()}/.env:stream`],
    ['.env:stream:$DATA', () => `${home()}/.env:stream:$DATA`],
    ['.claude.json::$DATA', () => `${home()}/.claude.json::$DATA`],
    ['.ssh::$INDEX_ALLOCATION/id_ed25519', () => `${home()}/.ssh::$INDEX_ALLOCATION/id_ed25519`],
    ['with backslashes', () => `${home().replace(/\//gu, '\\')}\\.env::$DATA`],
  ] as const)('%s is a secret path', (_label, path) => {
    expect(isSecretPath(path())).toBe(true)
  })

  it('a command reading it is a secret read', () => {
    expect(inDraft(`cat ${home()}/.env::$DATA`)).toBe('secret')
    expect(inDraft(`type ${home()}\\.env::$DATA`)).toBe('secret')
  })

  it('an ordinary path, a drive letter and a name that merely contains a colon-free dollar are not secrets (no regression)', () => {
    expect(isSecretPath('C:/Users/x/Documents/notas.txt')).toBe(false)
    expect(isSecretPath('C:/Users/x/Documents/notas.txt::$DATA')).toBe(false)
    expect(isSecretPath(`${home()}/projeto/readme.md`)).toBe(false)
  })

  it('the native Read of a secret with the suffix is refused by the gate', async () => {
    const gate = await PermissionGate.start({ token: 'tok-1' })
    try {
      gate.arm({ draftRoot: draft })
      const response = await fetch(gate.url, {
        method: 'POST', headers: { 'content-type': 'application/json', [GATE_TOKEN_HEADER]: 'tok-1' },
        body: JSON.stringify({ hook_event_name: 'PreToolUse', tool_name: 'Read', tool_input: { file_path: `${home()}/.claude.json::$DATA` }, tool_use_id: 'tu', cwd: draft }),
      })
      const body = (await response.json()) as { hookSpecificOutput?: { permissionDecision?: 'allow' | 'deny' } }
      expect(body.hookSpecificOutput?.permissionDecision).toBe('deny')
    } finally {
      await gate.close()
    }
  })
})

describe('P0-05b (3) git config -f reads the file it is given', () => {
  const configReads: ReadonlyArray<readonly [string, () => string]> = [
    ['git config -f FILE --list', () => `git config -f ${home()}/.aws/credentials --list`],
    ['git config --file FILE -l', () => `git config --file ${home()}/.aws/credentials -l`],
    ['git config --file=FILE --list (glued)', () => `git config --file=${home()}/.aws/credentials --list`],
    ['git config -f ~/.aws/credentials --get-regexp .', () => 'git config -f ~/.aws/credentials --get-regexp .'],
    ['git config -f ~/.ssh/config --list', () => 'git config -f ~/.ssh/config --list'],
  ]
  it.each(configReads)('%s is a secret read', (_label, command) => {
    expect(inDraft(command())).toBe('secret')
  })

  it('a plain config read stays a read (no regression)', () => {
    expect(inDraft('git config --list')).toBe('read')
    expect(inDraft('git config --get user.name')).toBe('read')
    expect(inDraft('git config -f sub/local.cfg --list')).toBe('read')
  })
})
