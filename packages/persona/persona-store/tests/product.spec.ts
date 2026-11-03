import { afterEach, expect, it } from 'vitest'
import type { Persona } from '@deepseek-ai/dsh-persona-core'
import {
  PERSONAL_PROJECT_NAME,
  ProductRepos,
  StoreError,
  openPersonaStore,
  openTempStore,
  type TempStore,
} from '../src/index.ts'

const temps: TempStore[] = []
let tick = 0
const now = (): string => {
  tick += 1
  return `2026-11-03T12:00:${String(tick).padStart(2, '0')}.000Z`
}

afterEach(async () => {
  tick = 0
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function repos(): Promise<ProductRepos> {
  const handle = await openTempStore()
  temps.push(handle)
  return new ProductRepos(handle.store, now)
}

function persona(overrides: Partial<Persona> = {}): Persona {
  return {
    id: 'p1',
    workspaceId: 'ws',
    name: 'Bento',
    avatar: { kind: 'gallery', ref: 'bento' },
    title: 'Engenharia',
    description: 'Implementa.',
    personality: 'Direto.',
    instructions: 'Prove o trabalho.',
    runner: { kind: 'dsh', model: 'deepseek-chat' },
    tools: { files: 'read' },
    skills: [],
    limits: { concurrency: 1 },
    systemRoles: [],
    canRecruit: false,
    createdAt: '2026-11-03T12:00:00.000Z',
    updatedAt: '2026-11-03T12:00:00.000Z',
    createdBy: 'miguel',
    ...overrides,
  }
}

async function seeded(): Promise<{ repos: ProductRepos; personalId: string }> {
  const r = await repos()
  r.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'proj-pessoal' })
  return { repos: r, personalId: 'proj-pessoal' }
}

it('creates a workspace and the Pessoal project', async () => {
  const r = await repos()
  const { workspace, personal } = r.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  expect(workspace.name).toBe('Acme')
  expect(personal.kind).toBe('personal')
  expect(personal.name).toBe(PERSONAL_PROJECT_NAME)
  expect(r.getProject('pp')?.kind).toBe('personal')
})

it('lists workspaces newest first', async () => {
  const r = await repos()
  r.createWorkspace({ id: 'ws1', name: 'A', personalProjectId: 'p1' })
  r.createWorkspace({ id: 'ws2', name: 'B', personalProjectId: 'p2' })
  expect(r.listWorkspaces().map(item => item.id)).toEqual(['ws2', 'ws1'])
})

it('updates a workspace name and keeps the same rowid', async () => {
  const r = await repos()
  r.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  const before = r.store.db.prepare('SELECT rowid FROM workspace WHERE id = ?').get('ws') as { rowid: number }
  const updated = r.updateWorkspace('ws', 'Acme Ltd')
  expect(updated.name).toBe('Acme Ltd')
  const after = r.store.db.prepare('SELECT rowid FROM workspace WHERE id = ?').get('ws') as { rowid: number }
  expect(after.rowid).toBe(before.rowid)
})

it('refuses a second personal project in the same workspace', async () => {
  const { repos: r } = await seeded()
  expect(() => {
    r.store.tx((db) => {
      db.prepare('INSERT INTO project (id, workspace_id, name, description, kind, created_at, updated_at) VALUES (\'x\', \'ws\', \'Pessoal 2\', \'\', \'personal\', \'t\', \'t\')').run()
    })
  }).toThrow()
})

it('creates and lists shared projects newest first', async () => {
  const { repos: r } = await seeded()
  r.createProject({ id: 'a', workspaceId: 'ws', name: 'Alpha' })
  r.createProject({ id: 'b', workspaceId: 'ws', name: 'Beta', description: 'd' })
  expect(r.listProjects('ws').map(item => item.id)).toEqual(['b', 'a', 'proj-pessoal'])
  expect(r.getProject('b')?.description).toBe('d')
})

it('updates a shared project and refuses deleting Pessoal', async () => {
  const { repos: r } = await seeded()
  r.createProject({ id: 'a', workspaceId: 'ws', name: 'Alpha' })
  expect(r.updateProject('a', { name: 'Alpha 2' }).name).toBe('Alpha 2')
  expect(() => {
    r.deleteProject('proj-pessoal')
  }).toThrow(StoreError)
  try {
    r.deleteProject('proj-pessoal')
  } catch (error: unknown) {
    expect((error as StoreError).code).toBe('constraint')
  }
  r.deleteProject('a')
  expect(r.getProject('a')).toBeUndefined()
})

it('refuses a project in an unknown workspace', async () => {
  const r = await repos()
  expect(() => r.createProject({ id: 'a', workspaceId: 'missing', name: 'X' })).toThrow(StoreError)
})

it('creates members with unique handles and lists newest first', async () => {
  const { repos: r } = await seeded()
  r.createMember({ id: 'm1', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
  r.createMember({ id: 'm2', workspaceId: 'ws', displayName: 'Bia', handle: 'bia', role: 'member' })
  expect(r.listMembers('ws').map(item => item.id)).toEqual(['m2', 'm1'])
  expect(() => r.createMember({
    id: 'm3', workspaceId: 'ws', displayName: 'Ana2', handle: 'ana', role: 'guest',
  })).toThrow(StoreError)
})

it('updates a member and keeps rowid', async () => {
  const { repos: r } = await seeded()
  r.createMember({ id: 'm1', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
  const before = r.store.db.prepare('SELECT rowid FROM member WHERE id = ?').get('m1') as { rowid: number }
  expect(r.updateMember('m1', { displayName: 'Ana Paula', role: 'member' }).displayName).toBe('Ana Paula')
  const after = r.store.db.prepare('SELECT rowid FROM member WHERE id = ?').get('m1') as { rowid: number }
  expect(after.rowid).toBe(before.rowid)
})

it('creates a persona from Forge schema and lists newest first', async () => {
  const { repos: r, personalId } = await seeded()
  r.createPersona(persona(), personalId)
  r.createPersona(persona({ id: 'p2', name: 'Nina' }), personalId)
  expect(r.listPersonas(personalId).map(item => item.id)).toEqual(['p2', 'p1'])
  expect(r.getPersona('p1')?.projectId).toBe(personalId)
  expect(r.getPersona('p1')?.title).toBe('Engenharia')
})

it('rejects an invalid persona at the store boundary', async () => {
  const { repos: r, personalId } = await seeded()
  expect(() => r.createPersona(persona({ name: '' }), personalId)).toThrow('INVALID_PERSONA')
})

it('updates a persona and keeps rowid', async () => {
  const { repos: r, personalId } = await seeded()
  r.createPersona(persona(), personalId)
  const before = r.store.db.prepare('SELECT rowid FROM persona WHERE id = ?').get('p1') as { rowid: number }
  r.updatePersona(persona({ title: 'Staff' }), personalId)
  expect(r.getPersona('p1')?.title).toBe('Staff')
  const after = r.store.db.prepare('SELECT rowid FROM persona WHERE id = ?').get('p1') as { rowid: number }
  expect(after.rowid).toBe(before.rowid)
})

it('enforces one coordination function per project', async () => {
  const { repos: r, personalId } = await seeded()
  r.createPersona(persona({ systemRoles: ['coordination'] }), personalId)
  expect(() => r.createPersona(persona({ id: 'p2', systemRoles: ['coordination'] }), personalId))
    .toThrow(StoreError)
  try {
    r.createPersona(persona({ id: 'p2', systemRoles: ['coordination'] }), personalId)
  } catch (error: unknown) {
    expect((error as StoreError).code).toBe('constraint')
    expect((error as StoreError).detail).toBe('COORDINATION_NOT_UNIQUE')
  }
})

it('allows one coordinator in each project', async () => {
  const { repos: r, personalId } = await seeded()
  const shared = r.createProject({ id: 'shared', workspaceId: 'ws', name: 'App' })
  r.createPersona(persona({ systemRoles: ['coordination'] }), personalId)
  expect(r.createPersona(persona({ id: 'p2', systemRoles: ['coordination'] }), shared.id).id).toBe('p2')
})

it('deletes a persona', async () => {
  const { repos: r, personalId } = await seeded()
  r.createPersona(persona(), personalId)
  r.deletePersona('p1')
  expect(r.getPersona('p1')).toBeUndefined()
})

it('adds, lists, and removes participation', async () => {
  const { repos: r, personalId } = await seeded()
  r.createPersona(persona(), personalId)
  r.createProject({ id: 'app', workspaceId: 'ws', name: 'App' })
  r.addParticipation({ personaId: 'p1', projectId: personalId, kind: 'project', targetId: 'app' })
  r.addParticipation({ personaId: 'p1', projectId: personalId, kind: 'project', targetId: 'app' })
  expect(r.listParticipations('p1')).toHaveLength(1)
  r.removeParticipation('p1', 'project', 'app')
  expect(r.listParticipations('p1')).toEqual([])
})

it('creates channels unique per project and lists newest first', async () => {
  const { repos: r, personalId } = await seeded()
  r.createChannel({ id: 'c1', workspaceId: 'ws', projectId: personalId, name: 'geral' })
  r.createChannel({ id: 'c2', workspaceId: 'ws', projectId: personalId, name: 'dev', topic: 'código' })
  expect(r.listChannels(personalId).map(item => item.name)).toEqual(['dev', 'geral'])
  expect(() => r.createChannel({
    id: 'c3', workspaceId: 'ws', projectId: personalId, name: 'geral',
  })).toThrow(StoreError)
})

it('allows the same channel name in another project', async () => {
  const { repos: r, personalId } = await seeded()
  const shared = r.createProject({ id: 'app', workspaceId: 'ws', name: 'App' })
  r.createChannel({ id: 'c1', workspaceId: 'ws', projectId: personalId, name: 'geral' })
  expect(r.createChannel({ id: 'c2', workspaceId: 'ws', projectId: shared.id, name: 'geral' }).id).toBe('c2')
})

it('updates and deletes a channel', async () => {
  const { repos: r, personalId } = await seeded()
  r.createChannel({ id: 'c1', workspaceId: 'ws', projectId: personalId, name: 'geral' })
  expect(r.updateChannel('c1', { topic: 'olá' }).topic).toBe('olá')
  r.deleteChannel('c1')
  expect(r.getChannel('c1')).toBeUndefined()
})

it('canonicalizes DM pairs and refuses duplicates', async () => {
  const { repos: r, personalId } = await seeded()
  const first = r.createDm({
    id: 'dm1', workspaceId: 'ws', projectId: personalId, participantA: 'mia', participantB: 'leo',
  })
  expect(first.participantA).toBe('leo')
  expect(first.participantB).toBe('mia')
  const again = r.createDm({
    id: 'dm2', workspaceId: 'ws', projectId: personalId, participantA: 'leo', participantB: 'mia',
  })
  expect(again.id).toBe('dm1')
  expect(r.listDms(personalId)).toHaveLength(1)
})

it('refuses a DM with the same participant twice', async () => {
  const { repos: r, personalId } = await seeded()
  expect(() => r.createDm({
    id: 'dm1', workspaceId: 'ws', projectId: personalId, participantA: 'mia', participantB: 'mia',
  })).toThrow(StoreError)
})

it('reopen preserves product rows', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  const r = new ProductRepos(handle.store, now)
  r.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  r.createMember({ id: 'm1', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
  r.createPersona(persona(), 'pp')
  r.createChannel({ id: 'c1', workspaceId: 'ws', projectId: 'pp', name: 'geral' })
  handle.store.close()
  const again = openPersonaStore({ path: handle.path })
  temps.push({ store: again, dir: '', path: handle.path, dispose: async () => { again.close() } })
  const r2 = new ProductRepos(again, now)
  expect(r2.getWorkspace('ws')?.name).toBe('Acme')
  expect(r2.getMember('m1')?.handle).toBe('ana')
  expect(r2.getPersona('p1')?.name).toBe('Bento')
  expect(r2.getChannel('c1')?.name).toBe('geral')
})

it('reads a DM by id after create', async () => {
  const { repos: r, personalId } = await seeded()
  const created = r.createDm({
    id: 'dm1', workspaceId: 'ws', projectId: personalId, participantA: 'ana', participantB: 'bia',
  })
  expect(r.getDm('dm1')?.participantA).toBe(created.participantA)
  expect(r.getDm('missing')).toBeUndefined()
})

it('not-found on missing workspace/member/persona update', async () => {
  const r = await repos()
  expect(() => r.updateWorkspace('x', 'n')).toThrow(StoreError)
  expect(() => r.updateMember('x', { displayName: 'n' })).toThrow(StoreError)
  expect(() => r.updatePersona(persona(), 'pp')).toThrow(StoreError)
})

it('persists optional schedule and reportsTo', async () => {
  const { repos: r, personalId } = await seeded()
  r.createPersona(persona({ id: 'lead' }), personalId)
  r.createPersona(persona({
    id: 'p2',
    reportsTo: 'lead',
    schedule: { timeZone: 'America/Sao_Paulo' },
  }), personalId)
  const stored = r.getPersona('p2')
  expect(stored?.reportsTo).toBe('lead')
  expect(stored?.schedule?.timeZone).toBe('America/Sao_Paulo')
})
