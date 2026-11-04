import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, expect } from 'vitest'
import PersonaHost from '../src/index.ts'
import { resolveProjectPath } from '../src/files.ts'
import { bindHostFile, it } from './host-harness.ts'

const dirs: string[] = []
afterEach(() => {
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true })
})

const { host } = bindHostFile()

function tempRoot(): string {
  const dir = mkdtempSync(join(tmpdir(), 'persona-files-'))
  dirs.push(dir)
  return dir
}

function seeded(): { h: PersonaHost; root: string; scope: { workspaceId: string; projectId: string } } {
  const h = host()
  const root = tempRoot()
  writeFileSync(join(root, 'readme.txt'), 'olá')
  mkdirSync(join(root, 'src'))
  writeFileSync(join(root, 'src', 'app.ts'), 'export {}')
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  h.updateProject({
    workspaceId: 'ws', projectId: 'pp', name: 'Pessoal', description: '', rootPath: root,
  })
  return { h, root, scope: { workspaceId: 'ws', projectId: 'pp' } }
}

it('lists and reads files under the project root', () => {
  const { h, scope } = seeded()
  const listing = h.listFiles({ ...scope, actorId: 'ana', path: '' })
  expect(listing.entries.map(item => item.name)).toEqual(['readme.txt', 'src'])
  expect(h.readFile({ ...scope, actorId: 'ana', path: 'readme.txt' }).text).toBe('olá')
  expect(h.statFile({ ...scope, actorId: 'ana', path: 'src' }).kind).toBe('directory')
})

it('refuses a project file larger than 8 MB with a clear message', () => {
  const { h, root, scope } = seeded()
  writeFileSync(join(root, 'huge.bin'), Buffer.alloc(8 * 1024 * 1024 + 1, 0x61))
  expect(() => {
    h.readFile({ ...scope, actorId: 'ana', path: 'huge.bin' })
  }).toThrow(/8 MB/)
})

it('refuses a path outside the project root', () => {
  const { h, root, scope } = seeded()
  expect(() => {
    h.readFile({ ...scope, actorId: 'ana', path: '../secret' })
  }).toThrow('path-outside-root')
  expect(() => {
    resolveProjectPath(root, '/etc/passwd')
  }).toThrow('path-outside-root')
})

it('refuses a caller who is not a workspace member', () => {
  const { h, scope } = seeded()
  h.createMember({
    id: 'eve', workspaceId: 'ws', projectId: 'pp', displayName: 'Eve', handle: 'eve', role: 'guest',
  })
  h.sessionMemberId = 'eve'
  expect(() => {
    h.listFiles({ ...scope, actorId: 'ana', path: '' })
  }).toThrow('forbidden')
})

it('refuses a project without a file root', () => {
  const h = host()
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({
    id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner',
  })
  const listing = h.listFiles({ workspaceId: 'ws', projectId: 'pp', actorId: 'ana', path: '' })
  expect(listing.status).toBe('need-root')
  expect(listing.message).toBe('escolha a pasta do projeto')
  const root = tempRoot()
  expect(h.setProjectRoot({ workspaceId: 'ws', projectId: 'pp', rootPath: root }).status).toBe('ok')
  expect(h.listFiles({ workspaceId: 'ws', projectId: 'pp', actorId: 'ana', path: '' }).status).toBe('ok')
})
