/**
 * Escalation: persona → Coordenação → responsável → substituto (D-054).
 * Absence never goes silent: wait always carries a notice.
 */

import {
  chargeOf,
  humanName,
  humanPresence,
  type GovernancePersona,
  type GovernanceSnapshot,
} from './model.ts'

/** One hop on the published chain. */
export type EscalationHop =
  | { kind: 'persona'; personaId: string }
  | { kind: 'coordination'; personaId: string }
  | { kind: 'human'; humanId: string; role: 'responsible' | 'substitute' }

/** Where an approval should go right now. */
export type ApprovalRoute =
  | { kind: 'human'; humanId: string; role: 'responsible' | 'substitute'; onBehalfOf?: string }
  | { kind: 'coordination'; personaId: string }
  | { kind: 'wait'; reason: 'away-no-substitute'; notice: string; responsibleHumanId: string }

/**
 * Coordination holders (braço direito). Role is assignable — not a fixed name.
 * @param snapshot - Workspace.
 */
export function rightHand(snapshot: GovernanceSnapshot): GovernancePersona | undefined {
  return snapshot.personas.find(row => row.systemRoles.includes('coordination'))
}

/**
 * Published chain for one persona. Missing charge still lists the persona hop.
 * @param snapshot - Workspace.
 * @param personaId - Persona that needs a decision.
 */
export function escalationChain(snapshot: GovernanceSnapshot, personaId: string): EscalationHop[] {
  const hops: EscalationHop[] = [{ kind: 'persona', personaId }]
  const coord = rightHand(snapshot)
  if (coord !== undefined) hops.push({ kind: 'coordination', personaId: coord.id })
  const charge = chargeOf(snapshot, personaId)
  if (charge === undefined) return hops
  hops.push({ kind: 'human', humanId: charge.responsibleHumanId, role: 'responsible' })
  if (charge.substituteHumanId !== undefined) {
    hops.push({ kind: 'human', humanId: charge.substituteHumanId, role: 'substitute' })
  }
  return hops
}

/**
 * Who should see an approval at `at`. Away + substituto ⇒ substituto. Away without backup ⇒ wait.
 * @param snapshot - Workspace.
 * @param personaId - Persona that raised the item.
 * @param at - ISO clock.
 * @param preferCoordination - When a 1-click fix delegated the approval.
 */
export function resolveApproval(
  snapshot: GovernanceSnapshot,
  personaId: string,
  at: string,
  preferCoordination = false,
): ApprovalRoute {
  if (preferCoordination) {
    const coord = rightHand(snapshot)
    if (coord !== undefined) return { kind: 'coordination', personaId: coord.id }
  }
  const charge = chargeOf(snapshot, personaId)
  if (charge === undefined) {
    const coord = rightHand(snapshot)
    if (coord !== undefined) return { kind: 'coordination', personaId: coord.id }
    return {
      kind: 'wait',
      reason: 'away-no-substitute',
      responsibleHumanId: '',
      notice: 'Ninguém responde por esta persona. Defina um responsável — isso não some em silêncio.',
    }
  }
  const presence = humanPresence(snapshot.away, charge.responsibleHumanId, at)
  if (presence === 'available') {
    return { kind: 'human', humanId: charge.responsibleHumanId, role: 'responsible' }
  }
  if (charge.substituteHumanId !== undefined) {
    const sub = humanPresence(snapshot.away, charge.substituteHumanId, at)
    if (sub === 'available') {
      return {
        kind: 'human',
        humanId: charge.substituteHumanId,
        role: 'substitute',
        onBehalfOf: charge.responsibleHumanId,
      }
    }
  }
  const name = humanName(snapshot, charge.responsibleHumanId)
  return {
    kind: 'wait',
    reason: 'away-no-substitute',
    responsibleHumanId: charge.responsibleHumanId,
    notice: `${name} está fora. Sem substituto disponível, isso espera — não some.`,
  }
}

/**
 * Audit row: who decided, in whose name, when.
 */
export interface ApprovalAudit {
  id: string
  at: string
  personaId: string
  ticketId?: string
  action: 'approved' | 'rejected' | 'waited' | 'routed'
  actor: { kind: 'human' | 'coordination'; id: string }
  onBehalfOf?: string
}

/**
 * Record a decision or a wait. Never silent.
 * @param input - Fields.
 */
export function recordApprovalAudit(input: Omit<ApprovalAudit, 'id'> & { id?: string }): ApprovalAudit {
  return {
    id: input.id ?? `audit:${input.personaId}:${input.at}`,
    at: input.at,
    personaId: input.personaId,
    action: input.action,
    actor: input.actor,
    ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
    ...(input.onBehalfOf === undefined ? {} : { onBehalfOf: input.onBehalfOf }),
  }
}
