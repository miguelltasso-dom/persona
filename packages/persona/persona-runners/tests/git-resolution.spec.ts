import { delimiter, resolve } from 'node:path'
import { expect, it } from 'vitest'
import { GitUnavailableError, resolveGitExecutable } from '../src/resolve/git.ts'

const name = process.platform === 'win32' ? 'git.exe' : 'git'

it('prefers a working PATH executable and keeps the caller environment unchanged', async () => {
  const first = resolve('installed-first', name)
  const second = resolve('installed-second', name)
  const bundled = resolve('bundled', 'cmd', name)
  const env = { PATH: [resolve('installed-first'), resolve('installed-second')].join(delimiter), TEST: 'kept' }
  const before = { ...env }
  const calls: string[] = []
  const found = await resolveGitExecutable({ env, bundledExecutable: bundled, timeoutMs: 1234 }, (executable, actualEnv, timeoutMs) => {
    calls.push(executable)
    expect(actualEnv).toBe(env)
    expect(timeoutMs).toBe(1234)
    return Promise.resolve(executable === second)
  })
  expect(found).toEqual({ executable: second, source: 'path' })
  expect(calls).toEqual([first, second])
  expect(env).toEqual(before)
})

it('uses the bundled executable when PATH has no working installation', async () => {
  const bundled = resolve('resources', 'mingit', 'cmd', name)
  const found = await resolveGitExecutable({ env: { PATH: resolve('missing') }, bundledExecutable: bundled },
    executable => Promise.resolve(executable === bundled))
  expect(found).toEqual({ executable: bundled, source: 'bundled' })
})

it('accepts a quoted PATH directory, skips empty entries and probes duplicates only once', async () => {
  const directory = resolve('installed with spaces')
  const calls: string[] = []
  await expect(resolveGitExecutable({ env: { PATH: ['', `"${directory}"`, directory, ''].join(delimiter) } }, (executable) => {
    calls.push(executable)
    return Promise.resolve(false)
  })).rejects.toBeInstanceOf(GitUnavailableError)
  expect(calls).toEqual([resolve(directory, name)])
})

it('fails with localized recovery and no executable path or subprocess details', async () => {
  await expect(resolveGitExecutable({ env: { PATH: '' }, bundledExecutable: resolve('missing-bundle', name) },
    () => Promise.resolve(false))).rejects.toMatchObject({ code: 'workspace_component_unavailable',
    message: 'Não conseguimos preparar o rascunho. Reabra ou reinstale a Persona e tente de novo.' })
})
