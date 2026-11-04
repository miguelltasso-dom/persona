/**
 * Librarian curation and LLM-free hygiene (SECOND-BRAIN §2).
 * Required rules/decisions never auto-apply.
 */

import { contradicts, nearDuplicate } from './aging.ts'
import {
  nextBrainVersion,
  replaceBrainPage,
  visibilityFromAudience,
  type BrainPage,
  type BrainPageKind,
  type BrainSource,
  type BrainVisibility,
} from './brain.ts'

export const BRAIN_CONFIRM_MS = 90 * 86_400_000

export type LibrarianPolicy = 'auto' | 'propose'

export interface LibrarianFact {
  readonly title: string
  readonly kind: BrainPageKind
  readonly body: string
  readonly required: boolean
  readonly linkTo: readonly string[]
}

export type LibrarianAction =
  | { readonly kind: 'create'; readonly page: BrainPage; readonly needsAccept: boolean }
  | { readonly kind: 'update'; readonly pageId: string; readonly body: string; readonly needsAccept: boolean }
  | { readonly kind: 'link'; readonly fromId: string; readonly toId: string }
  | { readonly kind: 'contradiction'; readonly pageId: string; readonly existing: string; readonly incoming: string }
  | { readonly kind: 'propose'; readonly title: string; readonly body: string; readonly pageKind: BrainPageKind }

export interface HygieneReport {
  readonly duplicates: readonly { readonly keepId: string; readonly dropId: string }[]
  readonly reminders: readonly { readonly pageId: string; readonly silentDays: number }[]
}

/**
 * Extract durable facts after a task, conversation or approval.
 * Required new rules/decisions need a human accept even under `auto`.
 * @param input - Facts, current pages, source, audience, policy.
 */
export function curateBrain(input: {
  readonly facts: readonly LibrarianFact[]
  readonly pages: readonly BrainPage[]
  readonly source: BrainSource
  readonly visibility: BrainVisibility
  readonly workspaceId: string
  readonly authorId: string
  readonly now: number
  readonly policy: LibrarianPolicy
}): LibrarianAction[] {
  const actions: LibrarianAction[] = []
  for (const [index, fact] of input.facts.entries()) {
    const same = input.pages.find(page =>
      page.status === 'active' && page.kind === fact.kind && nearDuplicate(page.body, fact.body))
    if (same !== undefined) {
      for (const toId of fact.linkTo) {
        if (!same.links.includes(toId)) actions.push({ kind: 'link', fromId: same.id, toId })
      }
      continue
    }
    const clash = input.pages.find(page =>
      page.status === 'active'
      && (page.kind === 'decision' || page.kind === 'rule')
      && contradicts(page.body, fact.body))
    if (clash !== undefined) {
      actions.push({
        kind: 'contradiction',
        pageId: clash.id,
        existing: clash.body,
        incoming: fact.body,
      })
      continue
    }
    const needsAccept = fact.required || fact.kind === 'rule' || fact.kind === 'decision'
    if (input.policy === 'propose' || needsAccept) {
      actions.push({
        kind: 'propose',
        title: fact.title,
        body: fact.body,
        pageKind: fact.kind,
      })
      continue
    }
    if (input.policy === 'auto' && !needsAccept) {
      const matchTitle = input.pages.find(page =>
        page.status === 'active' && page.kind === fact.kind && page.title === fact.title)
      if (matchTitle !== undefined) {
        actions.push({ kind: 'update', pageId: matchTitle.id, body: fact.body, needsAccept: false })
        continue
      }
      actions.push({
        kind: 'create',
        needsAccept: false,
        page: {
          id: `brain-${input.source.kind}-${input.source.id}-${String(index + 1)}`,
          workspaceId: input.workspaceId,
          kind: fact.kind,
          title: fact.title,
          body: fact.body,
          properties: {},
          sources: [input.source],
          visibility: input.visibility,
          revision: 1,
          confirmedAt: input.now,
          links: [...fact.linkTo],
          required: false,
          status: 'active',
          authorId: input.authorId,
          createdAt: input.now,
          lastUsedAt: input.now,
          replacedBy: '',
        },
      })
    }
  }
  return actions
}

/**
 * Audience helper for curation.
 * @param stream - Origin.
 * @param participantIds - DM members or empty.
 * @param projectId - Optional project.
 */
export function curateVisibility(
  stream: 'channel' | 'dm' | 'task' | 'approval',
  participantIds: readonly string[],
  projectId?: string,
): BrainVisibility {
  return visibilityFromAudience({ stream, participantIds, ...(projectId === undefined ? {} : { projectId }) })
}

/**
 * Dedupe + 90-day confirmation reminders. Pages stay; nothing is deleted.
 * @param pages - Current pages.
 * @param now - Clock (ms).
 */
export function hygieneBrain(pages: readonly BrainPage[], now: number): HygieneReport {
  const active = pages.filter(page => page.status === 'active')
  const duplicates: { keepId: string; dropId: string }[] = []
  const seen = new Set<string>()
  for (const page of active) {
    if (seen.has(page.id)) continue
    const twin = active.find(other =>
      other.id !== page.id && other.kind === page.kind && nearDuplicate(page.body, other.body))
    if (twin !== undefined) {
      seen.add(twin.id)
      const keep = page.revision >= twin.revision ? page : twin
      const drop = keep.id === page.id ? twin : page
      duplicates.push({ keepId: keep.id, dropId: drop.id })
    }
  }
  const reminders = active
    .filter(page => now - page.confirmedAt >= BRAIN_CONFIRM_MS)
    .map(page => ({
      pageId: page.id,
      silentDays: Math.floor((now - page.confirmedAt) / 86_400_000),
    }))
  return { duplicates, reminders }
}

/**
 * Librarian batch: only rows that changed (TOKEN-OPTIMIZATION §2.9).
 * @param pages - Current pages.
 * @param changedIds - Pages touched since the last cursor.
 * @param now - Clock (ms).
 * @returns Hygiene limited to the changed set. Empty change → empty report.
 */
export function hygieneChangedOnly(
  pages: readonly BrainPage[],
  changedIds: readonly string[],
  now: number,
): HygieneReport {
  if (changedIds.length === 0) return { duplicates: [], reminders: [] }
  const changed = new Set(changedIds)
  const report = hygieneBrain(pages, now)
  return {
    duplicates: report.duplicates.filter(row => changed.has(row.keepId) || changed.has(row.dropId)),
    reminders: report.reminders.filter(row => changed.has(row.pageId)),
  }
}

/**
 * Apply create/update/link. Propose and contradiction never write the body.
 * @param pages - Current pages.
 * @param actions - Librarian output.
 * @param authorId - Librarian or human.
 * @param now - Clock (ms).
 */
export function applyLibrarianActions(
  pages: readonly BrainPage[],
  actions: readonly LibrarianAction[],
  authorId: string,
  now: number,
): BrainPage[] {
  const next = [...pages]
  for (const action of actions) {
    if (action.kind === 'create' && !action.needsAccept) {
      next.push(action.page)
      continue
    }
    if (action.kind === 'update' && !action.needsAccept) {
      const index = next.findIndex(page => page.id === action.pageId)
      if (index < 0) continue
      const current = next[index]
      if (current === undefined) continue
      next[index] = nextBrainVersion(current, { body: action.body }, authorId, now).page
      continue
    }
    if (action.kind === 'link') {
      const index = next.findIndex(page => page.id === action.fromId)
      if (index < 0) continue
      const current = next[index]
      if (current === undefined || current.links.includes(action.toId)) continue
      next[index] = nextBrainVersion(
        current,
        { links: [...current.links, action.toId] },
        authorId,
        now,
      ).page
    }
  }
  return next
}

/**
 * Human accept of a required rule/decision. Creates the page; never auto.
 * @param input - Accepted proposal plus audience.
 */
export function acceptLibrarianProposal(input: {
  readonly id: string
  readonly workspaceId: string
  readonly title: string
  readonly body: string
  readonly pageKind: BrainPageKind
  readonly visibility: BrainVisibility
  readonly source: BrainSource
  readonly authorId: string
  readonly now: number
  readonly required?: boolean
}): BrainPage {
  const required = input.required === true || input.pageKind === 'rule' || input.pageKind === 'decision'
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    kind: input.pageKind,
    title: input.title,
    body: input.body,
    properties: required ? { required: 'true' } : {},
    sources: [input.source],
    visibility: input.visibility,
    revision: 1,
    confirmedAt: input.now,
    links: [],
    required,
    status: 'active',
    authorId: input.authorId,
    createdAt: input.now,
    lastUsedAt: input.now,
    replacedBy: '',
  }
}

/**
 * Apply hygiene: mark duplicates replaced. Bodies stay in history.
 * @param pages - Current pages.
 * @param report - {@link hygieneBrain} output.
 */
export function applyHygiene(pages: readonly BrainPage[], report: HygieneReport): BrainPage[] {
  const drop = new Map(report.duplicates.map(row => [row.dropId, row.keepId]))
  return pages.map((page) => {
    const keepId = drop.get(page.id)
    return keepId === undefined ? page : replaceBrainPage(page, keepId)
  })
}
