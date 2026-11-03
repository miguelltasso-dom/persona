/**
 * Notion export (zip of .md / .csv). Extra columns are ignored.
 * esquema presumido — validar com amostra real.
 */

import { IMPORT_SCHEMA_PRESUMED, type ImportAdapter, type ImportCandidate, type ImportFile, type ImportRejection } from './types.ts'
import { expandWikilinks, stripFrontmatter } from './markdown.ts'

function csvRows(text: string): string[][] {
  return text.split(/\r?\n/).map(line => line.split(',').map(cell => cell.trim().replace(/^"|"$/g, ''))).filter(row => row.some(cell => cell.length > 0))
}

export const notionAdapter: ImportAdapter = {
  id: 'notion',
  label: `Notion export (${IMPORT_SCHEMA_PRESUMED})`,
  sniff(files: readonly ImportFile[]): boolean {
    const names = files.map(file => file.name.toLowerCase())
    if (names.some(name => name.includes('notion'))) return true
    const csv = files.find(file => file.name.endsWith('.csv'))
    if (csv === undefined) return false
    const header = csv.text.split(/\r?\n/)[0] ?? ''
    return /\bName\b/i.test(header) && files.some(file => file.name.endsWith('.md') || file.name.endsWith('.csv'))
  },
  parse(files: readonly ImportFile[]) {
    const accepted: ImportCandidate[] = []
    const rejected: ImportRejection[] = []
    for (const file of files) {
      if (file.name.endsWith('.csv')) {
        const rows = csvRows(file.text)
        const header = rows[0] ?? []
        const nameAt = header.findIndex(col => col.toLowerCase() === 'name')
        const textAt = header.findIndex(col => /^(text|content|body)$/i.test(col))
        for (const row of rows.slice(1)) {
          const name = nameAt >= 0 ? (row[nameAt] ?? '') : (row[0] ?? '')
          if (name === '') continue
          const extra = textAt >= 0 ? (row[textAt] ?? '') : row.slice(1).join(' ')
          accepted.push({
            kind: 'memory',
            externalId: `notion:csv:${file.name}:${name}`,
            body: `${name}\n\n${extra}`.trim(),
            privacy: 'private',
            status: 'proposed',
          })
        }
        continue
      }
      if (file.name.endsWith('.md')) {
        const split = stripFrontmatter(file.text)
        accepted.push({
          kind: 'memory',
          externalId: `notion:md:${file.name}`,
          body: expandWikilinks(`${split.title ?? file.name}\n\n${split.body}`).trim(),
          privacy: 'private',
          status: 'proposed',
        })
        continue
      }
      rejected.push({
        externalId: `notion:${file.name}`,
        reason: 'ATTACHMENT',
        why: `Anexo ignorado: ${file.name}.`,
      })
    }
    return { adapterId: 'notion', accepted, rejected, presumedSchema: true }
  },
}
