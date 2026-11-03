import type { VaultRecordView } from '@deepseek-ai/dsh-persona-host/types'
import type { KnowledgeRecord } from '../../knowledge/mock-data.ts'

/** Map host vault rows to Cofre UI records. */
export function vaultRecordsToKnowledge(rows: readonly VaultRecordView[]): KnowledgeRecord[] {
  return rows.map((row, index) => ({
    id: row.id,
    type: row.kind,
    title: row.body.slice(0, 48) || row.id,
    excerpt: row.body,
    version: index + 1,
    updatedAt: '',
    author: '—',
    visibility: 'team',
  }))
}
