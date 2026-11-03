/**
 * Claude.ai export (conversations array with chat_messages).
 */

import type { ImportAdapter, ImportCandidate, ImportFile } from './types.ts'

interface ClaudeMessage {
  uuid?: string
  text?: string
}

interface ClaudeConversation {
  uuid?: string
  name?: string
  chat_messages?: ClaudeMessage[]
}

export const claudeAdapter: ImportAdapter = {
  id: 'claude',
  label: 'Claude.ai export',
  sniff(files: readonly ImportFile[]): boolean {
    return files.some(file => file.text.includes('"chat_messages"') && file.text.includes('"uuid"'))
  },
  parse(files: readonly ImportFile[]) {
    const file = files.find(item => item.text.includes('"chat_messages"'))
    const accepted: ImportCandidate[] = []
    if (file === undefined) return { adapterId: 'claude', accepted, rejected: [] }
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
      const body = [title, ...(conversation.chat_messages ?? []).map(item => item.text ?? '').filter(Boolean)].join('\n\n')
      accepted.push({ kind: 'message', externalId: `claude:${id}`, body, privacy: 'private', status: 'proposed' })
    }
    return { adapterId: 'claude', accepted, rejected: [] }
  },
}
