import { afterEach, expect, it } from 'vitest'
import {
  ProductRepos,
  StoreError,
  VaultRepos,
  openPersonaStore,
  openTempStore,
  type TempStore,
} from '../src/index.ts'

const temps: TempStore[] = []
let tick = 0
const now = (): string => {
  tick += 1
  return `2026-11-03T16:00:${String(tick).padStart(2, '0')}.000Z`
}

afterEach(async () => {
  tick = 0
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function setup(): Promise<{ vault: VaultRepos; path: string }> {
  const handle = await openTempStore()
  temps.push(handle)
  const product = new ProductRepos(handle.store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  return { vault: new VaultRepos(handle.store, now), path: handle.path }
}

it('creates a brief and reads it back', async () => {
  const { vault } = await setup()
  const record = vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'brief',
    body: 'Fazemos software para clínicas.', authorId: 'ana',
    visibility: { kind: 'workspace' }, sourceIds: ['onboarding'],
  })
  expect(record.revision).toBe(1)
  expect(vault.getRecord('r1')?.body).toContain('clínicas')
})

it('rejects an invalid kind at the Forge schema boundary', async () => {
  const { vault } = await setup()
  expect(() => {
    vault.createRecord({
      id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'note' as 'brief',
      body: 'x', authorId: 'ana', visibility: { kind: 'workspace' },
    })
  }).toThrow('INVALID_VAULT_RECORD')
})

it('lists records newest first', async () => {
  const { vault } = await setup()
  vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'brief',
    body: 'um', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  vault.createRecord({
    id: 'r2', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
    body: 'dois', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  expect(vault.listRecords('pp').map(item => item.id)).toEqual(['r2', 'r1'])
})

it('requiredRecords returns only active constraints and decisions', async () => {
  const { vault } = await setup()
  vault.createRecord({
    id: 'b', workspaceId: 'ws', projectId: 'pp', kind: 'brief',
    body: 'história', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  vault.createRecord({
    id: 'c', workspaceId: 'ws', projectId: 'pp', kind: 'constraint',
    body: 'Nunca publicar sem aprovação.', authorId: 'ana', visibility: { kind: 'workspace' },
    factKey: 'publish',
  })
  vault.createRecord({
    id: 'd', workspaceId: 'ws', projectId: 'pp', kind: 'decision',
    body: 'UI em pt-BR.', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  vault.createRecord({
    id: 'm', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
    body: 'gosta de café', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  expect(vault.requiredRecords('pp').map(item => item.id).sort()).toEqual(['c', 'd'])
})

it('bumps revision and keeps prior bodies in vault_version', async () => {
  const { vault } = await setup()
  vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'decision',
    body: 'v1', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  const next = vault.updateRecord('r1', 'v2', 'bia')
  expect(next.revision).toBe(2)
  expect(next.body).toBe('v2')
  expect(vault.listVersions('record', 'r1').map(item => item.body)).toEqual(['v2', 'v1'])
})

it('refuses to update a missing record', async () => {
  const { vault } = await setup()
  expect(() => {
    vault.updateRecord('nope', 'x', 'ana')
  }).toThrow(StoreError)
})

it('revokes a record and drops it from requiredRecords', async () => {
  const { vault } = await setup()
  vault.createRecord({
    id: 'c', workspaceId: 'ws', projectId: 'pp', kind: 'constraint',
    body: 'regra', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  expect(vault.revokeRecord('c').status).toBe('revoked')
  expect(vault.requiredRecords('pp')).toEqual([])
  expect(vault.getRecord('c')?.status).toBe('revoked')
})

it('refuses to edit a revoked record', async () => {
  const { vault } = await setup()
  vault.createRecord({
    id: 'c', workspaceId: 'ws', projectId: 'pp', kind: 'constraint',
    body: 'regra', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  vault.revokeRecord('c')
  expect(() => {
    vault.updateRecord('c', 'nova', 'ana')
  }).toThrow(StoreError)
})

it('stores project and persona visibility', async () => {
  const { vault } = await setup()
  const project = vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
    body: 'só este projeto', authorId: 'ana', visibility: { kind: 'project', projectId: 'pp' },
  })
  const persona = vault.createRecord({
    id: 'r2', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
    body: 'só a persona', authorId: 'ana', visibility: { kind: 'persona', personaId: 'p1' },
  })
  expect(project.visibility).toEqual({ kind: 'project', projectId: 'pp' })
  expect(persona.visibility).toEqual({ kind: 'persona', personaId: 'p1' })
})

it('creates a document and finds it by FTS', async () => {
  const { vault } = await setup()
  vault.createDocument({
    id: 'd1', workspaceId: 'ws', projectId: 'pp', title: 'Manual',
    body: 'Como abrir o Cofre da empresa', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  expect(vault.searchDocuments('pp', 'Cofre').map(item => item.id)).toEqual(['d1'])
})

it('searchDocuments is scoped to the project', async () => {
  const { vault } = await setup()
  const product = new ProductRepos(vault.store, now)
  product.createProject({ id: 'app', workspaceId: 'ws', name: 'App' })
  vault.createDocument({
    id: 'd1', workspaceId: 'ws', projectId: 'pp', title: 'A',
    body: 'segredo-fts', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  vault.createDocument({
    id: 'd2', workspaceId: 'ws', projectId: 'app', title: 'B',
    body: 'segredo-fts', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  expect(vault.searchDocuments('pp', 'segredo-fts').map(item => item.id)).toEqual(['d1'])
})

it('updates a document and versions the body', async () => {
  const { vault } = await setup()
  vault.createDocument({
    id: 'd1', workspaceId: 'ws', projectId: 'pp', title: 'A',
    body: 'antigo', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  const next = vault.updateDocument('d1', { body: 'novo', title: 'B' }, 'bia')
  expect(next.revision).toBe(2)
  expect(next.title).toBe('B')
  expect(vault.listVersions('document', 'd1').map(item => item.body)).toEqual(['novo', 'antigo'])
})

it('search misses after the body changes away from the term', async () => {
  const { vault } = await setup()
  vault.createDocument({
    id: 'd1', workspaceId: 'ws', projectId: 'pp', title: 'A',
    body: 'abacaxi-unico', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  vault.updateDocument('d1', { body: 'laranja' }, 'ana')
  expect(vault.searchDocuments('pp', 'abacaxi-unico')).toEqual([])
  expect(vault.searchDocuments('pp', 'laranja').map(item => item.id)).toEqual(['d1'])
})

it('blank document search returns empty', async () => {
  const { vault } = await setup()
  expect(vault.searchDocuments('pp', '  ')).toEqual([])
})

it('reopen preserves vault records and versions', async () => {
  const { vault, path } = await setup()
  vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'decision',
    body: 'persistir', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  vault.updateRecord('r1', 'persistir-2', 'ana')
  vault.store.close()
  const again = openPersonaStore({ path })
  temps.push({ store: again, dir: '', path, dispose: async () => { again.close() } })
  const v2 = new VaultRepos(again, now)
  expect(v2.getRecord('r1')?.body).toBe('persistir-2')
  expect(v2.listVersions('record', 'r1')).toHaveLength(2)
})

it('requiredRecords stay empty when only briefs exist', async () => {
  const { vault } = await setup()
  vault.createRecord({
    id: 'b', workspaceId: 'ws', projectId: 'pp', kind: 'brief',
    body: 'história', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  expect(vault.requiredRecords('pp')).toEqual([])
})

it('keeps rowid on record upsert', async () => {
  const { vault } = await setup()
  vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'brief',
    body: 'a', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  const before = vault.store.db.prepare('SELECT rowid FROM vault_record WHERE id = ?').get('r1') as { rowid: number }
  vault.updateRecord('r1', 'b', 'ana')
  const after = vault.store.db.prepare('SELECT rowid FROM vault_record WHERE id = ?').get('r1') as { rowid: number }
  expect(after.rowid).toBe(before.rowid)
})

it('members visibility requires at least one id', async () => {
  const { vault } = await setup()
  expect(() => {
    vault.createRecord({
      id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
      body: 'x', authorId: 'ana', visibility: { kind: 'members', memberIds: [] },
    })
  }).toThrow('INVALID_VAULT_RECORD')
})

it('getDocument returns undefined when missing', async () => {
  const { vault } = await setup()
  expect(vault.getDocument('nope')).toBeUndefined()
})

it('updateDocument refuses a missing id', async () => {
  const { vault } = await setup()
  expect(() => {
    vault.updateDocument('nope', { body: 'x' }, 'ana')
  }).toThrow(StoreError)
})

it('stores sourceIds and factKey', async () => {
  const { vault } = await setup()
  const record = vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'constraint',
    body: 'limite', authorId: 'ana', visibility: { kind: 'workspace' },
    sourceIds: ['doc-1', 'chat'], factKey: 'budget',
  })
  expect(record.sourceIds).toEqual(['doc-1', 'chat'])
  expect(record.factKey).toBe('budget')
})

it('document search does not cross into records FTS', async () => {
  const { vault } = await setup()
  vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'brief',
    body: 'palavra-rara-record', authorId: 'ana', visibility: { kind: 'workspace' },
  })
  expect(vault.searchDocuments('pp', 'palavra-rara-record')).toEqual([])
})

it('purges a secret record: tombstone body, no fact key, no versions', async () => {
  const { vault } = await setup()
  vault.createRecord({
    id: 'r1', workspaceId: 'ws', projectId: 'pp', kind: 'memory',
    body: 'token-123', authorId: 'ana', visibility: { kind: 'workspace' }, factKey: 'telegram',
  })
  vault.updateRecord('r1', 'token-456', 'ana')
  vault.purgeSecret('r1')
  const row = vault.getRecord('r1')
  expect(row?.body).toBe('Conteúdo movido para o Cofre.')
  expect(row?.status).toBe('revoked')
  expect(row?.factKey).toBeUndefined()
  expect(vault.findActiveFact('pp', 'telegram')).toBeUndefined()
  expect(vault.listVersions('record', 'r1')).toEqual([])
})
