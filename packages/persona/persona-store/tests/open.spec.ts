import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import {
  PACKAGE_STORE,
  PERSONAL_PROJECT_NAME,
  PERSONA_APPLICATION_ID,
  PERSONA_MIGRATIONS,
  PERSONA_SCHEMA_VERSION,
  StoreError,
  openPersonaStore,
  openTempStore,
  type Migration,
  type TempStore,
} from '../src/index.ts'

const temps: TempStore[] = []

afterEach(async () => {
  await Promise.all(temps.splice(0).map(temp => temp.dispose()))
})

async function temp(options?: { migrations?: readonly Migration[] }): Promise<TempStore> {
  const handle = await openTempStore(options)
  temps.push(handle)
  return handle
}

function pragma(db: DatabaseSync, name: 'user_version' | 'application_id' | 'foreign_keys'): number {
  const row = db.prepare(`PRAGMA ${name}`).get() as Record<string, number>
  return row[name] ?? -1
}

it('persona-store skeleton loads', () => {
  expect(PACKAGE_STORE).toBe('persona-store')
  expect(PERSONAL_PROJECT_NAME).toBe('Pessoal')
  expect(PERSONA_SCHEMA_VERSION).toBe(4)
})

it('stamps application_id and user_version on a fresh file', async () => {
  const { store } = await temp()
  expect(store.applicationId()).toBe(PERSONA_APPLICATION_ID)
  expect(store.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
})

it('opens :memory: at the current schema', () => {
  const store = openPersonaStore({ path: ':memory:' })
  try {
    expect(store.applicationId()).toBe(PERSONA_APPLICATION_ID)
    expect(store.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
    expect(store.db.prepare("SELECT name FROM sqlite_master WHERE type='table' AND name='workspace'").get())
      .toEqual({ name: 'workspace' })
  } finally {
    store.close()
  }
})

it('reopen preserves rows and identity', async () => {
  const { path, store } = await temp()
  store.tx((db) => {
    db.prepare('INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('ws1', 'Acme', '2026-11-03T12:00:00Z', '2026-11-03T12:00:00Z')
  })
  store.close()
  const again = openPersonaStore({ path })
  temps.push({
    store: again, dir: '', path, dispose: async () => { again.close() },
  })
  expect(again.applicationId()).toBe(PERSONA_APPLICATION_ID)
  expect(again.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
  const row = again.db.prepare('SELECT name FROM workspace WHERE id = ?').get('ws1') as { name: string }
  expect(row.name).toBe('Acme')
})

it('refuses a foreign application_id', async () => {
  const { path, store, dir } = await temp()
  store.close()
  const raw = new DatabaseSync(path)
  raw.exec('PRAGMA application_id = 1')
  raw.close()
  expect(() => openPersonaStore({ path, backupDir: join(dir, 'backups') })).toThrow(StoreError)
  try {
    openPersonaStore({ path, backupDir: join(dir, 'backups') })
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(StoreError)
    expect((error as StoreError).code).toBe('foreign-application')
  }
})

it('refuses a greater user_version', async () => {
  const { path, store, dir } = await temp()
  store.close()
  const raw = new DatabaseSync(path)
  raw.exec('PRAGMA user_version = 999')
  raw.close()
  try {
    openPersonaStore({ path, backupDir: join(dir, 'backups') })
    expect.unreachable()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(StoreError)
    expect((error as StoreError).code).toBe('version-too-new')
  }
})

it('refuses an unrecognized file that already has user tables', async () => {
  const handle = await temp()
  const alien = join(handle.dir, 'alien.db')
  const raw = new DatabaseSync(alien)
  raw.exec('CREATE TABLE leftover (id TEXT PRIMARY KEY) STRICT')
  raw.close()
  try {
    openPersonaStore({ path: alien })
    expect.unreachable()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(StoreError)
    expect((error as StoreError).code).toBe('unrecognized-database')
  }
})

it('does not vacuum a brand-new empty file before v1', async () => {
  const { dir } = await temp()
  const backupDir = join(dir, 'db', 'backups')
  expect(existsSync(backupDir)).toBe(false)
})

it('backs up with VACUUM INTO before migrating', async () => {
  const v1: readonly Migration[] = PERSONA_MIGRATIONS.filter(item => item.version === 1)
  const { path, store, dir } = await temp({ migrations: v1 })
  store.tx((db) => {
    db.prepare('INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('ws1', 'Kept', '2026-11-03T12:00:00Z', '2026-11-03T12:00:00Z')
  })
  store.close()
  const v2: readonly Migration[] = [
    ...v1,
    { version: 2, sql: 'CREATE TABLE extra_flag (id TEXT PRIMARY KEY) STRICT;' },
  ]
  const migrated = openPersonaStore({ path, migrations: v2, backupDir: join(dir, 'db', 'backups') })
  temps.push({ store: migrated, dir, path, dispose: async () => { migrated.close() } })
  expect(migrated.schemaVersion()).toBe(2)
  const backups = readdirSync(join(dir, 'db', 'backups'))
  const name = backups.find(item => item.startsWith('persona-v1-to-v2-'))
  expect(name).toBeDefined()
  const backupFile = join(dir, 'db', 'backups', name ?? '')
  expect(existsSync(backupFile)).toBe(true)
  const snapshot = new DatabaseSync(backupFile)
  expect(pragma(snapshot, 'user_version')).toBe(1)
  const kept = snapshot.prepare('SELECT name FROM workspace WHERE id = ?').get('ws1') as { name: string }
  expect(kept.name).toBe('Kept')
  snapshot.close()
})

it('keeps the backup and rolls back the original when a migration fails', async () => {
  const v1: readonly Migration[] = PERSONA_MIGRATIONS.filter(item => item.version === 1)
  const { path, store, dir } = await temp({ migrations: v1 })
  store.tx((db) => {
    db.prepare('INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('ws1', 'Safe', '2026-11-03T12:00:00Z', '2026-11-03T12:00:00Z')
  })
  store.close()
  const failing: readonly Migration[] = [
    ...v1,
    { version: 2, sql: 'THIS IS NOT VALID SQL' },
  ]
  try {
    openPersonaStore({ path, migrations: failing, backupDir: join(dir, 'db', 'backups') })
    expect.unreachable()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(StoreError)
    expect((error as StoreError).code).toBe('migration-failed')
  }
  const backups = readdirSync(join(dir, 'db', 'backups'))
  expect(backups.length).toBe(1)
  const snapshot = new DatabaseSync(join(dir, 'db', 'backups', backups[0] ?? ''))
  expect(pragma(snapshot, 'user_version')).toBe(1)
  expect((snapshot.prepare('SELECT name FROM workspace WHERE id = ?').get('ws1') as { name: string }).name).toBe('Safe')
  snapshot.close()
  const original = new DatabaseSync(path)
  expect(pragma(original, 'user_version')).toBe(1)
  expect((original.prepare('SELECT name FROM workspace WHERE id = ?').get('ws1') as { name: string }).name).toBe('Safe')
  original.close()
})

it('refuses a migration gap', async () => {
  const { path, store, dir } = await temp()
  store.close()
  const gapped: readonly Migration[] = [
    ...PERSONA_MIGRATIONS,
    { version: PERSONA_SCHEMA_VERSION + 2, sql: 'CREATE TABLE skipped (id TEXT PRIMARY KEY) STRICT;' },
  ]
  try {
    openPersonaStore({ path, migrations: gapped, backupDir: join(dir, 'db', 'backups') })
    expect.unreachable()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(StoreError)
    expect((error as StoreError).code).toBe('migration-gap')
  }
})

it('tx commits a write', async () => {
  const { store } = await temp()
  store.tx((db) => {
    db.prepare('INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('ws1', 'Tx', '2026-11-03T12:00:00Z', '2026-11-03T12:00:00Z')
  })
  const row = store.db.prepare('SELECT name FROM workspace WHERE id = ?').get('ws1') as { name: string }
  expect(row.name).toBe('Tx')
})

it('tx rolls back on throw', async () => {
  const { store } = await temp()
  expect(() => store.tx((db) => {
    db.prepare('INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('ws1', 'Nope', '2026-11-03T12:00:00Z', '2026-11-03T12:00:00Z')
    throw new Error('boom')
  })).toThrow('boom')
  expect(store.db.prepare('SELECT count(*) AS n FROM workspace').get()).toEqual({ n: 0 })
})

it('nests tx with a savepoint and keeps the outer write when the inner rolls back', async () => {
  const { store } = await temp()
  store.tx((db) => {
    db.prepare('INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
      .run('ws1', 'Outer', '2026-11-03T12:00:00Z', '2026-11-03T12:00:00Z')
    try {
      store.tx((inner) => {
        inner.prepare('INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
          .run('ws2', 'Inner', '2026-11-03T12:00:00Z', '2026-11-03T12:00:00Z')
        throw new Error('inner')
      })
    } catch (error: unknown) {
      expect((error as Error).message).toBe('inner')
    }
  })
  const names = (store.db.prepare('SELECT name FROM workspace ORDER BY id').all() as Array<{ name: string }>)
    .map(row => row.name)
  expect(names).toEqual(['Outer'])
})

it('nests tx and releases a savepoint so the inner write commits with the outer', async () => {
  const { store } = await temp()
  store.tx(() => {
    store.tx((db) => {
      db.prepare('INSERT INTO workspace (id, name, created_at, updated_at) VALUES (?, ?, ?, ?)')
        .run('ws1', 'Nested', '2026-11-03T12:00:00Z', '2026-11-03T12:00:00Z')
    })
  })
  expect(store.db.prepare('SELECT name FROM workspace WHERE id = ?').get('ws1')).toEqual({ name: 'Nested' })
})

it('enables foreign_keys and WAL on a file database', async () => {
  const { store } = await temp()
  expect(pragma(store.db, 'foreign_keys')).toBe(1)
  const journal = store.db.prepare('PRAGMA journal_mode').get() as { journal_mode: string }
  expect(journal.journal_mode.toLowerCase()).toBe('wal')
})

it('applies busy_timeout', async () => {
  const { store } = await temp()
  const row = store.db.prepare('PRAGMA busy_timeout').get() as { timeout: number }
  expect(row.timeout).toBe(5_000)
})

it('throws not-open after close', async () => {
  const { store } = await temp()
  store.close()
  expect(() => store.schemaVersion()).toThrow(StoreError)
  try {
    store.schemaVersion()
  } catch (error: unknown) {
    expect((error as StoreError).code).toBe('not-open')
  }
})

it('creates missing parent directories', async () => {
  const handle = await temp()
  const nested = join(handle.dir, 'deep', 'db', 'persona.db')
  const store = openPersonaStore({ path: nested })
  temps.push({ store, dir: handle.dir, path: nested, dispose: async () => { store.close() } })
  expect(existsSync(nested)).toBe(true)
  expect(store.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
})

it('ships a contiguous v1 migration and creates STRICT product tables', async () => {
  expect(PERSONA_MIGRATIONS.map(item => item.version)).toEqual([1, 2, 3, 4])
  const { store } = await temp()
  const tables = (store.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '*_fts*' ORDER BY name",
  ).all() as Array<{ name: string }>).map(row => row.name)
  expect(tables).toEqual(expect.arrayContaining([
    'workspace', 'member', 'project', 'persona', 'participation', 'channel', 'dm',
    'stream', 'event', 'stream_cursor',
    'vault_record', 'vault_document', 'vault_version',
    'routine', 'routine_run',
    'engine_trigger', 'engine_ticket', 'engine_effect', 'engine_outbox',
    'sync_envelope', 'invite', 'invite_actor', 'import_batch',
    'autonomy', 'visit', 'initiative_fire', 'watchdog_audit', 'attention_spend',
  ]))
})
