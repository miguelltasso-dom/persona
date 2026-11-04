/**
 * Gemini Takeout (conversations JSON). Extra fields are ignored.
 * esquema presumido — validar com amostra real.
 */

import { IMPORT_SCHEMA_PRESUMED, type ImportAdapter, type ImportCandidate, type ImportFile, type ImportRejection } from './types.ts'

interface GeminiMessage {
  author?: string
  text?: string
  content?: unknown
  parts?: unknown[]
}

interface GeminiConversation {
  id?: string
  conversation_id?: string
  title?: string
  messages?: GeminiMessage[]
  model_messages?: GeminiMessage[]
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return undefined
  return value as Record<string, unknown>
}

function conversationsOf(parsed: unknown): GeminiConversation[] {
  if (Array.isArray(parsed)) return parsed.filter((row): row is GeminiConversation => typeof row === 'object' && row !== null)
  const rec = asRecord(parsed)
  const inner = rec?.conversations
  if (Array.isArray(inner)) return inner.filter((row): row is GeminiConversation => typeof row === 'object' && row !== null)
  return []
}

function textOf(item: GeminiMessage): string {
  if (typeof item.text === 'string' && item.text.trim()) return item.text.trim()
  if (typeof item.content === 'string' && item.content.trim()) return item.content.trim()
  if (Array.isArray(item.content)) {
    return item.content
      .flatMap((part) => {
        if (typeof part === 'string' && part.trim()) return [part.trim()]
        const rec = asRecord(part)
        return typeof rec?.text === 'string' && rec.text.trim() ? [rec.text.trim()] : []
      })
      .join('\n')
  }
  if (!Array.isArray(item.parts)) return ''
  return item.parts.flatMap(part => typeof part === 'string' && part.trim() ? [part.trim()] : []).join('\n')
}

function messagesOf(row: GeminiConversation): GeminiMessage[] {
  if (Array.isArray(row.messages) && row.messages.length > 0) return row.messages
  if (Array.isArray(row.model_messages)) return row.model_messages
  return []
}

export const geminiAdapter: ImportAdapter = {
  id: 'gemini',
  label: `Gemini Takeout (${IMPORT_SCHEMA_PRESUMED})`,
  sniff(files: readonly ImportFile[]): boolean {
    return files.some((file) => {
      const name = file.name.toLowerCase()
      if (name.includes('gemini') || name.includes('myactivity')) return file.text.includes('{')
      return file.text.includes('"model_messages"')
    })
  },
  parse(files: readonly ImportFile[]) {
    const accepted: ImportCandidate[] = []
    const rejected: ImportRejection[] = []
    for (const file of files) {
      let parsed: unknown
      try { parsed = JSON.parse(file.text) }
      catch {
        rejected.push({ externalId: file.name, reason: 'INVALID_JSON', why: 'O JSON do Gemini não abriu. Exporte de novo.' })
        continue
      }
      const rows = conversationsOf(parsed)
      if (rows.length === 0) {
        rejected.push({ externalId: file.name, reason: 'EMPTY', why: 'Não achei conversas neste Takeout.' })
        continue
      }
      for (const row of rows) {
        const id = (typeof row.id === 'string' && row.id) || (typeof row.conversation_id === 'string' && row.conversation_id) || ''
        if (id === '') continue
        const title = typeof row.title === 'string' ? row.title : 'conversa'
        const bits = messagesOf(row).map(textOf).filter(bit => bit.length > 0)
        accepted.push({
          kind: 'message',
          externalId: `gemini:${id}`,
          body: [title, ...bits].join('\n\n'),
          privacy: 'private',
          status: 'proposed',
        })
      }
    }
    return { adapterId: 'gemini', accepted, rejected, presumedSchema: true }
  },
}
