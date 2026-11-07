/**
 * Workspace snapshot and Muse/Lumen views for GOV-5 remotes.
 */

import { createHash, randomUUID } from 'node:crypto'
import { z } from 'zod'
import { ScreenRepos, type StoredPersona } from '@deepseek-ai/dsh-persona-store'
import { routeApproval } from '@deepseek-ai/dsh-persona-engine'
import {
  applyGovernanceFix,
  assessTeamHealth,
  assignPersonaCharge,
  defaultSectorPolicy,
  humanPresence,
  orgChart,
  recommendStructure,
  runTwoDayTest,
  type CompanyKind,
  type GovernanceAutonomy,
  type GovernanceFix,
  type GovernancePersona,
  type GovernanceSnapshot,
  type HealthItem,
  type HealthReport,
  type OrgChart,
  type PersonaCharge,
  type RoutineCharge,
  type Sector,
  type SectorPolicy,
  type StructureRecommendation,
  type TwoDayResult,
} from '@deepseek-ai/dsh-persona-core'
import type {
  ProductRepos,
  RoutineRepos,
  SqliteCardRepos,
  SqliteGovernanceRepos,
  StoredRoutineCharge,
  StoredSector,
} from '@deepseek-ai/dsh-persona-store'
import { MORNING_ROUTINE_PREFIX } from './morning-brief-host.ts'
import type { ProactivityHost } from './proactivity.ts'
import { INITIATIVE_ROUTINE_PREFIX } from './routine-remotes.ts'
import type {
  ApprovalView,
  ApplyGovernanceFixRequest,
  GetOrgChartRequest,
  GovernanceAuditView,
  HealthFindingView,
  HealthLevelView,
  OrgChartGroupBy,
  OrgChartView,
  OrgPersonaStateView,
  OrgPersonaView,
  RecommendStructureRequest,
  SetAvailabilityRequest,
  SetPersonaGovernanceRequest,
  StructureRecommendationView,
  TeamHealthView,
  TwoDayOutcomeView,
  TwoDayTestView,
} from './types.ts'

/** The team's own routines (the morning card, a persona's initiative): not the person's to own, not a failure to count. */
export function isSystemRoutine(routineId: string): boolean {
  return routineId.startsWith(MORNING_ROUTINE_PREFIX) || routineId.startsWith(INITIATIVE_ROUTINE_PREFIX)
}

const COMPANY_WIRE: Readonly<Record<string, CompanyKind>> = {
  agency: 'agencia',
  agencia: 'agencia',
  ecommerce: 'loja_online',
  loja_online: 'loja_online',
  saas: 'saas',
  consulting: 'consultoria',
  consultoria: 'consultoria',
  creator: 'criador',
  criador: 'criador',
  office: 'escritorio',
  escritorio: 'escritorio',
}

function functionKey(value: string): string {
  return value.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
}

/**
 * Assemble a live snapshot and map core governance to the Lumen wire.
 */
export class GovernanceHost {
  private readonly functionPlans: ScreenRepos
  /** CV-6: the organogram changed for the projects of these personas (a persona joined, left a team, changed sector or role). The host reconciles the team channels. */
  onOrganogramChange: ((projectId: string) => void) | undefined = undefined
  /**
   * @param product - Members and personas.
   * @param cards - Charge rows.
   * @param gov - Sectors / away / routine owners / audit.
   * @param routines - Recurring jobs.
   * @param proactivity - Queue and idle.
   * @param now - Clock.
   */
  constructor(
    readonly product: ProductRepos,
    readonly cards: SqliteCardRepos,
    readonly gov: SqliteGovernanceRepos,
    readonly routines: RoutineRepos,
    readonly proactivity: ProactivityHost,
    readonly now: () => string,
  ) {
    this.functionPlans = new ScreenRepos(gov.store)
  }

  /**
   * Initialize a hired persona and its initiative with a real human responsible for both.
   * Existing human choices win over recommendation defaults.
   * @param persona - Persona already persisted in this store transaction.
   * @param sectorName - Approved assembly function's sector; omitted uses the structure recommendation.
   */
  registerPersona(persona: StoredPersona, sectorName?: string): void {
    const humans = this.product.listMembers(persona.workspaceId).filter(row => row.role !== 'guest')
    const current = this.cards.getCharge(persona.id)
    const creatorCharge = this.cards.getCharge(persona.createdBy)
    const humanId = [current?.responsibleHumanId, persona.createdBy, creatorCharge?.responsibleHumanId,
      humans.find(row => row.role === 'owner')?.id].find(id => humans.some(row => row.id === id)) ?? ''
    const project = this.product.listProjects(persona.workspaceId).find(row => row.kind === 'personal')
    const raw = project === undefined ? undefined : this.functionPlans.get<unknown>(project.id, 'governance_function', functionKey(persona.title))
    const plan = raw === undefined ? undefined : z.object({ sectorId: z.string() }).parse(raw)
    let sectorId = current?.sectorId ?? plan?.sectorId
    if (sectorId === undefined && sectorName !== undefined && sectorName.trim() !== '') {
      const existing = this.gov.listSectors(persona.workspaceId).find(row => functionKey(row.name) === functionKey(sectorName))
      sectorId = existing?.id ?? `sector-${createHash('sha256').update(`${persona.workspaceId}:${functionKey(sectorName)}`).digest('hex').slice(0, 24)}`
      if (existing === undefined) this.gov.putSector({ id: sectorId, workspaceId: persona.workspaceId,
        name: sectorName.trim(), policyJson: JSON.stringify(defaultSectorPolicy()) })
    }
    this.cards.putCharge({ personaId: persona.id, responsibleHumanId: humanId,
      confirmed: humanId !== '' && (current?.confirmed ?? true),
      ...(current?.substituteHumanId === undefined ? {} : { substituteHumanId: current.substituteHumanId }),
      ...(sectorId === undefined ? {} : { sectorId }),
    })
    this.onOrganogramChange?.(persona.projectId)
    this.proactivity.ensureInitiativeRoutine(persona)
    this.gov.putRoutineCharge({ routineId: `initiative:${persona.id}`, workspaceId: persona.workspaceId,
      title: `Iniciativa de ${persona.name}`, executorPersonaId: persona.id,
      ...(humanId === '' ? {} : { responsibleHumanId: humanId }),
      ...(sectorId === undefined ? {} : { sectorId }), requiresApproval: false })
  }

  /**
   * In-memory picture for core helpers.
   * @param workspaceId - Workspace.
   */
  snapshot(workspaceId: string): GovernanceSnapshot {
    const owner = this.product.listMembers(workspaceId).find(row => row.role === 'owner')
    const humans = this.product.listMembers(workspaceId)
      .filter(row => row.role !== 'guest')
      .map(row => ({ id: row.id, name: row.displayName }))
    const personas: GovernancePersona[] = []
    const queueByPersona: Record<string, number> = {}
    const idleSince: Record<string, string> = {}
    for (const project of this.product.listProjects(workspaceId)) {
      const now = this.proactivity.overviewNow(project.id)
      for (const persona of this.product.listPersonas(project.id)) {
        const live = now.personas.find(row => row.personaId === persona.id)
        personas.push({
          id: persona.id,
          title: persona.title,
          systemRoles: persona.systemRoles,
          ...(live === undefined ? {} : { live: liveState(live.state) }),
        })
        if (live !== undefined) {
          queueByPersona[persona.id] = live.queueCount
          if (live.state === 'resting') idleSince[persona.id] = persona.updatedAt
        }
      }
    }
    const charges = this.chargesOf(workspaceId, personas, owner?.id ?? '')
    const sectors = this.gov.listSectors(workspaceId).map(sectorFromStored)
    const away = this.gov.listAway(workspaceId).map(row => ({
      humanId: row.humanId, kind: row.kind, from: row.from, until: row.until,
    }))
    const charged = new Set(this.gov.listRoutineCharges(workspaceId).map(row => row.routineId))
    const overlay = this.gov.listRoutineCharges(workspaceId).map(routineFromStored)
    const loose: RoutineCharge[] = []
    for (const project of this.product.listProjects(workspaceId)) {
      for (const routine of this.routines.list(project.id)) {
        // A routine of the SYSTEM (the morning card, a persona's initiative) is the team's own: it never becomes a Task or a line the person could own, so
        // "no executions" is not a failure and "no owner" is not a gap. The Saúde does not list it and it does not lower the score (Muse, Keel 05:53).
        if (charged.has(routine.id) || isSystemRoutine(routine.id)) continue
        loose.push({ routineId: routine.id, title: routine.name, requiresApproval: false })
      }
    }
    return {
      workspaceId,
      humans,
      personas,
      sectors,
      charges,
      away,
      routines: [...overlay, ...loose],
      queueByPersona,
      idleSince,
    }
  }

  /**
   * Resolve a pending card against current availability and the responsible person's substitute.
   * @param workspaceId - Workspace owning the approval.
   * @param card - Proposal or ticket attention card.
   * @returns Card with its current recipient or explicit waiting notice.
   */
  approval(workspaceId: string, card: ApprovalView): ApprovalView {
    if (card.status !== 'pending') return card
    const delivery = routeApproval({ snapshot: this.snapshot(workspaceId), personaId: card.personaId,
      at: this.now(), required: true, ticketId: card.id })
    if (delivery.route.kind === 'wait') return { ...card, waitNotice: delivery.route.notice }
    if (delivery.route.kind === 'coordination') return { ...card, routedToId: delivery.route.personaId }
    return { ...card, routedToId: delivery.route.humanId,
      ...(delivery.route.onBehalfOf === undefined ? {} : {
        onBehalfOfId: delivery.route.onBehalfOf, onBehalfOf: delivery.route.onBehalfOf,
      }) }
  }

  /**
   * @param request - Grouping.
   */
  orgChartView(request: GetOrgChartRequest): OrgChartView {
    const snap = this.snapshot(request.workspaceId)
    return orgViewOf(
      request.workspaceId, request.groupBy, orgChart(snap, request.groupBy), snap, this.now(), this.personaNames(request.workspaceId),
    )
  }

  /**
   * @param workspaceId - Workspace.
   */
  healthView(workspaceId: string): TeamHealthView {
    const snap = this.snapshot(workspaceId)
    return healthViewOf(workspaceId, assessTeamHealth(snap, this.now()))
  }

  /**
   * @param workspaceId - Workspace.
   */
  twoDayView(workspaceId: string): TwoDayTestView {
    const snap = this.snapshot(workspaceId)
    const delegated = new Set(this.gov.listDelegates(workspaceId))
    return twoDayViewOf(workspaceId, runTwoDayTest(snap, this.now(), delegated))
  }

  /**
   * @param request - Company ask.
   */
  recommend(request: RecommendStructureRequest): StructureRecommendationView {
    const owner = this.product.listMembers(request.workspaceId).find(row => row.role === 'owner')
    const rec = recommendStructure({
      company: companyOf(request.company),
      sectorNames: request.sectorNames,
      recurring: request.recurring,
      ...(owner === undefined ? {} : { ownerHumanId: owner.id }),
    })
    return structureViewOf(request.workspaceId, rec, this.personaNames(request.workspaceId))
  }

  /**
   * Persist sectors and routine owners from the recommendation. Does not hire personas.
   * @param request - Same ask as recommend.
   * @param actorId - Auditor.
   */
  applyStructure(request: RecommendStructureRequest, actorId: string): StructureRecommendationView {
    const rec = this.recommend(request)
    const ownerId = this.product.listMembers(request.workspaceId).find(row => row.role === 'owner')?.id
    const raw = recommendStructure({
      company: companyOf(request.company),
      sectorNames: request.sectorNames,
      recurring: request.recurring,
      ...(ownerId === undefined ? {} : { ownerHumanId: ownerId }),
    })
    for (const sector of raw.preview.sectors) {
      this.gov.putSector({
        id: sector.id,
        workspaceId: request.workspaceId,
        name: sector.name,
        policyJson: JSON.stringify(sector.policy),
      })
    }
    const project = this.product.listProjects(request.workspaceId).find(row => row.kind === 'personal')
    const roster = this.product.listProjects(request.workspaceId).flatMap(row => this.product.listPersonas(row.id))
    const actualIds = new Map<string, string>()
    for (const recommended of raw.personas) {
      const charge = raw.preview.charges.find(row => row.personaId === recommended.id)
      if (project !== undefined && charge?.sectorId !== undefined) {
        this.functionPlans.put(project.id, 'governance_function', functionKey(recommended.title), { sectorId: charge.sectorId })
      }
      const actual = roster.find(row => functionKey(row.title) === functionKey(recommended.title))
      if (actual !== undefined) actualIds.set(recommended.id, actual.id)
    }
    for (const persona of roster) this.registerPersona(persona)
    for (const routine of raw.preview.routines) {
      const executorId = routine.executorPersonaId === undefined ? undefined : actualIds.get(routine.executorPersonaId)
      this.gov.putRoutineCharge({
        routineId: routine.routineId,
        workspaceId: request.workspaceId,
        title: routine.title,
        requiresApproval: routine.requiresApproval,
        ...(executorId === undefined ? {} : { executorPersonaId: executorId }),
        ...(routine.responsibleHumanId === undefined ? {} : { responsibleHumanId: routine.responsibleHumanId }),
        ...(routine.sectorId === undefined ? {} : { sectorId: routine.sectorId }),
        ...(routine.approvalKind === undefined ? {} : { approvalKind: routine.approvalKind }),
        ...(routine.autonomy === undefined ? {} : { autonomy: routine.autonomy }),
        ...(routine.cadence === undefined ? {} : { cadence: routine.cadence }),
      })
    }
    this.audit(request.workspaceId, actorId, 'apply-structure', { company: request.company })
    return rec
  }

  /**
   * @param request - Finding + kind.
   * @param actorId - Auditor.
   */
  applyFix(request: ApplyGovernanceFixRequest, actorId: string): TeamHealthView {
    const snap = this.snapshot(request.workspaceId)
    const fix = fixOf(snap, request)
    if (fix !== undefined) {
      const next = applyGovernanceFix(snap, fix)
      this.persistCharges(next.charges)
      this.persistRoutines(request.workspaceId, next.routines)
      if (fix.kind === 'delegate_to_coordination') this.gov.addDelegate(request.workspaceId, fix.routineId)
    } else if (request.fixKind === 'set_responsible' && request.targetId !== undefined && request.targetId !== '') {
      const personaId = request.findingId.split(':').slice(1).join(':')
      const current = this.cards.getCharge(personaId)
      this.cards.putCharge({
        personaId,
        responsibleHumanId: request.targetId,
        confirmed: true,
        ...(current?.substituteHumanId === undefined ? {} : { substituteHumanId: current.substituteHumanId }),
        ...(current?.sectorId === undefined ? {} : { sectorId: current.sectorId }),
      })
    } else if (request.fixKind === 'set_routine_owner' && request.targetId !== undefined && request.targetId !== '') {
      const routineId = request.findingId.split(':').slice(1).join(':')
      const current = this.gov.listRoutineCharges(request.workspaceId).find(row => row.routineId === routineId)
      this.gov.putRoutineCharge({
        routineId,
        workspaceId: request.workspaceId,
        title: current?.title ?? routineId,
        responsibleHumanId: request.targetId,
        requiresApproval: current?.requiresApproval ?? false,
        ...(current?.executorPersonaId === undefined ? {} : { executorPersonaId: current.executorPersonaId }),
        ...(current?.sectorId === undefined ? {} : { sectorId: current.sectorId }),
        ...(current?.approvalKind === undefined ? {} : { approvalKind: current.approvalKind }),
        ...(current?.autonomy === undefined ? {} : { autonomy: current.autonomy }),
        ...(current?.cadence === undefined ? {} : { cadence: current.cadence }),
      })
    }
    this.audit(request.workspaceId, actorId, 'apply-fix', { findingId: request.findingId, fixKind: request.fixKind })
    return this.healthView(request.workspaceId)
  }

  /**
   * @param workspaceId - Workspace.
   * @param personaId - Persona.
   * @param humanId - Responsável.
   * @param actorId - Auditor.
   */
  setResponsible(workspaceId: string, personaId: string, humanId: string, actorId: string): void {
    const charge = assignPersonaCharge({
      personaId,
      responsibleHumanId: humanId,
      ...chargeExtras(this.cards.getCharge(personaId)),
    })
    this.persistCharges([charge])
    this.audit(workspaceId, actorId, 'set-responsible', { personaId, humanId })
  }

  /**
   * @param workspaceId - Workspace.
   * @param personaId - Persona.
   * @param humanId - Substituto; empty clears.
   * @param actorId - Auditor.
   */
  setSubstitute(workspaceId: string, personaId: string, humanId: string, actorId: string): void {
    const current = this.cards.getCharge(personaId)
    if (current === undefined) throw new Error('persona-not-found')
    const charge = assignPersonaCharge({
      personaId,
      responsibleHumanId: current.responsibleHumanId,
      ...(humanId === '' ? {} : { substituteHumanId: humanId }),
      ...(current.sectorId === undefined ? {} : { sectorId: current.sectorId }),
      confirmed: current.confirmed,
    })
    this.persistCharges([charge])
    this.audit(workspaceId, actorId, 'set-substitute', { personaId, humanId })
  }

  /**
   * @param workspaceId - Workspace.
   * @param personaId - Persona.
   * @param sectorId - Sector; empty clears.
   * @param actorId - Auditor.
   */
  setSector(workspaceId: string, personaId: string, sectorId: string, actorId: string): void {
    const current = this.cards.getCharge(personaId)
    if (current === undefined) throw new Error('persona-not-found')
    if (sectorId !== '' && this.gov.getSector(sectorId) === undefined) throw new Error('sector-not-found')
    this.cards.putCharge({
      personaId,
      responsibleHumanId: current.responsibleHumanId,
      confirmed: current.confirmed,
      ...(current.substituteHumanId === undefined ? {} : { substituteHumanId: current.substituteHumanId }),
      ...(sectorId === '' ? {} : { sectorId }),
    })
    this.changedFor([personaId])
    this.audit(workspaceId, actorId, 'set-sector', { personaId, sectorId })
  }

  /**
   * @param request - Window.
   * @param actorId - Auditor.
   */
  setAvailability(request: SetAvailabilityRequest, actorId: string): void {
    if (request.kind === 'available') {
      this.gov.setAway(request.workspaceId, request.humanId, [])
    } else {
      this.gov.setAway(request.workspaceId, request.humanId, [{
        kind: request.kind, from: request.from, until: request.until,
      }])
    }
    this.audit(request.workspaceId, actorId, 'set-availability', { humanId: request.humanId, kind: request.kind })
  }

  /**
   * Editor write: responsável + substituto + setor.
   * @param request - Fields.
   * @param actorId - Auditor.
   */
  setPersonaGovernance(request: SetPersonaGovernanceRequest, actorId: string): void {
    const charge = assignPersonaCharge({
      personaId: request.personaId,
      responsibleHumanId: request.responsibleMemberId,
      confirmed: true,
      ...(request.substituteMemberId === '' ? {} : { substituteHumanId: request.substituteMemberId }),
      ...(request.sectorId === '' ? {} : { sectorId: request.sectorId }),
    })
    this.persistCharges([charge])
    this.audit(request.workspaceId, actorId, 'set-persona-governance', { personaId: request.personaId })
  }

  /**
   * @param workspaceId - Workspace.
   */
  listAudit(workspaceId: string): GovernanceAuditView[] {
    return this.gov.listAudit(workspaceId).map(row => ({
      id: row.id,
      at: row.at,
      action: row.action,
      actorId: row.actorId,
      body: row.body,
    }))
  }

  /**
   * @param workspaceId - Workspace.
   * @param actorId - Session.
   * @param action - Verb.
   * @param detail - JSON-safe body.
   */
  audit(workspaceId: string, actorId: string, action: string, detail: Record<string, string>): void {
    const at = this.now()
    this.gov.putAudit({
      id: `${action}:${at}:${actorId}:${randomUUID()}`,
      workspaceId,
      at,
      action,
      actorId,
      body: JSON.stringify(detail),
    })
  }

  private personaNames(workspaceId: string): Readonly<Record<string, string>> {
    const names: Record<string, string> = {}
    for (const project of this.product.listProjects(workspaceId)) {
      for (const persona of this.product.listPersonas(project.id)) names[persona.id] = persona.name
    }
    return names
  }

  private chargesOf(workspaceId: string, personas: readonly GovernancePersona[], ownerId: string): PersonaCharge[] {
    const stored = this.cards.listCharges(workspaceId)
    const byId = new Map(stored.map(row => [row.personaId, row]))
    return personas.map((persona) => {
      const row = byId.get(persona.id)
      if (row !== undefined) {
        return {
          personaId: row.personaId,
          responsibleHumanId: row.responsibleHumanId,
          confirmed: row.confirmed,
          ...(row.substituteHumanId === undefined ? {} : { substituteHumanId: row.substituteHumanId }),
          ...(row.sectorId === undefined ? {} : { sectorId: row.sectorId }),
        }
      }
      if (ownerId === '') return { personaId: persona.id, responsibleHumanId: '', confirmed: false }
      const charge = assignPersonaCharge({ personaId: persona.id, responsibleHumanId: ownerId })
      this.cards.putCharge(charge)
      return charge
    }).filter(row => row.responsibleHumanId !== '')
  }

  private persistCharges(charges: readonly PersonaCharge[]): void {
    for (const charge of charges) {
      this.cards.putCharge({
        personaId: charge.personaId,
        responsibleHumanId: charge.responsibleHumanId,
        confirmed: charge.confirmed,
        ...(charge.substituteHumanId === undefined ? {} : { substituteHumanId: charge.substituteHumanId }),
        ...(charge.sectorId === undefined ? {} : { sectorId: charge.sectorId }),
      })
    }
    this.changedFor(charges.map(charge => charge.personaId))
  }

  /** Tell the host which projects' organogram changed (once per project). */
  private changedFor(personaIds: readonly string[]): void {
    if (this.onOrganogramChange === undefined) return
    for (const projectId of new Set(personaIds.flatMap(id => this.product.getPersona(id)?.projectId ?? []))) this.onOrganogramChange(projectId)
  }

  private persistRoutines(workspaceId: string, routines: readonly RoutineCharge[]): void {
    for (const routine of routines) {
      this.gov.putRoutineCharge({
        routineId: routine.routineId,
        workspaceId,
        title: routine.title,
        requiresApproval: routine.requiresApproval,
        ...(routine.executorPersonaId === undefined ? {} : { executorPersonaId: routine.executorPersonaId }),
        ...(routine.responsibleHumanId === undefined ? {} : { responsibleHumanId: routine.responsibleHumanId }),
        ...(routine.sectorId === undefined ? {} : { sectorId: routine.sectorId }),
        ...(routine.approvalKind === undefined ? {} : { approvalKind: routine.approvalKind }),
        ...(routine.autonomy === undefined ? {} : { autonomy: routine.autonomy }),
        ...(routine.cadence === undefined ? {} : { cadence: routine.cadence }),
      })
    }
  }
}

function chargeExtras(row: { substituteHumanId?: string; sectorId?: string; confirmed: boolean } | undefined): {
  substituteHumanId?: string
  sectorId?: string
  confirmed?: boolean
} {
  if (row === undefined) return {}
  return {
    confirmed: row.confirmed,
    ...(row.substituteHumanId === undefined ? {} : { substituteHumanId: row.substituteHumanId }),
    ...(row.sectorId === undefined ? {} : { sectorId: row.sectorId }),
  }
}

function liveState(state: 'working' | 'resting' | 'stuck' | 'waiting'): 'working' | 'idle' | 'needs_you' | 'away' {
  if (state === 'working') return 'working'
  if (state === 'waiting') return 'needs_you'
  if (state === 'stuck') return 'away'
  return 'idle'
}

function sectorFromStored(row: StoredSector): Sector {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    name: row.name,
    policy: policyOf(row.policyJson),
  }
}

function policyOf(raw: string): SectorPolicy {
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return defaultSectorPolicy()
  }
  if (parsed === null || typeof parsed !== 'object') return defaultSectorPolicy()
  const rec = parsed as { autonomy?: unknown; tokensPerDay?: unknown; requiredApprovals?: unknown }
  const autonomy = rec.autonomy === 'on_request' || rec.autonomy === 'propose' || rec.autonomy === 'act'
    ? rec.autonomy
    : 'propose'
  const requiredApprovals = Array.isArray(rec.requiredApprovals)
    ? rec.requiredApprovals.filter((item): item is string => typeof item === 'string')
    : []
  return {
    autonomy,
    requiredApprovals,
    ...(typeof rec.tokensPerDay === 'number' ? { tokensPerDay: rec.tokensPerDay } : {}),
  }
}

function routineFromStored(row: StoredRoutineCharge): RoutineCharge {
  const autonomy = row.autonomy
  const cadence = row.cadence
  return {
    routineId: row.routineId,
    title: row.title,
    requiresApproval: row.requiresApproval,
    ...(row.executorPersonaId === undefined ? {} : { executorPersonaId: row.executorPersonaId }),
    ...(row.responsibleHumanId === undefined ? {} : { responsibleHumanId: row.responsibleHumanId }),
    ...(row.sectorId === undefined ? {} : { sectorId: row.sectorId }),
    ...(row.approvalKind === undefined ? {} : { approvalKind: row.approvalKind }),
    ...(autonomy === 'on_request' || autonomy === 'propose' || autonomy === 'act' ? { autonomy } : {}),
    ...(cadence === 'daily' || cadence === 'weekly' ? { cadence } : {}),
  }
}

function companyOf(raw: string): CompanyKind {
  return COMPANY_WIRE[raw] ?? 'escritorio'
}

function orgViewOf(
  workspaceId: string,
  groupBy: OrgChartGroupBy,
  chart: OrgChart,
  snap: GovernanceSnapshot,
  at: string,
  names: Readonly<Record<string, string>> = {},
): OrgChartView {
  const personaView = (id: string, title: string, live: GovernancePersona['live']): OrgPersonaView => ({
    id,
    name: names[id] ?? title,
    role: title,
    state: stateOf(live),
  })
  const groups = chart.groups.map((group) => {
    const away = groupBy === 'person'
      && humanPresence(snap.away, group.id, at) !== 'available'
    return {
      id: group.id,
      title: group.label,
      kind: groupBy,
      members: group.personas.map(card => personaView(card.personaId, card.title, card.live)),
      ...(groupBy === 'sector' && group.id !== 'unassigned' ? { sectorId: group.id } : {}),
      ...(away ? { away: true } : {}),
    }
  })
  return {
    workspaceId,
    groupBy,
    groups,
    personaCount: snap.personas.length,
    humanCount: snap.humans.length,
    ...(chart.rightHand === undefined ? {} : {
      rightHand: personaView(chart.rightHand.personaId, chart.rightHand.title, chart.rightHand.live),
      rightHandCaption: 'Braço direito',
    }),
  }
}

function stateOf(live: GovernancePersona['live']): OrgPersonaStateView {
  if (live === 'working') return 'working'
  if (live === 'needs_you') return 'waiting'
  if (live === 'away') return 'offline'
  return 'resting'
}

function healthViewOf(workspaceId: string, report: HealthReport): TeamHealthView {
  const level: HealthLevelView = report.score >= 80 ? 'good' : report.score >= 50 ? 'attention' : 'risk'
  return {
    workspaceId,
    level,
    title: level === 'good' ? 'A equipe se sustenta' : level === 'attention' ? 'A equipe precisa de ajuste' : 'A equipe para se alguém some',
    score: report.score,
    findings: report.items.map(findingOf),
    gestorAudit: [],
    ...(report.items[0] === undefined ? {} : { body: report.items[0].message }),
  }
}

function findingOf(item: HealthItem): HealthFindingView {
  const mapped = mapFix(item.fix)
  return {
    id: `${item.kind}:${item.subjectId}`,
    level: item.kind === 'single_point_of_failure' || item.kind === 'persona_without_responsible' ? 'risk' : 'attention',
    title: item.message,
    ...(mapped === undefined ? {} : mapped),
  }
}

function mapFix(fix: HealthItem['fix']): { fixKind: NonNullable<HealthFindingView['fixKind']>; fixTargetId?: string } | undefined {
  if (fix === undefined) return undefined
  if (fix.kind === 'set_substitute') return { fixKind: 'set_substitute', fixTargetId: fix.humanId }
  if (fix.kind === 'raise_autonomy') return { fixKind: 'raise_autonomy', fixTargetId: fix.routineId }
  return { fixKind: 'delegate_coordination', fixTargetId: fix.routineId }
}

function twoDayViewOf(workspaceId: string, result: TwoDayResult): TwoDayTestView {
  const bySubject = new Map<string, { label: string; slots: TwoDayOutcomeView[]; reason?: string; fixKind?: HealthFindingView['fixKind']; fixTargetId?: string }>()
  for (const event of result.events) {
    const row = bySubject.get(event.subjectId) ?? { label: event.title, slots: [] }
    row.slots.push(fateOf(event.fate))
    row.reason = event.why
    const mapped = mapFix(event.fix)
    if (mapped !== undefined) {
      row.fixKind = mapped.fixKind
      if (mapped.fixTargetId !== undefined) row.fixTargetId = mapped.fixTargetId
    }
    bySubject.set(event.subjectId, row)
  }
  const hours = uniqueHours(result)
  return {
    workspaceId,
    slotLabels: hours.map(hour => `+${hour}h`),
    rows: [...bySubject].map(([id, row]) => ({
      id,
      label: row.label,
      slots: row.slots,
      ...(row.reason === undefined ? {} : { reason: row.reason }),
      ...(row.fixKind === undefined ? {} : { fixKind: row.fixKind }),
      ...(row.fixTargetId === undefined ? {} : { fixTargetId: row.fixTargetId }),
    })),
  }
}

function uniqueHours(result: TwoDayResult): number[] {
  const from = Date.parse(result.from)
  const hours = [...new Set(result.events.map(event => Math.round((Date.parse(event.at) - from) / 3_600_000)))]
  hours.sort((a, b) => a - b)
  return hours.length === 0 ? [12, 36] : hours
}

function fateOf(fate: 'continues' | 'waits' | 'stops'): TwoDayOutcomeView {
  if (fate === 'continues') return 'runs'
  if (fate === 'waits') return 'waits'
  return 'stops'
}

function structureViewOf(
  workspaceId: string,
  rec: StructureRecommendation,
  names: Readonly<Record<string, string>> = {},
): StructureRecommendationView {
  const previewNames = { ...names }
  for (const row of rec.personas) previewNames[row.id] = row.title
  return {
    company: rec.company,
    explanation: rec.explanation,
    personas: rec.personas.map(row => ({ id: row.id, title: row.title, sectorName: row.sectorName })),
    routines: rec.routines.map(row => ({ title: row.title, ownerTitle: row.ownerTitle })),
    tasks: rec.tasks,
    org: orgViewOf(workspaceId, 'person', rec.org, rec.preview, rec.twoDay.from, previewNames),
    health: healthViewOf(workspaceId, rec.health),
    twoDay: twoDayViewOf(workspaceId, rec.twoDay),
  }
}

function fixOf(snap: GovernanceSnapshot, request: ApplyGovernanceFixRequest): GovernanceFix | undefined {
  const subject = request.findingId.split(':').slice(1).join(':')
  if (request.fixKind === 'set_substitute') {
    const personaId = snap.personas.some(row => row.id === subject)
      ? subject
      : snap.charges[0]?.personaId ?? ''
    const humanId = request.targetId !== undefined && request.targetId !== ''
      ? request.targetId
      : snap.humans.find(row => row.id !== snap.charges.find(item => item.personaId === personaId)?.responsibleHumanId)?.id ?? ''
    if (personaId === '' || humanId === '') return undefined
    return { kind: 'set_substitute', personaId, humanId }
  }
  if (request.fixKind === 'raise_autonomy') {
    const routineId = request.targetId !== undefined && request.targetId !== '' ? request.targetId : subject
    if (routineId === '') return undefined
    return { kind: 'raise_autonomy', routineId, to: 'act' as GovernanceAutonomy }
  }
  if (request.fixKind === 'delegate_coordination') {
    const routineId = request.targetId !== undefined && request.targetId !== '' ? request.targetId : subject
    if (routineId === '') return undefined
    return { kind: 'delegate_to_coordination', routineId }
  }
  return undefined
}
