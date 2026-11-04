/**
 * Claude.ai export (conversations array with chat_messages). Extra fields ignored.
 * esquema presumido — validar com amostra real.
 */

import type { ImportAdapter, ImportCandidate, ImportFile, ImportRejection } from './types.ts'

interface ClaudeMessage {
  uuid?: string
  text?: string
  sender?: string
  content?: Array<{ type?: string; text?: string }>
  attachments?: Array<{ file_name?: string }>
  files?: Array<{ file_name?: string }>
}

interface ClaudeConversation {
  uuid?: string
  name?: string
  chat_messages?: ClaudeMessage[]
}

function messageText(message: ClaudeMessage): string {
  if (typeof message.text === 'string' && message.text.trim() !== '') return message.text.trim()
  return (message.content ?? [])
    .filter(part => part.type === 'text' && typeof part.text === 'string')
    .map(part => part.text!.trim())
    .filter(Boolean)
    .join('\n')
}

export const claudeAdapter: ImportAdapter = {
  id: 'claude',
  label: 'Claude.ai export (esquema presumido — validar com amostra real)',
  sniff(files: readonly ImportFile[]): boolean {
    return files.some(file => file.text.includes('"chat_messages"') && file.text.includes('"uuid"'))
  },
  parse(files: readonly ImportFile[]) {
    const file = files.find(item => item.text.includes('"chat_messages"'))
    const accepted: ImportCandidate[] = []
    const rejected: ImportRejection[] = []
    if (file === undefined) return { adapterId: 'claude', accepted, rejected }
    let parsed: unknown
    try { parsed = JSON.parse(file.text) }
    catch { return { adapterId: 'claude', accepted, rejected: [{ externalId: file.name, reason: 'INVALID_JSON' }] } }
    const rows = Array.isArray(parsed) ? parsed : []
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue
      const conversation = row as ClaudeConversation
      const id = typeof conversation.uuid === 'string' ? conversation.uuid : ''
      if (id === '') continue
      const title = typeof conversation.name === 'string' ? conversation.name : 'conversation'
      const lines = (conversation.chat_messages ?? []).map(messageText).filter(Boolean)
      const body = [title, ...lines].join('\n\n')
      accepted.push({ kind: 'message', externalId: `claude:${id}`, body, privacy: 'private', status: 'proposed' })
      for (const message of conversation.chat_messages ?? []) {
        for (const attach of [...(message.attachments ?? []), ...(message.files ?? [])]) {
          const name = attach.file_name ?? 'anexo'
          rejected.push({
            externalId: `claude:${id}:${name}`,
            reason: 'ATTACHMENT',
            why: `Anexo ignorado: ${name}. Importe só o texto da conversa.`,
          })
        }
      }
    }
    return { adapterId: 'claude', accepted, rejected, presumedSchema: true }
  },
}
