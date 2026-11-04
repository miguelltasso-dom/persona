/**
 * ChatGPT export (`conversations.json`). Extra fields are ignored.
 * esquema presumido — validar com amostra real.
 */

import type { ImportAdapter, ImportCandidate, ImportFile } from './types.ts'

interface ChatGptNode {
  id?: string
  parent?: string | null
  children?: string[]
  message?: {
    id?: string
    author?: { role?: string }
    content?: { content_type?: string; parts?: unknown[] }
  }
}

interface ChatGptConversation {
  id?: string
  conversation_id?: string
  title?: string
  current_node?: string
  mapping?: Record<string, ChatGptNode>
}

function textParts(node: ChatGptNode): string[] {
  const content = node.message?.content
  if (content === undefined) return []
  if (content.content_type === 'image_asset_pointer' || content.content_type === 'multimodal_text') {
    return (content.parts ?? []).flatMap(part => typeof part === 'string' && part.trim() ? [part.trim()] : [])
  }
  return (content.parts ?? []).flatMap(part => typeof part === 'string' && part.trim() ? [part.trim()] : [])
}

/**
 * Official ChatGPT export: walk `mapping` via `parent`/`children`, not object order.
 * @param conversation - One conversations.json row.
 */
function partsOf(conversation: ChatGptConversation): string {
  const mapping = conversation.mapping ?? {}
  const parts: string[] = []
  const seen = new Set<string>()
  const visit = (id: string): void => {
    if (seen.has(id)) return
    seen.add(id)
    const node = mapping[id]
    if (node === undefined) return
    parts.push(...textParts(node))
    for (const child of node.children ?? []) visit(child)
  }
  const roots = Object.entries(mapping)
    .filter(([, node]) => node.parent === null || node.parent === undefined)
    .map(([id]) => id)
  if (roots.length === 0) {
    for (const id of Object.keys(mapping)) visit(id)
  }
  else {
    for (const id of roots) visit(id)
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
      const id = typeof conversation.id === 'string' && conversation.id !== ''
        ? conversation.id
        : typeof conversation.conversation_id === 'string' ? conversation.conversation_id : ''
      if (id === '') continue
      const title = typeof conversation.title === 'string' ? conversation.title : 'conversation'
      const body = `${title}\n\n${partsOf(conversation)}`.trim()
      accepted.push({ kind: 'message', externalId: `chatgpt:${id}`, body, privacy: 'private', status: 'proposed' })
    }
    return { adapterId: 'chatgpt', accepted, rejected: [], presumedSchema: true }
  },
}
