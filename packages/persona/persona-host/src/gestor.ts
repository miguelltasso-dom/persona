/**
 * Gestor de equipe remotes: limits, plan/approve, assemble, audit (BRIEFING 20).
 */

import {
  assembleTeamForGoal,
  assertGestorAssemblyHires,
  claimGestorScope,
  commentGestorPlan,
  decideGestorAction,
  formatGestorAudit,
  gestorAllocate,
  gestorHire,
  gestorReorganize,
  gestorScopeKey,
  isGestor,
  parsePersonaSpec,
  resolveGestorTie,
  type CliKind,
  type GestorLimits,
  type GestorPlan,
  type GestorAssemble,
  type PersonaSpec,
} from '@deepseek-ai/dsh-persona-core'
import { z } from 'zod'
import { gestorHireTools } from './file-tools.ts'
import { GestorRepos, type ProductRepos, type StoredPersona } from '@deepseek-ai/dsh-persona-store'
import type { BoardsHost } from './boards.ts'
import { campaignTeamOf, CAMPAIGN_FUNCTIONS } from './campaign-team.ts'
import { routeByFunction, type RoutablePersona } from './function-route.ts'
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

function functionKey(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
}

function assemblyView(preview: GestorAssemble): AssembleTeamView {
  return { company: preview.structure.company, explanation: preview.structure.explanation,
    personaTitles: preview.structure.personas.map(row => row.title), workflowId: preview.workflow.template,
    sprintName: preview.sprint.name, hire: preview.hire.map(row => ({ function: row.title })), reuse: preview.reuse }
}

/** Host-side Gestor de equipe. */
export class GestorHost {
  /**
   * @param product - Personas.
   * @param repos - Mandate/plan store.
   * @param now - Clock.
   * @param boards - Workflow and sprint writes using the same SQLite transaction.
   * @param initializePersona - Responsibility, sector and routine ownership for a persisted hire.
   */
  constructor(
    readonly product: ProductRepos,
    readonly repos: GestorRepos,
    readonly now: () => string,
    readonly boards: BoardsHost,
    readonly initializePersona: (persona: StoredPersona, sectorName?: string) => void,
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
    const view = this.repos.store.tx(() => {
      this.applyEnvelope(plan, persona, limits, true)
      const applied = { ...plan, status: 'applied' as const }
      this.repos.putPlan(applied)
      if (decision.kind === 'apply' || decision.kind === 'notify') this.repos.putAudit(decision.audit)
      return toPlanView(applied)
    })
    this.startCampaignOf(plan)
    return view
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
    if (this.repos.getPlan(request.id) !== undefined) throw new Error('conflict')
    const limits = this.repos.mandateOrDefault(request.gestorId, request.workspaceId)
    const at = this.now()
    const sprintId = `sprint-${request.id}`
    const project = this.product.getProject(request.projectId)
    if (project?.workspaceId !== request.workspaceId || persona.workspaceId !== request.workspaceId) {
      throw new Error('project-not-found')
    }
    const generic = assembleTeamForGoal({
      goal: request.goal,
      projectId: request.projectId,
      sprintId,
      at,
      existingFunctions: this.product.listPersonas(request.projectId)
        .map(row => ({ personaId: row.id, function: row.title })),
    })
    // A CAMPAIGN that did not list its functions still needs text, art and posts (EQ-8/EQ-9): reuse who already does each one and hire only
    // what nobody does, instead of the generic structure (Atendimento, Financeiro, Pessoas) and no Task at all.
    const campaignTeam = campaignTeamOf(request.goal, this.product.listPersonas(request.projectId).map(row => ({
      id: row.id, name: row.name, title: row.title, description: row.description, coordination: row.systemRoles.includes('coordination'), paused: false,
    })))
    const preview: GestorAssemble = campaignTeam === undefined ? generic : {
      ...generic,
      hire: campaignTeam.hire,
      reuse: campaignTeam.reuse,
      structure: {
        ...generic.structure,
        personas: [...campaignTeam.reuse.map(row => ({ id: row.personaId, title: row.function, sectorName: 'Marketing', continuous: true as const })), ...campaignTeam.hire],
        explanation: `porque uma campanha precisa de ${CAMPAIGN_FUNCTIONS.map(need => need.title).join(', ')}: aproveito quem já faz cada uma e contrato só o que falta`,
      },
    }
    const scopeKey = gestorScopeKey({ projectId: request.projectId })
    const clash = claimGestorScope(this.repos.listOpenPlans(request.workspaceId, scopeKey), scopeKey)
    if (clash.kind === 'conflict') {
      const plan = this.storeComment({ workspaceId: request.workspaceId, planId: clash.existingPlanId,
        commenterId: request.gestorId, comment: request.goal, commentId: request.id, at, scopeKey })
      return { plan, preview: assemblyView(preview) }
    }
    const titles = preview.hire.map(row => row.title).join(', ')
    const campaign = this.campaignStepsOf(request.id, request.projectId, request.goal, preview, campaignTeam?.request)
    const reused = preview.reuse.map(row => this.product.getPersona(row.personaId)?.name ?? row.function)
    const summary = reused.length === 0
      ? `Vou contratar ${preview.hire.length} personas (${titles}) e montar o fluxo ${preview.workflow.template}.`
      : `Vou aproveitar ${reused.join(', ')}${preview.hire.length === 0 ? '' : ` e contratar ${preview.hire.length} (${titles})`} e montar o fluxo ${preview.workflow.template}.`
    const plan = {
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
      assembly: {
        projectId: request.projectId,
        hires: preview.hire.map(row => ({
          id: `hire-${request.id}-${row.id}`,
          sectorName: row.sectorName,
          spec: {
            name: row.title, title: row.title,
            avatar: { kind: 'gallery' as const, ref: row.id },
            // The FUNCTION only: the routing by function reads the description, and an objective in it would send every request that shares
            // a word with the objective to this persona. The objective stays where the persona reads it: her instructions.
            description: row.title,
            personality: persona.personality,
            instructions: `Cuide da função ${row.title} no projeto: ${request.goal.trim()}`,
            runner: persona.runner, tools: gestorHireTools(persona.tools, limits.allowedTools), skills: [], limits: {}, systemRoles: [], canRecruit: false,
          } satisfies PersonaSpec,
        })),
        reuse: preview.reuse.map(row => ({ ...row })),
        template: preview.workflow.template,
        sprint: { id: sprintId, name: preview.sprint.name, objective: request.goal, startsAt: at },
        ...(campaign.length === 0 ? {} : { campaign: { goal: request.goal, steps: campaign } }),
      },
    } satisfies GestorPlan & { assembly: z.input<typeof assemblySchema> }
    const decision = decideGestorAction({
      mandate: { personaId: request.gestorId, workspaceId: request.workspaceId, limits },
      plan,
      accepted: false,
      auditId: `aud-${request.id}`,
      at,
    })
    if (decision.kind === 'ask') {
      const existing = this.repos.getPlan(plan.id)
      if (existing !== undefined) throw new Error('conflict')
      this.repos.putPlan(plan)
    } else {
      this.repos.store.tx(() => {
        if (this.repos.getPlan(plan.id) !== undefined) throw new Error('conflict')
        this.applyAssembly(plan, persona, limits)
        const applied = { ...plan, status: 'applied' as const }
        this.repos.putPlan(applied)
        if (decision.kind === 'apply' || decision.kind === 'notify') this.repos.putAudit(decision.audit)
      })
      this.startCampaignOf(plan)
    }
    return {
      plan: toPlanView(decision.kind === 'ask' ? plan : { ...plan, status: 'applied' }),
      preview: assemblyView(preview),
    }
  }

  /**
   * TEAM-12: the host starts the campaign of an approved plan (set by the host; unset = the team behavior is off). Called AFTER the plan
   * was applied, outside its transaction: opening Tasks must not be part of hiring people.
   */
  campaignStarter: ((input: { readonly projectId: string; readonly planId: string; readonly gestorId: string; readonly goal: string; readonly steps: readonly { readonly personaId: string; readonly label: string }[] }) => void) | undefined = undefined

  /** The parts of the goal, in order, each for the persona of its function (the team that will exist once the plan is applied). */
  private campaignStepsOf(requestId: string, projectId: string, goal: string, preview: GestorAssemble, asked?: string): { personaId: string; label: string }[] {
    const existing: RoutablePersona[] = this.product.listPersonas(projectId).map(row => ({
      id: row.id, name: row.name, title: row.title, description: row.description, coordination: row.systemRoles.includes('coordination'), paused: false,
    }))
    const hired: RoutablePersona[] = preview.hire.map(row => ({
      // The function only: the goal is NOT part of the description here, or every word of it would route the whole goal to this persona.
      id: `hire-${requestId}-${row.id}`, name: row.title, title: row.title, description: row.title, coordination: false, paused: false,
    }))
    // A campaign that did not list its functions is read as the functions its team was built for ("texto, arte, posts").
    const route = routeByFunction([...existing, ...hired], asked ?? goal)
    if (route === undefined) return []
    const parts = route.kind === 'split' ? route.parts : [route.part]
    return parts.map(part => ({ personaId: part.persona.id, label: part.cues.join(', ') })).filter(step => step.label !== '')
  }

  /** Start the campaign of a plan that was just applied. Never fails the plan: the team was hired either way. */
  private startCampaignOf(plan: GestorPlan): void {
    const parsed = z.object({ assembly: assemblySchema }).safeParse(plan)
    const campaign = parsed.success ? parsed.data.assembly.campaign : undefined
    if (!parsed.success || campaign === undefined || campaign.steps.length === 0) return
    try {
      this.campaignStarter?.({ projectId: parsed.data.assembly.projectId, planId: plan.id, gestorId: plan.gestorId, goal: campaign.goal, steps: campaign.steps })
    } catch (error: unknown) {
      process.stderr.write(`[persona-host] campaign not started (${plan.id}): ${error instanceof Error ? error.name : 'Error'}\n`)
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
    if (plan.action === 'assemble') this.applyAssembly(plan, persona, limits)
  }

  private applyAssembly(plan: GestorPlan, persona: Parameters<typeof gestorHire>[0]['gestor'], limits: GestorLimits): void {
    const { assembly } = z.object({ assembly: assemblySchema }).parse(plan)
    const project = this.product.getProject(assembly.projectId)
    if (project?.workspaceId !== plan.workspaceId || persona.workspaceId !== plan.workspaceId) throw new Error('forbidden')
    const roster = this.product.listProjects(plan.workspaceId).flatMap(row => this.product.listPersonas(row.id))
    const hires = assembly.hires.map(row => ({ ...row, spec: parsePersonaSpec(row.spec) }))
    const specs = hires.map(row => row.spec)
    const currentFunctions = new Set(this.product.listPersonas(project.id).map(row => functionKey(row.title)))
    if (hires.some(row => currentFunctions.has(functionKey(row.spec.title)))) throw new Error('assembly-changed')
    assertGestorAssemblyHires({ gestor: persona, limits, specs,
      rosterCount: roster.length,
      spentTokens: roster.reduce((sum, row) => sum + (row.limits.tokensPerMonth ?? 0), 0),
      scope: { projectId: project.id },
    })
    for (const reuse of assembly.reuse) {
      const target = this.product.getPersona(reuse.personaId)
      if (target?.workspaceId !== plan.workspaceId || target.projectId !== project.id
        || functionKey(target.title) !== functionKey(reuse.function)) {
        throw new Error('assembly-changed')
      }
      gestorAllocate({ gestor: persona, limits, scope: { projectId: project.id },
        personaId: target.id, projectIds: [project.id] })
    }
    for (const hire of hires) {
      if (this.product.getPersona(hire.id) !== undefined) throw new Error('conflict')
      const created = this.product.createPersona({ ...hire.spec, id: hire.id, workspaceId: plan.workspaceId,
        createdAt: this.now(), updatedAt: this.now(), createdBy: persona.id }, project.id)
      this.initializePersona(created, hire.sectorName)
    }
    for (const reuse of assembly.reuse) {
      this.product.addParticipation({ personaId: reuse.personaId, projectId: project.id, kind: 'project', targetId: project.id })
    }
    this.boards.createWorkflowFromTemplate({ workspaceId: plan.workspaceId, projectId: project.id, template: assembly.template })
    this.boards.createSprint({ workspaceId: plan.workspaceId, projectId: project.id, ...assembly.sprint })
    this.boards.planSprint({ workspaceId: plan.workspaceId, projectId: project.id, sprintId: assembly.sprint.id, ticketIds: [] })
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
    const created = this.product.createPersona({
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
    this.initializePersona(created)
  }
}

const assemblySchema = z.object({
  projectId: z.string().min(1),
  hires: z.array(z.object({ id: z.string().min(1), sectorName: z.string().optional(), spec: z.unknown() })),
  reuse: z.array(z.object({ personaId: z.string().min(1), function: z.string().min(1) })),
  template: z.enum(['contratacao', 'site', 'software', 'marketing', 'atendimento', 'simples', 'em_branco']),
  sprint: z.object({ id: z.string().min(1), name: z.string().min(1), objective: z.string(), startsAt: z.string() }),
  // TEAM-12: the parts of the campaign, in order, each for the persona of its function; each delivery opens the next.
  campaign: z.object({ goal: z.string(), steps: z.array(z.object({ personaId: z.string().min(1), label: z.string().min(1) })) }).optional(),
})

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
