/**
 * Gestor de equipe engine face: decide/apply hire and initiative (BRIEFING 20).
 * Persistence is the host/store; this file only sequences domain checks.
 */

import {
  assembleTeamForGoal,
  claimGestorScope,
  commentGestorPlan,
  decideGestorAction,
  gestorAllocate,
  gestorHire,
  gestorInitiative,
  gestorReorganize,
  type GestorAllocation,
  type GestorAssemble,
  type GestorDecision,
  type GestorInitiative,
  type GestorMandate,
  type GestorPlan,
  resolveGestorTie,
  type GestorReorganize,
  type Persona,
  type PersonaProposal,
  type PersonaSpec,
} from '@deepseek-ai/dsh-persona-core'

export type { GestorAssemble, GestorDecision, GestorInitiative }

/**
 * Run the approval gate, then hire when the decision applies.
 * @param input - Mandate, draft plan, spec, roster, whether a human accepted.
 */
export function runGestorHire(input: {
  readonly mandate: GestorMandate
  readonly gestor: Persona
  readonly plan: GestorPlan
  readonly spec: PersonaSpec
  readonly rosterCount: number
  readonly spentTokens: number
  readonly accepted: boolean
  readonly auditId: string
  readonly hireId: string
  readonly at: string
  readonly openPlans?: readonly GestorPlan[]
}): { readonly decision: GestorDecision; readonly proposal?: PersonaProposal } {
  const clash = claimGestorScope(input.openPlans ?? [], input.plan.scopeKey)
  if (clash.kind === 'conflict' && clash.existingPlanId !== input.plan.id) {
    return {
      decision: {
        kind: 'conflict',
        existingPlanId: clash.existingPlanId,
        comment: 'já tem um plano neste escopo — comentei',
      },
    }
  }
  const decision = decideGestorAction({
    mandate: input.mandate,
    plan: input.plan,
    accepted: input.accepted,
    auditId: input.auditId,
    at: input.at,
  })
  if (decision.kind !== 'apply' && decision.kind !== 'notify') return { decision }
  const proposal = gestorHire({
    id: input.hireId,
    gestor: input.gestor,
    limits: input.mandate.limits,
    spec: input.spec,
    rosterCount: input.rosterCount,
    spentTokens: input.spentTokens,
    scope: {},
    createdAt: input.at,
    accepted: input.accepted || input.mandate.limits.approval !== 'always_ask',
  })
  return { decision, proposal }
}

/**
 * @param goal - User sentence.
 * @param projectId - Target project.
 * @param sprintId - Sprint 1 id.
 * @param at - ISO clock.
 */
export function runAssembleTeam(
  goal: string,
  projectId: string,
  sprintId: string,
  at: string,
): GestorAssemble {
  return assembleTeamForGoal({ goal, projectId, sprintId, at })
}

/**
 * Same approval / conflict gate as hire, then assemble sprint 1.
 * @param input - Mandate, draft plan, goal, whether a human accepted.
 */
export function runGestorAssemble(input: {
  readonly mandate: GestorMandate
  readonly plan: GestorPlan
  readonly goal: string
  readonly projectId: string
  readonly sprintId: string
  readonly accepted: boolean
  readonly auditId: string
  readonly at: string
  readonly openPlans?: readonly GestorPlan[]
}): { readonly decision: GestorDecision; readonly assemble?: GestorAssemble } {
  const clash = claimGestorScope(input.openPlans ?? [], input.plan.scopeKey)
  if (clash.kind === 'conflict' && clash.existingPlanId !== input.plan.id) {
    return {
      decision: {
        kind: 'conflict',
        existingPlanId: clash.existingPlanId,
        comment: 'já tem um plano neste escopo — comentei',
      },
    }
  }
  const decision = decideGestorAction({
    mandate: input.mandate,
    plan: input.plan,
    accepted: input.accepted,
    auditId: input.auditId,
    at: input.at,
  })
  if (decision.kind !== 'apply' && decision.kind !== 'notify') return { decision }
  return {
    decision,
    assemble: assembleTeamForGoal({
      goal: input.goal,
      projectId: input.projectId,
      sprintId: input.sprintId,
      at: input.at,
    }),
  }
}

export { gestorInitiative }

/**
 * Allocate after the same approval / conflict gate as hire.
 * @param input - Mandate, plan, seats.
 */
export function runGestorAllocate(input: {
  readonly mandate: GestorMandate
  readonly gestor: Persona
  readonly plan: GestorPlan
  readonly personaId: string
  readonly projectIds: readonly string[]
  readonly accepted: boolean
  readonly auditId: string
  readonly at: string
  readonly channelIds?: readonly string[]
  readonly sectorId?: string
  readonly reportsTo?: string
  readonly openPlans?: readonly GestorPlan[]
}): { readonly decision: GestorDecision; readonly allocation?: GestorAllocation } {
  const clash = claimGestorScope(input.openPlans ?? [], input.plan.scopeKey)
  if (clash.kind === 'conflict' && clash.existingPlanId !== input.plan.id) {
    return {
      decision: {
        kind: 'conflict',
        existingPlanId: clash.existingPlanId,
        comment: 'já tem um plano neste escopo — comentei',
      },
    }
  }
  const decision = decideGestorAction({
    mandate: input.mandate,
    plan: input.plan,
    accepted: input.accepted,
    auditId: input.auditId,
    at: input.at,
  })
  if (decision.kind !== 'apply' && decision.kind !== 'notify') return { decision }
  const allocation = gestorAllocate({
    gestor: input.gestor,
    limits: input.mandate.limits,
    scope: {},
    personaId: input.personaId,
    projectIds: input.projectIds,
    ...(input.channelIds === undefined ? {} : { channelIds: input.channelIds }),
    ...(input.sectorId === undefined ? {} : { sectorId: input.sectorId }),
    ...(input.reportsTo === undefined ? {} : { reportsTo: input.reportsTo }),
  })
  return { decision, allocation }
}

/**
 * Reorganize after the same approval / conflict gate as hire.
 * @param input - Mandate, plan, change.
 */
export function runGestorReorganize(input: {
  readonly mandate: GestorMandate
  readonly gestor: Persona
  readonly plan: GestorPlan
  readonly kind: GestorReorganize['kind']
  readonly targetPersonaId: string
  readonly notice: string
  readonly accepted: boolean
  readonly auditId: string
  readonly at: string
  readonly ticketIds?: readonly string[]
  readonly nextAutonomy?: GestorReorganize['nextAutonomy']
  readonly ceiling?: GestorReorganize['nextAutonomy']
  readonly openPlans?: readonly GestorPlan[]
}): { readonly decision: GestorDecision; readonly change?: GestorReorganize } {
  const clash = claimGestorScope(input.openPlans ?? [], input.plan.scopeKey)
  if (clash.kind === 'conflict' && clash.existingPlanId !== input.plan.id) {
    return {
      decision: {
        kind: 'conflict',
        existingPlanId: clash.existingPlanId,
        comment: 'já tem um plano neste escopo — comentei',
      },
    }
  }
  const decision = decideGestorAction({
    mandate: input.mandate,
    plan: input.plan,
    accepted: input.accepted,
    auditId: input.auditId,
    at: input.at,
  })
  if (decision.kind !== 'apply' && decision.kind !== 'notify') return { decision }
  const change = gestorReorganize({
    gestor: input.gestor,
    limits: input.mandate.limits,
    scope: {},
    kind: input.kind,
    targetPersonaId: input.targetPersonaId,
    notice: input.notice,
    ...(input.ticketIds === undefined ? {} : { ticketIds: input.ticketIds }),
    ...(input.nextAutonomy === undefined ? {} : { nextAutonomy: input.nextAutonomy }),
    ...(input.ceiling === undefined ? {} : { ceiling: input.ceiling }),
  })
  return { decision, change }
}

/**
 * Second Gestor comments on an open plan; host persists the comment row.
 * @param input - Open plans and the commenter.
 */
export function runGestorComment(input: {
  readonly open: readonly GestorPlan[]
  readonly scopeKey: string
  readonly commenterId: string
  readonly workspaceId: string
  readonly commentId: string
  readonly comment: string
  readonly at: string
}): ReturnType<typeof commentGestorPlan> {
  return commentGestorPlan(input)
}

/**
 * Human tie-break. Host applies winner / rejects the rest.
 * @param plans - Proposed and commented rows on one scope.
 * @param chosenId - The plan the person picked.
 * @returns Winner stays proposed; others on the scope are rejected.
 */
export function runGestorTie(
  plans: readonly GestorPlan[],
  chosenId: string,
): ReturnType<typeof resolveGestorTie> {
  return resolveGestorTie({ plans, chosenId })
}
