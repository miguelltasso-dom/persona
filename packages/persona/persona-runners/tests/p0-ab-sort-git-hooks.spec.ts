/**
 * Auditoria final da Colheita S1 (colheita-s1-final.md), P0-A e P0-B:
 *  A. `sort -uo FILE a`: a cluster of short options that ENDS in `o` takes the NEXT word as the output file. It was judged `read` (auto-allowed) and wrote outside the draft. Same for `tree -Lo 2 FILE`.
 *  B. git runs programs from the repository it is in (hooks, config). A raw path into `.git/` was already refused, but the `.git` could be POPULATED another way and then every
 *     `git commit` (a `draft-change`, auto-allowed) ran the persona's hook: `git init --template=DIR` / `--separate-git-dir`, and `mv`/`cp -r`/`ren`/`mkdir` with `.git` as the destination.
 *     Second barrier: the env every CLI session gets (`nativeSessionEnv`) pins git config that beats the repository's: no hooks, no fsmonitor, no implicit bare repository.
 */
import { execFileSync } from 'node:child_process'
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { judgeCommand } from '../src/authority/command-policy.ts'
import type { ActionKind } from '../src/authority/authority-table.ts'
import { nativeSessionEnv } from '../src/oar/native-cli-env.ts'

let base = ''
let draft = ''
let outside = ''
const slash = (path: string): string => path.replace(/\\/gu, '/')

beforeAll(() => {
  base = mkdtempSync(join(tmpdir(), 'persona-p0ab-'))
  draft = join(base, 'draft')
  outside = slash(join(base, 'person-folder'))
  mkdirSync(join(draft, 'sub'), { recursive: true })
  mkdirSync(outside, { recursive: true })
})
afterAll(() => { rmSync(base, { recursive: true, force: true }) })

const inDraft = (command: string): ActionKind => judgeCommand(command, { draftRoot: draft, cwd: draft }).kind
/** What the authority table lets through with nobody looking. */
const AUTO: readonly ActionKind[] = ['read', 'draft-change']

describe('P0-A: a short-option cluster that ends in `o` writes the next word', () => {
  it.each([
    ['sort -uo FILE a', () => `sort -uo ${outside}/x.txt a`],
    ['sort -ro FILE a', () => `sort -ro ${outside}/x.txt a`],
    ['sort -no FILE a', () => `sort -no ${outside}/x.txt a`],
    ['sort -k2o FILE a', () => `sort -k2o ${outside}/x.txt a`],
    ['sort -uo ../FILE a (relative, out of the draft)', () => 'sort -uo ../person-folder/x.txt a'],
    ['sort -uo FILE a (inside the draft: same answer as `sort -o FILE`)', () => 'sort -uo sub/x.txt a'],
    ['tree -Lo 2 FILE', () => `tree -Lo 2 ${outside}/x.txt`],
    ['tree -ao FILE', () => `tree -ao ${outside}/x.txt`],
  ])('%s is not a read', (_label, command) => {
    expect(AUTO).not.toContain(inDraft(command()))
  })

  it('plain reads stay reads (no regression)', () => {
    expect(inDraft('sort a.txt')).toBe('read')
    expect(inDraft('sort -rn a.txt')).toBe('read')
    expect(inDraft('sort -u a.txt b.txt')).toBe('read')
    expect(inDraft('sort -k2 -t, a.txt')).toBe('read')
    expect(inDraft('tree')).toBe('read')
    expect(inDraft('tree -L 2')).toBe('read')
    expect(inDraft('tree -a sub')).toBe('read')
  })
})

describe('P0-B (1): git init may not populate the new .git from a folder the persona wrote', () => {
  it.each([
    'git init --template=tpl r',
    'git init --template tpl r',
    'git init --templ=tpl r',
    'git init --separate-git-dir=sub r',
    'git init --separate-git-dir sub r',
    'git init --sep=sub r',
    'git -C sub init --template=../tpl',
  ])('%s is not auto-allowed', (command) => {
    expect(AUTO).not.toContain(inDraft(command))
  })

  it('a plain init is still a draft change (no regression)', () => {
    expect(inDraft('git init')).toBe('draft-change')
    expect(inDraft('git init sub/r')).toBe('draft-change')
    expect(inDraft('git init -b main')).toBe('draft-change')
    expect(inDraft('git init --quiet sub/r')).toBe('draft-change')
  })
})

describe('P0-B (2): no command makes a folder BECOME the .git', () => {
  it.each([
    'mv sub .git',
    'cp -r sub .git',
    'ren sub .git',
    'mkdir .git',
    'mkdir -p r/.git',
    'mv sub r/.git',
    'cp -r sub .GIT',
    'mv sub .git.',
    'move sub .git',
    'Move-Item sub .git',
    'Copy-Item sub .git -Recurse',
    'Rename-Item sub -NewName .git',
    'cp -rt .git sub',
  ])('%s is not auto-allowed', (command) => {
    expect(AUTO).not.toContain(inDraft(command))
  })

  it('names that merely look like it are still draft changes (no regression)', () => {
    expect(inDraft('mv sub other')).toBe('draft-change')
    expect(inDraft('mkdir .github')).toBe('draft-change')
    expect(inDraft('mkdir sub/git')).toBe('draft-change')
    expect(inDraft('cp a.txt .gitignore')).toBe('draft-change')
    expect(inDraft('touch sub/x.git')).toBe('draft-change')
  })
})

describe('P0-B (3): the env of every CLI session pins the git config that beats the repository', () => {
  const pinned = (): Record<string, string> => {
    const env = nativeSessionEnv()
    const count = Number(env.GIT_CONFIG_COUNT)
    const out: Record<string, string> = {}
    for (let at = 0; at < count; at += 1) out[String(env[`GIT_CONFIG_KEY_${String(at)}`])] = String(env[`GIT_CONFIG_VALUE_${String(at)}`])
    return out
  }

  it('no hooks, no fsmonitor, no implicit bare repository', () => {
    expect(pinned()).toMatchObject({ 'core.fsmonitor': 'false', 'safe.bareRepository': 'explicit' })
    expect(pinned()['core.hooksPath']).toBeTruthy()
  })

  it('a caller cannot drop it by passing its own overlay (isolation dirs still apply)', () => {
    const env = nativeSessionEnv({ CLAUDE_CONFIG_DIR: 'C:/iso' })
    expect(env.CLAUDE_CONFIG_DIR).toBe('C:/iso')
    expect(env.GIT_CONFIG_COUNT).toBe('3')
  })

  it('REAL git: the hook of a repository made from a template runs WITHOUT the env (control) and does NOT run with it', () => {
    const run = (dir: string, env: NodeJS.ProcessEnv, args: readonly string[]): void => {
      execFileSync('git', args, { cwd: dir, env, stdio: 'ignore', timeout: 20_000, windowsHide: true })
    }
    try {
      execFileSync('git', ['--version'], { stdio: 'ignore', timeout: 20_000, windowsHide: true })
    } catch {
      return // no git on this machine: nothing to prove here (the judgments above still hold)
    }
    const clean: NodeJS.ProcessEnv = { ...process.env }
    for (const name of Object.keys(clean)) if (/^GIT_/iu.test(name)) delete clean[name]
    const withPins: NodeJS.ProcessEnv = { ...clean }
    for (const [key, value] of Object.entries(nativeSessionEnv())) {
      if (value === null) delete withPins[key]
      else withPins[key] = value
    }
    const attempt = (name: string, env: NodeJS.ProcessEnv): boolean => {
      const dir = join(base, name)
      mkdirSync(join(dir, 'tpl', 'hooks'), { recursive: true })
      writeFileSync(join(dir, 'tpl', 'hooks', 'pre-commit'), '#!/bin/sh\necho ran > ../hook-ran.txt\n', { mode: 0o755 })
      run(dir, env, ['init', '-q', '--template=tpl', 'r'])
      writeFileSync(join(dir, 'r', 'a.txt'), 'a\n')
      run(join(dir, 'r'), env, ['add', '.'])
      run(join(dir, 'r'), env, ['-c', 'user.name=x', '-c', 'user.email=x@x.invalid', 'commit', '-q', '-m', 'x'])
      return existsSync(join(dir, 'hook-ran.txt'))
    }
    expect(attempt('real-control', clean), 'control: without the pins the hook runs').toBe(true)
    expect(attempt('real-pinned', withPins), 'with the pins the hook does not run').toBe(false)
  }, 120_000)
})
