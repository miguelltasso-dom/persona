/**
 * Import framework (F1). Every accepted row is a proposal, never active.
 * Cookies and tokens are refused. Anvil persists batches; adapters stay here.
 */

export type ImportKind = 'preference' | 'decision' | 'skill' | 'memory' | 'message'
export type ImportPrivacy = 'workspace' | 'project' | 'private'

/** Mark every adapter until Miguel drops a real sample. */
export const IMPORT_SCHEMA_PRESUMED = 'esquema presumido — validar com amostra real'

export const IMPORT_UNRECOGNIZED =
  'Não reconheci este arquivo. Use uma pasta Markdown/Obsidian, um zip do Notion, ou a exportação do ChatGPT, do Claude ou do Gemini.'

export interface ImportFile {
  name: string
  text: string
  /** Persona DM. Never becomes workspace without {@link ImportFile.shared}. */
  dm?: boolean
  /** Person marked the private/DM payload as shared. */
  shared?: boolean
}

export interface ImportCounts {
  accepted: number
  rejected: number
  duplicates: number
  discarded: number
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
  /** pt-BR, one idea. */
  why?: string
}

export interface ImportPreview {
  adapterId: string
  accepted: ImportCandidate[]
  rejected: ImportRejection[]
  counts?: ImportCounts
  /** Always true until a real sample confirms the export. */
  presumedSchema?: boolean
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
