/**
 * Obsidian-friendly markdown export / import of vault and memories (3c).
 */

import type { VaultKind, VaultRecord } from './schemas.ts'
import type { AgedMemory } from './aging.ts'

function fence(body: string): string {
  return body.replace(/\r\n/g, '\n').trimEnd()
}

/**
 * @param record - Vault record.
 */
export function vaultToMarkdown(record: VaultRecord): string {
  const lines = [
    '---',
    `id: ${record.id}`,
    `kind: ${record.kind}`,
    `revision: ${String(record.revision)}`,
    `status: ${record.status}`,
    `workspace: ${record.workspaceId}`,
    '---',
    '',
    fence(record.body),
    '',
  ]
  return lines.join('\n')
}

/**
 * @param markdown - Document produced by {@link vaultToMarkdown}.
 */
export function markdownToVault(markdown: string): Pick<VaultRecord, 'id' | 'kind' | 'revision' | 'status' | 'workspaceId' | 'body'> {
  const match = markdown.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (match === null) throw new Error('INVALID_MARKDOWN')
  const front = match[1] ?? ''
  const body = (match[2] ?? '').trim()
  const field = (name: string): string => {
    const row = front.split('\n').find(line => line.startsWith(`${name}:`))
    return row === undefined ? '' : row.slice(name.length + 1).trim()
  }
  return {
    id: field('id'),
    kind: field('kind') as VaultKind,
    revision: Number(field('revision')),
    status: field('status') as VaultRecord['status'],
    workspaceId: field('workspace'),
    body,
  }
}

/**
 * @param memory - Aged memory.
 */
export function memoryToMarkdown(memory: AgedMemory): string {
  return [
    '---',
    `id: ${memory.id}`,
    `layer: ${memory.layer}`,
    `score: ${memory.score.toFixed(3)}`,
    `uses: ${String(memory.uses)}`,
    `archived: ${memory.archived ? 'true' : 'false'}`,
    '---',
    '',
    fence(memory.body),
    '',
  ].join('\n')
}
