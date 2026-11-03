import { mkdir, mkdtemp } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { describe, expect, it } from 'vitest'
import { checkpointSqliteWal, personaDbPath } from '../src/shutdown.ts'

describe('desktop shutdown helpers', () => {
  it('checkpoints a sqlite WAL and no-ops a missing database', async () => {
    const root = await mkdtemp(join(tmpdir(), 'persona-wal-'))
    const dbPath = personaDbPath(root)
    await mkdir(join(root, 'db'), { recursive: true })
    const db = new DatabaseSync(dbPath)
    db.exec('PRAGMA journal_mode=WAL')
    db.exec('CREATE TABLE t(id INTEGER)')
    db.exec('INSERT INTO t(id) VALUES (1)')
    db.close()
    await checkpointSqliteWal(dbPath)
    await checkpointSqliteWal(join(root, 'missing.db'))
    const again = new DatabaseSync(dbPath, { readOnly: true })
    expect(again.prepare('SELECT id FROM t').get()).toEqual({ id: 1 })
    again.close()
  })
})
