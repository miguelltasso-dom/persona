/**
 * Irreversible tenant wipe (export / backup / exclusão).
 */

import type { DatabaseSync } from 'node:sqlite'
import { StoreError } from '../errors.ts'
import { run } from '../sql.ts'
import type { PersonaStore } from '../store.ts'

/**
 * Delete every row for `workspaceId`. Foreign keys stay off for the duration
 * (`PRAGMA foreign_keys` is a no-op inside a transaction).
 * @param store - Open store.
 * @param workspaceId - Workspace.
 */
export function wipeWorkspace(store: PersonaStore, workspaceId: string): void {
  const workspace = store.db.prepare('SELECT 1 AS ok FROM workspace WHERE id = ?').get(workspaceId)
  if (workspace === undefined) throw new StoreError('not-found', workspaceId)
  wipeScope(store, {
    workspaceId,
    projectIds: idsOf(store.db, 'SELECT id FROM project WHERE workspace_id = ?', [workspaceId]),
    personaIds: idsOf(store.db, 'SELECT id FROM persona WHERE workspace_id = ?', [workspaceId]),
    streamIds: idsOf(store.db, 'SELECT id FROM stream WHERE workspace_id = ?', [workspaceId]),
    deleteWorkspace: true,
  })
}

/**
 * Delete a shared project and its rows. The personal project cannot be removed.
 * @param store - Open store.
 * @param projectId - Shared project.
 */
export function wipeProject(store: PersonaStore, projectId: string): void {
  const row = store.db.prepare('SELECT kind FROM project WHERE id = ?').get(projectId) as
    | { kind: string }
    | undefined
  if (row === undefined) throw new StoreError('not-found', projectId)
  if (row.kind === 'personal') throw new StoreError('constraint', 'personal-project')
  wipeScope(store, {
    projectIds: [projectId],
    personaIds: idsOf(store.db, 'SELECT id FROM persona WHERE project_id = ?', [projectId]),
    streamIds: idsOf(store.db, 'SELECT id FROM stream WHERE project_id = ?', [projectId]),
    deleteWorkspace: false,
  })
}

function wipeScope(
  store: PersonaStore,
  scope: {
    workspaceId?: string
    projectIds: readonly string[]
    personaIds: readonly string[]
    streamIds: readonly string[]
    deleteWorkspace: boolean
  },
): void {
  store.db.exec('PRAGMA foreign_keys = OFF')
  try {
    store.tx((db) => {
      deleteIn(db, 'stream_cursor', 'stream_id', scope.streamIds)
      for (const table of listUserTables(db)) {
        const columns = listColumns(db, table)
        if (scope.workspaceId !== undefined && columns.includes('workspace_id')) {
          run(db, `DELETE FROM "${table}" WHERE workspace_id = ?`, [scope.workspaceId])
          continue
        }
        if (columns.includes('project_id')) {
          deleteIn(db, table, 'project_id', scope.projectIds)
          continue
        }
        if (columns.includes('persona_id')) {
          deleteIn(db, table, 'persona_id', scope.personaIds)
        }
      }
      if (scope.deleteWorkspace && scope.workspaceId !== undefined) {
        run(db, 'DELETE FROM workspace WHERE id = ?', [scope.workspaceId])
      } else {
        deleteIn(db, 'project', 'id', scope.projectIds)
      }
      if (listUserTables(db).includes('blob_object')) {
        db.exec(
          `DELETE FROM blob_object
            WHERE hash NOT IN (SELECT hash FROM attachment)
              AND hash NOT IN (
                SELECT json_extract(avatar_json, '$.ref') FROM persona
                 WHERE json_extract(avatar_json, '$.kind') = 'upload'
              )`,
        )
      }
    })
  } finally {
    store.db.exec('PRAGMA foreign_keys = ON')
  }
}

function deleteIn(
  db: DatabaseSync,
  table: string,
  column: string,
  ids: readonly string[],
): void {
  if (ids.length === 0) return
  const placeholders = ids.map(() => '?').join(', ')
  run(db, `DELETE FROM "${table}" WHERE "${column}" IN (${placeholders})`, ids)
}

function listUserTables(db: DatabaseSync): string[] {
  return (db.prepare(
    "SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT GLOB 'sqlite_*' AND name NOT GLOB '*_fts*'",
  ).all() as Array<{ name: string }>).map(row => row.name)
}

function listColumns(db: DatabaseSync, table: string): readonly string[] {
  return (db.prepare(`PRAGMA table_info("${table}")`).all() as Array<{ name: string }>).map(row => row.name)
}

function idsOf(db: DatabaseSync, sql: string, params: readonly string[]): string[] {
  return db.prepare(sql).all(...params).map((row) => {
    const value = row.id
    if (typeof value !== 'string') throw new StoreError('constraint', 'id')
    return value
  })
}
