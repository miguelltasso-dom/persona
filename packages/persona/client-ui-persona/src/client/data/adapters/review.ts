import type { ReviewAcceptView, ReviewSummaryView } from '@deepseek-ai/dsh-persona-host/types'
import type { ReviewBlockedUi, ReviewSummaryUi } from '../../review/mock-data.ts'

/** Engine default when the host omits byte limit on the wire. */
export const REVIEW_PATCH_LIMIT_BYTES = 32_768

/** Map Anvil {@link ReviewSummaryView} → Revisar panel model. */
export function reviewSummaryFromHost(payload: ReviewSummaryView): ReviewSummaryUi | null {
  if (!payload.hasWorktree && payload.files.length === 0 && payload.patch.trim() === '') {
    return null
  }
  return {
    ticketId: payload.ticketId,
    files: payload.files.map(file => ({
      path: file.path,
      added: file.added,
      deleted: file.deleted,
    })),
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
  return { explanation: explanation === '' ? 'Conflito ao integrar — resolva no repositório.' : explanation }
}
