/**
 * Markdown / Obsidian folder. Wikilinks and optional frontmatter.
 * Attachments are ignored with a warning. esquema presumido — validar com amostra real.
 */

import { IMPORT_SCHEMA_PRESUMED, type ImportAdapter, type ImportCandidate, type ImportFile, type ImportRejection } from './types.ts'

const ATTACH = /\.(png|jpe?g|gif|webp|pdf|mp3|mp4|mov|zip)$/i

/**
 * @param text - Note body.
 */
export function stripFrontmatter(text: string): { body: string; title?: string } {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?/.exec(text)
  if (match === null) return { body: text }
  const raw = match[1] ?? ''
  const titleLine = /^title:\s*(.+)$/m.exec(raw)
  const rest = text.slice(match[0].length)
  const title = titleLine?.[1]?.trim()
  return title === undefined || title.length === 0 ? { body: rest } : { body: rest, title }
}

/**
 * `[[Note]]` / `[[Note|label]]` → visible text. Links stay in the body.
 * @param text - Note body.
 */
export function expandWikilinks(text: string): string {
  return text.replace(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|([^\]]+))?\]\]/g, (_all, target: string, label?: string) => label ?? target)
}

export const markdownAdapter: ImportAdapter = {
  id: 'markdown',
  label: `Markdown/Obsidian (${IMPORT_SCHEMA_PRESUMED})`,
  sniff(files: readonly ImportFile[]): boolean {
    return files.some(file => file.name.endsWith('.md'))
  },
  parse(files: readonly ImportFile[]) {
    const accepted: ImportCandidate[] = []
    const rejected: ImportRejection[] = []
    for (const file of files) {
      const path = file.name.replace(/\\/g, '/')
      if (/(?:^|\/)\.obsidian(?:\/|$)/i.test(path)) {
        rejected.push({
          externalId: `md:${path}`,
          reason: 'DISCARDED',
          why: 'Pasta .obsidian ignorada.',
        })
        continue
      }
      if (/(?:^|\/)\.trash(?:\/|$)/i.test(path)) {
        rejected.push({
          externalId: `md:${path}`,
          reason: 'DISCARDED',
          why: 'Lixeira .trash ignorada.',
        })
        continue
      }
      if (ATTACH.test(file.name)) {
        rejected.push({
          externalId: `md:${file.name}`,
          reason: 'ATTACHMENT',
          why: `Anexo ignorado: ${file.name}. Importe só o texto da nota.`,
        })
        continue
      }
      if (!file.name.endsWith('.md')) {
        rejected.push({
          externalId: `md:${file.name}`,
          reason: 'DISCARDED',
          why: `Arquivo ignorado: ${file.name}. Só notas .md entram.`,
        })
        continue
      }
      const split = stripFrontmatter(file.text)
      const body = expandWikilinks(split.body).trim()
      const title = split.title === undefined ? file.name : split.title
      accepted.push({
        kind: 'memory',
        externalId: `md:${file.name}`,
        body: `${title}\n\n${body}`.trim(),
        privacy: 'private',
        status: 'proposed',
      })
    }
    return { adapterId: 'markdown', accepted, rejected, presumedSchema: true }
  },
}
