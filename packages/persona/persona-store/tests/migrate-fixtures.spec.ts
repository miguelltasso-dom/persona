import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { afterEach, expect, it } from 'vitest'
import {
  PERSONA_MIGRATIONS,
  PERSONA_SCHEMA_VERSION,
  StoreError,
  openPersonaStore,
  openTempStore,
} from '../src/index.ts'

const handles: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  await Promise.all(handles.splice(0).map(item => item.dispose()))
})

it('fixtures v1..v6 migrate to current and keep workspace rows', async () => {
  for (let version = 1; version <= PERSONA_SCHEMA_VERSION; version += 1) {
    const temp = await openTempStore({
      migrations: PERSONA_MIGRATIONS.filter(item => item.version <= version),
    })
    handles.push(temp)
    const now = '2026-11-03T15:00:00.000Z'
    temp.store.db.exec(
      `INSERT INTO workspace (id, name, created_at, updated_at) VALUES ('ws-v${version}', 'Acme v${version}', '${now}', '${now}')`,
    )
    temp.store.close()
    const migrated = openPersonaStore({ path: temp.path, backupDir: join(temp.dir, 'backups') })
    expect(migrated.schemaVersion()).toBe(PERSONA_SCHEMA_VERSION)
    const row = migrated.db.prepare('SELECT name FROM workspace WHERE id = ?').get(`ws-v${version}`) as { name: string }
    expect(row.name).toBe(`Acme v${version}`)
    migrated.close()
  }
// Justified: one temp SQLite per schema version (25 now, one more with each migration) on a loaded Windows box; not a wall-clock assertion.
}, 60_000)

it('refuses a newer database with a clear pt-BR message and does not migrate down', async () => {
  const temp = await openTempStore()
  handles.push(temp)
  temp.store.close()
  const raw = new DatabaseSync(temp.path)
  raw.exec('PRAGMA user_version = 999')
  raw.close()
  try {
    openPersonaStore({ path: temp.path, backupDir: join(temp.dir, 'backups') })
    expect.unreachable()
  } catch (error: unknown) {
    expect(error).toBeInstanceOf(StoreError)
    expect((error as StoreError).code).toBe('version-too-new')
    expect((error as StoreError).userMessage).toMatch(/versão mais nova/)
    expect((error as StoreError).message).toMatch(/versão mais nova/)
  }
  const again = new DatabaseSync(temp.path)
  expect((again.prepare('PRAGMA user_version').get() as { user_version: number }).user_version).toBe(999)
  again.close()
})

it('opens the last VACUUM INTO backup when the live file is corrupt', async () => {
  const temp = await openTempStore()
  handles.push(temp)
  const now = '2026-11-03T15:00:00.000Z'
  temp.store.db.exec(
    `INSERT INTO workspace (id, name, created_at, updated_at) VALUES ('ws-ok', 'Salvo', '${now}', '${now}')`,
  )
  mkdirSync(temp.store.backupDir, { recursive: true })
  const backup = join(temp.store.backupDir, 'persona-v6-to-v6-hand.db')
  temp.store.db.exec(`VACUUM INTO '${backup.replaceAll('\\', '/')}'`)
  temp.store.close()
  writeFileSync(temp.path, 'not-a-database')
  const recovered = openPersonaStore({ path: temp.path, backupDir: temp.store.backupDir })
  expect(recovered.recoveredFrom).toBe(backup)
  expect(recovered.recoveryMessage).toMatch(/backup/)
  const row = recovered.db.prepare('SELECT name FROM workspace WHERE id = ?').get('ws-ok') as { name: string }
  expect(row.name).toBe('Salvo')
  recovered.close()
})
