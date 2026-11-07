/**
 * ISO-2 store: a grant is a pointer with a level, apart from persona.tools; the log only grows and outlives the persona.
 * Contract: persona-spec/contracts/connector-grants.md.
 */
import { join } from 'node:path'
import { expect, it } from 'vitest'
import { StoreError } from '../src/errors.ts'
import {
  ConnectorGrantRepos, MAX_CONNECTOR_GRANTS_PER_PERSONA, PERSONA_MIGRATIONS, PERSONA_SCHEMA_VERSION, ProductRepos, openPersonaStore,
} from '../src/index.ts'
import { openTempStore, withTempStore } from '../src/test-helpers.ts'
import type { PersonaStore } from '../src/index.ts'

let tick = 0
const now = (): string => `2026-11-04T12:00:${String(tick += 1).padStart(2, '0')}.000Z`
const base = { workspaceId: 'ws', personaId: 'nina', cli: 'claude', connectorId: 'notes-mcp', name: 'Notas', access: 'read' as const, grantedBy: 'ana' }

function seed(store: PersonaStore): ConnectorGrantRepos {
  tick = 0
  const product = new ProductRepos(store, now)
  product.createWorkspace({ id: 'ws', name: 'Acme', personalProjectId: 'pp' })
  product.createWorkspace({ id: 'other', name: 'Outra', personalProjectId: 'po' })
  for (const [workspaceId, projectId, id] of [['ws', 'pp', 'nina'], ['ws', 'pp', 'bento'], ['other', 'po', 'zeca']] as const) {
    product.createPersona({
      id, workspaceId, name: id, avatar: { kind: 'gallery', ref: id }, title: 'Eng', description: 'x', personality: 'x', instructions: 'x',
      runner: { kind: 'cli', cli: 'claude', model: 'm' }, tools: {}, skills: [], limits: {}, systemRoles: [], canRecruit: false,
      createdAt: now(), updatedAt: now(), createdBy: 'ana',
    }, projectId)
  }
  return new ConnectorGrantRepos(store, now)
}

it('grant, change, repeat and revoke: the same level twice writes and logs nothing; the log only grows', async () => {
  await withTempStore(async (store) => {
    const book = seed(store)
    expect(book.list('ws', 'nina')).toEqual([])
    const first = book.put(base)
    expect(first.action).toBe('grant')
    expect(book.get('ws', 'nina', 'claude', 'notes-mcp')).toMatchObject({ name: 'Notas', access: 'read', grantedBy: 'ana' })
    expect(book.put(base).action).toBe('unchanged') // same level: nothing new
    expect(book.log('ws', 'nina')).toHaveLength(1)
    const changed = book.put({ ...base, access: 'write', grantedBy: 'bia' })
    expect(changed.action).toBe('change')
    expect(book.list('ws', 'nina')).toHaveLength(1) // one row per (persona, cli, connector)
    expect(book.get('ws', 'nina', 'claude', 'notes-mcp')).toMatchObject({ access: 'write', grantedBy: 'bia' })
    const removed = book.revoke('ws', 'nina', 'claude', 'notes-mcp', 'ana')
    expect(removed).toMatchObject({ connectorId: 'notes-mcp', access: 'write' })
    expect(book.revoke('ws', 'nina', 'claude', 'notes-mcp', 'ana')).toBeUndefined() // idempotent: nothing there, nothing logged
    expect(book.list('ws', 'nina')).toEqual([])
    expect(book.log('ws', 'nina').map(row => [row.action, row.access, row.actorId])).toEqual([
      ['grant', 'read', 'ana'], ['change', 'write', 'bia'], ['revoke', undefined, 'ana'],
    ])
  })
})

it('waivers are per class: nothing is waived unless asked, pay and delete only by their own value, and a value from the wire never widens them', async () => {
  await withTempStore(async (store) => {
    const book = seed(store)
    expect(book.put(base).grant.confirm).toEqual({ send: 'ask', pay: 'ask', delete: 'ask' }) // the default: every irreversible action asks
    expect(book.put({ ...base, confirm: { send: 'never' } }).action).toBe('change') // the "Não perguntar de novo" box
    expect(book.get('ws', 'nina', 'claude', 'notes-mcp')?.confirm).toEqual({ send: 'never', pay: 'ask', delete: 'ask' }) // send never waives pay or delete
    expect(book.put({ ...base, confirm: { send: 'never' } }).action).toBe('unchanged')
    expect(book.put({ ...base, confirm: { send: 'never', pay: 'never' } }).action).toBe('change') // an explicit waiver of pay, on its own
    expect(book.get('ws', 'nina', 'claude', 'notes-mcp')?.confirm).toEqual({ send: 'never', pay: 'never', delete: 'ask' })
    // A class left out of a later call goes back to ask (a waiver does not linger by omission); junk from the wire is ask, the safe side.
    book.put({ ...base, confirm: { delete: 'never' } })
    expect(book.get('ws', 'nina', 'claude', 'notes-mcp')?.confirm).toEqual({ send: 'ask', pay: 'ask', delete: 'never' })
    book.put({ ...base, confirm: { send: 'always' as unknown as 'never', pay: true as unknown as 'never' } })
    expect(book.get('ws', 'nina', 'claude', 'notes-mcp')?.confirm).toEqual({ send: 'ask', pay: 'ask', delete: 'ask' })
    // The log says what was waived at each step.
    expect(book.log('ws', 'nina').map(row => `${row.confirm?.send ?? '-'}/${row.confirm?.pay ?? '-'}/${row.confirm?.delete ?? '-'}`)).toEqual([
      'ask/ask/ask', 'never/ask/ask', 'never/never/ask', 'ask/ask/never', 'ask/ask/ask',
    ])
  })
})

it('a grant is a pointer: nothing but the id, a label and a level is kept (no command, URL or secret column exists)', async () => {
  await withTempStore(async (store) => {
    const columns = (table: string): string[] => store.db.prepare(`PRAGMA table_info(${table})`).all().map(row => String(row.name))
    expect(columns('connector_grant').sort()).toEqual([
      'access', 'cli', 'confirm_delete', 'confirm_pay', 'confirm_send', 'connector_id', 'granted_at', 'granted_by', 'name', 'persona_id', 'workspace_id',
    ])
    expect(columns('connector_grant_log').sort()).toEqual(['access', 'action', 'actor_id', 'at', 'cli', 'confirm_json', 'connector_id', 'id', 'persona_id', 'workspace_id'])
  })
})

it('refuses fields outside their limits and stores nothing', async () => {
  await withTempStore(async (store) => {
    const book = seed(store)
    const bad: Array<Partial<typeof base>> = [
      { cli: 'Claude Code' }, { cli: '' }, { cli: 'x'.repeat(33) },
      { connectorId: '' }, { connectorId: 'x'.repeat(257) }, { connectorId: 'a\u0000b' },
      { name: '' }, { name: '   ' }, { name: 'x'.repeat(81) }, { name: 'Notas\nnovas' },
      { access: 'admin' as unknown as 'read' },
    ]
    for (const override of bad) expect(() => book.put({ ...base, ...override }), JSON.stringify(override)).toThrow(StoreError)
    expect(book.list('ws')).toEqual([])
    expect(book.log('ws')).toEqual([])
    expect(book.put({ ...base, name: '  Notas  ' }).grant.name).toBe('Notas') // the label is trimmed
  })
})

it('holds at most 64 per persona; changing a level at the limit still works; another persona is unaffected', async () => {
  await withTempStore(async (store) => {
    const book = seed(store)
    for (let index = 0; index < MAX_CONNECTOR_GRANTS_PER_PERSONA; index += 1) book.put({ ...base, connectorId: `mcp-${String(index).padStart(3, '0')}` })
    expect(book.count('ws', 'nina')).toBe(64)
    expect(() => book.put({ ...base, connectorId: 'one-too-many' })).toThrow(expect.objectContaining({ detail: 'connector-limit' }))
    expect(book.put({ ...base, connectorId: 'mcp-000', access: 'write' }).action).toBe('change')
    expect(book.put({ ...base, personaId: 'bento', connectorId: 'one-too-many' }).action).toBe('grant')
  })
})

it('the list is stable (CLI, then connector id) and a workspace never sees another one\'s grants', async () => {
  await withTempStore(async (store) => {
    const book = seed(store)
    book.put({ ...base, cli: 'opencode', connectorId: 'z' })
    book.put({ ...base, connectorId: 'b-mcp' })
    book.put({ ...base, connectorId: 'a-mcp' })
    book.put({ ...base, workspaceId: 'other', personaId: 'zeca', connectorId: 'secret-mcp' })
    expect(book.list('ws', 'nina').map(row => `${row.cli}/${row.connectorId}`)).toEqual(['claude/a-mcp', 'claude/b-mcp', 'opencode/z'])
    expect(book.list('ws').some(row => row.connectorId === 'secret-mcp')).toBe(false)
    expect(book.list('other').map(row => row.connectorId)).toEqual(['secret-mcp'])
    expect(book.log('ws').some(row => row.connectorId === 'secret-mcp')).toBe(false)
  })
})

it('deleting the persona removes her grants and keeps the log', async () => {
  await withTempStore(async (store) => {
    const book = seed(store)
    book.put(base)
    book.put({ ...base, personaId: 'bento' })
    store.db.exec("DELETE FROM persona WHERE id = 'nina'")
    expect(book.list('ws', 'nina')).toEqual([])
    expect(book.list('ws', 'bento')).toHaveLength(1)
    expect(book.log('ws', 'nina')).toHaveLength(1) // what was granted stays on record
  })
})

it('a v21 database opens at the current version with its data intact and no grant invented', async () => {
  const temp = await openTempStore({ migrations: PERSONA_MIGRATIONS.filter(item => item.version <= 21) })
  try {
    expect(temp.store.schemaVersion()).toBe(21)
    temp.store.db.exec("INSERT INTO workspace (id, name, created_at, updated_at) VALUES ('ws-old', 'Antiga', '2026-11-03T10:00:00.000Z', '2026-11-03T10:00:00.000Z')")
    temp.store.close()
    const migrated = openPersonaStore({ path: temp.path, backupDir: join(temp.dir, 'backups') })
    try {
      expect(migrated.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
      expect(migrated.db.prepare("SELECT name FROM workspace WHERE id = 'ws-old'").get()).toMatchObject({ name: 'Antiga' })
      expect(new ConnectorGrantRepos(migrated).list('ws-old')).toEqual([])
    } finally {
      migrated.close()
    }
  } finally {
    await temp.dispose()
  }
})
