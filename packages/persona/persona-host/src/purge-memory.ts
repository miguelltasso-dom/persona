/**
 * `purgeMemory`: apagamento real de uma memória ou proposta de memória (`vault_record`, `vault_version`,
 * `memory_proposal`, `memory_proof`, `memory_promotion`, `vault_proposal`), zerando páginas livres no `.db`,
 * truncando o `-wal` e limpando cópias em `backups/`. Diferente de `forgetMemory` (que só revoga), nada sobra em claro.
 */
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import type { ScreenRepos, VaultRepos } from '@deepseek-ai/dsh-persona-store'
import { MEMORY_PROMOTION_KIND } from './memory-promotion.ts'
import { MEMORY_PROOF_KIND } from './owner-memory.ts'
import { assertMemoryReachable } from './private-records.ts'

const KIND_MEMORY_PROPOSAL = 'memory_proposal'
const KIND_VAULT_PROPOSAL = 'vault_proposal'

/** Repositories required to verify ownership and physically purge a memory. */
export interface PurgeMemoryStores {
  readonly vault: VaultRepos
  readonly screens: ScreenRepos
}

/** Tenant and target memory identifier. */
export interface PurgeMemoryScope {
  readonly workspaceId: string
  readonly projectId: string
  readonly id: string
}

/** Optional hooks invoked once durable deletion completes. */
export interface PurgeMemoryOptions {
  /** Invoked with the purged memory id so callers can drop in-memory context caches. */
  readonly onPurged?: (recordId: string) => void
}

/** Result returned after irreversible erasure of a memory and its disk artifacts. */
export interface PurgeMemoryResult {
  readonly id: string
  readonly purged: true
}

function purgeFromDatabase(db: DatabaseSync, projectId: string, id: string, tables: ReadonlySet<string>): void {
  if (tables.has('vault_record')) {
    db.prepare('DELETE FROM vault_record WHERE id = ? AND project_id = ?').run(id, projectId)
  }
  if (tables.has('vault_version')) {
    db.prepare("DELETE FROM vault_version WHERE target_kind = 'record' AND target_id = ? AND project_id = ?").run(id, projectId)
  }
  if (tables.has('screen_doc')) {
    db.prepare('DELETE FROM screen_doc WHERE project_id = ? AND kind IN (?, ?) AND id = ?').run(
      projectId,
      KIND_MEMORY_PROPOSAL,
      MEMORY_PROOF_KIND,
      id,
    )
    db.prepare("DELETE FROM screen_doc WHERE project_id = ? AND kind IN (?, ?) AND json_extract(body, '$.recordId') = ?").run(
      projectId,
      MEMORY_PROMOTION_KIND,
      KIND_VAULT_PROPOSAL,
      id,
    )
  }
}

function tableNamesOf(db: DatabaseSync): Set<string> {
  const rows = db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as Array<{ readonly name: string }>
  return new Set(rows.map(row => row.name))
}

function scrubBackupFiles(backupDir: string, projectId: string, id: string): void {
  if (backupDir === '' || !existsSync(backupDir)) return
  for (const name of readdirSync(backupDir)) {
    if (!name.endsWith('.db')) continue
    const copy = new DatabaseSync(join(backupDir, name))
    try {
      const tables = tableNamesOf(copy)
      if (!tables.has('vault_record') && !tables.has('vault_version') && !tables.has('screen_doc')) continue
      copy.exec('PRAGMA secure_delete = ON')
      copy.exec('BEGIN IMMEDIATE')
      try {
        purgeFromDatabase(copy, projectId, id, tables)
        copy.exec('COMMIT')
      } catch (error: unknown) {
        try { copy.exec('ROLLBACK') } catch (rollbackError: unknown) { void rollbackError /* best-effort rollback before rethrowing original failure */ }
        throw error
      }
      copy.exec('VACUUM')
      copy.exec('PRAGMA wal_checkpoint(TRUNCATE)')
    } finally {
      copy.close()
    }
  }
}

/**
 * Permanently delete a reachable memory (or pending proposal), its versions, proofs, promotion trail, and vault proposals,
 * zeroing freed database pages, truncating the WAL, and scrubbing backup databases.
 * @param stores - Vault and screen repositories.
 * @param scope - Workspace, project, and memory identifier.
 * @param viewerId - Authenticated member id from the session (never from a request body field).
 * @param options - Optional post-purge cleanup hooks.
 * @returns Confirmation object with `{ id, purged: true }`.
 */
export function purgeMemoryRecord(
  stores: PurgeMemoryStores,
  scope: PurgeMemoryScope,
  viewerId: string,
  options: PurgeMemoryOptions = {},
): PurgeMemoryResult {
  assertMemoryReachable(stores, scope, viewerId)
  const store = stores.vault.store
  const recordRow = store.db.prepare('SELECT project_id FROM vault_record WHERE id = ?').get(scope.id) as
    | { readonly project_id: string }
    | undefined
  if (recordRow !== undefined && recordRow.project_id !== scope.projectId) throw new Error('memory-not-found')
  const hasPending = stores.screens.get(scope.projectId, KIND_MEMORY_PROPOSAL, scope.id) !== undefined
  if (recordRow === undefined && !hasPending) throw new Error('memory-not-found')

  const tables = tableNamesOf(store.db)
  store.withSecureDelete(() => {
    store.tx((db) => {
      purgeFromDatabase(db, scope.projectId, scope.id, tables)
    })
  })
  // Compact and truncate outside any outer transaction so previously-updated B-tree free space and old WAL page frames vanish.
  if (!store.db.isTransaction) {
    store.compactSecrets()
  }
  if (store.path !== ':memory:') {
    scrubBackupFiles(store.backupDir, scope.projectId, scope.id)
  }
  options.onPurged?.(scope.id)
  return { id: scope.id, purged: true }
}
