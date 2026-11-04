import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, expect, it } from 'vitest'
import { StoreError, openPersonaStore, openTempStore } from '../src/index.ts'

const handles: Array<{ dispose: () => Promise<void> }> = []
afterEach(async () => {
  await Promise.all(handles.splice(0).map(item => item.dispose()))
})

it('opens safe mode when the live file is corrupt and there is no backup', async () => {
  const temp = await openTempStore()
  handles.push(temp)
  temp.store.close()
  writeFileSync(temp.path, 'not-a-database')
  const safe = openPersonaStore({ path: temp.path, backupDir: join(temp.dir, 'backups') })
  expect(safe.safeMode).toBe(true)
  expect(safe.recoveryMessage).toMatch(/modo seguro/)
  expect(safe.schemaVersion()).toBeGreaterThan(0)
  expect(safe.db.prepare('SELECT COUNT(*) AS n FROM workspace').get() as { n: number }).toEqual({ n: 0 })
  safe.close()
})

it('restoreBackup replaces live rows with the chosen copy', async () => {
  const temp = await openTempStore()
  handles.push(temp)
  const now = '2026-11-03T15:00:00.000Z'
  temp.store.db.exec(
    `INSERT INTO workspace (id, name, created_at, updated_at) VALUES ('ws-a', 'Antes', '${now}', '${now}')`,
  )
  const dest = temp.store.backupNow()
  temp.store.db.exec(
    `INSERT INTO workspace (id, name, created_at, updated_at) VALUES ('ws-b', 'Depois', '${now}', '${now}')`,
  )
  expect(temp.store.db.prepare('SELECT name FROM workspace WHERE id = ?').get('ws-b')).toBeDefined()
  temp.store.restoreBackup(dest.split(/[/\\]/).pop() ?? '')
  expect(temp.store.recoveryMessage).toMatch(/backup/)
  expect(temp.store.safeMode).toBe(false)
  expect((temp.store.db.prepare('SELECT name FROM workspace WHERE id = ?').get('ws-a') as { name: string }).name).toBe('Antes')
  expect(temp.store.db.prepare('SELECT name FROM workspace WHERE id = ?').get('ws-b')).toBeUndefined()
})

it('restoreBackup refuses a path escape and :memory:', async () => {
  const temp = await openTempStore()
  handles.push(temp)
  expect(() => temp.store.restoreBackup('../secret.db')).toThrow(StoreError)
  const memory = openPersonaStore({ path: ':memory:' })
  expect(() => memory.restoreBackup('x.db')).toThrow(StoreError)
  memory.close()
})

it('corrupt file with a backup still restores that copy', async () => {
  const temp = await openTempStore()
  handles.push(temp)
  const now = '2026-11-03T15:00:00.000Z'
  temp.store.db.exec(
    `INSERT INTO workspace (id, name, created_at, updated_at) VALUES ('ws-ok', 'Salvo', '${now}', '${now}')`,
  )
  mkdirSync(temp.store.backupDir, { recursive: true })
  const backup = join(temp.store.backupDir, 'persona-manual-hand.db')
  temp.store.db.exec(`VACUUM INTO '${backup.replaceAll('\\', '/')}'`)
  temp.store.close()
  writeFileSync(temp.path, 'not-a-database')
  const recovered = openPersonaStore({ path: temp.path, backupDir: temp.store.backupDir })
  expect(recovered.safeMode).toBe(false)
  expect(recovered.recoveredFrom).toBe(backup)
  expect((recovered.db.prepare('SELECT name FROM workspace WHERE id = ?').get('ws-ok') as { name: string }).name).toBe('Salvo')
  recovered.close()
})
