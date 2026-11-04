/**
 * Agent tools brain_search / brain_read / brain_propose (SECOND-BRAIN §4).
 * ACL is checked on every hit and every recall hop. Required rules compile.
 */

import { compileContext } from '../context/index.ts'
import type {
  CompiledContext, CompileContextInput, ContextKind, ContextRecord, ContextSnapshot,
} from '../context/types.ts'
import { DomainError } from './schemas.ts'
import {
  canReadBrain,
  canWriteBrain,
  nextBrainVersion,
  touchBrainPage,
  type BrainPage,
  type BrainPageKind,
  type BrainVersion,
} from './brain.ts'
import type { Actor } from './acl.ts'

export interface BrainSearchHit {
  readonly id: string
  readonly title: string
  readonly kind: BrainPageKind
  readonly snippet: string
}

export interface BrainReadHop {
  readonly id: string
  readonly title: string
  readonly body: string
  readonly neighbors: readonly string[]
}

export interface BrainReadResult {
  readonly page: BrainPage
  readonly hops: readonly BrainReadHop[]
}

export interface BrainProposal {
  readonly pageId: string
  readonly title: string
  readonly body: string
  readonly needsAccept: boolean
}

function tokens(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter(part => part.length > 0)
}

function haystack(page: BrainPage): string {
  return `${page.title} ${page.body} ${Object.values(page.properties).join(' ')}`
}

function snippetOf(body: string): string {
  const flat = body.replace(/\s+/g, ' ').trim()
  return flat.length <= 140 ? flat : `${flat.slice(0, 137)}...`
}

/**
 * brain_search: FTS + optional type + optional linked-from, ACL per page.
 * A page the actor cannot read is omitted entirely (no title, no snippet).
 * @param actor - Trusted identity.
 * @param pages - Workspace pages.
 * @param query - Query plus optional filters.
 */
export function brainSearch(
  actor: Actor,
  pages: readonly BrainPage[],
  query: {
    readonly text: string
    readonly kind?: BrainPageKind
    readonly linkedFrom?: string
  },
): { readonly hits: readonly BrainSearchHit[]; readonly pages: readonly BrainPage[] } {
  const want = tokens(query.text)
  const touched: BrainPage[] = []
  const hits: BrainSearchHit[] = []
  for (const page of pages) {
    if (page.status !== 'active') continue
    if (!canReadBrain(actor, page)) continue
    if (query.kind !== undefined && page.kind !== query.kind) continue
    if (query.linkedFrom !== undefined && !page.links.includes(query.linkedFrom)
      && page.id !== query.linkedFrom) continue
    const hay = haystack(page)
    if (want.length > 0 && !want.every(token => hay.toLowerCase().includes(token))) continue
    hits.push({
      id: page.id,
      title: page.title,
      kind: page.kind,
      snippet: snippetOf(page.body),
    })
    touched.push(touchBrainPage(page, Date.now()))
  }
  return { hits, pages: touched }
}

/**
 * brain_read(id) plus Chain of Recall along links. Each hop re-checks ACL.
 * @param actor - Trusted identity.
 * @param pages - Workspace pages.
 * @param pageId - Start id.
 * @param maxHops - Inclusive of the start page (1–16).
 */
export function brainRead(
  actor: Actor,
  pages: readonly BrainPage[],
  pageId: string,
  maxHops = 4,
): BrainReadResult {
  if (!Number.isInteger(maxHops) || maxHops < 1 || maxHops > 16) {
    throw new DomainError('INVALID_BRAIN', 'HOPS')
  }
  const byId = new Map(pages.map(page => [page.id, page]))
  const start = byId.get(pageId)
  if (start === undefined || !canReadBrain(actor, start)) {
    throw new DomainError('ACL_DENIED', 'BRAIN_READ')
  }
  const hops: BrainReadHop[] = []
  const seen = new Set<string>()
  const queue = [pageId]
  while (queue.length > 0 && hops.length < maxHops) {
    const id = queue.shift()
    if (id === undefined || seen.has(id)) continue
    seen.add(id)
    const page = byId.get(id)
    if (page === undefined || !canReadBrain(actor, page)) {
      if (hops.length === 0) throw new DomainError('ACL_DENIED', 'BRAIN_READ')
      continue
    }
    hops.push({
      id: page.id,
      title: page.title,
      body: page.body,
      neighbors: [...page.links],
    })
    for (const neighbor of page.links) {
      if (!seen.has(neighbor)) queue.push(neighbor)
    }
  }
  return { page: touchBrainPage(start, Date.now()), hops }
}

/**
 * brain_propose: suggest a body/title change. Readers may propose; requireds
 * still need a human accept before apply.
 * @param actor - Trusted identity.
 * @param page - Target page.
 * @param next - Suggested title/body.
 */
export function brainPropose(
  actor: Actor,
  page: BrainPage,
  next: { readonly title?: string; readonly body?: string },
): BrainProposal {
  if (!canReadBrain(actor, page)) throw new DomainError('ACL_DENIED', 'BRAIN_PROPOSE')
  const needsAccept = page.required || page.kind === 'rule' || page.kind === 'decision'
  return {
    pageId: page.id,
    title: next.title ?? page.title,
    body: next.body ?? page.body,
    needsAccept,
  }
}

/**
 * Apply a proposal after ACL write (or human accept for requireds).
 * @param actor - Trusted identity.
 * @param page - Current page.
 * @param proposal - {@link brainPropose} result.
 * @param accepted - Human accept for requireds.
 * @param at - Clock (ms).
 */
export function applyBrainPropose(
  actor: Actor,
  page: BrainPage,
  proposal: BrainProposal,
  accepted: boolean,
  at: number,
): { readonly page: BrainPage; readonly version: BrainVersion } {
  if (proposal.pageId !== page.id) throw new DomainError('INVALID_BRAIN', 'PROPOSE')
  if (proposal.needsAccept && !accepted) throw new DomainError('INVALID_BRAIN', 'ACCEPT')
  if (!proposal.needsAccept && !canWriteBrain(actor, page)) throw new DomainError('ACL_DENIED', 'BRAIN_PROPOSE')
  if (proposal.needsAccept && actor.kind !== 'user' && !canWriteBrain(actor, page)) {
    throw new DomainError('ACL_DENIED', 'BRAIN_PROPOSE')
  }
  return nextBrainVersion(page, { title: proposal.title, body: proposal.body }, actor.id, at)
}

function kindToContext(kind: BrainPageKind): ContextKind {
  if (kind === 'rule') return 'constraint'
  if (kind === 'decision') return 'decision'
  if (kind === 'company') return 'brief'
  return 'memory'
}

/**
 * Map a readable page onto a compileContext record. Required rules/decisions
 * keep `constraint`/`decision` so they enter every turn.
 * @param page - Page the actor may read.
 * @param projectId - Compilation project.
 */
export function brainPageToContextRecord(page: BrainPage, projectId: string): ContextRecord {
  const mappedProjectId = page.visibility.kind === 'project' ? page.visibility.projectId : projectId
  return {
    id: page.id,
    workspaceId: page.workspaceId,
    projectId: mappedProjectId,
    revision: page.revision,
    kind: kindToContext(page.kind),
    status: page.status,
    body: page.body,
    sourceIds: [],
    title: page.title,
    locator: page.kind,
  }
}

/**
 * Snapshot for compileContext. Required active rule/decision pages are listed.
 * @param pages - Workspace pages.
 * @param projectId - Compilation project.
 * @param revision - Snapshot token from the host.
 * @param actor - Trusted reader (ACL filter).
 */
export function brainSnapshot(
  pages: readonly BrainPage[],
  projectId: string,
  revision: string,
  actor: Actor,
): ContextSnapshot {
  const readable = pages.filter(page => page.status === 'active' && canReadBrain(actor, page))
  const applies = readable.filter((page) => {
    if (page.visibility.kind === 'project') return page.visibility.projectId === projectId
    return true
  })
  return {
    revision,
    requiredIds: applies
      .filter(page => page.required && (page.kind === 'rule' || page.kind === 'decision'))
      .map(page => page.id)
      .sort(),
    records: applies.map(page => brainPageToContextRecord(page, projectId)),
  }
}

/**
 * Compile prompt context from brain pages. Required rules enter every turn.
 * @param input - Actor plus compile options; snapshot is derived.
 */
export async function compileBrainContext(
  input: Omit<CompileContextInput, 'snapshot'> & {
    readonly pages: readonly BrainPage[]
    readonly snapshotRevision: string
    readonly actor: Actor
  },
): Promise<CompiledContext> {
  const snapshot = brainSnapshot(input.pages, input.scope.projectId, input.snapshotRevision, input.actor)
  return compileContext({
    scope: input.scope,
    snapshot,
    budgetTokens: input.budgetTokens,
    countTokens: input.countTokens,
    authorize: input.authorize,
  })
}
