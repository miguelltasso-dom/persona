import {
  bringContextPrompt,
  parseBringPaste,
  type BringApplyItem,
  type BringContextPreview,
  type BringContextProposal,
  type BringProvider,
} from './bring-context-paste-local.ts'
import { defaultChoice, type ContextProposal, type ProposalChoice } from '../primitives/BringContext.tsx'
import type { LocaleDict } from '../preview/locale-bind.ts'
import { bindLocale } from '../preview/locale-bind.ts'

export type { BringProvider, BringContextPreview }

export function bringPromptForLocale(dict: LocaleDict, localeKey: 'pt' | 'en'): string {
  void dict
  return bringContextPrompt(localeKey)
}

export function organizeBringPaste(
  text: string,
  provider: BringProvider,
): BringContextPreview {
  return parseBringPaste({
    text,
    provider,
    at: new Date().toISOString(),
    existing: [],
  })
}

/** Merge non-blocked proposals into company brief markdown for onboarding Cofre seed. */
type BringPreviewLike = Pick<BringContextPreview, 'proposals'>

export function bringPreviewToVaultSeed(preview: BringPreviewLike): string {
  const lines: string[] = []
  for (const row of preview.proposals) {
    if (row.blocked || row.status === 'duplicate') continue
    lines.push(`## ${row.section}`, row.body, '')
  }
  return lines.join('\n').trim()
}

export function summarizeBringPreview(dict: LocaleDict, preview: BringPreviewLike & { readonly ignored: readonly unknown[] }): string {
  const ready = preview.proposals.filter(row => !row.blocked && row.status !== 'duplicate').length
  const blocked = preview.proposals.filter(row => row.blocked).length
  const ignored = preview.ignored.length
  return bindLocale(dict, 'byc.organizeSummary', {
    ready: String(ready),
    blocked: String(blocked),
    ignored: String(ignored),
  })
}

/** Host/core proposals → Muse `ProposalReview` rows. */
export function contextProposalsFromPreview(preview: BringContextPreview): ContextProposal[] {
  return preview.proposals.map(row => contextProposalFromRow(row))
}

function contextProposalFromRow(row: BringContextProposal): ContextProposal {
  const conflict = row.conflictQuestion.trim() !== ''
    ? row.conflictQuestion
    : (row.duplicateOf.trim() !== '' ? row.duplicateOf : undefined)
  return {
    id: row.id,
    kind: row.kind,
    text: row.body,
    provenance: row.provenance,
    uncertain: row.uncertain,
    sensitive: row.sensitive && row.sensitiveWhy.trim() !== '' ? row.sensitiveWhy : undefined,
    conflict,
  }
}

/** Merge pasted answers and optional vault preview for one review pass. */
export function buildBringReviewPreview(
  pasted: readonly { readonly source: BringProvider; readonly text: string }[],
  vaultPreview: BringContextPreview | null,
): BringContextPreview {
  const merged: BringContextProposal[] = []
  const ignored = vaultPreview?.ignored ?? []
  for (const chunk of pasted) {
    const preview = organizeBringPaste(chunk.text, chunk.source)
    merged.push(...preview.proposals)
  }
  if (vaultPreview !== null) merged.push(...vaultPreview.proposals)
  return { source: pasted.length > 0 ? 'paste' : 'vault', proposals: merged, ignored }
}

/** Accepted review choices → Cofre markdown (onboarding seed). */
/** Review UI choices → core apply items (Forge `decideBringApply`). */
export function choicesToApplyItems(
  preview: BringContextPreview,
  choices: Readonly<Record<string, ProposalChoice>>,
): BringApplyItem[] {
  const items: BringApplyItem[] = []
  for (const row of preview.proposals) {
    const ui = contextProposalFromRow(row)
    const choice = choices[row.id] ?? defaultChoice(ui)
    if (choice.decision === 'discard') {
      items.push({ id: row.id, action: 'discard' })
      continue
    }
    if (choice.decision !== 'accept') continue
    if (ui.sensitive !== undefined && choice.unblocked !== true) {
      items.push({ id: row.id, action: 'discard' })
      continue
    }
    const edited = choice.text.trim() !== ui.text.trim()
    const action = choice.private ? 'private' : (edited ? 'edit' : 'accept')
    items.push({
      id: row.id,
      action,
      ...(edited || action === 'edit' ? { body: choice.text.trim() } : {}),
    })
  }
  return items
}

export function vaultMarkdownFromReview(
  preview: BringContextPreview,
  choices: Readonly<Record<string, ProposalChoice>>,
): string {
  const lines: string[] = []
  for (const row of preview.proposals) {
    const ui = contextProposalFromRow(row)
    const choice = choices[row.id]
    if (choice === undefined || choice.decision !== 'accept') continue
    if (ui.sensitive !== undefined && choice.unblocked !== true) continue
    lines.push(`## ${row.section}`, choice.text.trim(), '')
  }
  return lines.join('\n').trim()
}
