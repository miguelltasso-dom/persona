/**
 * BYC review → Cofre writes. Blocked / conflict / discard / duplicate never persist.
 */

import {
  decideBringApply,
  type BringApplyAction,
  type BringApplyItem,
  type BringContextPreview,
  type BringContextProposal,
  type BringProposalStatus,
  type BringVaultKind,
} from '@deepseek-ai/dsh-persona-core'
import type {
  ApplyContextItemView,
  BringContextPreviewView,
} from './types.ts'

function asKind(value: string): BringVaultKind {
  if (value === 'brief' || value === 'constraint' || value === 'decision' || value === 'memory') {
    return value
  }
  return 'memory'
}

function asStatus(value: string): BringProposalStatus {
  if (
    value === 'ready'
    || value === 'uncertain'
    || value === 'blocked'
    || value === 'duplicate'
    || value === 'conflict'
  ) {
    return value
  }
  return 'ready'
}

function asAction(value: string): BringApplyAction {
  if (value === 'accept' || value === 'edit' || value === 'discard' || value === 'private') {
    return value
  }
  return 'discard'
}

/**
 * Rebuild the domain preview from the wire view (round-trip after the review screen).
 * @param view - Last organize preview.
 */
export function previewFromView(view: BringContextPreviewView): BringContextPreview {
  return {
    source: view.source,
    proposals: view.proposals.map(row => ({
      id: row.id,
      kind: asKind(row.kind),
      section: row.section,
      body: row.body,
      provenance: row.provenance,
      uncertain: row.uncertain,
      sensitive: row.sensitive,
      blocked: row.blocked,
      sensitiveWhy: row.sensitiveWhy,
      duplicateOf: row.duplicateOf,
      conflictQuestion: row.conflictQuestion,
      status: asStatus(row.status),
      path: row.path,
      hash: row.hash,
    })),
    ignored: view.ignored.map(row => ({ path: row.path, why: row.why })),
  }
}

/**
 * Filter review choices through {@link decideBringApply}.
 * @param preview - Wire preview the person saw.
 * @param items - Accept / edit / discard / private.
 */
export function selectedBringWrites(
  preview: BringContextPreviewView,
  items: readonly ApplyContextItemView[],
): {
  readonly writes: readonly BringContextProposal[]
  readonly privateIds: ReadonlySet<string>
  readonly skipped: number
} {
  const choices: BringApplyItem[] = items.map(item => ({
    id: item.id,
    action: asAction(item.action),
    ...(item.body === undefined ? {} : { body: item.body }),
  }))
  const writes = decideBringApply(previewFromView(preview), choices)
  const writeIds = new Set(writes.map(row => row.id))
  const privateIds = new Set(
    items.filter(item => item.action === 'private' && writeIds.has(item.id)).map(item => item.id),
  )
  const decided = items.filter(item => item.action !== 'discard').length
  return { writes, privateIds, skipped: Math.max(0, decided - writes.length) }
}
