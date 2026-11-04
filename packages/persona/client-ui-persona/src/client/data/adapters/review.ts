import type { ReviewAcceptView, ReviewSummaryView } from '@deepseek-ai/dsh-persona-host/types'
import type { ReviewBlockedUi, ReviewFileChangeUi, ReviewSummaryUi } from '../../review/mock-data.ts'

/** Engine default when the host omits byte limit on the wire. */
export const REVIEW_PATCH_LIMIT_BYTES = 32_768

/** Map Anvil {@link ReviewSummaryView} → Revisar panel model. */
export function reviewSummaryFromHost(payload: ReviewSummaryView): ReviewSummaryUi | null {
  if (!payload.hasWorktree && payload.files.length === 0 && payload.patch.trim() === '') {
    return null
  }
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
  }
}

/** Conflict after accept → Bloqueado · Precisa de você. */
export function reviewBlockedFromAccept(result: ReviewAcceptView): ReviewBlockedUi | null {
  if (result.kind !== 'blocked') return null
  const explanation = result.explanation.trim()
  return { explanation: explanation === '' ? 'A pasta mudou enquanto o rascunho era feito.' : explanation }
}
