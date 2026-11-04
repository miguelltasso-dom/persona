/**
 * Gestor de equipe engine face: decide/apply hire and initiative (BRIEFING 20).
 * Persistence is the host/store; this file only sequences domain checks.
 */

import { recordTurnActivity } from './activity.ts'
import {
  assembleTeamForGoal,
  attachGestorPlanMarker,
  commentGestorPlan,
  decideGestorAction,
  gestorAllocate,
  gestorConflictDecision,
  gestorHire,
  gestorInitiative,
  gestorReorganize,
  type GestorAllocation,
  type ExistingGestorFunction,
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

function clashOnScope(open: readonly GestorPlan[] | undefined, draft: GestorPlan, at: string): GestorDecision | undefined {
  return gestorConflictDecision({
    open: open ?? [],
    draft,
    commentId: `${draft.id}-comment`,
    at,
  })
}

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
  const clash = clashOnScope(input.openPlans, input.plan, input.at)
  if (clash !== undefined) return { decision: clash }
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
 * @param existingFunctions - Optional functions in the authorized roster; omitted means all hires.
 */
export function runAssembleTeam(
  goal: string,
  projectId: string,
  sprintId: string,
  at: string,
  existingFunctions?: readonly ExistingGestorFunction[],
): GestorAssemble {
  return assembleTeamForGoal({ goal, projectId, sprintId, at, ...(existingFunctions === undefined ? {} : { existingFunctions }) })
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
  readonly existingFunctions?: readonly ExistingGestorFunction[]
}): { readonly decision: GestorDecision; readonly assemble?: GestorAssemble } {
  const clash = clashOnScope(input.openPlans, input.plan, input.at)
  if (clash !== undefined) return { decision: clash }
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
      ...(input.existingFunctions === undefined ? {} : { existingFunctions: input.existingFunctions }),
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
  const clash = clashOnScope(input.openPlans, input.plan, input.at)
  if (clash !== undefined) return { decision: clash }
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
  const clash = clashOnScope(input.openPlans, input.plan, input.at)
  if (clash !== undefined) return { decision: clash }
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

/**
 * Channel body when a plan is proposed. Host posts this so Prism can parse
 * `[[gestor-plan:id]]`.
 * @param plan - Open plan.
 * @returns Summary plus the marker, once.
 */
export function proposeGestorChannelBody(plan: GestorPlan): string {
  return attachGestorPlanMarker(plan.summary, plan.id)
}

/**
 * One host write when a plan is proposed: channel body + activity row.
 * @param input - Plan, conversation thread, clock.
 * @returns Body to post and the activity row to persist.
 */
export function emitGestorPropose(input: {
  readonly plan: GestorPlan
  readonly threadId: string
  readonly at: string
}): { readonly channelBody: string; readonly activity: ReturnType<typeof recordTurnActivity> } {
  return {
    channelBody: proposeGestorChannelBody(input.plan),
    activity: recordTurnActivity({
      id: `act-${input.plan.id}`,
      personaId: input.plan.gestorId,
      threadId: input.threadId,
      title: input.plan.summary,
      at: input.at,
      tool: input.plan.action,
      state: 'waiting',
    }),
  }
}
