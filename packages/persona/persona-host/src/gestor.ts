/**
 * Gestor de equipe remotes: limits, plan/approve, assemble, audit (BRIEFING 20).
 */

import {
  assembleTeamForGoal,
  claimGestorScope,
  commentGestorPlan,
  decideGestorAction,
  formatGestorAudit,
  gestorAllocate,
  gestorHire,
  gestorReorganize,
  gestorScopeKey,
  isGestor,
  resolveGestorTie,
  type CliKind,
  type GestorLimits,
  type GestorPlan,
  type PersonaSpec,
} from '@deepseek-ai/dsh-persona-core'
import { GestorRepos, type ProductRepos } from '@deepseek-ai/dsh-persona-store'
import type {
  ApproveGestorPlanRequest,
  RejectGestorPlanRequest,
  AssembleTeamRequest,
  AssembleTeamView,
  GetGestorMandateRequest,
  ListGestorAuditRequest,
  GestorAuditView,
  GestorMandateView,
  GestorPlanView,
  GestorHireSpecView,
  ProposeGestorAssembleRequest,
  ProposeGestorAssembleView,
  ProposeGestorHireRequest,
  ProposeGestorAllocateRequest,
  ProposeGestorReorganizeRequest,
  CommentGestorPlanRequest,
  ResolveGestorTieRequest,
  ListGestorPlansRequest,
  SetGestorLimitsRequest,
  SystemRoleView,
} from './types.ts'

/**
 * GES-1: Coordenação template default também Gestor de equipe.
 * @param roles - Requested roles.
 */
export function withDefaultGestor(roles: readonly SystemRoleView[]): SystemRoleView[] {
  if (!roles.includes('coordination') || roles.includes('team_manager')) return [...roles]
  return [...roles, 'team_manager']
}

function enginesOf(values: readonly string[]): GestorLimits['allowedEngines'] {
  return values.filter((item): item is 'dsh' | CliKind =>
    item === 'dsh' || item === 'claude' || item === 'codex' || item === 'cursor' || item === 'opencode')
}

function specFromView(view: GestorHireSpecView): PersonaSpec {
  return {
    name: view.name,
    avatar: { kind: 'gallery', ref: view.name.toLowerCase() },
    title: view.title,
    description: view.description,
    personality: view.personality,
    instructions: view.instructions,
    runner: (() => {
      const engine = enginesOf([view.runnerCli])[0]
      if (view.runnerKind === 'dsh' || engine === undefined || engine === 'dsh') {
        return { kind: 'dsh' as const, model: view.runnerModel }
      }
      return { kind: 'cli' as const, cli: engine, model: view.runnerModel }
    })(),
    tools: { ...view.tools },
    skills: [],
    limits: view.tokensPerMonth > 0 ? { tokensPerMonth: view.tokensPerMonth } : {},
    systemRoles: [...view.systemRoles],
    canRecruit: view.canRecruit,
  }
}

function toMandateView(personaId: string, workspaceId: string, limits: GestorLimits): GestorMandateView {
  return { personaId, workspaceId, ...limits }
}

function toPlanView(plan: GestorPlan): GestorPlanView {
  return {
    id: plan.id,
    workspaceId: plan.workspaceId,
    gestorId: plan.gestorId,
    action: plan.action,
    scopeKey: plan.scopeKey,
    summary: plan.summary,
    reason: plan.reason,
    status: plan.status,
    createdAt: plan.createdAt,
    ...(plan.commentOnId === undefined ? {} : { commentOnId: plan.commentOnId }),
  }
}

/** Host-side Gestor de equipe. */
export class GestorHost {
  /**
   * @param product - Personas.
   * @param repos - Mandate/plan store.
   * @param now - Clock.
   */
  constructor(
    readonly product: ProductRepos,
    readonly repos: GestorRepos,
    readonly now: () => string,
  ) {}

  /**
   * @param request - Persona.
   */
  getMandate(request: GetGestorMandateRequest): GestorMandateView {
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined || !isGestor(persona)) throw new Error('not-gestor')
    const limits = this.repos.mandateOrDefault(request.personaId, request.workspaceId)
    return toMandateView(request.personaId, request.workspaceId, limits)
  }

  /**
   * Owner writes the ceiling.
   * @param request - Limits.
   */
  setLimits(request: SetGestorLimitsRequest): GestorMandateView {
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined || !isGestor(persona)) throw new Error('not-gestor')
    const limits: GestorLimits = {
      approval: request.approval,
      maxPersonas: request.maxPersonas,
      budgetTokens: request.budgetTokens,
      allowedTools: [...request.allowedTools],
      allowedEngines: enginesOf(request.allowedEngines),
      sectorIds: [...request.sectorIds],
      projectIds: [...request.projectIds],
      canGrantGestor: request.canGrantGestor,
    }
    this.repos.putMandate(request.personaId, request.workspaceId, limits)
    return toMandateView(request.personaId, request.workspaceId, limits)
  }

  /**
   * Propose or auto-apply a hire. Always-ask stays pending.
   * @param request - Hire draft.
   */
  proposeHire(request: ProposeGestorHireRequest): GestorPlanView {
    const persona = this.product.getPersona(request.gestorId)
    if (persona === undefined || !isGestor(persona)) throw new Error('not-gestor')
    const limits = this.repos.mandateOrDefault(request.gestorId, request.workspaceId)
    const scope = {
      ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
      ...(request.sectorId === undefined ? {} : { sectorId: request.sectorId }),
      roleTitle: request.spec.title,
    }
    const scopeKey = gestorScopeKey(scope)
    const clash = claimGestorScope(this.repos.listOpenPlans(request.workspaceId, scopeKey), scopeKey)
    const at = this.now()
    if (clash.kind === 'conflict') {
      return this.storeComment({
        workspaceId: request.workspaceId,
        planId: clash.existingPlanId,
        commenterId: request.gestorId,
        comment: request.reason,
        commentId: request.id,
        at,
        scopeKey,
      })
    }
    const summary = formatGestorAudit({
      gestorName: persona.name,
      verb: 'contratou',
      detail: `${request.spec.name} (${request.spec.title}) para o projeto ${request.projectId ?? 'workspace'}`,
      reason: request.reason,
    })
    const plan: HireEnvelope = {
      id: request.id,
      workspaceId: request.workspaceId,
      gestorId: request.gestorId,
      action: 'hire',
      scopeKey,
      summary,
      reason: request.reason.startsWith('porque') ? request.reason : `porque ${request.reason}`,
      status: 'proposed',
      createdAt: at,
      spec: request.spec,
      ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
      ...(request.sectorId === undefined ? {} : { sectorId: request.sectorId }),
    }
    const decision = decideGestorAction({
      mandate: { personaId: request.gestorId, workspaceId: request.workspaceId, limits },
      plan,
      accepted: false,
      auditId: `aud-${request.id}`,
      at,
    })
    if (decision.kind === 'ask') {
      this.repos.putPlan(plan)
      return toPlanView(plan)
    }
    this.applyHire(plan, persona, limits, true)
    const applied = { ...plan, status: 'applied' as const }
    this.repos.putPlan(applied)
    if (decision.kind === 'apply' || decision.kind === 'notify') {
      this.repos.putAudit(decision.audit)
    }
    return toPlanView(applied)
  }

  /**
   * Human accept of a pending plan.
   * @param request - Plan id.
   */
  approvePlan(request: ApproveGestorPlanRequest): GestorPlanView {
    const plan = this.repos.getPlan(request.planId)
    if (plan === undefined || plan.workspaceId !== request.workspaceId) throw new Error('not-found')
    if (plan.status === 'applied') return toPlanView(plan)
    if (plan.status !== 'proposed') throw new Error('not-found')
    const persona = this.product.getPersona(plan.gestorId)
    if (persona === undefined) throw new Error('not-gestor')
    const limits = this.repos.mandateOrDefault(plan.gestorId, request.workspaceId)
    const at = this.now()
    const decision = decideGestorAction({
      mandate: { personaId: plan.gestorId, workspaceId: request.workspaceId, limits },
      plan,
      accepted: true,
      auditId: `aud-${plan.id}`,
      at,
    })
    this.applyEnvelope({ ...plan }, persona, limits, true)
    const applied = { ...plan, status: 'applied' as const }
    this.repos.putPlan(applied)
    if (decision.kind === 'apply' || decision.kind === 'notify') this.repos.putAudit(decision.audit)
    return toPlanView(applied)
  }

  /**
   * Second Gestor comments; the original plan stays proposed.
   * @param request - Open plan and commenter.
   */
  commentPlan(request: CommentGestorPlanRequest): GestorPlanView {
    const existing = this.repos.getPlan(request.planId)
    if (existing === undefined || existing.workspaceId !== request.workspaceId) throw new Error('not-found')
    const commenter = this.product.getPersona(request.commenterId)
    if (commenter === undefined || !isGestor(commenter)) throw new Error('not-gestor')
    return this.storeComment({
      workspaceId: request.workspaceId,
      planId: existing.id,
      commenterId: request.commenterId,
      comment: request.comment,
      commentId: `c-${request.planId}-${request.commenterId}`,
      at: this.now(),
      scopeKey: existing.scopeKey,
    })
  }

  /**
   * Human picks the winner; others on the same scope are rejected.
   * @param request - Chosen plan.
   */
  resolveTie(request: ResolveGestorTieRequest): GestorPlanView {
    const chosen = this.repos.getPlan(request.chosenId)
    if (chosen === undefined || chosen.workspaceId !== request.workspaceId) throw new Error('not-found')
    const tied = this.repos.listDisplayPlans(request.workspaceId)
      .filter(row => row.scopeKey === chosen.scopeKey)
    const result = resolveGestorTie({ plans: tied, chosenId: request.chosenId })
    this.repos.putPlan(result.winner)
    for (const row of result.rejected) this.repos.putPlan(row)
    return toPlanView(result.winner)
  }

  /**
   * Propose placing a persona. always_ask stays pending.
   * @param request - Allocation draft.
   */
  proposeAllocate(request: ProposeGestorAllocateRequest): GestorPlanView {
    const persona = this.product.getPersona(request.gestorId)
    if (persona === undefined || !isGestor(persona)) throw new Error('not-gestor')
    const limits = this.repos.mandateOrDefault(request.gestorId, request.workspaceId)
    const scope = {
      ...(request.projectIds[0] === undefined ? {} : { projectId: request.projectIds[0] }),
      ...(request.sectorId === undefined ? {} : { sectorId: request.sectorId }),
    }
    const scopeKey = gestorScopeKey(scope)
    const at = this.now()
    const clash = claimGestorScope(this.repos.listOpenPlans(request.workspaceId, scopeKey), scopeKey)
    if (clash.kind === 'conflict') {
      return this.storeComment({
        workspaceId: request.workspaceId,
        planId: clash.existingPlanId,
        commenterId: request.gestorId,
        comment: request.reason,
        commentId: request.id,
        at,
        scopeKey,
      })
    }
    const plan: AllocateEnvelope = {
      id: request.id,
      workspaceId: request.workspaceId,
      gestorId: request.gestorId,
      action: 'allocate',
      scopeKey,
      summary: `Alocar ${request.personaId} em ${request.projectIds.join(', ')}`,
      reason: request.reason.startsWith('porque') ? request.reason : `porque ${request.reason}`,
      status: 'proposed',
      createdAt: at,
      personaId: request.personaId,
      projectIds: [...request.projectIds],
      ...(request.sectorId === undefined ? {} : { sectorId: request.sectorId }),
    }
    const decision = decideGestorAction({
      mandate: { personaId: request.gestorId, workspaceId: request.workspaceId, limits },
      plan,
      accepted: false,
      auditId: `aud-${request.id}`,
      at,
    })
    if (decision.kind === 'ask') {
      this.repos.putPlan(plan)
      return toPlanView(plan)
    }
    this.applyEnvelope(plan, persona, limits, true)
    const applied = { ...plan, status: 'applied' as const }
    this.repos.putPlan(applied)
    if (decision.kind === 'apply' || decision.kind === 'notify') this.repos.putAudit(decision.audit)
    return toPlanView(applied)
  }

  /**
   * Propose a reorganize. always_ask stays pending.
   * @param request - Reorganize draft.
   */
  proposeReorganize(request: ProposeGestorReorganizeRequest): GestorPlanView {
    const persona = this.product.getPersona(request.gestorId)
    if (persona === undefined || !isGestor(persona)) throw new Error('not-gestor')
    const limits = this.repos.mandateOrDefault(request.gestorId, request.workspaceId)
    const scope = { ...(request.projectId === undefined ? {} : { projectId: request.projectId }) }
    const scopeKey = gestorScopeKey(scope)
    const at = this.now()
    const clash = claimGestorScope(this.repos.listOpenPlans(request.workspaceId, scopeKey), scopeKey)
    if (clash.kind === 'conflict') {
      return this.storeComment({
        workspaceId: request.workspaceId,
        planId: clash.existingPlanId,
        commenterId: request.gestorId,
        comment: request.reason,
        commentId: request.id,
        at,
        scopeKey,
      })
    }
    const plan: ReorganizeEnvelope = {
      id: request.id,
      workspaceId: request.workspaceId,
      gestorId: request.gestorId,
      action: 'reorganize',
      scopeKey,
      summary: `${request.kind} ${request.targetPersonaId}`,
      reason: request.reason.startsWith('porque') ? request.reason : `porque ${request.reason}`,
      status: 'proposed',
      createdAt: at,
      kind: request.kind,
      targetPersonaId: request.targetPersonaId,
      notice: request.notice,
      ticketIds: request.ticketIds === undefined ? [] : [...request.ticketIds],
      ...(request.nextAutonomy === undefined ? {} : { nextAutonomy: request.nextAutonomy }),
      ...(request.projectId === undefined ? {} : { projectId: request.projectId }),
    }
    const decision = decideGestorAction({
      mandate: { personaId: request.gestorId, workspaceId: request.workspaceId, limits },
      plan,
      accepted: false,
      auditId: `aud-${request.id}`,
      at,
    })
    if (decision.kind === 'ask') {
      this.repos.putPlan(plan)
      return toPlanView(plan)
    }
    this.applyEnvelope(plan, persona, limits, true)
    const applied = { ...plan, status: 'applied' as const }
    this.repos.putPlan(applied)
    if (decision.kind === 'apply' || decision.kind === 'notify') this.repos.putAudit(decision.audit)
    return toPlanView(applied)
  }

  /**
   * Human decline of a pending plan.
   * @param request - Plan id.
   */
  rejectPlan(request: RejectGestorPlanRequest): GestorPlanView {
    const plan = this.repos.getPlan(request.planId)
    if (plan === undefined || plan.workspaceId !== request.workspaceId) throw new Error('not-found')
    if (plan.status === 'rejected') return toPlanView(plan)
    if (plan.status !== 'proposed') throw new Error('not-found')
    const rejected = { ...plan, status: 'rejected' as const }
    this.repos.putPlan(rejected)
    return toPlanView(rejected)
  }

  /**
   * Goal sentence → pending assemble plan + structure preview (chat card).
   * @param request - Gestor + goal.
   */
  proposeAssemble(request: ProposeGestorAssembleRequest): ProposeGestorAssembleView {
    const persona = this.product.getPersona(request.gestorId)
    if (persona === undefined || !isGestor(persona)) throw new Error('not-gestor')
    const limits = this.repos.mandateOrDefault(request.gestorId, request.workspaceId)
    const at = this.now()
    const sprintId = `sprint-${request.id}`
    const preview = assembleTeamForGoal({
      goal: request.goal,
      projectId: request.projectId,
      sprintId,
      at,
    })
    const scopeKey = gestorScopeKey({ projectId: request.projectId })
    const titles = preview.structure.personas.map(row => row.title).join(', ')
    const summary = `Vou contratar ${preview.structure.personas.length} personas (${titles}) e montar o fluxo ${preview.workflow.template}.`
    const plan: GestorPlan = {
      id: request.id,
      workspaceId: request.workspaceId,
      gestorId: request.gestorId,
      action: 'assemble',
      scopeKey,
      summary,
      reason: preview.structure.explanation.length > 0
        ? preview.structure.explanation
        : `porque você pediu: ${request.goal.trim()}`,
      status: 'proposed',
      createdAt: at,
    }
    const decision = decideGestorAction({
      mandate: { personaId: request.gestorId, workspaceId: request.workspaceId, limits },
      plan,
      accepted: false,
      auditId: `aud-${request.id}`,
      at,
    })
    if (decision.kind === 'ask') {
      this.repos.putPlan(plan)
    } else {
      const applied = { ...plan, status: 'applied' as const }
      this.repos.putPlan(applied)
      if (decision.kind === 'notify') this.repos.putAudit(decision.audit)
    }
    return {
      plan: toPlanView(decision.kind === 'ask' ? plan : { ...plan, status: 'applied' }),
      preview: {
        company: preview.structure.company,
        explanation: preview.structure.explanation,
        personaTitles: preview.structure.personas.map(row => row.title),
        workflowId: preview.workflow.template,
        sprintName: preview.sprint.name,
      },
    }
  }

  /**
   * @param request - Workspace.
   */
  listPlans(request: ListGestorPlansRequest): GestorPlanView[] {
    return this.repos.listDisplayPlans(request.workspaceId).map(toPlanView)
  }

  /**
   * @param request - Goal sentence.
   */
  assemble(request: AssembleTeamRequest): AssembleTeamView {
    const pack = assembleTeamForGoal({
      goal: request.goal,
      projectId: request.projectId,
      sprintId: request.sprintId,
      at: this.now(),
    })
    return {
      company: pack.structure.company,
      explanation: pack.structure.explanation,
      personaTitles: pack.structure.personas.map(row => row.title),
      workflowId: pack.workflow.template,
      sprintName: pack.sprint.name,
    }
  }

  /**
   * @param request - Workspace.
   */
  listAudit(request: ListGestorAuditRequest): GestorAuditView[] {
    return this.repos.listAudit(request.workspaceId).map(row => ({
      id: row.id,
      gestorId: row.gestorId,
      action: row.action,
      summary: row.summary,
      reason: row.reason,
      at: row.at,
    }))
  }

  private storeComment(input: {
    readonly workspaceId: string
    readonly planId: string
    readonly commenterId: string
    readonly comment: string
    readonly commentId: string
    readonly at: string
    readonly scopeKey: string
  }): GestorPlanView {
    const result = commentGestorPlan({
      open: this.repos.listOpenPlans(input.workspaceId, input.scopeKey),
      scopeKey: input.scopeKey,
      commenterId: input.commenterId,
      workspaceId: input.workspaceId,
      commentId: input.commentId,
      comment: input.comment,
      at: input.at,
    })
    if (result.kind === 'claim') throw new Error('not-found')
    this.repos.putPlan(result.plan)
    return toPlanView(result.plan)
  }

  private applyEnvelope(
    plan: GestorPlan,
    persona: Parameters<typeof gestorHire>[0]['gestor'],
    limits: GestorLimits,
    accepted: boolean,
  ): void {
    if (plan.action === 'hire') this.applyHire(plan, persona, limits, accepted)
    if (plan.action === 'allocate') this.applyAllocate(plan, persona, limits)
    if (plan.action === 'reorganize') this.applyReorganize(plan, persona, limits)
  }

  private applyAllocate(
    plan: GestorPlan,
    persona: Parameters<typeof gestorHire>[0]['gestor'],
    limits: GestorLimits,
  ): void {
    const envelope = plan as AllocateEnvelope
    if (envelope.personaId === undefined || envelope.projectIds === undefined) return
    const allocation = gestorAllocate({
      gestor: persona,
      limits,
      scope: {
        ...(envelope.projectIds[0] === undefined ? {} : { projectId: envelope.projectIds[0] }),
        ...(envelope.sectorId === undefined ? {} : { sectorId: envelope.sectorId }),
      },
      personaId: envelope.personaId,
      projectIds: envelope.projectIds,
    })
    for (const projectId of allocation.projectIds) {
      this.product.addParticipation({
        personaId: allocation.personaId,
        projectId,
        kind: 'project',
        targetId: projectId,
      })
    }
  }

  private applyReorganize(
    plan: GestorPlan,
    persona: Parameters<typeof gestorHire>[0]['gestor'],
    limits: GestorLimits,
  ): void {
    const envelope = plan as ReorganizeEnvelope
    if (envelope.targetPersonaId === undefined || envelope.kind === undefined) return
    gestorReorganize({
      gestor: persona,
      limits,
      scope: { ...(envelope.projectId === undefined ? {} : { projectId: envelope.projectId }) },
      kind: envelope.kind,
      targetPersonaId: envelope.targetPersonaId,
      notice: envelope.notice ?? '',
      ...(envelope.ticketIds === undefined ? {} : { ticketIds: envelope.ticketIds }),
      ...(envelope.nextAutonomy === undefined ? {} : { nextAutonomy: envelope.nextAutonomy }),
    })
  }

  private applyHire(
    plan: HireEnvelope,
    persona: Parameters<typeof gestorHire>[0]['gestor'],
    limits: GestorLimits,
    accepted: boolean,
  ): void {
    if (plan.spec === undefined) return
    const hireId = `hire-${plan.id}`
    if (this.product.getPersona(hireId) !== undefined) return
    const projectId = plan.projectId ?? this.product.listProjects(plan.workspaceId)[0]?.id
    if (projectId === undefined) throw new Error('project-not-found')
    const roster = this.product.listProjects(plan.workspaceId)
      .flatMap(project => this.product.listPersonas(project.id))
    const spec = specFromView(plan.spec)
    gestorHire({
      id: hireId,
      gestor: persona,
      limits,
      spec,
      rosterCount: roster.length,
      spentTokens: roster.reduce((sum, row) => sum + (row.limits.tokensPerMonth ?? 0), 0),
      scope: {
        ...(plan.projectId === undefined ? {} : { projectId: plan.projectId }),
        ...(plan.sectorId === undefined ? {} : { sectorId: plan.sectorId }),
        roleTitle: plan.spec.title,
      },
      createdAt: this.now(),
      accepted,
    })
    const at = this.now()
    this.product.createPersona({
      id: hireId,
      workspaceId: plan.workspaceId,
      name: spec.name,
      title: spec.title,
      description: spec.description,
      personality: spec.personality,
      instructions: spec.instructions,
      avatar: spec.avatar,
      runner: spec.runner,
      tools: spec.tools,
      skills: spec.skills,
      limits: spec.limits,
      systemRoles: spec.systemRoles,
      canRecruit: spec.canRecruit,
      createdAt: at,
      updatedAt: at,
      createdBy: persona.id,
    }, projectId)
  }
}

interface HireEnvelope extends GestorPlan {
  readonly spec?: GestorHireSpecView
  readonly projectId?: string
  readonly sectorId?: string
}

interface AllocateEnvelope extends GestorPlan {
  readonly personaId?: string
  readonly projectIds?: readonly string[]
  readonly sectorId?: string
}

interface ReorganizeEnvelope extends GestorPlan {
  readonly kind?: 'move_work' | 'pause_idle' | 'set_autonomy'
  readonly targetPersonaId?: string
  readonly notice?: string
  readonly ticketIds?: readonly string[]
  readonly nextAutonomy?: 'on_request' | 'propose' | 'act'
  readonly projectId?: string
}
