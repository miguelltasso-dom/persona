/**
 * Route Attention / approvals through the governance chain (GOV-2).
 * Domain types live in persona-core; this file only decides delivery vs wait.
 */

import {
  recordApprovalAudit,
  resolveApproval,
  type ApprovalAudit,
  type ApprovalRoute,
  type GovernanceSnapshot,
} from '@deepseek-ai/dsh-persona-core'
import { inSilence, mayPropose, type AttentionBudget } from './budget.ts'

export type ApprovalDelivery =
  | { kind: 'deliver'; route: Extract<ApprovalRoute, { kind: 'human' | 'coordination' }>; audit: ApprovalAudit }
  | { kind: 'wait'; route: Extract<ApprovalRoute, { kind: 'wait' }>; audit: ApprovalAudit }

/**
 * Who should see this approval now. Away ⇒ substituto; no backup ⇒ wait with notice.
 * Silence budget only holds proposal-style items, never a required sector approval.
 * @param input - Snapshot, persona, clock, optional kind and attention budget.
 */
export function routeApproval(input: {
  snapshot: GovernanceSnapshot
  personaId: string
  at: string
  kind?: string
  required?: boolean
  ticketId?: string
  budget?: AttentionBudget
  preferCoordination?: boolean
}): ApprovalDelivery {
  const route = resolveApproval(
    input.snapshot,
    input.personaId,
    input.at,
    input.preferCoordination === true,
  )
  if (route.kind === 'wait') {
    return {
      kind: 'wait',
      route,
      audit: recordApprovalAudit({
        at: input.at,
        personaId: input.personaId,
        action: 'waited',
        actor: { kind: 'human', id: route.responsibleHumanId },
        ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
      }),
    }
  }
  if (
    input.required !== true
    && input.budget !== undefined
    && (inSilence(input.budget, Date.parse(input.at)) || !mayPropose(input.budget, Date.parse(input.at)))
  ) {
    return {
      kind: 'wait',
      route: {
        kind: 'wait',
        reason: 'away-no-substitute',
        responsibleHumanId: route.kind === 'human' ? route.humanId : '',
        notice: 'Fora da janela de atenção. A aprovação espera — não some.',
      },
      audit: recordApprovalAudit({
        at: input.at,
        personaId: input.personaId,
        action: 'waited',
        actor: route.kind === 'human'
          ? { kind: 'human', id: route.humanId }
          : { kind: 'coordination', id: route.personaId },
        ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
      }),
    }
  }
  return {
    kind: 'deliver',
    route,
    audit: recordApprovalAudit({
      at: input.at,
      personaId: input.personaId,
      action: 'routed',
      actor: route.kind === 'human'
        ? { kind: 'human', id: route.humanId }
        : { kind: 'coordination', id: route.personaId },
      ...(route.kind === 'human' && route.onBehalfOf !== undefined ? { onBehalfOf: route.onBehalfOf } : {}),
      ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
    }),
  }
}
