/**
 * Score initiative proposals from a synthetic project snapshot.
 * Utility / novelty / non-duplication; empty and near-duplicate titles never emit.
 */

import { mayPropose, type AttentionBudget } from './budget.ts'
import { nearRatio, normalizeRouteText } from './preroute/rules.ts'

/** Why a candidate was dropped. */
export type InitiativeRejectWhy = 'empty' | 'duplicate' | 'budget'

/** Fact the host observed on a project. */
export interface ProjectFact {
  kind: 'stale_ticket' | 'blocked' | 'deadline' | 'gap' | 'recurring_error'
  title: string
  detail: string
  ticketId?: string
}

/** Ticket or prior proposal used for dedupe. */
export interface ExistingWorkItem {
  title: string
  kind: 'ticket' | 'proposal'
}

/** Scored proposal that passed empty + dedupe + budget. */
export interface ScoredProposal {
  title: string
  reason: string
  utility: number
  novelty: number
  uniqueness: number
  score: number
}

export interface InitiativeReject {
  title: string
  why: InitiativeRejectWhy
}

export interface InitiativeQualityInput {
  facts: readonly ProjectFact[]
  existing: readonly ExistingWorkItem[]
  budget: AttentionBudget
  now: number
}

export interface InitiativeQualityResult {
  proposals: ScoredProposal[]
  rejected: InitiativeReject[]
}

const DUP = 0.85

const UTILITY: Record<ProjectFact['kind'], number> = {
  recurring_error: 0.95,
  blocked: 0.9,
  deadline: 0.85,
  gap: 0.7,
  stale_ticket: 0.6,
}

const PREFIX: Record<ProjectFact['kind'], string> = {
  stale_ticket: 'Retomar',
  blocked: 'Desbloquear',
  deadline: 'Prazo',
  gap: 'Cobrir lacuna',
  recurring_error: 'Corrigir erro recorrente',
}

/**
 * @param fact - Observed fact.
 */
export function proposalTitleOf(fact: ProjectFact): string {
  const title = fact.title.trim()
  if (title === '') return ''
  return `${PREFIX[fact.kind]}: ${title}`
}

/**
 * @param fact - Observed fact.
 */
export function proposalReasonOf(fact: ProjectFact): string {
  const detail = fact.detail.trim()
  if (detail !== '') return detail
  return PREFIX[fact.kind]
}

function nearest(title: string, pool: readonly string[]): number {
  const norm = normalizeRouteText(title)
  if (norm === '') return 1
  let best = 0
  for (const item of pool) {
    const ratio = nearRatio(norm, normalizeRouteText(item))
    if (ratio > best) best = ratio
  }
  return best
}

/**
 * Turn facts into scored proposals. Zero empty or duplicate titles in `proposals`.
 * @param input - Snapshot, existing work, attention budget.
 */
export function scoreInitiative(input: InitiativeQualityInput): InitiativeQualityResult {
  const rejected: InitiativeReject[] = []
  if (!mayPropose(input.budget, input.now)) {
    return {
      proposals: [],
      rejected: input.facts.map(fact => ({ title: proposalTitleOf(fact), why: 'budget' as const })),
    }
  }
  const existingTitles = input.existing.map(item => item.title)
  const drafted: ScoredProposal[] = []
  const outgoing: string[] = []
  const room = Math.max(0, input.budget.proposalsPerDay - input.budget.proposedToday)
  for (const fact of input.facts) {
    const title = proposalTitleOf(fact)
    const reason = proposalReasonOf(fact)
    if (title === '' || reason === '') {
      rejected.push({ title, why: 'empty' })
      continue
    }
    const vsExisting = Math.max(nearest(title, existingTitles), nearest(fact.title, existingTitles))
    const vsOutgoing = nearest(title, outgoing)
    if (vsExisting >= DUP || vsOutgoing >= DUP) {
      rejected.push({ title, why: 'duplicate' })
      continue
    }
    const utility = UTILITY[fact.kind]
    const novelty = 1 - vsExisting
    const uniqueness = 1 - vsOutgoing
    if (novelty < 1 - DUP) {
      rejected.push({ title, why: 'duplicate' })
      continue
    }
    drafted.push({
      title,
      reason,
      utility,
      novelty,
      uniqueness,
      score: (utility + novelty + uniqueness) / 3,
    })
    outgoing.push(title)
  }
  drafted.sort((a, b) => b.score - a.score)
  const proposals = drafted.slice(0, room)
  for (const extra of drafted.slice(room)) rejected.push({ title: extra.title, why: 'budget' })
  return { proposals, rejected }
}

/**
 * True when the emitted set has no empty title/reason and no near-duplicate pair.
 * @param proposals - Emitted proposals.
 */
export function initiativeSetClean(proposals: readonly ScoredProposal[]): boolean {
  const titles: string[] = []
  for (const row of proposals) {
    if (row.title.trim() === '' || row.reason.trim() === '') return false
    if (nearest(row.title, titles) >= DUP) return false
    titles.push(row.title)
  }
  return true
}
