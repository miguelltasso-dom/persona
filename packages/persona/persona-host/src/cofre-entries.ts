/**
 * Cofre v2 entries: Logins, Chaves and the company Ficha. The metadata (site, user, service, company data) lives in the product
 * store as one JSON document per entry; the secret never does — it is sealed by the vault (DPAPI) and only its presence is
 * reported. The Ficha is also written as the `brief` record of the Cofre, so the team reads the company data through the ordinary
 * vault context without ever seeing a password.
 */

import { randomUUID } from 'node:crypto'
import type { ScreenRepos, VaultRepos } from '@deepseek-ai/dsh-persona-store'
import type { CofreSecrets } from '@deepseek-ai/dsh-persona-vault'

/** The three kinds of Cofre entry. */
export type CofreEntryKind = 'login' | 'key' | 'company'

/** `screen_doc` kind of the Cofre entries (one document per entry). */
export const COFRE_ENTRY_DOC = 'cofre-entry'

/** `factKey` of the `brief` record that carries the company Ficha into the team's context. */
export const COMPANY_CARD_FACT = 'company.card'

/** One Cofre entry as the screen reads it: never a secret, only whether one is kept. */
export interface CofreEntryView {
  readonly id: string
  readonly projectId: string
  readonly kind: CofreEntryKind
  readonly title: string
  /** Non-secret fields of the kind: `site`/`username`, `service`, or the company data. */
  readonly fields: Readonly<Record<string, string>>
  readonly hasSecret: boolean
  readonly createdAt: string
  readonly updatedAt: string
  readonly authorId: string
}

/** What the screen saves for a Login; `password` goes to the vault, never to the document. */
export interface SaveLoginInput {
  readonly projectId: string
  readonly authorId: string
  readonly site: string
  readonly username: string
  readonly password: string
  readonly title?: string
  /** Existing entry to replace; absent creates a new one. */
  readonly id?: string
}

/** What the screen saves for a Chave (API key, token); `secret` goes to the vault. */
export interface SaveKeyInput {
  readonly projectId: string
  readonly authorId: string
  readonly service: string
  readonly secret: string
  readonly title?: string
  readonly id?: string
}

/** The company Ficha: the only kind with no secret at all. */
export interface SaveCompanyInput {
  readonly projectId: string
  readonly authorId: string
  readonly legalName: string
  readonly document: string
  readonly email?: string
  readonly phone?: string
  readonly address?: string
  readonly id?: string
}

/** A refused Cofre entry: the message is the actionable sentence the screen shows. */
export class CofreEntryError extends Error {}

/** Stored document; it has no secret field by construction. */
interface StoredCofreEntry {
  readonly id: string
  readonly projectId: string
  readonly kind: CofreEntryKind
  readonly title: string
  readonly fields: Readonly<Record<string, string>>
  readonly createdAt: string
  readonly updatedAt: string
  readonly authorId: string
}

/** What the entries need from the host. */
export interface CofreEntriesDeps {
  readonly screens: ScreenRepos
  readonly vault: VaultRepos
  readonly secrets: CofreSecrets
  /** Workspace of a project; the Ficha's `brief` record is workspace-visible. */
  readonly workspaceOf: (projectId: string) => string | undefined
  readonly now?: () => string
  readonly newId?: () => string
}

/**
 * The Cofre entries of every project: Logins, Chaves and the company Ficha.
 */
export class CofreEntries {
  private readonly deps: CofreEntriesDeps
  private readonly now: () => string
  private readonly newId: () => string

  /**
   * @param deps - Store, vault and clock.
   */
  constructor(deps: CofreEntriesDeps) {
    this.deps = deps
    this.now = deps.now ?? (() => new Date().toISOString())
    this.newId = deps.newId ?? (() => randomUUID())
  }

  /**
   * @param projectId - Tenant.
   * @returns Every entry of the project, newest first, with the presence of a sealed secret and never its value.
   */
  list(projectId: string): readonly CofreEntryView[] {
    const sealed = new Set(this.deps.secrets.ids(projectId))
    return this.docs(projectId).map(doc => toView(doc, sealed.has(doc.id)))
  }

  /**
   * @param projectId - Tenant.
   * @param id - Entry id.
   * @returns The entry, or undefined.
   */
  get(projectId: string, id: string): CofreEntryView | undefined {
    const doc = this.deps.screens.get<StoredCofreEntry>(projectId, COFRE_ENTRY_DOC, id)
    return doc === undefined ? undefined : toView(doc, this.deps.secrets.has(projectId, id))
  }

  /**
   * Save a Login: the password is sealed first, so a vault without protection refuses before anything is written.
   * @param input - Site, user and password.
   * @returns The stored entry.
   */
  async saveLogin(input: SaveLoginInput): Promise<CofreEntryView> {
    const site = required(input.site, 'o site')
    const username = required(input.username, 'o usuário')
    const id = input.id ?? `cofre-login-${this.newId()}`
    await this.deps.secrets.put(input.projectId, id, input.password)
    try {
      return this.write(input.projectId, input.authorId, id, 'login', input.title ?? hostOf(site), { site, username })
    } catch (error) {
      // A new entry whose document fails leaves an orphan secret; an edited one already replaced it, so dropping would lose the value.
      if (input.id === undefined) await this.deps.secrets.drop(input.projectId, id)
      throw error
    }
  }

  /**
   * Save a Chave: the secret is sealed first, so a vault without protection refuses before anything is written.
   * @param input - Service and secret.
   * @returns The stored entry.
   */
  async saveKey(input: SaveKeyInput): Promise<CofreEntryView> {
    const service = required(input.service, 'o serviço')
    const id = input.id ?? `cofre-key-${this.newId()}`
    await this.deps.secrets.put(input.projectId, id, input.secret)
    try {
      return this.write(input.projectId, input.authorId, id, 'key', input.title ?? service, { service })
    } catch (error) {
      if (input.id === undefined) await this.deps.secrets.drop(input.projectId, id)
      throw error
    }
  }

  /**
   * Save the company Ficha and project it as the Cofre's `brief`, which is how the team reads it.
   * @param input - The company data.
   * @returns The stored entry.
   */
  saveCompany(input: SaveCompanyInput): CofreEntryView {
    const legalName = required(input.legalName, 'a razão social')
    const document = required(input.document, 'o CNPJ ou CPF')
    const digits = document.replace(/\D/gu, '')
    if (digits.length !== 11 && digits.length !== 14) throw new CofreEntryError('O CNPJ tem 14 números e o CPF tem 11. Confira o documento.')
    const email = optional(input.email)
    if (email !== undefined && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/u.test(email)) throw new CofreEntryError('O e-mail da empresa parece incompleto. Confira e salve de novo.')
    const fields: Record<string, string> = { legalName, document }
    if (email !== undefined) fields.email = email
    const phone = optional(input.phone)
    if (phone !== undefined) fields.phone = phone
    const address = optional(input.address)
    if (address !== undefined) fields.address = address
    const id = input.id ?? `cofre-company-${this.newId()}`
    const workspaceId = this.deps.workspaceOf(input.projectId)
    if (workspaceId === undefined) throw new CofreEntryError('Não achei o espaço de trabalho deste projeto.')
    const view = this.write(input.projectId, input.authorId, id, 'company', legalName, fields)
    this.projectCompany(input.projectId, workspaceId, input.authorId, fields)
    return view
  }

  /**
   * Remove an entry and its sealed secret; the company Ficha also revokes the projected brief.
   * @param projectId - Tenant.
   * @param id - Entry id.
   */
  async remove(projectId: string, id: string): Promise<void> {
    const doc = this.deps.screens.get<StoredCofreEntry>(projectId, COFRE_ENTRY_DOC, id)
    // The secret goes first: a vault that cannot release it leaves the entry in place instead of an orphan sealed blob.
    if (doc !== undefined && doc.kind !== 'company') await this.deps.secrets.drop(projectId, id)
    this.deps.screens.delete(projectId, COFRE_ENTRY_DOC, id)
    if (doc?.kind !== 'company') return
    const brief = this.deps.vault.findActiveFact(projectId, COMPANY_CARD_FACT)
    if (brief !== undefined) this.deps.vault.revokeRecord(brief.id)
  }

  private docs(projectId: string): readonly StoredCofreEntry[] {
    return this.deps.screens.list<StoredCofreEntry>(projectId, COFRE_ENTRY_DOC)
  }

  private write(
    projectId: string,
    authorId: string,
    id: string,
    kind: CofreEntryKind,
    title: string,
    fields: Readonly<Record<string, string>>,
  ): CofreEntryView {
    const previous = this.deps.screens.get<StoredCofreEntry>(projectId, COFRE_ENTRY_DOC, id)
    const at = this.now()
    const doc: StoredCofreEntry = {
      id,
      projectId,
      kind,
      title,
      fields,
      createdAt: previous?.createdAt ?? at,
      updatedAt: at,
      authorId,
    }
    this.deps.screens.put(projectId, COFRE_ENTRY_DOC, id, doc)
    return toView(doc, kind !== 'company')
  }

  private projectCompany(projectId: string, workspaceId: string, authorId: string, fields: Readonly<Record<string, string>>): void {
    const body = companyCardText(fields)
    const brief = this.deps.vault.findActiveFact(projectId, COMPANY_CARD_FACT)
    if (brief === undefined) {
      this.deps.vault.createRecord({
        id: `company-card-${this.newId()}`,
        workspaceId,
        projectId,
        kind: 'brief',
        body,
        authorId,
        visibility: { kind: 'workspace' },
        factKey: COMPANY_CARD_FACT,
      })
      return
    }
    this.deps.vault.updateRecord(brief.id, body, authorId)
  }
}

/**
 * The company Ficha as the team reads it: one line per field that has words.
 * @param fields - The stored company fields.
 * @returns Plain text, one physical line per field.
 */
export function companyCardText(fields: Readonly<Record<string, string>>): string {
  const lines: string[] = []
  const legalName = fields.legalName ?? ''
  if (legalName !== '') lines.push(`Razão social: ${legalName}`)
  const document = fields.document ?? ''
  if (document !== '') lines.push(`CNPJ/CPF: ${document}`)
  const email = fields.email ?? ''
  if (email !== '') lines.push(`E-mail: ${email}`)
  const phone = fields.phone ?? ''
  if (phone !== '') lines.push(`Telefone/WhatsApp: ${phone}`)
  const address = fields.address ?? ''
  if (address !== '') lines.push(`Endereço: ${address}`)
  return lines.join('\n')
}

function toView(doc: StoredCofreEntry, hasSecret: boolean): CofreEntryView {
  return {
    id: doc.id,
    projectId: doc.projectId,
    kind: doc.kind,
    title: doc.title,
    fields: doc.fields,
    hasSecret,
    createdAt: doc.createdAt,
    updatedAt: doc.updatedAt,
    authorId: doc.authorId,
  }
}

function required(value: string, label: string): string {
  const text = value.trim()
  if (text === '') throw new CofreEntryError(`Preencha ${label}.`)
  return text
}

function optional(value: string | undefined): string | undefined {
  const text = value?.trim() ?? ''
  return text === '' ? undefined : text
}

/** The site as a title: the host without `www.`, or the whole value when it is not a URL. */
function hostOf(site: string): string {
  try {
    return new URL(site.includes('://') ? site : `https://${site}`).hostname.replace(/^www\./u, '')
  } catch (error) {
    void error
    return site
  }
}
