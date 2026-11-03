/**
 * ChatGPT export (`conversations.json`). Extra fields are ignored.
 * esquema presumido — validar com amostra real.
 */

import type { ImportAdapter, ImportCandidate, ImportFile } from './types.ts'

interface ChatGptNode {
  message?: { id?: string; content?: { parts?: unknown[] } }
}

interface ChatGptConversation {
  id?: string
  title?: string
  mapping?: Record<string, ChatGptNode>
}

function partsOf(conversation: ChatGptConversation): string {
  const parts: string[] = []
  for (const node of Object.values(conversation.mapping ?? {})) {
    const raw = node.message?.content?.parts ?? []
    for (const part of raw) if (typeof part === 'string' && part.trim()) parts.push(part.trim())
  }
  return parts.join('\n\n')
}

export const chatgptAdapter: ImportAdapter = {
  id: 'chatgpt',
  label: 'ChatGPT export (esquema presumido — validar com amostra real)',
  sniff(files: readonly ImportFile[]): boolean {
    return files.some(file => file.name.endsWith('conversations.json') && file.text.includes('"mapping"'))
  },
  parse(files: readonly ImportFile[]) {
    const file = files.find(item => item.name.endsWith('conversations.json'))
    const accepted: ImportCandidate[] = []
    if (file === undefined) return { adapterId: 'chatgpt', accepted, rejected: [] }
    let parsed: unknown
    try { parsed = JSON.parse(file.text) }
    catch { return { adapterId: 'chatgpt', accepted, rejected: [{ externalId: file.name, reason: 'INVALID_JSON' }] } }
    const rows = Array.isArray(parsed) ? parsed : []
    for (const row of rows) {
      if (typeof row !== 'object' || row === null) continue
      const conversation = row as ChatGptConversation
      const id = typeof conversation.id === 'string' ? conversation.id : ''
      if (id === '') continue
      const title = typeof conversation.title === 'string' ? conversation.title : 'conversation'
      const body = `${title}\n\n${partsOf(conversation)}`.trim()
      accepted.push({ kind: 'message', externalId: `chatgpt:${id}`, body, privacy: 'private', status: 'proposed' })
    }
    return { adapterId: 'chatgpt', accepted, rejected: [], presumedSchema: true }
  },
}
