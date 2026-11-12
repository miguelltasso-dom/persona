/**
 * Cofre v2 import: the CSV that Chrome and Bitwarden export, read into a PREVIEW first (what enters, what is already in the Cofre,
 * what was ignored) and only then committed. A row's password never reaches the preview: the same text is parsed again on commit and
 * the value goes straight to the sealed store.
 */

import type { CofreEntries, CofreEntryView } from './cofre-entries.ts'

/** CSV formats this importer reads. */
export type CofreImportFormat = 'chrome' | 'bitwarden'

/** One row that will enter the Cofre (never a password). */
export interface CofreImportRow {
  /** Line in the file (1 = header). */
  readonly line: number
  readonly title: string
  readonly site: string
  readonly username: string
}

/** A row that is already in the Cofre or repeated inside the file. */
export interface CofreImportDuplicate extends CofreImportRow {
  readonly reason: 'no-cofre' | 'no-arquivo'
}

/** A row that cannot enter, with the plain reason. */
export interface CofreImportIgnored {
  readonly line: number
  readonly reason: string
}

/** What the screen shows before the person confirms. */
export interface CofreImportPreview {
  readonly format: CofreImportFormat | 'desconhecido'
  readonly entries: readonly CofreImportRow[]
  readonly duplicates: readonly CofreImportDuplicate[]
  readonly ignored: readonly CofreImportIgnored[]
}

/** What the commit did. */
export interface CofreImportResult {
  readonly imported: number
  readonly duplicates: number
  readonly ignored: number
}

/** What the importer needs. */
export interface CofreImportDeps {
  readonly entries: CofreEntries
}

/**
 * Read and apply Chrome/Bitwarden CSV exports.
 */
export class CofreImport {
  private readonly entries: CofreEntries

  /**
   * @param deps - The Cofre entries that will receive the rows.
   */
  constructor(deps: CofreImportDeps) {
    this.entries = deps.entries
  }

  /**
   * @param projectId - Tenant.
   * @param csv - The exported file, as text.
   * @returns What would enter, what is already there and what was ignored.
   */
  preview(projectId: string, csv: string): CofreImportPreview {
    const read = parse(csv)
    const existing = this.keysOf(this.entries.list(projectId))
    const seen = new Set<string>()
    const entries: CofreImportRow[] = []
    const duplicates: CofreImportDuplicate[] = []
    const ignored: CofreImportIgnored[] = []
    for (const row of read.rows) {
      if (row.problem !== undefined) {
        ignored.push({ line: row.line, reason: row.problem })
        continue
      }
      const key = `${hostOf(row.site)}|${row.username.toLowerCase()}`
      const publicRow: CofreImportRow = { line: row.line, title: row.title, site: row.site, username: row.username }
      if (existing.has(key)) {
        duplicates.push({ ...publicRow, reason: 'no-cofre' })
        continue
      }
      if (seen.has(key)) {
        duplicates.push({ ...publicRow, reason: 'no-arquivo' })
        continue
      }
      seen.add(key)
      entries.push(publicRow)
    }
    return {
      format: read.format ?? 'desconhecido',
      entries,
      duplicates,
      ignored: [...(read.format === undefined ? [{ line: 1, reason: 'O arquivo não parece ser do Chrome nem do Bitwarden.' }] : []), ...ignored],
    }
  }

  /**
   * Import every row the preview lists as new. A row that fails stops the import with its own error; running it again skips what
   * already entered (the preview sees it as a duplicate of the Cofre).
   * @param projectId - Tenant.
   * @param authorId - Who imported.
   * @param csv - The same text the preview read.
   * @returns How many entered, were already there and were ignored.
   */
  async commit(projectId: string, authorId: string, csv: string): Promise<CofreImportResult> {
    const preview = this.preview(projectId, csv)
    const rows = new Map(parse(csv).rows.map(row => [row.line, row]))
    let imported = 0
    for (const entry of preview.entries) {
      const row = rows.get(entry.line)
      if (row === undefined || row.password === '') continue
      await this.entries.saveLogin({
        projectId,
        authorId,
        site: row.site,
        username: row.username,
        password: row.password,
        ...(row.title === '' ? {} : { title: row.title }),
      })
      imported += 1
    }
    return { imported, duplicates: preview.duplicates.length, ignored: preview.ignored.length }
  }

  private keysOf(entries: readonly CofreEntryView[]): ReadonlySet<string> {
    return new Set(entries
      .filter(entry => entry.kind === 'login')
      .map(entry => `${hostOf(entry.fields.site ?? '')}|${(entry.fields.username ?? '').toLowerCase()}`))
  }
}

/** One row of the file, with the reason it cannot enter (when it cannot). */
interface ReadRow extends CofreImportRow {
  readonly password: string
  readonly problem?: string
}

interface ReadResult {
  readonly format: CofreImportFormat | undefined
  readonly rows: readonly ReadRow[]
}

const CHROME_KEYS = ['name', 'url', 'username', 'password'] as const
const BITWARDEN_TYPE = 'type'
const BITWARDEN_KEYS = ['name', 'login_uri', 'login_username', 'login_password'] as const

/**
 * @param csv - The exported file.
 * @returns The format and every data row, with the password and the reason a row cannot enter.
 */
function parse(csv: string): ReadResult {
  const table = parseCsv(csv)
  const header = table[0]?.map(cell => cell.trim().toLowerCase()) ?? []
  const format = formatOf(header)
  if (format === undefined) return { format: undefined, rows: [] }
  const column = (name: string): number => header.indexOf(name)
  const rows: ReadRow[] = []
  for (const [index, cells] of table.entries()) {
    if (index === 0) continue
    if (cells.every(cell => cell.trim() === '')) continue
    const line = index + 1
    const cell = (name: string): string => cells[column(name)]?.trim() ?? ''
    const type = format === 'bitwarden' ? cell(BITWARDEN_TYPE) : ''
    if (format === 'bitwarden' && type !== '' && type !== 'login' && type !== '1') {
      rows.push({ line, title: cell('name'), site: '', username: '', password: '', problem: 'A linha não é um login (nota, cartão ou identidade).' })
      continue
    }
    const site = format === 'chrome' ? cell('url') : cell('login_uri').split(/[\s,;]+/u)[0] ?? ''
    const username = format === 'chrome' ? cell('username') : cell('login_username')
    const password = format === 'chrome' ? cell('password') : cell('login_password')
    const title = cell('name')
    const problem = password === ''
      ? 'A linha não tem senha.'
      : username === ''
        ? 'A linha não tem usuário.'
        : site === ''
          ? 'A linha não tem endereço do site.'
          : undefined
    rows.push({ line, title, site, username, password, ...(problem === undefined ? {} : { problem }) })
  }
  return { format, rows }
}

function formatOf(header: readonly string[]): CofreImportFormat | undefined {
  if (BITWARDEN_KEYS.every(key => header.includes(key))) return 'bitwarden'
  if (CHROME_KEYS.every(key => header.includes(key))) return 'chrome'
  return undefined
}

/** RFC 4180: quoted fields, doubled quotes, CRLF or LF. */
function parseCsv(text: string): string[][] {
  const source = text.charCodeAt(0) === 0xFEFF ? text.slice(1) : text
  const rows: string[][] = []
  let row: string[] = []
  let field = ''
  let quoted = false
  for (let index = 0; index < source.length; index += 1) {
    const char = source[index] ?? ''
    if (quoted) {
      if (char !== '"') {
        field += char
      } else if (source[index + 1] === '"') {
        field += '"'
        index += 1
      } else {
        quoted = false
      }
      continue
    }
    if (char === '"') {
      quoted = true
    } else if (char === ',') {
      row.push(field)
      field = ''
    } else if (char === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
    } else if (char !== '\r') {
      field += char
    }
  }
  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }
  return rows
}

/** The site as a comparable key: host without `www.`, lowercased. */
function hostOf(site: string): string {
  try {
    return new URL(site.includes('://') ? site : `https://${site}`).hostname.toLowerCase().replace(/^www\./u, '')
  } catch (error) {
    void error
    return site.trim().toLowerCase()
  }
}
