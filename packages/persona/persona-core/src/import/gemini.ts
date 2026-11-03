/**
 * Gemini Takeout (conversations JSON). Extra fields are ignored.
 * esquema presumido — validar com amostra real.
 */

import { IMPORT_SCHEMA_PRESUMED, type ImportAdapter, type ImportCandidate, type ImportFile, type ImportRejection } from './types.ts'

interface GeminiMessage {
  author?: string
  text?: string
  content?: string
}

interface GeminiConversation {
  id?: string
  conversation_id?: string
  title?: string
  messages?: GeminiMessage[]
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

export const geminiAdapter: ImportAdapter = {
  id: 'gemini',
  label: `Gemini Takeout (${IMPORT_SCHEMA_PRESUMED})`,
  sniff(files: readonly ImportFile[]): boolean {
    return files.some((file) => {
      const name = file.name.toLowerCase()
      if (name.includes('gemini') || name.includes('myactivity')) return file.text.includes('{')
      return file.text.includes('"conversations"') && (file.text.includes('"model_messages"') || file.text.includes('"conversation_id"'))
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
        const bits = (row.messages ?? []).map(item => item.text ?? item.content ?? '').filter(bit => bit.length > 0)
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
