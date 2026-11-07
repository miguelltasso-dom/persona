/**
 * CV-6 store (contracts/team-channels.md): the channel beyond {id, name, topic}. DRAFT written during the host freeze — goes to
 * persona-store/tests when the second host window opens, together with migration v24.
 */
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { StoreError } from '../src/errors.ts'
import { ChannelRepos, PERSONA_MIGRATIONS, PERSONA_SCHEMA_VERSION, ProductRepos, openPersonaStore } from '../src/index.ts'
import { openTempStore, withTempStore } from '../src/test-helpers.ts'
import type { PersonaStore } from '../src/index.ts'

let tick = 0
const now = (): string => `2026-11-05T09:00:${String(tick += 1).padStart(2, '0')}.000Z`

function seed(store: PersonaStore): { product: ProductRepos; channels: ChannelRepos } {
  tick = 0
  const product = new ProductRepos(store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  return { product, channels: new ChannelRepos(store, now) }
}

const base = { workspaceId: 'ws', projectId: 'pp', topic: '' }

it('a v23 database opens at v24: the #geral becomes general, the others custom, nothing archived or locked', async () => {
  const temp = await openTempStore({ migrations: PERSONA_MIGRATIONS.filter(item => item.version <= 23) })
  try {
    expect(temp.store.schemaVersion()).toBe(23)
    const old = new ProductRepos(temp.store, now)
    old.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
    old.createChannel({ id: 'geral', ...base, name: 'geral' })
    old.createChannel({ id: 'ideias', ...base, name: 'ideias' })
    temp.store.close()
    const migrated = openPersonaStore({ path: temp.path, backupDir: join(temp.dir, 'backups') })
    try {
      expect(migrated.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
      const channels = new ChannelRepos(migrated, now)
      expect(channels.get('geral')).toMatchObject({ kind: 'general', nameLocked: false })
      expect(channels.get('geral')?.archivedAt).toBeUndefined()
      expect(channels.get('ideias')).toMatchObject({ kind: 'custom', nameLocked: false })
    } finally {
      migrated.close()
    }
  } finally {
    await temp.dispose()
  }
})

it('a team channel is one per (project, sector); a taken name is a conflict; rename can lock the name', async () => {
  await withTempStore(async (store) => {
    const { channels } = seed(store)
    channels.create({ id: 'equipe:pp:s1', ...base, name: 'marketing', kind: 'team', sourceId: 's1' })
    expect(channels.bySource('pp', 's1')?.id).toBe('equipe:pp:s1')
    expect(() => channels.create({ id: 'x', ...base, name: 'outro', kind: 'team', sourceId: 's1' })).toThrow() // UNIQUE (project, source)
    expect(() => channels.create({ id: 'y', ...base, name: 'marketing', kind: 'custom' })).toThrow(StoreError)
    const renamed = channels.rename('equipe:pp:s1', 'campanhas', true)
    expect(renamed).toMatchObject({ name: 'campanhas', nameLocked: true })
    expect(() => channels.rename('equipe:pp:s1', 'campanhas-2', false)).not.toThrow() // a later organogram rename keeps the lock
    expect(channels.get('equipe:pp:s1')?.nameLocked).toBe(true)
  })
})

it('archive never deletes and keeps the FIRST reason and instant; unarchive brings it back with its history', async () => {
  await withTempStore(async (store) => {
    const { channels } = seed(store)
    channels.create({ id: 'c1', ...base, name: 'time', kind: 'team', sourceId: 's1' })
    const first = channels.archive('c1', 'team-gone')
    const again = channels.archive('c1', 'by-person')
    expect(again.archivedAt).toBe(first.archivedAt)
    expect(again.archivedReason).toBe('team-gone')
    expect(channels.list('pp').map(channel => channel.id)).toContain('c1') // still listed (the caller decides what to show)
    const back = channels.unarchive('c1')
    expect(back.archivedAt).toBeUndefined()
    expect(back.archivedReason).toBeUndefined()
    expect(() => channels.archive('nope', 'by-person')).toThrow(StoreError)
  })
})

it('members of a channel the person made are replaced as a set; pins are each person\'s own; both cascade with the channel', async () => {
  await withTempStore(async (store) => {
    const { channels } = seed(store)
    channels.create({ id: 'c1', ...base, name: 'lancamento', kind: 'custom' })
    channels.setMembers('c1', [{ kind: 'persona', id: 'bia' }, { kind: 'human', id: 'ana' }, { kind: 'persona', id: 'bia' }])
    expect(channels.members('c1')).toEqual([{ kind: 'human', id: 'ana' }, { kind: 'persona', id: 'bia' }]) // deduplicated, stable
    channels.setMembers('c1', [{ kind: 'persona', id: 'teo' }])
    expect(channels.members('c1')).toEqual([{ kind: 'persona', id: 'teo' }])
    channels.setPinned('c1', 'ana', true)
    expect([...channels.pinnedBy('ana')]).toEqual(['c1'])
    expect([...channels.pinnedBy('outra')]).toEqual([]) // pinning is each person's own
    channels.setPinned('c1', 'ana', false)
    expect([...channels.pinnedBy('ana')]).toEqual([])
    channels.setPinned('c1', 'ana', true)
    store.db.exec("DELETE FROM channel WHERE id = 'c1'") // the store has no delete path of its own; the schema still cascades
    expect(channels.members('c1')).toEqual([])
    expect([...channels.pinnedBy('ana')]).toEqual([])
  })
})
