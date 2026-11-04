import { mayUpload } from '@deepseek-ai/dsh-persona-core'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import {
  PERSONA_MIGRATIONS,
  PERSONA_SCHEMA_VERSION,
  ProductRepos,
  SqliteCardRepos,
  SqliteGovernanceRepos,
  openPersonaStore,
  openTempStore,
  type PersonaStore,
  type TempStore,
} from '../src/index.ts'

const stores: PersonaStore[] = []
const temps: TempStore[] = []
afterEach(async () => {
  for (const store of stores.splice(0)) store.close()
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

function seed(store: PersonaStore): ProductRepos {
  const product = new ProductRepos(store, () => '2026-11-03T15:00:00.000Z')
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  product.createMember({ id: 'ana', workspaceId: 'ws', displayName: 'Ana', handle: 'ana', role: 'owner' })
  product.createPersona({
    id: 'dev', workspaceId: 'ws', name: 'Bento', title: 'Engenharia',
    description: 'Código.', personality: 'Direto.', instructions: 'Entregue.',
    avatar: { kind: 'gallery', ref: 'bento' },
    runner: { kind: 'cli', cli: 'claude', model: 'haiku' },
    tools: {}, skills: [], limits: {}, systemRoles: [], canRecruit: false,
    createdAt: '2026-11-03T15:00:00.000Z', updatedAt: '2026-11-03T15:00:00.000Z', createdBy: 'ana',
  }, 'pp')
  return product
}

it('migrates v10 → v11, backfills responsável, and keeps existing charge', async () => {
  const v10 = PERSONA_MIGRATIONS.filter(item => item.version <= 10)
  const handle = await openTempStore({ migrations: v10 })
  temps.push(handle)
  seed(handle.store)
  const cards = new SqliteCardRepos(handle.store, () => '2026-11-03T15:00:00.000Z')
  cards.putCharge({ personaId: 'dev', responsibleHumanId: 'ana', confirmed: true })
  handle.store.close()
  const migrated = openPersonaStore({
    path: handle.path,
    backupDir: join(handle.dir, 'db', 'backups'),
  })
  temps.push({ store: migrated, dir: handle.dir, path: handle.path, dispose: async () => { migrated.close() } })
  expect(migrated.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
  const again = new SqliteCardRepos(migrated)
  expect(again.getCharge('dev')?.responsibleHumanId).toBe('ana')
  expect(new SqliteGovernanceRepos(migrated).listSectors('ws')).toEqual([])
})

it('persists sector, away, routine charge, delegate, and audit', () => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  seed(store)
  const gov = new SqliteGovernanceRepos(store, () => '2026-11-03T16:00:00.000Z')
  const sector = gov.putSector({
    id: 'eng', workspaceId: 'ws', name: 'Engenharia',
    policyJson: JSON.stringify({ autonomy: 'propose', requiredApprovals: [] }),
  })
  expect(gov.listSectors('ws')[0]?.name).toBe('Engenharia')
  expect(gov.getSector(sector.id)?.policyJson).toContain('propose')
  expect(gov.setAway('ws', 'ana', [{
    kind: 'away', from: '2026-11-04T00:00:00.000Z', until: '2026-11-06T00:00:00.000Z',
  }])[0]?.kind).toBe('away')
  expect(gov.setAway('ws', 'ana', [])).toEqual([])
  gov.putRoutineCharge({
    routineId: 'rt-1', workspaceId: 'ws', title: 'Standup',
    responsibleHumanId: 'ana', requiresApproval: false,
  })
  expect(gov.listRoutineCharges('ws')[0]?.title).toBe('Standup')
  gov.addDelegate('ws', 'rt-1')
  expect(gov.listDelegates('ws')).toEqual(['rt-1'])
  gov.putAudit({
    id: 'a1', workspaceId: 'ws', at: '2026-11-03T16:00:00.000Z',
    action: 'set-sector', actorId: 'ana', body: '{"sectorId":"eng"}',
  })
  expect(gov.listAudit('ws')[0]?.action).toBe('set-sector')
})

it('crash during putSector rolls back; reopen keeps sector and audit', async () => {
  const handle = await openTempStore()
  temps.push(handle)
  seed(handle.store)
  const gov = new SqliteGovernanceRepos(handle.store, () => '2026-11-03T16:00:00.000Z')
  gov.putSector({
    id: 'eng', workspaceId: 'ws', name: 'Engenharia',
    policyJson: JSON.stringify({ autonomy: 'propose', requiredApprovals: [] }),
  })
  gov.putAudit({
    id: 'a1', workspaceId: 'ws', at: '2026-11-03T16:00:00.000Z',
    action: 'set-sector', actorId: 'ana', body: '{"sectorId":"eng"}',
  })
  let writes = 0
  const inner = handle.store.tx.bind(handle.store)
  handle.store.tx = ((work) => {
    writes += 1
    if (writes === 1) throw new Error('boom')
    return inner(work)
  })
  expect(() => gov.putSector({
    id: 'ops', workspaceId: 'ws', name: 'Ops',
    policyJson: JSON.stringify({ autonomy: 'act', requiredApprovals: [] }),
  })).toThrow('boom')
  handle.store.tx = inner
  expect(gov.listSectors('ws').map(row => row.id)).toEqual(['eng'])
  handle.store.close()
  const again = openPersonaStore({
    path: handle.path,
    backupDir: join(handle.dir, 'db', 'backups'),
  })
  temps.push({ store: again, dir: handle.dir, path: handle.path, dispose: async () => { again.close() } })
  const reopened = new SqliteGovernanceRepos(again)
  expect(reopened.getSector('eng')?.name).toBe('Engenharia')
  expect(reopened.listAudit('ws')[0]?.id).toBe('a1')
  expect(reopened.listSectors('ws').some(row => row.id === 'ops')).toBe(false)
})

it('snapshot/restore is idempotent; workspace stream uploads; DM does not', () => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  seed(store)
  const gov = new SqliteGovernanceRepos(store, () => '2026-11-03T16:00:00.000Z')
  gov.putSector({
    id: 'eng', workspaceId: 'ws', name: 'Engenharia',
    policyJson: JSON.stringify({ autonomy: 'propose', requiredApprovals: [] }),
  })
  gov.putAudit({
    id: 'a1', workspaceId: 'ws', at: '2026-11-03T16:00:00.000Z',
    action: 'set-sector', actorId: 'ana', body: '{"sectorId":"eng"}',
  })
  const snap = gov.snapshot('ws')
  gov.restore('ws', snap)
  gov.restore('ws', snap)
  expect(gov.listSectors('ws').map(row => row.id)).toEqual(['eng'])
  expect(gov.listAudit('ws')).toHaveLength(1)
  expect(mayUpload({
    workspaceId: 'ws', streamId: 'gov:ws', seq: 1, idempotencyKey: 'g1',
    classification: 'workspace', at: '2026-11-03T16:00:00.000Z',
    payload: { clear: JSON.stringify(snap) },
  })).toBe(true)
  expect(mayUpload({
    workspaceId: 'ws', streamId: 'dm:secret', seq: 1, idempotencyKey: 'd1',
    classification: 'dm', at: '2026-11-03T16:00:00.000Z',
    payload: { clear: 'private' },
  })).toBe(false)
})

it('pruneAudit keeps the newest rows', () => {
  const store = openPersonaStore({ path: ':memory:' })
  stores.push(store)
  seed(store)
  const gov = new SqliteGovernanceRepos(store, () => '2026-11-03T16:00:00.000Z')
  for (let index = 0; index < 5; index += 1) {
    gov.putAudit({
      id: `a${index}`, workspaceId: 'ws', at: `2026-11-03T16:0${index}:00.000Z`,
      action: 'set-sector', actorId: 'ana', body: '{}',
    })
  }
  expect(gov.pruneAudit('ws', 2)).toBe(3)
  expect(gov.listAudit('ws').map(row => row.id)).toEqual(['a4', 'a3'])
})
