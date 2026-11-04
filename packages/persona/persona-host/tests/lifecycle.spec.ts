import { mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { expect } from 'vitest'
import { bindHostFile, it } from './host-harness.ts'

const { host } = bindHostFile()

function seedOwner(h: ReturnType<typeof host>): void {
  h.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  h.createMember({ id: 'ana', workspaceId: 'ws', projectId: 'pp', displayName: 'Ana', handle: 'ana', role: 'owner' })
  h.createMember({ id: 'bia', workspaceId: 'ws', projectId: 'pp', displayName: 'Bia', handle: 'bia', role: 'member' })
  h.createProject({ id: 'site', workspaceId: 'ws', name: 'Site', description: '' })
}

it('deleteWorkspace requires owner and confirmed, then the tenant is gone', () => {
  const h = host()
  seedOwner(h)
  expect(() => h.deleteWorkspace({ workspaceId: 'ws', confirmed: false })).toThrowError('not-confirmed')
  h.sessionMemberId = 'bia'
  expect(() => h.deleteWorkspace({ workspaceId: 'ws', confirmed: true })).toThrowError('forbidden')
  h.sessionMemberId = 'ana'
  expect(h.deleteWorkspace({ workspaceId: 'ws', confirmed: true })).toBe(true)
  expect(h.product.getWorkspace('ws')).toBeUndefined()
})

it('deleteSharedProject refuses Pessoal and removes a shared project', () => {
  const h = host()
  seedOwner(h)
  expect(() => h.deleteSharedProject({
    workspaceId: 'ws', projectId: 'pp', confirmed: true,
  })).toThrow()
  expect(h.deleteSharedProject({ workspaceId: 'ws', projectId: 'site', confirmed: true })).toBe(true)
  expect(h.product.getProject('site')).toBeUndefined()
  expect(h.product.getProject('pp')?.kind).toBe('personal')
})

it('backupNow and listBackups work on a file-backed host', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'persona-host-backup-'))
  const h = host(join(dir, 'persona.db'))
  seedOwner(h)
  const one = h.backupNow()
  expect(one.filename).toMatch(/^persona-manual-/)
  expect(one.path).toContain('backups')
  const listed = h.listBackups()
  expect(listed.some(item => item.path === one.path)).toBe(true)
  const health = h.getStoreHealth()
  expect(health.schemaVersion).toBeGreaterThan(0)
  expect(health.safeMode).toBe(false)
  expect(health.backups.some(item => item.path === one.path)).toBe(true)
  h.createProject({ id: 'extra', workspaceId: 'ws', name: 'Extra', description: '' })
  expect(h.restoreBackup({ filename: one.filename }).recovered).toBe(true)
  expect(h.product.getProject('extra')).toBeUndefined()
  expect(h.product.getWorkspace('ws')?.name).toBe('Acme')
})
