/**
 * Preview → batch. Reimport of the same external id is a no-op. Rollback
 * marks the batch; Anvil deletes the proposed rows.
 */

import { DomainError } from '../domain/schemas.ts'
import { refuseSecrets } from './privacy.ts'
import {
  IMPORT_UNRECOGNIZED,
  type ImportAdapter,
  type ImportBatch,
  type ImportCandidate,
  type ImportFile,
  type ImportPreview,
  type ImportRejection,
  type ImportStore,
} from './types.ts'

function whyOf(reason: string, fallback: string): string {
  if (reason === 'SECRET') return 'Parece um segredo. Isso não entra.'
  if (reason === 'DUPLICATE') return 'Já importado. Reimportar não duplica.'
  if (reason === 'DM_UNSHARED') return 'Conversa direta só sobe se você marcar como compartilhada.'
  if (reason === 'ATTACHMENT') return fallback
  if (reason === 'DISCARDED') return fallback
  return fallback
}

function enrich(preview: ImportPreview, store?: ImportStore, files: readonly ImportFile[] = []): ImportPreview {
  const rejected: ImportRejection[] = preview.rejected.map(row => ({
    ...row,
    why: row.why ?? whyOf(row.reason, 'Descartado.'),
  }))
  const accepted: ImportCandidate[] = []
  let duplicates = 0
  const dmBlocked = files.some(file => file.dm === true && file.shared !== true)
  for (const row of preview.accepted) {
    if (dmBlocked) {
      rejected.push({
        externalId: row.externalId,
        reason: 'DM_UNSHARED',
        why: whyOf('DM_UNSHARED', ''),
      })
      continue
    }
    if (store?.hasExternalId(row.externalId) === true) {
      duplicates += 1
      rejected.push({
        externalId: row.externalId,
        reason: 'DUPLICATE',
        why: whyOf('DUPLICATE', ''),
      })
      continue
    }
    accepted.push(row)
  }
  return {
    ...preview,
    accepted,
    rejected,
    presumedSchema: true,
    counts: {
      accepted: accepted.length,
      rejected: rejected.length,
      duplicates,
      discarded: rejected.length,
    },
  }
}

/**
 * @param adapters - Registered adapters, first sniff wins.
 * @param files - User files.
 * @param store - Optional store so the preview can mark duplicates.
 */
export function previewImport(
  adapters: readonly ImportAdapter[],
  files: readonly ImportFile[],
  store?: ImportStore,
): ImportPreview {
  const adapter = adapters.find(item => item.sniff(files))
  if (adapter === undefined) throw new DomainError('IMPORT_REFUSED', IMPORT_UNRECOGNIZED)
  return enrich(refuseSecrets(adapter.parse(files)), store, files)
}

/**
 * Apply only new external ids. Every row stays `proposed`. Never raises privacy.
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
