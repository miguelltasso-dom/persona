/**
 * Grok / grok-bot export (conversations JSON). Extra fields are ignored.
 * esquema presumido — validar com amostra real.
 */

import { IMPORT_SCHEMA_PRESUMED, type ImportAdapter, type ImportCandidate, type ImportFile, type ImportRejection } from './types.ts'

interface GrokMessage {
  role?: string
  author?: string
  content?: unknown
  text?: string
}

interface GrokConversation {
  id?: string
  conversation_id?: string
  title?: string
  messages?: GrokMessage[]
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function conversationsOf(parsed: unknown): GrokConversation[] {
  if (Array.isArray(parsed)) return parsed.filter((row): row is GrokConversation => typeof row === 'object' && row !== null)
  const rec = asRecord(parsed)
  const inner = rec?.conversations ?? rec?.chats
  if (Array.isArray(inner)) return inner.filter((row): row is GrokConversation => typeof row === 'object' && row !== null)
  return []
}

function textOf(item: GrokMessage): string {
  if (typeof item.text === 'string' && item.text.trim()) return item.text.trim()
  if (typeof item.content === 'string' && item.content.trim()) return item.content.trim()
  if (!Array.isArray(item.content)) return ''
  return item.content.flatMap(part => typeof part === 'string' && part.trim() ? [part.trim()] : []).join('\n')
}

export const grokAdapter: ImportAdapter = {
  id: 'grok',
  label: `Grok export (${IMPORT_SCHEMA_PRESUMED})`,
  sniff(files: readonly ImportFile[]): boolean {
    return files.some((file) => {
      const name = file.name.toLowerCase()
      if (!name.includes('grok')) return false
      return file.text.includes('"conversations"') || file.text.includes('"chats"')
    })
  },
  parse(files: readonly ImportFile[]) {
    const accepted: ImportCandidate[] = []
    const rejected: ImportRejection[] = []
    for (const file of files) {
      let parsed: unknown
      try { parsed = JSON.parse(file.text) }
      catch {
        rejected.push({ externalId: file.name, reason: 'INVALID_JSON', why: 'O JSON do Grok não abriu. Exporte de novo.' })
        continue
      }
      const rows = conversationsOf(parsed)
      if (rows.length === 0) {
        rejected.push({ externalId: file.name, reason: 'EMPTY', why: 'Não achei conversas neste arquivo do Grok.' })
        continue
      }
      for (const row of rows) {
        const id = (typeof row.id === 'string' && row.id) || (typeof row.conversation_id === 'string' && row.conversation_id) || ''
        if (id === '') continue
        const title = typeof row.title === 'string' ? row.title : 'conversa'
        const bits = (row.messages ?? []).map(textOf).filter(bit => bit.length > 0)
        accepted.push({
          kind: 'message',
          externalId: `grok:${id}`,
          body: [title, ...bits].join('\n\n'),
          privacy: 'private',
          status: 'proposed',
        })
      }
    }
    return { adapterId: 'grok', accepted, rejected, presumedSchema: true }
  },
}
