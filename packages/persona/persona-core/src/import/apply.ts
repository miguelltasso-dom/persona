/**
 * Preview → batch. Reimport of the same external id is a no-op. Rollback
 * marks the batch; Anvil deletes the proposed rows.
 */

import { DomainError } from '../domain/schemas.ts'
import { refuseSecrets } from './privacy.ts'
import type { ImportAdapter, ImportBatch, ImportFile, ImportPreview, ImportStore } from './types.ts'

/**
 * @param adapters - Registered adapters, first sniff wins.
 * @param files - User files.
 */
export function previewImport(adapters: readonly ImportAdapter[], files: readonly ImportFile[]): ImportPreview {
  const adapter = adapters.find(item => item.sniff(files))
  if (adapter === undefined) throw new DomainError('IMPORT_REFUSED', 'NO_ADAPTER')
  return refuseSecrets(adapter.parse(files))
}

/**
 * Apply only new external ids. Every row stays `proposed`.
 * @param store - Import store.
 * @param preview - Secret-stripped preview.
 * @param batchId - New batch id.
 */
export function applyImport(store: ImportStore, preview: ImportPreview, batchId: string): ImportBatch {
  const applied = preview.accepted.filter(row => !store.hasExternalId(row.externalId))
    .map(row => ({ ...row, status: 'proposed' as const }))
  const batch: ImportBatch = { id: batchId, adapterId: preview.adapterId, applied, rolledBack: false }
  store.saveBatch(batch)
  return batch
}

/**
 * @param store - Import store.
 * @param batchId - Batch to roll back.
 */
export function rollbackImport(store: ImportStore, batchId: string): ImportBatch {
  const batch = store.getBatch(batchId)
  if (batch === undefined) throw new DomainError('IMPORT_REFUSED', 'UNKNOWN_BATCH')
  const next = { ...batch, rolledBack: true }
  store.saveBatch(next)
  return next
}

/** In-memory store for tests and ephemeral hosts. */
export class MemoryImportStore implements ImportStore {
  private readonly batches = new Map<string, ImportBatch>()

  hasExternalId(externalId: string): boolean {
    for (const batch of this.batches.values()) {
      if (batch.rolledBack) continue
      if (batch.applied.some(row => row.externalId === externalId)) return true
    }
    return false
  }

  saveBatch(batch: ImportBatch): void {
    this.batches.set(batch.id, batch)
  }

  getBatch(batchId: string): ImportBatch | undefined {
    return this.batches.get(batchId)
  }
}
