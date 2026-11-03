/**
 * Folder of Markdown notes (Obsidian-style). Front matter is optional.
 */

import type { ImportAdapter, ImportCandidate, ImportFile } from './types.ts'

export const markdownAdapter: ImportAdapter = {
  id: 'markdown',
  label: 'Markdown folder',
  sniff(files: readonly ImportFile[]): boolean {
    return files.length > 0 && files.every(file => file.name.endsWith('.md'))
  },
  parse(files: readonly ImportFile[]) {
    const accepted: ImportCandidate[] = files.map(file => ({
      kind: 'memory' as const,
      externalId: `md:${file.name}`,
      body: file.text,
      privacy: 'private' as const,
      status: 'proposed' as const,
    }))
    return { adapterId: 'markdown', accepted, rejected: [] }
  },
}
