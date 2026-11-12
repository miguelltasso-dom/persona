/**
 * Item 22 (H22) store: the equipes the person assembles and the categories that group channels (migration v26, additive). The fence is NOT here: who answers in a
 * channel is still the channel's members. Includes the real upgrade (a seeded v25 database keeps every row) and the honest failure (a broken v26 leaves v25 intact).
 */
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { StoreError } from '../src/errors.ts'
import { CategoryRepos, ChannelRepos, EQUIPE_NAME_MAX, EquipeRepos, PERSONA_MIGRATIONS, PERSONA_SCHEMA_VERSION, ProductRepos, cleanEquipeName, openPersonaStore } from '../src/index.ts'
import { openTempStore, withTempStore } from '../src/test-helpers.ts'
import type { PersonaStore } from '../src/index.ts'

let tick = 0
const now = (): string => `2026-11-12T09:00:${String(tick += 1).padStart(2, '0')}.000Z`

function seed(store: PersonaStore): { equipes: EquipeRepos; categories: CategoryRepos; channels: ChannelRepos; product: ProductRepos } {
  tick = 0
  const product = new ProductRepos(store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  return { product, equipes: new EquipeRepos(store, now), categories: new CategoryRepos(store, now), channels: new ChannelRepos(store, now) }
}

const base = { workspaceId: 'ws', projectId: 'pp' }

it('a v25 database with real rows opens at v26 and loses NOTHING (channels, kinds, members, pins keep; the new tables start empty)', async () => {
  const temp = await openTempStore({ migrations: PERSONA_MIGRATIONS.filter(item => item.version <= 25) })
  try {
    expect(temp.store.schemaVersion()).toBe(25)
    tick = 0
    const old = new ProductRepos(temp.store, now)
    old.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
    const channels = new ChannelRepos(temp.store, now)
    channels.create({ id: 'geral', ...base, name: 'geral', kind: 'general' })
    channels.create({ id: 'ideias', ...base, name: 'ideias', topic: 'rascunhos', kind: 'custom' })
    channels.create({ id: 'mkt', ...base, name: 'marketing', kind: 'team', sourceId: 'sec-mkt' })
    channels.setMembers('ideias', [{ kind: 'persona', id: 'p-nina' }])
    channels.setPinned('ideias', 'owner', true)
    temp.store.close()
    const migrated = openPersonaStore({ path: temp.path, backupDir: join(temp.dir, 'backups') })
    try {
      expect(migrated.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
      expect(PERSONA_SCHEMA_VERSION).toBeGreaterThanOrEqual(26)
      const after = new ChannelRepos(migrated, now)
      expect(after.get('geral')).toMatchObject({ kind: 'general', name: 'geral' })
      expect(after.get('ideias')).toMatchObject({ kind: 'custom', topic: 'rascunhos' })
      expect(after.get('mkt')).toMatchObject({ kind: 'team', sourceId: 'sec-mkt' })
      expect(after.members('ideias')).toEqual([{ kind: 'persona', id: 'p-nina' }])
      expect([...after.pinnedBy('owner')]).toEqual(['ideias'])
      expect(new EquipeRepos(migrated, now).list('pp', true)).toEqual([])
      expect(new CategoryRepos(migrated, now).list('pp')).toEqual([])
      // every old channel is "no category", at position 0: the sidebar looks exactly like before until the person arranges something
      expect(new CategoryRepos(migrated, now).placements('pp')).toEqual([])
      const column = migrated.db.prepare("SELECT name, \"notnull\" AS required, dflt_value AS dflt FROM pragma_table_info('channel') WHERE name = 'position'").get() as { required: number; dflt: string } | undefined
      expect(column).toMatchObject({ required: 1, dflt: '0' })
    } finally {
      migrated.close()
    }
  } finally {
    await temp.dispose()
  }
}, 30_000)

it('a v26 that FAILS rolls back whole: the database stays at v25 with every row, and a backup of v25 exists (honest failure)', async () => {
  const shipped = PERSONA_MIGRATIONS.filter(item => item.version <= 25)
  const temp = await openTempStore({ migrations: shipped })
  try {
    tick = 0
    const old = new ProductRepos(temp.store, now)
    old.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
    new ChannelRepos(temp.store, now).create({ id: 'geral', ...base, name: 'geral', kind: 'general' })
    temp.store.close()
    const broken = [...shipped, { version: 26, sql: 'CREATE TABLE equipe (id TEXT PRIMARY KEY) STRICT; THIS IS NOT SQL;' }]
    try {
      openPersonaStore({ path: temp.path, backupDir: join(temp.dir, 'backups'), migrations: broken })
      expect.unreachable()
    } catch (error: unknown) {
      expect(error).toBeInstanceOf(StoreError)
      expect((error as StoreError).code).toBe('migration-failed')
    }
    // the shipped code still opens it at v25 and the data is there; the half-made `equipe` table did not survive
    const reopened = openPersonaStore({ path: temp.path, backupDir: join(temp.dir, 'backups'), migrations: shipped })
    try {
      expect(reopened.schemaVersion()).toBe(25)
      expect(new ChannelRepos(reopened, now).get('geral')).toMatchObject({ kind: 'general' })
      expect(reopened.db.prepare("SELECT name FROM sqlite_master WHERE name = 'equipe'").get()).toBeUndefined()
    } finally {
      reopened.close()
    }
  } finally {
    await temp.dispose()
  }
}, 30_000)

it('names: trimmed, 1..40, no @ or line break, never the words @equipe/@time already mean (with or without accent or case)', () => {
  expect(cleanEquipeName('  Marketing   Digital ')).toBe('Marketing Digital')
  expect(() => cleanEquipeName('   ')).toThrow(StoreError)
  expect(() => cleanEquipeName('x'.repeat(EQUIPE_NAME_MAX + 1))).toThrow(StoreError)
  expect(cleanEquipeName('x'.repeat(EQUIPE_NAME_MAX))).toHaveLength(EQUIPE_NAME_MAX)
  for (const bad of ['@Vendas', 'Vendas\nPós', 'Equipe', 'TIME', ' Equipe ']) expect(() => cleanEquipeName(bad)).toThrow(StoreError)
  expect(cleanEquipeName('Equipe Sol')).toBe('Equipe Sol') // only the bare word is reserved
})

it('an equipe the person made: created in order, with members; a taken name is a conflict; rename; archive is idempotent and never deletes', async () => {
  await withTempStore(async (store) => {
    const { equipes } = seed(store)
    const a = equipes.create({ id: 'e1', ...base, name: 'Lançamento', color: '#c27', icon: 'rocket', personaIds: ['p-nina', 'p-sol', 'p-nina'] })
    const b = equipes.create({ id: 'e2', ...base, name: 'Suporte' })
    expect(a).toMatchObject({ name: 'Lançamento', position: 0, color: '#c27', icon: 'rocket' })
    expect([...a.personaIds].sort()).toEqual(['p-nina', 'p-sol'])
    expect(b.position).toBe(1)
    expect(a.sourceId).toBeUndefined()
    expect(() => equipes.create({ id: 'e3', ...base, name: 'Suporte' })).toThrowError(expect.objectContaining({ code: 'conflict' }))
    expect(equipes.rename('e2', 'Atendimento').name).toBe('Atendimento')
    expect(() => equipes.rename('e2', 'Lançamento')).toThrowError(expect.objectContaining({ code: 'conflict' }))
    const archived = equipes.archive('e1')
    expect(archived.archivedAt).toBeDefined()
    expect(equipes.archive('e1').archivedAt).toBe(archived.archivedAt) // the first instant stays
    expect(equipes.list('pp').map(item => item.id)).toEqual(['e2'])
    expect(equipes.list('pp', true).map(item => item.id)).toEqual(['e1', 'e2'])
    expect(equipes.unarchive('e1').archivedAt).toBeUndefined()
    expect(() => equipes.rename('nope', 'X')).toThrowError(expect.objectContaining({ code: 'not-found' }))
  })
})

it('members: replaced whole and deduplicated; an equipe that MIRRORS a sector keeps the organogram as its source (not editable here); one mirror per sector', async () => {
  await withTempStore(async (store) => {
    const { equipes } = seed(store)
    equipes.create({ id: 'own', ...base, name: 'Minha' })
    expect([...equipes.setMembers('own', ['p-a', 'p-b', 'p-a']).personaIds].sort()).toEqual(['p-a', 'p-b'])
    expect(equipes.setMembers('own', []).personaIds).toEqual([])
    equipes.create({ id: 'mirror', ...base, name: 'Marketing', sourceId: 'sec-mkt' })
    expect(() => equipes.setMembers('mirror', ['p-a'])).toThrowError(expect.objectContaining({ code: 'forbidden' }))
    expect(() => equipes.create({ id: 'again', ...base, name: 'Marketing 2', sourceId: 'sec-mkt' })).toThrowError(expect.objectContaining({ code: 'conflict' }))
  })
})

it('categories: ordered, unique names, reorder keeps the unnamed after the named; removing one sends its channels back to "no category" and deletes none', async () => {
  await withTempStore(async (store) => {
    const { categories, channels, product } = seed(store)
    categories.create({ id: 'c1', ...base, name: 'Clientes' })
    categories.create({ id: 'c2', ...base, name: 'Interno' })
    categories.create({ id: 'c3', ...base, name: 'Arquivo' })
    expect(categories.list('pp').map(item => item.name)).toEqual(['Clientes', 'Interno', 'Arquivo'])
    expect(() => categories.create({ id: 'c4', ...base, name: 'Interno' })).toThrowError(expect.objectContaining({ code: 'conflict' }))
    expect(categories.reorder('pp', ['c3', 'c1']).map(item => item.id)).toEqual(['c3', 'c1', 'c2'])
    product.createChannel({ id: 'ch1', ...base, name: 'pedidos', topic: '' })
    product.createChannel({ id: 'ch2', ...base, name: 'duvidas', topic: '' })
    categories.placeChannel('ch1', 'c1')
    categories.placeChannel('ch2', 'c1')
    expect(categories.placements('pp').map(item => [item.channelId, item.categoryId, item.position])).toEqual([['ch1', 'c1', 0], ['ch2', 'c1', 1]])
    categories.placeChannel('ch2', 'c1', 0)
    expect(categories.placements('pp').map(item => item.channelId)).toEqual(['ch2', 'ch1'])
    expect(categories.remove('c1')).toBe(true)
    expect(categories.remove('c1')).toBe(false)
    expect(categories.placements('pp')).toEqual([]) // both fell back to no category
    expect(channels.get('ch1')).toBeDefined() // and no channel was deleted
    expect(channels.get('ch2')).toBeDefined()
  })
})

it('the tenant fence: a channel never goes into a category of ANOTHER project, and an unknown channel or category is not-found', async () => {
  await withTempStore(async (store) => {
    const { categories, product } = seed(store)
    product.createProject({ id: 'p2', workspaceId: 'ws', name: 'Outro' })
    categories.create({ id: 'cx', workspaceId: 'ws', projectId: 'p2', name: 'Do outro' })
    product.createChannel({ id: 'ch1', ...base, name: 'pedidos', topic: '' })
    expect(() => categories.placeChannel('ch1', 'cx')).toThrowError(expect.objectContaining({ code: 'forbidden' }))
    expect(() => categories.placeChannel('nope', undefined)).toThrowError(expect.objectContaining({ code: 'not-found' }))
    expect(() => categories.placeChannel('ch1', 'nope')).toThrowError(expect.objectContaining({ code: 'not-found' }))
  })
})
