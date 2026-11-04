/**
 * Turn proposal and review outcomes into persona memory + skill candidates
 * with provenance. Acceptance rate feeds {@link nextProposalIntervalHours}.
 */

import { nextProposalIntervalHours, recordProposalOutcome, type AttentionBudget } from './budget.ts'

/** Outcomes the engine can learn from. */
export type FeedbackKind = 'proposal_accepted' | 'proposal_rejected' | 'review_accepted' | 'review_changes'

export interface FeedbackEvent {
  kind: FeedbackKind
  personaId: string
  title: string
  detail: string
  at: number
  sourceId: string
}

export interface LearnedMemory {
  id: string
  personaId: string
  kind: 'memory'
  body: string
  provenance: { event: FeedbackKind; sourceId: string; at: number }
}

export interface LearnedSkillCandidate {
  name: string
  body: string
  origin: 'learned'
  scope: 'persona'
  enabled: false
  personaId: string
  provenance: { event: FeedbackKind; sourceId: string }
}

export interface FeedbackLearnResult {
  memory: LearnedMemory
  skill: LearnedSkillCandidate | undefined
  budget: AttentionBudget
  intervalHours: number
}

const BODIES: Record<FeedbackKind, (title: string, detail: string) => string> = {
  proposal_accepted: (title, detail) => `Proposta aceita: ${title}. ${detail}`.trim(),
  proposal_rejected: (title, detail) => `Proposta recusada: ${title}. Não repetir sem evidência nova. ${detail}`.trim(),
  review_accepted: (title, detail) => `Revisão aceita: ${title}. ${detail}`.trim(),
  review_changes: (title, detail) => `Revisão pediu ajustes: ${title}. ${detail}`.trim(),
}

/**
 * @param event - Accept / reject / review outcome.
 */
export function memoryFromFeedback(event: FeedbackEvent): LearnedMemory {
  return {
    id: `mem-fb-${event.sourceId}`,
    personaId: event.personaId,
    kind: 'memory',
    body: BODIES[event.kind](event.title.trim(), event.detail.trim()),
    provenance: { event: event.kind, sourceId: event.sourceId, at: event.at },
  }
}

/**
 * Skill candidate only when the person accepted the work (not a rejection).
 * @param event - Outcome.
 */
export function skillCandidateFromFeedback(event: FeedbackEvent): LearnedSkillCandidate | undefined {
  if (event.kind === 'proposal_rejected' || event.kind === 'review_changes') return undefined
  const title = event.title.trim()
  if (title === '') return undefined
  return {
    name: title.slice(0, 64),
    body: `Quando o contexto for semelhante a: ${title}. ${event.detail.trim()}`.trim(),
    origin: 'learned',
    scope: 'persona',
    enabled: false,
    personaId: event.personaId,
    provenance: { event: event.kind, sourceId: event.sourceId },
  }
}

/**
 * @param budget - Current attention counters.
 * @param event - Outcome.
 */
export function adjustBudgetFromFeedback(budget: AttentionBudget, event: FeedbackEvent): AttentionBudget {
  if (event.kind === 'proposal_accepted') return recordProposalOutcome(budget, true)
  if (event.kind === 'proposal_rejected') return recordProposalOutcome(budget, false)
  if (event.kind === 'review_changes') {
    return { ...budget, acceptanceRate: Math.max(0, budget.acceptanceRate * 0.75) }
  }
  if (event.kind === 'review_accepted') {
    return { ...budget, acceptanceRate: Math.min(1, budget.acceptanceRate * 0.75 + 0.25) }
  }
  return budget
}

/**
 * Memory + optional skill + updated cadence.
 * @param event - Outcome.
 * @param budget - Current budget.
 * @param baseHours - Configured proposal cadence.
 */
export function learnFromFeedback(
  event: FeedbackEvent,
  budget: AttentionBudget,
  baseHours: number = 4,
): FeedbackLearnResult {
  const next = adjustBudgetFromFeedback(budget, event)
  return {
    memory: memoryFromFeedback(event),
    skill: skillCandidateFromFeedback(event),
    budget: next,
    intervalHours: nextProposalIntervalHours(baseHours, next.acceptanceRate),
  }
}
