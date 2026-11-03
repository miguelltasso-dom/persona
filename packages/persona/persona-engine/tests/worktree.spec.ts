import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { addWorktree, worktreeArgv, worktreePath } from '../src/index.ts'

it('builds git worktree argv without a shell string', () => {
  expect(worktreeArgv('/repo', 't9', '/wt/t9')).toEqual([
    '-C', '/repo', 'worktree', 'add', '/wt/t9', '-b', 'persona/t9', 'HEAD',
  ])
  expect(worktreePath('/home/worktrees', 't9')).toBe(join('/home/worktrees', 't9'))
})

it('spawns git with argv and shell:false', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'persona-wt-'))
  const ok = join(dir, 'ok.cmd')
  await writeFile(ok, '@echo off\r\nexit /b 0\r\n')
  await addWorktree('C:\\repo', 't1', 'C:\\dest', ok)
})

it('rejects a non-zero git exit with stderr', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'persona-wt-'))
  const bad = join(dir, 'bad.cmd')
  await writeFile(bad, '@echo off\r\necho boom 1>&2\r\nexit /b 2\r\n')
  await expect(addWorktree('C:\\repo', 't1', 'C:\\dest', bad)).rejects.toThrow(/git worktree failed \(2\)/)
})
