import type { RemoteResult } from '@deepseek-ai/dsh-api-remotes/client'
import type {
  AcceptReviewRequest,
  RequestChangesRequest,
  ReviewAcceptView,
  ReviewSummaryView,
  TicketCommandRequest,
} from '@deepseek-ai/dsh-persona-host/types'
import type { PersonaRemoteClient } from './lumen-inject.ts'

/**
 * Review delivery RPCs (Anvil). Every request type is the host's own: `reviewSummary` and `discardReview` take a
 * TicketCommandRequest (command + reason), `acceptReview` takes the folder-conflict choices as `conflicts[]` with the exact
 * file versions the previous answer showed. The Typert client may lag until regen, hence the narrow wire below.
 */
export interface PersonaReviewRemote {
  reviewSummary(request: TicketCommandRequest): Promise<RemoteResult<ReviewSummaryView>>
  acceptReview(request: AcceptReviewRequest): Promise<RemoteResult<ReviewAcceptView>>
  requestChanges(request: RequestChangesRequest): Promise<RemoteResult<boolean>>
  discardReview(request: TicketCommandRequest): Promise<RemoteResult<boolean>>
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
