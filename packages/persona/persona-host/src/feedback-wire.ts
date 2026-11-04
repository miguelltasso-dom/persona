/**
 * Persist review / proposal outcomes as persona memory (Forge learnFromFeedback).
 */

import { learnFromFeedback, type AttentionBudget } from '@deepseek-ai/dsh-persona-engine'
import type { VaultRepos } from '@deepseek-ai/dsh-persona-store'

const SEED: AttentionBudget = {
  proposalsPerDay: 2,
  proposedToday: 0,
  silenceUntil: 0,
  tokensLeft: 1,
  runsLeft: 1,
  acceptanceRate: 0.5,
}

/**
 * Write a provenance-tagged memory. Failures stay local (never throw to RPC).
 * @param vault - Company vault.
 * @param request - Tenant + ticket.
 * @param kind - Accept or request-changes.
 * @param detail - Mode or feedback.
 */
export function rememberReviewFeedback(
  vault: VaultRepos,
  request: { workspaceId: string; projectId: string; ticketId: string },
  kind: 'review_accepted' | 'review_changes',
  detail: string,
): void {
  const learned = learnFromFeedback({
    kind,
    personaId: 'review',
    title: request.ticketId,
    detail,
    at: Date.now(),
    sourceId: request.ticketId,
  }, SEED)
  try {
    vault.createRecord({
      id: learned.memory.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      kind: 'memory',
      body: learned.memory.body,
      authorId: 'review',
      visibility: { kind: 'workspace' },
    })
  } catch (vaultError: unknown) {
    void vaultError
  }
}
