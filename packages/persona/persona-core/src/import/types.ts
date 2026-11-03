/**
 * Import framework (F1). Every accepted row is a proposal, never active.
 * Cookies and tokens are refused. Anvil persists batches; adapters stay here.
 */

export type ImportKind = 'preference' | 'decision' | 'skill' | 'memory' | 'message'
export type ImportPrivacy = 'workspace' | 'project' | 'private'

export interface ImportFile {
  name: string
  text: string
}

export interface ImportCandidate {
  kind: ImportKind
  externalId: string
  body: string
  privacy: ImportPrivacy
  /** Always `proposed` at the adapter boundary. */
  status: 'proposed'
}

export interface ImportRejection {
  externalId: string
  reason: string
}

export interface ImportPreview {
  adapterId: string
  accepted: ImportCandidate[]
  rejected: ImportRejection[]
}

export interface ImportBatch {
  id: string
  adapterId: string
  applied: ImportCandidate[]
  rolledBack: boolean
}

export interface ImportAdapter {
  id: string
  label: string
  /**
   * @param files - User-selected files.
   */
  sniff(files: readonly ImportFile[]): boolean
  /**
   * @param files - Files this adapter claimed.
   */
  parse(files: readonly ImportFile[]): ImportPreview
}

/** Persistence port. Anvil stores applied batches for rollback. */
export interface ImportStore {
  /**
   * @param externalId - Stable id from the source export.
   */
  hasExternalId(externalId: string): boolean
  /**
   * @param batch - Applied proposals.
   */
  saveBatch(batch: ImportBatch): void
  /**
   * @param batchId - Batch to load.
   */
  getBatch(batchId: string): ImportBatch | undefined
}
