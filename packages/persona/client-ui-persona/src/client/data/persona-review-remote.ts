import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type { ReviewAcceptView, ReviewSummaryView } from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from './lumen-inject.ts'

/** Review delivery RPCs (Anvil); Typert client may lag until regen. */
export interface PersonaReviewRemote {
  reviewSummary(request: { workspaceId: string; projectId: string; ticketId: string }): Promise<RemoteResult<ReviewSummaryView>>
  acceptReview(request: {
    workspaceId: string
    projectId: string
    ticketId: string
    mode: 'ff' | 'merge'
    /** Per clashing file: what stays (SW-3/SW-6; see contracts/simple-workspace-ui.md §3). */
    choices?: Readonly<Record<string, 'mine' | 'theirs' | 'both'>>
  }): Promise<RemoteResult<ReviewAcceptView>>
  requestChanges(request: {
    workspaceId: string
    projectId: string
    ticketId: string
    feedback: string
  }): Promise<RemoteResult<boolean>>
  discardReview(request: { workspaceId: string; projectId: string; ticketId: string }): Promise<RemoteResult<boolean>>
}

type ReviewWire = PersonaReviewRemote

function hasReviewWire(persona: PersonaRemoteClient): persona is PersonaRemoteClient & ReviewWire {
  return typeof (persona as PersonaRemoteClient & Partial<ReviewWire>).reviewSummary === 'function'
}

/** Narrow host review methods without widening every consumer of {@link PersonaRemoteClient}. */
export function personaReviewRemote(persona: PersonaRemoteClient): PersonaReviewRemote {
  if (!hasReviewWire(persona)) {
    const missing = (): Promise<never> => Promise.reject(new Error('review-unavailable'))
    return {
      reviewSummary: missing,
      acceptReview: missing,
      requestChanges: missing,
      discardReview: missing,
    }
  }
  const wire = persona as PersonaRemoteClient & ReviewWire
  return {
    reviewSummary: request => wire.reviewSummary(request),
    acceptReview: request => wire.acceptReview(request),
    requestChanges: request => wire.requestChanges(request),
    discardReview: request => wire.discardReview(request),
  }
}
