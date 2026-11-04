import { existsSync } from 'node:fs'
import { afterEach, expect, it } from 'vitest'
import {
  ProductRepos,
  StoreError,
  openPersonaStore,
  openTempStore,
  wipeProject,
  wipeWorkspace,
  type PersonaStore,
  type TempStore,
} from '../src/index.ts'

const stores: PersonaStore[] = []
const temps: TempStore[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

function seedTwoWorkspaces(store: PersonaStore): ProductRepos {
  const product = new ProductRepos(store, () => '2026-11-03T15:00:00.000Z')
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  product.createWorkspace({ id: 'other', name: 'Outro', personalProjectId: 'opp' })
  product.createMember({ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
  product.createProject({ id: 'site', workspaceId: 'ws', name: 'Site' })
  product.createPersona({
    id: 'dev', workspaceId: 'ws', name: 'Bento', title: 'Engenharia',
    description: 'Código.', personality: 'Direto.', instructions: 'Entregue.',
    avatar: { kind: 'gallery', ref: 'bento' },
    runner: { kind: 'cli', cli: 'claude', model: 'haiku' },
    tools: {}, skills: [], limits: {}, systemRoles: [], canRecruit: false,
    createdAt: '2026-11-03T15:00:00.000Z', updatedAt: '2026-11-03T15:00:00.000Z', createdBy: 'ana',
  }, 'site')
  product.createChannel({ id: 'geral', workspaceId: 'ws', projectId: 'site', name: 'geral', topic: '' })
  return product
}

it('wipeWorkspace removes one tenant and leaves the other', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const product = seedTwoWorkspaces(handle.store)
  wipeWorkspace(handle.store, 'ws')
  expect(product.getWorkspace('ws')).toBeUndefined()
  expect(product.getProject('pp')).toBeUndefined()
  expect(product.getProject('site')).toBeUndefined()
  expect(product.getPersona('dev')).toBeUndefined()
  expect(product.getWorkspace('other')?.name).toBe('Outro')
  expect(product.getProject('opp')?.kind).toBe('personal')
})

it('wipeProject refuses the personal project and deletes a shared one', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const product = seedTwoWorkspaces(handle.store)
  expect(() => wipeProject(handle.store, 'pp')).toThrowError(StoreError)
  wipeProject(handle.store, 'site')
  expect(product.getProject('site')).toBeUndefined()
  expect(product.getPersona('dev')).toBeUndefined()
  expect(product.getWorkspace('ws')?.name).toBe('Acme')
  expect(product.getProject('pp')?.kind).toBe('personal')
})

it('backupNow writes a file that listBackups returns', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  seedTwoWorkspaces(handle.store)
  const dest = handle.store.backupNow()
  expect(existsSync(dest)).toBe(true)
  expect(dest).toMatch(/persona-manual-.*\.db$/)
  const listed = handle.store.listBackups()
  expect(listed.some(item => item.path === dest)).toBe(true)
})

it('backupNow refuses :memory:', () => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  expect(() => store.backupNow()).toThrowError(StoreError)
})
