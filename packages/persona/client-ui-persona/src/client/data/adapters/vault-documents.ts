import type { VaultDocumentView } from '@deepseek-ai/dsh-persona-host/types'
import type { KnowledgeDocument } from '../../knowledge/mock-data.ts'

/** Map host Cofre document cards to Knowledge UI rows. */
export function vaultDocumentsToKnowledge(rows: readonly VaultDocumentView[]): KnowledgeDocument[] {
  return rows.map(row => ({
    id: row.id,
    name: row.title.length > 0 ? row.title : row.filename,
    version: row.revision,
    updatedAt: '',
    visibility: 'team',
    chunks: row.chunks,
    bytes: row.bytes,
    filename: row.filename,
  }))
}
