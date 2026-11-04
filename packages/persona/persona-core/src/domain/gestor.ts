/**
 * Assignable Gestor de equipe function (BRIEFING 20, role `team_manager`):
 * hire, allocate, reorganize, assemble a team for a goal. Never more access
 * than the holder; never grant the function without an explicit permit.
 * N holders; scope avoids fights.
 */

import { personaPropose, proposalExceedsCreatorAccess } from './rules.ts'
import { DomainError, type CliKind, type Persona, type PersonaProposal, type PersonaSpec } from './schemas.ts'
import type { GovernanceAutonomy } from '../governance/model.ts'
import type { HealthReport } from '../governance/health.ts'
import { parseStructureAsk, recommendStructure, type StructureRecommendation } from '../governance/recommend.ts'
import { proposeWorkflow, type ProjectWorkflow, type WorkflowProposal } from '../board/workflow.ts'
import { openSprint, type Sprint } from '../board/sprint.ts'

export type GestorApproval = 'always_ask' | 'auto_within_limits' | 'auto_and_notify'

export type GestorActionKind = 'hire' | 'allocate' | 'reorganize' | 'assemble'

export interface GestorLimits {
  readonly approval: GestorApproval
  readonly maxPersonas: number
  readonly budgetTokens: number
  readonly allowedTools: readonly string[]
  readonly allowedEngines: readonly ('dsh' | CliKind)[]
  readonly sectorIds: readonly string[]
  readonly projectIds: readonly string[]
  readonly canGrantGestor: boolean
}

export interface GestorMandate {
  readonly personaId: string
  readonly workspaceId: string
  readonly limits: GestorLimits
}

export interface GestorScope {
  readonly projectId?: string
  readonly sectorId?: string
  readonly roleTitle?: string
}

export interface GestorPlan {
  readonly id: string
  readonly workspaceId: string
  readonly gestorId: string
  readonly action: GestorActionKind
  readonly scopeKey: string
  readonly summary: string
  readonly reason: string
  readonly status: 'proposed' | 'applied' | 'commented' | 'rejected'
  readonly createdAt: string
  readonly commentOnId?: string
}

export interface GestorAudit {
  readonly id: string
  readonly workspaceId: string
  readonly gestorId: string
  readonly action: GestorActionKind
  readonly summary: string
  readonly reason: string
  readonly at: string
}

export type GestorDecision =
  | { readonly kind: 'apply'; readonly plan: GestorPlan; readonly audit: GestorAudit }
  | { readonly kind: 'ask'; readonly plan: GestorPlan }
  | { readonly kind: 'notify'; readonly plan: GestorPlan; readonly audit: GestorAudit }
  | { readonly kind: 'conflict'; readonly existingPlanId: string; readonly comment: string }
  | { readonly kind: 'refuse'; readonly why: string }

export interface GestorAssemble {
  readonly structure: StructureRecommendation
  readonly workflow: ProjectWorkflow
  readonly workflowProposal: WorkflowProposal
  readonly sprint: Sprint
}

export interface GestorInitiative {
  readonly kind: 'queue_full' | 'sector_uncovered' | 'health'
  readonly subjectId: string
  readonly reason: string
  readonly action: GestorActionKind
}

/** Safe defaults: always ask, cannot grant Gestor de equipe, workspace-wide. */
export const DEFAULT_GESTOR_LIMITS: GestorLimits = {
  approval: 'always_ask',
  maxPersonas: 8,
  budgetTokens: 0,
  allowedTools: [],
  allowedEngines: [],
  sectorIds: [],
  projectIds: [],
  canGrantGestor: false,
}

/**
 * @param persona - Roster row.
 */
export function isGestor(persona: Pick<Persona, 'systemRoles'>): boolean {
  return persona.systemRoles.includes('team_manager')
}

/**
 * @param personas - Workspace roster.
 * @param workspaceId - Workspace.
 */
export function gestorHolders(
  personas: readonly Persona[],
  workspaceId: string,
): Persona[] {
  return personas.filter(row => row.workspaceId === workspaceId && isGestor(row))
}

/**
 * Stable conflict key: project + sector + role.
 * @param scope - Intended target.
 */
export function gestorScopeKey(scope: GestorScope): string {
  return `${scope.projectId ?? '*'}|${scope.sectorId ?? '*'}|${scope.roleTitle ?? '*'}`
}

/**
 * Empty sector/project lists mean workspace-wide. A set list is exclusive.
 * @param limits - Mandate.
 * @param scope - Intended target.
 */
export function gestorInScope(limits: GestorLimits, scope: GestorScope): boolean {
  if (limits.projectIds.length > 0) {
    if (scope.projectId === undefined || !limits.projectIds.includes(scope.projectId)) return false
  }
  if (limits.sectorIds.length > 0) {
    if (scope.sectorId === undefined || !limits.sectorIds.includes(scope.sectorId)) return false
  }
  return true
}

/**
 * @param limits - User-defined ceiling.
 */
export function assertGestorLimits(limits: GestorLimits): void {
  if (limits.maxPersonas < 1) throw new DomainError('INVALID_GESTOR', 'MAX')
  if (limits.budgetTokens < 0) throw new DomainError('INVALID_GESTOR', 'BUDGET')
}

function engineOf(spec: PersonaSpec): 'dsh' | CliKind {
  return spec.runner.kind === 'dsh' ? 'dsh' : spec.runner.cli
}

/**
 * Hire checks: access ≤ holder, no illicit Gestor grant, roster/budget/tool/engine caps.
 * @param input - Holder, mandate, proposed spec, current roster size, monthly spend.
 */
export function assertGestorHire(input: {
  readonly gestor: Persona
  readonly limits: GestorLimits
  readonly spec: PersonaSpec
  readonly rosterCount: number
  readonly spentTokens: number
  readonly scope: GestorScope
}): void {
  if (!isGestor(input.gestor)) throw new DomainError('ACL_DENIED', 'NOT_GESTOR')
  if (input.gestor.workspaceId === '') throw new DomainError('INVALID_GESTOR', 'WORKSPACE')
  if (!gestorInScope(input.limits, input.scope)) throw new DomainError('INVALID_GESTOR', 'SCOPE')
  if (input.rosterCount >= input.limits.maxPersonas) throw new DomainError('INVALID_GESTOR', 'MAX')
  if (input.limits.budgetTokens > 0) {
    const add = input.spec.limits.tokensPerMonth ?? 0
    if (input.spentTokens + add > input.limits.budgetTokens) throw new DomainError('INVALID_GESTOR', 'BUDGET')
  }
  if (input.limits.allowedTools.length > 0) {
    for (const name of Object.keys(input.spec.tools)) {
      if (!input.limits.allowedTools.includes(name)) throw new DomainError('INVALID_GESTOR', 'TOOL')
    }
  }
  if (input.limits.allowedEngines.length > 0 && !input.limits.allowedEngines.includes(engineOf(input.spec))) {
    throw new DomainError('INVALID_GESTOR', 'ENGINE')
  }
  if (input.spec.systemRoles.includes('team_manager') && !input.limits.canGrantGestor) {
    throw new DomainError('INVALID_GESTOR', 'GRANT')
  }
  if (proposalExceedsCreatorAccess(input.gestor, input.spec)) {
    throw new DomainError('ACCESS_ESCALATION')
  }
}

/**
 * Allocate / assign a function. Granting Gestor de equipe needs the explicit permit.
 * @param input - Holder, limits, target roles, scope.
 */
export function assertGestorAllocate(input: {
  readonly gestor: Persona
  readonly limits: GestorLimits
  readonly nextRoles: readonly string[]
  readonly scope: GestorScope
}): void {
  if (!isGestor(input.gestor)) throw new DomainError('ACL_DENIED', 'NOT_GESTOR')
  if (!gestorInScope(input.limits, input.scope)) throw new DomainError('INVALID_GESTOR', 'SCOPE')
  if (input.nextRoles.includes('team_manager') && !input.limits.canGrantGestor) {
    throw new DomainError('INVALID_GESTOR', 'GRANT')
  }
}

export interface GestorAllocation {
  readonly personaId: string
  readonly projectIds: readonly string[]
  readonly channelIds: readonly string[]
  readonly sectorId?: string
  readonly reportsTo?: string
}

/**
 * Place a persona on projects, channels, and a sector. Stays inside the mandate.
 * @param input - Holder, limits, target, and seats.
 */
export function gestorAllocate(input: {
  readonly gestor: Persona
  readonly limits: GestorLimits
  readonly scope: GestorScope
  readonly personaId: string
  readonly projectIds: readonly string[]
  readonly channelIds?: readonly string[]
  readonly sectorId?: string
  readonly reportsTo?: string
  readonly nextRoles?: readonly string[]
}): GestorAllocation {
  assertGestorAllocate({
    gestor: input.gestor,
    limits: input.limits,
    nextRoles: input.nextRoles ?? [],
    scope: input.scope,
  })
  if (input.personaId === '') throw new DomainError('INVALID_GESTOR', 'TARGET')
  if (input.limits.projectIds.length > 0) {
    for (const id of input.projectIds) {
      if (!input.limits.projectIds.includes(id)) throw new DomainError('INVALID_GESTOR', 'SCOPE')
    }
  }
  if (input.sectorId !== undefined && input.limits.sectorIds.length > 0) {
    if (!input.limits.sectorIds.includes(input.sectorId)) throw new DomainError('INVALID_GESTOR', 'SCOPE')
  }
  return {
    personaId: input.personaId,
    projectIds: [...input.projectIds],
    channelIds: [...(input.channelIds ?? [])],
    ...(input.sectorId === undefined ? {} : { sectorId: input.sectorId }),
    ...(input.reportsTo === undefined ? {} : { reportsTo: input.reportsTo }),
  }
}

const AUTONOMY_RANK: Record<GovernanceAutonomy, number> = {
  on_request: 0,
  propose: 1,
  act: 2,
}

export type GestorReorganizeKind = 'move_work' | 'pause_idle' | 'set_autonomy'

export interface GestorReorganize {
  readonly kind: GestorReorganizeKind
  readonly targetPersonaId: string
  readonly notice: string
  readonly ticketIds: readonly string[]
  readonly nextAutonomy?: GovernanceAutonomy
}

/**
 * Reorganize: move work, pause an idle persona (with notice), or set autonomy
 * within the user ceiling. Never raises autonomy above the ceiling.
 * @param input - Holder, limits, scope, and the intended change.
 */
export function assertGestorReorganize(input: {
  readonly gestor: Persona
  readonly limits: GestorLimits
  readonly scope: GestorScope
  readonly kind: GestorReorganizeKind
  readonly targetPersonaId: string
  readonly notice: string
  readonly ticketIds?: readonly string[]
  readonly nextAutonomy?: GovernanceAutonomy
  readonly ceiling?: GovernanceAutonomy
}): void {
  if (!isGestor(input.gestor)) throw new DomainError('ACL_DENIED', 'NOT_GESTOR')
  if (!gestorInScope(input.limits, input.scope)) throw new DomainError('INVALID_GESTOR', 'SCOPE')
  if (input.targetPersonaId === '') throw new DomainError('INVALID_GESTOR', 'TARGET')
  if (input.kind === 'pause_idle' && input.notice.trim() === '') {
    throw new DomainError('INVALID_GESTOR', 'NOTICE')
  }
  if (input.kind === 'move_work' && (input.ticketIds?.length ?? 0) === 0) {
    throw new DomainError('INVALID_GESTOR', 'TICKETS')
  }
  if (input.kind === 'set_autonomy') {
    if (input.nextAutonomy === undefined) throw new DomainError('INVALID_GESTOR', 'AUTONOMY')
    const ceiling = input.ceiling ?? 'propose'
    if (AUTONOMY_RANK[input.nextAutonomy] > AUTONOMY_RANK[ceiling]) {
      throw new DomainError('INVALID_GESTOR', 'AUTONOMY')
    }
  }
}

/**
 * @param input - Same as {@link assertGestorReorganize}.
 * @returns Applied reorganize record (host persists).
 */
export function gestorReorganize(input: {
  readonly gestor: Persona
  readonly limits: GestorLimits
  readonly scope: GestorScope
  readonly kind: GestorReorganizeKind
  readonly targetPersonaId: string
  readonly notice: string
  readonly ticketIds?: readonly string[]
  readonly nextAutonomy?: GovernanceAutonomy
  readonly ceiling?: GovernanceAutonomy
}): GestorReorganize {
  assertGestorReorganize(input)
  return {
    kind: input.kind,
    targetPersonaId: input.targetPersonaId,
    notice: input.notice,
    ticketIds: input.ticketIds ?? [],
    ...(input.nextAutonomy === undefined ? {} : { nextAutonomy: input.nextAutonomy }),
  }
}

/**
 * First open plan on the same scope wins; the other comments.
 * @param open - Proposed plans still pending.
 * @param scopeKey - {@link gestorScopeKey}.
 */
export function claimGestorScope(
  open: readonly GestorPlan[],
  scopeKey: string,
): { readonly kind: 'claim' } | { readonly kind: 'conflict'; readonly existingPlanId: string } {
  const hit = open.find(plan => plan.status === 'proposed' && plan.scopeKey === scopeKey)
  if (hit !== undefined) return { kind: 'conflict', existingPlanId: hit.id }
  return { kind: 'claim' }
}

/**
 * Second Gestor on the same scope comments; the first plan stays proposed.
 * @param input - Open plans and the commenter's note.
 * @returns Comment row, or `claim` when the scope is free.
 */
export function commentGestorPlan(input: {
  readonly open: readonly GestorPlan[]
  readonly scopeKey: string
  readonly commenterId: string
  readonly workspaceId: string
  readonly commentId: string
  readonly comment: string
  readonly at: string
}): { readonly kind: 'comment'; readonly existingId: string; readonly plan: GestorPlan } | { readonly kind: 'claim' } {
  const clash = claimGestorScope(input.open, input.scopeKey)
  if (clash.kind === 'claim') return { kind: 'claim' }
  return {
    kind: 'comment',
    existingId: clash.existingPlanId,
    plan: {
      id: input.commentId,
      workspaceId: input.workspaceId,
      gestorId: input.commenterId,
      action: input.open.find(row => row.id === clash.existingPlanId)?.action ?? 'hire',
      scopeKey: input.scopeKey,
      summary: input.comment,
      reason: input.comment,
      status: 'commented',
      createdAt: input.at,
      commentOnId: clash.existingPlanId,
    },
  }
}

/**
 * Human picks the winner on a tied scope. Others on that scope are rejected.
 * @param input - Open plans and the chosen id.
 */
export function resolveGestorTie(input: {
  readonly plans: readonly GestorPlan[]
  readonly chosenId: string
}): { readonly winner: GestorPlan; readonly rejected: GestorPlan[] } {
  const winner = input.plans.find(row => row.id === input.chosenId)
  if (winner === undefined) throw new DomainError('INVALID_GESTOR', 'TIE')
  const rejected = input.plans
    .filter(row => row.id !== winner.id && row.scopeKey === winner.scopeKey && row.status !== 'applied')
    .map(row => ({ ...row, status: 'rejected' as const }))
  return { winner: { ...winner, status: 'proposed' }, rejected }
}

function auditOf(input: {
  readonly id: string
  readonly workspaceId: string
  readonly gestorId: string
  readonly action: GestorActionKind
  readonly summary: string
  readonly reason: string
  readonly at: string
}): GestorAudit {
  return {
    id: input.id,
    workspaceId: input.workspaceId,
    gestorId: input.gestorId,
    action: input.action,
    summary: input.summary,
    reason: input.reason,
    at: input.at,
  }
}

/**
 * Approval gate. `always_ask` never applies without `accepted`.
 * @param input - Mandate, draft plan, whether a human already approved.
 */
export function decideGestorAction(input: {
  readonly mandate: GestorMandate
  readonly plan: GestorPlan
  readonly accepted: boolean
  readonly auditId: string
  readonly at: string
}): GestorDecision {
  const audit = auditOf({
    id: input.auditId,
    workspaceId: input.mandate.workspaceId,
    gestorId: input.mandate.personaId,
    action: input.plan.action,
    summary: input.plan.summary,
    reason: input.plan.reason,
    at: input.at,
  })
  if (input.mandate.limits.approval === 'always_ask' && !input.accepted) {
    return { kind: 'ask', plan: input.plan }
  }
  if (input.mandate.limits.approval === 'auto_and_notify') {
    return { kind: 'notify', plan: { ...input.plan, status: 'applied' }, audit }
  }
  return { kind: 'apply', plan: { ...input.plan, status: 'applied' }, audit }
}

/**
 * Mark an accepted plan applied. Rejected plans stay rejected.
 * @param plan - Open plan after {@link decideGestorAction} or a human accept.
 * @returns Applied copy.
 */
export function applyGestorPlan(plan: GestorPlan): GestorPlan {
  if (plan.status === 'rejected') {
    throw new DomainError('INVALID_GESTOR', 'REJECTED')
  }
  return { ...plan, status: 'applied' }
}

/**
 * Rows the host persists in one write (GES-2 apply atomically).
 * @param decision - Gate result.
 * @returns Plan/audit to store, or `persist: false`.
 */
export function gestorDecisionRows(decision: GestorDecision): {
  readonly persist: boolean
  readonly plan?: GestorPlan
  readonly audit?: GestorAudit
} {
  if (decision.kind === 'apply' || decision.kind === 'notify') {
    return { persist: true, plan: decision.plan, audit: decision.audit }
  }
  if (decision.kind === 'ask') return { persist: true, plan: decision.plan }
  return { persist: false }
}

/**
 * Hire through persona_propose after Gestor de equipe checks.
 * @param input - Identity, holder, spec, policy from the approval mode.
 */
export function gestorHire(input: {
  readonly id: string
  readonly gestor: Persona
  readonly limits: GestorLimits
  readonly spec: PersonaSpec
  readonly rosterCount: number
  readonly spentTokens: number
  readonly scope: GestorScope
  readonly createdAt: string
  readonly accepted: boolean
}): PersonaProposal {
  assertGestorHire(input)
  if (input.limits.approval === 'always_ask' && !input.accepted) {
    throw new DomainError('INVALID_GESTOR', 'ASK')
  }
  return personaPropose({
    id: input.id,
    workspaceId: input.gestor.workspaceId,
    creator: input.gestor,
    spec: input.spec,
    policy: input.accepted || input.limits.approval !== 'always_ask' ? 'auto' : 'approval',
    createdAt: input.createdAt,
  })
}

/**
 * One-shot team for a goal: structure + flow + sprint 1.
 * @param input - Free-text goal, project id, clock.
 */
export function assembleTeamForGoal(input: {
  readonly goal: string
  readonly projectId: string
  readonly sprintId: string
  readonly at: string
}): GestorAssemble {
  const ask = parseStructureAsk(input.goal)
  const structure = recommendStructure({
    company: ask.company,
    sectorNames: ask.sectorNames,
    recurring: ask.recurring,
  })
  const workflowProposal = proposeWorkflow(input.projectId, input.goal)
  return {
    structure,
    workflowProposal,
    workflow: workflowProposal.workflow,
    sprint: openSprint({
      id: input.sprintId,
      projectId: input.projectId,
      name: 'Sprint 1',
      objective: input.goal,
      status: 'planejado',
      startsAt: input.at,
    }),
  }
}

/**
 * Initiative from a full queue, uncovered sector, or Saúde items.
 * @param input - Health plus per-persona open counts.
 */
export function gestorInitiative(input: {
  readonly health: HealthReport
  readonly queues: readonly { readonly personaId: string; readonly sectorId?: string; readonly open: number }[]
}): GestorInitiative[] {
  const out: GestorInitiative[] = []
  for (const queue of input.queues) {
    if (queue.open < 6) continue
    out.push({
      kind: 'queue_full',
      subjectId: queue.personaId,
      reason: `porque a fila estava com ${String(queue.open)} tarefas`,
      action: 'hire',
    })
  }
  for (const item of input.health.items) {
    if (item.kind === 'sector_without_coverage') {
      out.push({
        kind: 'sector_uncovered',
        subjectId: item.subjectId,
        reason: item.message,
        action: 'hire',
      })
    }
    else if (item.kind === 'persona_queue_full' || item.kind === 'human_overloaded') {
      out.push({
        kind: 'health',
        subjectId: item.subjectId,
        reason: item.message,
        action: item.kind === 'persona_queue_full' ? 'hire' : 'reorganize',
      })
    }
  }
  return out
}

/**
 * Audit line: "Atlas contratou Pipoca (Designer) para o projeto Site — porque…"
 * @param input - Actor name, verb, detail, reason.
 */
export function formatGestorAudit(input: {
  readonly gestorName: string
  readonly verb: string
  readonly detail: string
  readonly reason: string
}): string {
  const reason = input.reason.startsWith('porque') ? input.reason : `porque ${input.reason}`
  return `${input.gestorName} ${input.verb} ${input.detail} — ${reason}`
}
