/**
 * Second brain pages (BRIEFING 19): typed markdown, links, versions,
 * visibility from audience. Index is derived. Nothing is deleted.
 */

import { DomainError, type VaultRecord, type VaultVisibility } from './schemas.ts'
import type { Actor } from './acl.ts'

export type BrainPageKind =
  | 'company'
  | 'person'
  | 'client'
  | 'project'
  | 'process'
  | 'rule'
  | 'decision'
  | 'permission'
  | 'tool'
  | 'glossary'
  | 'learning'

export const BRAIN_PAGE_KINDS: readonly BrainPageKind[] = [
  'company', 'person', 'client', 'project', 'process',
  'rule', 'decision', 'permission', 'tool', 'glossary', 'learning',
]

export type BrainVisibility =
  | { readonly kind: 'workspace' }
  | { readonly kind: 'project'; readonly projectId: string }
  | { readonly kind: 'members'; readonly memberIds: readonly string[] }

export type BrainSourceKind = 'task' | 'conversation' | 'approval' | 'vault' | 'import'

export interface BrainSource {
  readonly kind: BrainSourceKind
  readonly id: string
}

export interface BrainPage {
  readonly id: string
  readonly workspaceId: string
  readonly kind: BrainPageKind
  readonly title: string
  readonly body: string
  readonly properties: Readonly<Record<string, string>>
  readonly sources: readonly BrainSource[]
  readonly visibility: BrainVisibility
  readonly revision: number
  readonly confirmedAt: number
  readonly links: readonly string[]
  readonly required: boolean
  readonly status: 'active' | 'replaced' | 'revoked'
  readonly authorId: string
  readonly createdAt: number
  readonly lastUsedAt: number
  readonly replacedBy: string
}

export interface BrainVersion {
  readonly pageId: string
  readonly revision: number
  readonly body: string
  readonly title: string
  readonly authorId: string
  readonly createdAt: number
}

/** Typed property keys per page kind (SECOND-BRAIN §1). Extra keys are allowed. */
export const BRAIN_PROPERTY_KEYS: Readonly<Record<BrainPageKind, readonly string[]>> = {
  company: [],
  person: ['role', 'company', 'workContact'],
  client: ['status', 'value', 'owner'],
  project: ['board', 'sprint'],
  process: ['owner', 'frequency', 'skillId'],
  rule: ['required'],
  decision: ['status'],
  permission: ['grantorId', 'personaId', 'action', 'target', 'maxUses', 'validity', 'expiresAt', 'revoked'],
  tool: ['account', 'access'],
  glossary: [],
  learning: ['personaId', 'taskId'],
}

/**
 * Visibility from the originating audience. DM never becomes a channel page.
 * @param input - Source stream and participants.
 */
export function visibilityFromAudience(input: {
  readonly stream: 'channel' | 'dm' | 'task' | 'approval'
  readonly participantIds: readonly string[]
  readonly projectId?: string
}): BrainVisibility {
  if (input.stream === 'dm') {
    return { kind: 'members', memberIds: [...input.participantIds] }
  }
  if (input.projectId !== undefined && input.projectId !== '') {
    return { kind: 'project', projectId: input.projectId }
  }
  return { kind: 'workspace' }
}

/**
 * @param actor - Trusted identity.
 * @param page - Page to read.
 */
export function canReadBrain(actor: Actor, page: BrainPage): boolean {
  if (actor.workspaceId !== page.workspaceId) return false
  if (page.status === 'revoked' && actor.workspaceRole !== 'owner') return false
  if (page.visibility.kind === 'workspace') return true
  if (page.visibility.kind === 'project') return actor.projectIds.includes(page.visibility.projectId)
  return page.visibility.memberIds.includes(actor.id)
}

/**
 * @param actor - Trusted identity.
 * @param page - Page to change.
 */
export function canWriteBrain(actor: Actor, page: BrainPage): boolean {
  if (!canReadBrain(actor, page)) return false
  if (actor.kind === 'user' && actor.workspaceRole === 'owner') return true
  return actor.systemRoles?.includes('librarian') === true
    || actor.systemRoles?.includes('coordination') === true
}

/**
 * @param pages - Workspace pages.
 * @param pageId - Target.
 * @returns Pages that link to `pageId`.
 */
export function backlinks(pages: readonly BrainPage[], pageId: string): BrainPage[] {
  return pages.filter(page => page.status === 'active' && page.links.includes(pageId))
}

/**
 * @param page - Current page.
 * @param next - Title/body/properties/links/required.
 * @param authorId - Person or persona.
 * @param at - Clock (ms).
 */
export function nextBrainVersion(
  page: BrainPage,
  next: Partial<Pick<BrainPage, 'title' | 'body' | 'properties' | 'links' | 'required' | 'confirmedAt'>>,
  authorId: string,
  at: number,
): { readonly page: BrainPage; readonly version: BrainVersion } {
  if (page.status === 'revoked') throw new DomainError('INVALID_BRAIN', 'REVOKED')
  const revision = page.revision + 1
  const updated: BrainPage = {
    ...page,
    title: next.title ?? page.title,
    body: next.body ?? page.body,
    properties: next.properties ?? page.properties,
    links: next.links ?? page.links,
    required: next.required ?? page.required,
    confirmedAt: next.confirmedAt ?? page.confirmedAt,
    revision,
    authorId,
    lastUsedAt: at,
  }
  return {
    page: updated,
    version: {
      pageId: page.id,
      revision,
      body: updated.body,
      title: updated.title,
      authorId,
      createdAt: at,
    },
  }
}

/**
 * @param pages - Active pages.
 * @returns Derived "Comece aqui" links.
 */
export function startHereLinks(pages: readonly BrainPage[]): readonly string[] {
  const want: BrainPageKind[] = ['company', 'rule', 'decision', 'project']
  const ids: string[] = []
  for (const kind of want) {
    const hit = pages.find(page => page.status === 'active' && page.kind === kind)
    if (hit !== undefined) ids.push(hit.id)
  }
  return ids
}

/**
 * Derived index by type. The page remains the source of truth.
 * @param pages - Workspace pages.
 */
export function indexBrainByKind(
  pages: readonly BrainPage[],
): Readonly<Record<BrainPageKind, BrainPage[]>> {
  const index: Record<BrainPageKind, BrainPage[]> = {
    company: [],
    person: [],
    client: [],
    project: [],
    process: [],
    rule: [],
    decision: [],
    permission: [],
    tool: [],
    glossary: [],
    learning: [],
  }
  for (const page of pages) {
    if (page.status === 'active') index[page.kind].push(page)
  }
  return index
}

/**
 * Reinforce last-used without rewriting the body (hygiene aging).
 * @param page - Page that was searched or read.
 * @param at - Clock (ms).
 */
export function touchBrainPage(page: BrainPage, at: number): BrainPage {
  return { ...page, lastUsedAt: at }
}

/**
 * Mark a page replaced. The body stays in history; nothing is deleted.
 * @param page - Duplicate or superseded page.
 * @param keepId - Surviving page id.
 */
export function replaceBrainPage(page: BrainPage, keepId: string): BrainPage {
  return { ...page, status: 'replaced', replacedBy: keepId }
}

/**
 * @param page - Candidate page.
 */
export function assertBrainPage(page: BrainPage): void {
  if (page.id.trim() === '' || page.title.trim() === '') throw new DomainError('INVALID_BRAIN', 'PAGE')
  if (!BRAIN_PAGE_KINDS.includes(page.kind)) throw new DomainError('INVALID_BRAIN', 'KIND')
  if (page.revision < 1) throw new DomainError('INVALID_BRAIN', 'REVISION')
  if (page.required && page.kind !== 'rule' && page.kind !== 'decision') {
    throw new DomainError('INVALID_BRAIN', 'REQUIRED')
  }
}

/**
 * Librarian: coordination if nobody holds the function.
 * @param personas - Roster with systemRoles.
 */
export function resolveLibrarian(
  personas: readonly { id: string; systemRoles: readonly string[] }[],
): string | undefined {
  const named = personas.find(row => row.systemRoles.includes('librarian'))
  if (named !== undefined) return named.id
  return personas.find(row => row.systemRoles.includes('coordination'))?.id
}

/**
 * Personas that currently hold librarian (assignable; not unique).
 * @param personas - Workspace roster.
 * @param workspaceId - Workspace to inspect.
 */
export function librarianHolders(
  personas: readonly { id: string; workspaceId: string; systemRoles: readonly string[] }[],
  workspaceId: string,
): { id: string; workspaceId: string; systemRoles: readonly string[] }[] {
  return personas.filter(row =>
    row.workspaceId === workspaceId && row.systemRoles.includes('librarian'))
}

function vaultVisibilityToBrain(visibility: VaultVisibility): BrainVisibility {
  if (visibility.kind === 'workspace') return { kind: 'workspace' }
  if (visibility.kind === 'project') return { kind: 'project', projectId: visibility.projectId }
  if (visibility.kind === 'members') return { kind: 'members', memberIds: visibility.memberIds }
  return { kind: 'members', memberIds: [visibility.personaId] }
}

/**
 * Copy a Cofre record onto a page. The vault row is not deleted.
 * @param record - Existing vault record.
 * @param at - Clock (ms).
 */
export function vaultRecordToBrainPage(record: VaultRecord, at: number): BrainPage {
  const kind: BrainPageKind = record.kind === 'constraint'
    ? 'rule'
    : record.kind === 'decision'
      ? 'decision'
      : record.kind === 'brief'
        ? 'company'
        : 'learning'
  const required = kind === 'rule' || kind === 'decision'
  return {
    id: `brain-vault-${record.id}`,
    workspaceId: record.workspaceId,
    kind,
    title: record.factKey ?? record.id,
    body: record.body,
    properties: required ? { required: 'true' } : {},
    sources: [{ kind: 'vault', id: record.id }],
    visibility: vaultVisibilityToBrain(record.visibility),
    revision: record.revision,
    confirmedAt: at,
    links: [],
    required,
    status: record.status === 'revoked' ? 'revoked' : 'active',
    authorId: record.authorId,
    createdAt: Date.parse(record.createdAt) || at,
    lastUsedAt: at,
    replacedBy: '',
  }
}
