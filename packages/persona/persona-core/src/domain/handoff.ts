/**
 * Typed executor handoffs with claim-once (AI-MEMORY-DECISION 3a / E1).
 */

import { DomainError } from './schemas.ts'

export interface HandoffEvidence {
  id: string
  summary: string
}

export interface HandoffObject {
  id: string
  ticketId: string
  objective: string
  decisionIds: readonly string[]
  evidence: readonly HandoffEvidence[]
  nextAction: string
  fromPersonaId: string
  toPersonaId: string
  depth: number
  claimedBy?: string
}

export const HANDOFF_MAX_DEPTH = 4
export const HANDOFF_MAX_COUNT = 8
export const HANDOFF_BUDGET_CHARS = 4000

export type HandoffErrorCode = DomainError['code'] | 'HANDOFF_CYCLE' | 'HANDOFF_DEPTH' | 'HANDOFF_BUDGET' | 'HANDOFF_CLAIMED' | 'HANDOFF_LIMIT'

/**
 * @param chain - Existing handoffs on the ticket (oldest first).
 * @param next - Proposed handoff (unclaimed).
 */
export function assertHandoffAllowed(chain: readonly HandoffObject[], next: HandoffObject): void {
  if (chain.length >= HANDOFF_MAX_COUNT) throw new DomainError('ACCESS_ESCALATION', 'HANDOFF_LIMIT')
  if (next.depth > HANDOFF_MAX_DEPTH) throw new DomainError('ACCESS_ESCALATION', 'HANDOFF_DEPTH')
  const body = JSON.stringify(next)
  if (body.length > HANDOFF_BUDGET_CHARS) throw new DomainError('ACCESS_ESCALATION', 'HANDOFF_BUDGET')
  const seen = new Set(chain.map(item => item.fromPersonaId))
  if (seen.has(next.toPersonaId) && chain.some(item => item.toPersonaId === next.fromPersonaId)) {
    throw new DomainError('ACCESS_ESCALATION', 'HANDOFF_CYCLE')
  }
  if (chain.some(item => item.id === next.id)) throw new DomainError('ACCESS_ESCALATION', 'HANDOFF_CLAIMED')
}

/**
 * First claim wins. Later claims fail.
 * @param handoff - Object to claim.
 * @param personaId - Claimant.
 */
export function claimHandoff(handoff: HandoffObject, personaId: string): HandoffObject {
  if (handoff.claimedBy !== undefined && handoff.claimedBy !== personaId) {
    throw new DomainError('ACCESS_ESCALATION', 'HANDOFF_CLAIMED')
  }
  return { ...handoff, claimedBy: personaId }
}

/**
 * A reference is visible only after the receiver is authorized.
 * @param handoff - Handoff object.
 * @param actorId - Would-be reader.
 * @param authorized - Host-supplied grant.
 */
export function resolveHandoffRef(
  handoff: HandoffObject,
  actorId: string,
  authorized: boolean,
): HandoffObject | undefined {
  if (!authorized) return undefined
  if (actorId !== handoff.toPersonaId && actorId !== handoff.fromPersonaId && handoff.claimedBy !== actorId) {
    return undefined
  }
  return handoff
}
