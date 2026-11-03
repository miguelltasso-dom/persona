/**
 * Open, identify, migrate, and transact against `persona.db`.
 */

import { closeSync, mkdirSync, openSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import {
  PERSONA_APPLICATION_ID,
  PERSONA_BUSY_TIMEOUT_MS,
} from './constants.ts'
import { StoreError } from './errors.ts'
import { PERSONA_MIGRATIONS, type Migration } from './migrations.ts'

/** Options for {@link openPersonaStore}. */
export interface OpenPersonaStoreOptions {
  /** File path or `:memory:`. Missing parent directories are created. */
  readonly path: string
  /** Override shipped migrations (tests). Must stay adjacent from 1. */
  readonly migrations?: readonly Migration[]
  /** Directory for `VACUUM INTO` copies. Defaults to `<dbDir>/backups`. */
  readonly backupDir?: string
  /** `PRAGMA busy_timeout` in milliseconds. */
  readonly busyTimeoutMs?: number
}

/**
 * Live `persona.db` connection. Writes go through {@link PersonaStore.tx};
 * never `await` inside that callback.
 */
export class PersonaStore {
  readonly path: string
  readonly backupDir: string
  /** Live `DatabaseSync`. Callers must not close it. */
  readonly db: DatabaseSync
  #open = true
  #txDepth = 0

  /**
   * @param path - Resolved file path or `:memory:`.
   * @param db - Configured connection owned by this instance.
   * @param backupDir - Directory used for pre-migration backups.
   */
  constructor(path: string, db: DatabaseSync, backupDir: string) {
    this.path = path
    this.db = db
    this.backupDir = backupDir
  }

  /**
   * @returns Current `PRAGMA user_version`.
   */
  schemaVersion(): number {
    this.assertOpen()
    return readUserVersion(this.db)
  }

  /**
   * @returns Current `PRAGMA application_id`.
   */
  applicationId(): number {
    this.assertOpen()
    return readApplicationId(this.db)
  }

  /**
   * Run `work` inside `BEGIN IMMEDIATE`, or a savepoint when already in a tx.
   * Inner rollback does not undo the outer transaction. Never `await` in `work`.
   * @param work - Synchronous body.
   * @returns The value returned by `work`.
   */
  tx<T>(work: (db: DatabaseSync) => T): T {
    this.assertOpen()
    this.#txDepth += 1
    const depth = this.#txDepth
    const savepoint = depth === 1 ? undefined : `sp_${depth}`
    if (savepoint === undefined) this.db.exec('BEGIN IMMEDIATE')
    else this.db.exec(`SAVEPOINT ${savepoint}`)
    try {
      const result = work(this.db)
      if (savepoint === undefined) this.db.exec('COMMIT')
      else this.db.exec(`RELEASE ${savepoint}`)
      return result
    } catch (error: unknown) {
      try {
        if (savepoint === undefined) this.db.exec('ROLLBACK')
        else {
          this.db.exec(`ROLLBACK TO ${savepoint}`)
          this.db.exec(`RELEASE ${savepoint}`)
        }
      } catch (rollbackError: unknown) {
        void rollbackError
      }
      throw error
    } finally {
      this.#txDepth -= 1
    }
  }

  /** Close the connection. Further use throws `not-open`. */
  close(): void {
    if (!this.#open) return
    this.#open = false
    this.db.close()
  }

  private assertOpen(): void {
    if (!this.#open) throw new StoreError('not-open')
  }
}

/**
 * Open or create `persona.db`, refuse foreign/newer files, backup, then migrate.
 * @param options - Path and optional test overrides.
 * @returns An open store at {@link PERSONA_SCHEMA_VERSION} (or the last injected migration).
 */
export function openPersonaStore(options: OpenPersonaStoreOptions): PersonaStore {
  const path = options.path === ':memory:' ? ':memory:' : resolve(options.path)
  const migrations = options.migrations ?? PERSONA_MIGRATIONS
  const known = maxVersion(migrations)
  const backupDir = options.backupDir ?? (path === ':memory:' ? '' : join(dirname(path), 'backups'))
  const busyTimeoutMs = options.busyTimeoutMs ?? PERSONA_BUSY_TIMEOUT_MS

  if (path !== ':memory:') {
    mkdirSync(dirname(path), { recursive: true, mode: 0o700 })
    createDatabaseFile(path)
  }

  const db = new DatabaseSync(path)
  try {
    configurePragmas(db, path, busyTimeoutMs)
    const applicationId = readApplicationId(db)
    const onDisk = readUserVersion(db)
    const userTables = listUserTables(db)

    if (applicationId !== 0 && applicationId !== PERSONA_APPLICATION_ID) {
      throw new StoreError(
        'foreign-application',
        `application_id ${applicationId} is not Persona`,
      )
    }
    if (applicationId === 0 && userTables.length > 0) {
      throw new StoreError('unrecognized-database', path)
    }
    if (onDisk > known) {
      throw new StoreError(
        'version-too-new',
        `on-disk ${onDisk} > known ${known}`,
      )
    }

    if (applicationId === 0) {
      db.exec(`PRAGMA application_id = ${PERSONA_APPLICATION_ID}`)
    }

    if (onDisk < known) {
      migrate(db, {
        path,
        backupDir,
        from: onDisk,
        migrations,
      })
    }

    return new PersonaStore(path, db, backupDir)
  } catch (error: unknown) {
    db.close()
    throw error
  }
}

function createDatabaseFile(path: string): void {
  try {
    const fd = openSync(path, 'wx', 0o600)
    closeSync(fd)
  } catch (error: unknown) {
    if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
  }
}

function configurePragmas(db: DatabaseSync, path: string, busyTimeoutMs: number): void {
  db.exec('PRAGMA foreign_keys = ON')
  db.exec(`PRAGMA busy_timeout = ${Math.trunc(busyTimeoutMs)}`)
  if (path !== ':memory:') db.exec('PRAGMA journal_mode = WAL')
}

function readUserVersion(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA user_version').get() as { user_version: number }
  return row.user_version
}

function readApplicationId(db: DatabaseSync): number {
  const row = db.prepare('PRAGMA application_id').get() as { application_id: number }
  return row.application_id
}

function listUserTables(db: DatabaseSync): string[] {
  const rows = db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' ORDER BY name",
  ).all() as Array<{ name: string }>
  return rows.map(row => row.name)
}

function maxVersion(migrations: readonly Migration[]): number {
  let max = 0
  for (const migration of migrations) {
    if (migration.version > max) max = migration.version
  }
  return max
}

function quoteSqlString(value: string): string {
  return `'${value.replaceAll("'", "''")}'`
}

function backupPath(backupDir: string, from: number, to: number): string {
  const stamp = new Date().toISOString().replaceAll(':', '').replaceAll('.', '')
  return join(backupDir, `persona-v${from}-to-v${to}-${stamp}.db`)
}

function vacuumInto(db: DatabaseSync, dest: string): void {
  const posix = dest.replaceAll('\\', '/')
  try {
    db.exec(`VACUUM INTO ${quoteSqlString(posix)}`)
  } catch (error: unknown) {
    const detail = error instanceof Error ? error.message : 'vacuum-into'
    throw new StoreError('backup-failed', detail)
  }
}

function migrate(
  db: DatabaseSync,
  input: {
    path: string
    backupDir: string
    from: number
    migrations: readonly Migration[]
  },
): void {
  const needed = input.migrations
    .filter(migration => migration.version > input.from)
    .slice()
    .sort((a, b) => a.version - b.version)

  if (needed.length === 0) return

  for (let index = 0; index < needed.length; index += 1) {
    const expected = input.from + 1 + index
    const actual = needed[index]
    if (actual === undefined || actual.version !== expected) {
      throw new StoreError('migration-gap', `expected v${expected}`)
    }
  }

  if (input.path !== ':memory:' && input.from > 0) {
    mkdirSync(input.backupDir, { recursive: true, mode: 0o700 })
    const last = needed[needed.length - 1]
    if (last === undefined) throw new StoreError('migration-gap')
    vacuumInto(db, backupPath(input.backupDir, input.from, last.version))
  }

  for (const migration of needed) {
    db.exec('BEGIN IMMEDIATE')
    try {
      db.exec(migration.sql)
      db.exec(`PRAGMA user_version = ${migration.version}`)
      db.exec('COMMIT')
    } catch (error: unknown) {
      try {
        db.exec('ROLLBACK')
      } catch (rollbackError: unknown) {
        void rollbackError
      }
      const detail = error instanceof Error ? error.message : 'migration'
      throw new StoreError('migration-failed', detail)
    }
  }
}
