import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { homedir, tmpdir } from 'node:os'
import { join } from 'node:path'
import { execFile } from 'node:child_process'
import { promisify } from 'node:util'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { bindHostFile, HOST_GIT_TIMEOUT_MS, it } from './host-harness.ts'

const exec = promisify(execFile)
const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const { host } = bindHostFile()

function seed(h: PersonaHost): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
}

it('accepts a temp folder with space and accents; reports git', async () => {
  const h = host()
  seed(h)
  const root = mkdtempSync(join(tmpdir(), 'pasta ágil-'))
  dirs.push(root)
  await exec('git', ['init', '-b', 'main', root])
  writeFileSync(join(root, 'a.txt'), 'x')
  const view = h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: root })
  expect(view.status).toBe('ok')
  expect(view.isRepo).toBe(true)
  expect(view.defaultBranch).toBe('main')
  expect(view.dirty).toBe(true)
  expect(h.getProjectRoot({ workspaceId: 'ws', projectId: 'pp' }).rootPath).toBe(view.rootPath)
}, HOST_GIT_TIMEOUT_MS)

it('refuses UNC, missing, file, system root, and nested projects', () => {
  const h = host()
  seed(h)
  h.createProject({ id: 'other', workspaceId: 'ws', name: 'Outro', description: '' })
  const parent = mkdtempSync(join(tmpdir(), 'persona-root-'))
  dirs.push(parent)
  const child = join(parent, 'sub')
  mkdirSync(child)
  expect(h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: '\\\\server\\share' }).message).toMatch(/UNC/i)
  expect(h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: '//server/share' }).status).toBe('invalid')
  expect(h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: homedir() }).message).toMatch(/pasta pessoal/i)
  expect(h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: join(parent, 'missing') }).message).toMatch(/não existe/i)
  writeFileSync(join(parent, 'file.txt'), 'x')
  expect(h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: join(parent, 'file.txt') }).message).toMatch(/não é uma pasta/i)
  expect(h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: 'C:\\' }).status).toBe('invalid')
  expect(h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: parent }).status).toBe('ok')
  expect(h.setProjectRoot({ workspaceId: 'ws', projectId: 'other', rootPath: child }).message).toMatch(/dentro/i)
  expect(h.listProjectRoots({ workspaceId: 'ws' }).roots).toEqual([
    { workspaceId: 'ws', projectId: 'pp', rootPath: parent },
  ])
  expect(h.pickDirectory()).toEqual({ path: null })
})
