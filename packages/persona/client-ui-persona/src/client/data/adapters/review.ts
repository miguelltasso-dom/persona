import type { ReviewAcceptView, ReviewConflictResolutionView, ReviewFileConflictView, ReviewSummaryView } from '@deepseek-ai/dsh-persona-host/types'
import type { ReviewBlockedUi, ReviewFileChangeUi, ReviewSummaryUi } from '../../review/mock-data.ts'
import type { ReviewedBySealReviewer } from '../../teamwork/ReviewedBySeal.tsx'

/** Engine default when the host omits byte limit on the wire. */
export const REVIEW_PATCH_LIMIT_BYTES = 32_768

/** Map Anvil {@link ReviewSummaryView} → Revisar panel model. */
export function reviewSummaryFromHost(payload: ReviewSummaryView): ReviewSummaryUi | null {
  if (!payload.hasWorktree && payload.files.length === 0 && payload.patch.trim() === '') {
    return null
  }
  const extraSummary = payload as ReviewSummaryView & { readonly reviewedBy?: ReviewedBySealReviewer | undefined }
  return {
    ticketId: payload.ticketId,
    files: payload.files.map((file) => {
      // The draft host (SW-6) may send more per file; today's host sends path + counts only.
      const extra = file as typeof file & Partial<Omit<ReviewFileChangeUi, 'path' | 'added' | 'deleted'>>
      return {
        path: file.path,
        added: file.added,
        deleted: file.deleted,
        ...(extra.kind === undefined ? {} : { kind: extra.kind }),
        ...(extra.before === undefined ? {} : { before: extra.before }),
        ...(extra.after === undefined ? {} : { after: extra.after }),
        ...(extra.cells === undefined ? {} : { cells: extra.cells }),
        ...(extra.beforeImage === undefined ? {} : { beforeImage: extra.beforeImage }),
        ...(extra.afterImage === undefined ? {} : { afterImage: extra.afterImage }),
        ...(extra.folderImage === undefined ? {} : { folderImage: extra.folderImage }),
        ...(extra.conflict === undefined ? {} : { conflict: extra.conflict }),
        ...(extra.truncated === undefined ? {} : { truncated: extra.truncated }),
        ...(extra.canOpenDraft === undefined ? {} : { canOpenDraft: extra.canOpenDraft }),
      }
    }),
    added: payload.added,
    deleted: payload.deleted,
    patch: payload.patch,
    patchTruncated: payload.patchTruncated,
    patchLimitBytes: REVIEW_PATCH_LIMIT_BYTES,
    secretsRedacted: payload.secretsRedacted,
    testsClaimed: payload.testsClaimed,
    ...(extraSummary.reviewedBy === undefined ? {} : { reviewedBy: extraSummary.reviewedBy }),
  }
}

/** Conflict after accept → Bloqueado · Precisa de você. */
export function reviewBlockedFromAccept(result: ReviewAcceptView): ReviewBlockedUi | null {
  if (result.kind !== 'blocked') return null
  const explanation = result.explanation.trim()
  return { explanation: explanation === '' ? 'A pasta mudou enquanto o rascunho era feito.' : explanation }
}

/** The files the folder and the draft both changed, with the exact versions the host showed (empty when none). */
export function reviewConflictsFromAccept(result: ReviewAcceptView): readonly ReviewFileConflictView[] {
  return result.kind === 'blocked' ? (result.conflicts ?? []) : []
}

const CHOICE_TO_HOST: Readonly<Record<'mine' | 'theirs' | 'both', ReviewConflictResolutionView['choice']>> = {
  mine: 'keep_mine',
  theirs: 'keep_persona',
  both: 'keep_both',
}

/**
 * The person's answers → the host's `conflicts[]`: each clash goes back with the SAME versions it was shown with, plus the
 * choice. A clash with no answer yet is not sent (the caller keeps asking) — never a guessed choice.
 */
export function resolveReviewConflicts(
  conflicts: readonly ReviewFileConflictView[],
  choices: Readonly<Record<string, 'mine' | 'theirs' | 'both'>>,
): readonly ReviewConflictResolutionView[] | null {
  const resolved: ReviewConflictResolutionView[] = []
  for (const conflict of conflicts) {
    const choice = choices[conflict.path]
    if (choice === undefined) return null
    resolved.push({ ...conflict, choice: CHOICE_TO_HOST[choice] })
  }
  return resolved
}
