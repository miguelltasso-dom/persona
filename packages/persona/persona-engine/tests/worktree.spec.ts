import { execFile } from 'node:child_process'
import { mkdtemp, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { promisify } from 'node:util'
import { expect, it } from 'vitest'
import { addWorktree, worktreeArgv, worktreePath } from '../src/index.ts'

const execFileAsync = promisify(execFile)

async function tempRepo(): Promise<string> {
  const dir = await mkdtemp(join(tmpdir(), 'persona-wt-'))
  await execFileAsync('git', ['init', '-b', 'main', dir])
  await execFileAsync('git', ['-C', dir, 'config', 'user.email', 'forge@persona.test'])
  await execFileAsync('git', ['-C', dir, 'config', 'user.name', 'Forge'])
  await execFileAsync('git', ['-C', dir, 'config', 'core.longpaths', 'true'])
  await writeFile(join(dir, 'README'), 'ok\n')
  await execFileAsync('git', ['-C', dir, 'add', '.'])
  await execFileAsync('git', ['-C', dir, 'commit', '-m', 'init'])
  return dir
}

it('builds git worktree argv without a shell string', () => {
  expect(worktreeArgv('/repo', 't9', '/wt/t9')).toEqual([
    '-C', '/repo', 'worktree', 'add', '/wt/t9', '-b', 'persona/t9', 'HEAD',
  ])
  expect(worktreePath('/home/worktrees', 't9')).toBe(resolve('/home/worktrees', 't9'))
})

it('adds a worktree by spawning git with argv and shell:false', async () => {
  const repo = await tempRepo()
  const dest = join(repo, 'wt-t1')
  await addWorktree(repo, 't1', dest)
  const { stdout } = await execFileAsync('git', ['-C', repo, 'worktree', 'list'])
  expect(stdout).toContain('wt-t1')
}, 45_000)

it('rejects a missing repository without using a shell', async () => {
  const dest = join(tmpdir(), 'persona-wt-missing')
  await expect(addWorktree(join(tmpdir(), 'no-such-repo'), 't1', dest)).rejects.toThrow(/git worktree failed/)
})
