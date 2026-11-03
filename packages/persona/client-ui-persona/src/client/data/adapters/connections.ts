import type { ConnectionView } from '@deepseek-ai/dsh-persona-host/types'
import type { ConnectionEntry } from '../../connections/mock-data.ts'

/** Host connection probe → Connections UI rows. */
export function connectionsToEntries(rows: readonly ConnectionView[]): ConnectionEntry[] {
  return rows.map(row => ({
    id: row.id,
    name: row.kind,
    detail: row.kind,
    status: row.available ? 'ready' : 'missing',
  }))
}
