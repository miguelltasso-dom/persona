/**
 * Item 15 (colheita) — the Cofre as the screen reads it. The host sends entries with the non-secret fields and `hasSecret`; this
 * turns them into the rows the screen draws (three groups: the company card, the logins, the keys). Nothing here ever holds a
 * password: the host never sends one, and the screen only sends one back when the person types it.
 */

/** The three kinds of Cofre entry (host: `CofreEntryKind`). */
export type CofreKind = 'login' | 'key' | 'company'

/** One entry as the host sends it (`listCofreEntries`). */
export interface HostCofreEntry {
  readonly id: string
  readonly projectId: string
  readonly kind: CofreKind
  readonly title: string
  /** Non-secret fields: `site`/`username`, `service`, or `legalName`/`document`/`email`/`phone`/`address`. */
  readonly fields: Readonly<Record<string, string>>
  /** A sealed secret is kept for this entry; its value never leaves the vault. */
  readonly hasSecret: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly authorId: string
}

/** One row of the screen. */
export interface CofreRowView {
  readonly id: string
  readonly kind: CofreKind
  readonly title: string
  /** The second line: `site · user`, the service, or the document. */
  readonly detail: string
  /** The non-secret fields, to fill the edit form. */
  readonly fields: Readonly<Record<string, string>>
  readonly hasSecret: boolean
  /** When it was last saved (ISO), for the key row's second line. */
  readonly updatedAt: string
}

/** What the three groups hold. */
export interface CofreGroups {
  /** The company card: only one exists. */
  readonly company: CofreRowView | undefined
  readonly logins: readonly CofreRowView[]
  readonly keys: readonly CofreRowView[]
}

function detailOf(entry: HostCofreEntry): string {
  const fields = entry.fields
  if (entry.kind === 'login') return [fields.site, fields.username].filter((part): part is string => part !== undefined && part !== '').join(' · ')
  if (entry.kind === 'key') return fields.service ?? ''
  return fields.document ?? ''
}

/**
 * Group the host's entries for the screen, keeping the host's order (newest first).
 * @param entries - The host's answer to `listCofreEntries`.
 */
export function cofreGroups(entries: readonly HostCofreEntry[]): CofreGroups {
  const rows = entries.map((entry): CofreRowView => ({
    id: entry.id,
    kind: entry.kind,
    title: entry.title,
    detail: detailOf(entry),
    fields: entry.fields,
    hasSecret: entry.hasSecret,
    updatedAt: entry.updatedAt,
  }))
  return {
    company: rows.find(row => row.kind === 'company'),
    logins: rows.filter(row => row.kind === 'login'),
    keys: rows.filter(row => row.kind === 'key'),
  }
}

/**
 * Whether the Cofre holds nothing at all.
 * @param groups - The grouped rows.
 */
export function cofreIsEmpty(groups: CofreGroups): boolean {
  return groups.company === undefined && groups.logins.length === 0 && groups.keys.length === 0
}

/**
 * "10/11": the day and month of an ISO date, for a row's second line. Empty when the text is not a date.
 * @param iso - An ISO date-time.
 */
export function shortDate(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return ''
  return `${String(date.getDate()).padStart(2, '0')}/${String(date.getMonth() + 1).padStart(2, '0')}`
}

/** One CSV row that would enter the Cofre (the host never sends the password). */
export interface HostImportRow {
  /** Line in the file (1 = header). */
  readonly line: number
  readonly title: string
  readonly site: string
  readonly username: string
}

/** A row that is already in the Cofre or repeated inside the file. */
export interface HostImportDuplicate extends HostImportRow {
  readonly reason: 'no-cofre' | 'no-arquivo'
}

/** A row that cannot enter, with the plain reason the host wrote. */
export interface HostImportIgnored {
  readonly line: number
  readonly reason: string
}

/** The host's answer to `previewCofreImport`: what would happen, no password in it. */
export interface HostImportPreview {
  readonly format: 'chrome' | 'bitwarden' | 'desconhecido'
  readonly entries: readonly HostImportRow[]
  readonly duplicates: readonly HostImportDuplicate[]
  readonly ignored: readonly HostImportIgnored[]
}

/** The host's answer to `commitCofreImport`. */
export interface HostImportResult {
  readonly imported: number
  readonly duplicates: number
  readonly ignored: number
}
