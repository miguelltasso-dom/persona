/** Persona host service and authenticated Remote controller. */
import { join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  EventRepos,
  ProductRepos,
  ProactivityRepos,
  RoutineRepos,
  ScreenRepos,
  SqliteImportStore,
  SqliteInviteBook,
  VaultRepos,
  openPersonaStore,
  type PersonaStore,
} from '@deepseek-ai/dsh-persona-store'
import { GithubSourceHost, detectGh } from './github.ts'
import { ProactivityHost } from './proactivity.ts'
import { ScreensHost } from './screens.ts'
import { draftPersonaFromDescription, draftTeamFromDescription } from './draft.ts'
import { Orchestration } from './orchestration.ts'
import {
  listProjectFiles,
  readProjectFile,
  statProjectFile,
} from './files.ts'
import type {
  ChannelView,
  ClaimRoutinesRequest,
  CreateChannelRequest,
  CreateDmRequest,
  CreateMemberRequest,
  CreatePersonaRequest,
  CreateProjectRequest,
  CreateRoutineRequest,
  CreateWorkspaceRequest,
  DmView,
  DraftPersonaRequest,
  DraftTeamRequest,
  ListMessagesRequest,
  MemberView,
  MessagePage,
  MessageStreamFrame,
  MessageView,
  OnboardingState,
  OverviewView,
  ParticipationRequest,
  PauseRoutineRequest,
  PersonaDraft,
  PersonaView,
  AttentionReplyRequest,
  ConnectionView,
  CreateVaultRecordRequest,
  TicketCommandRequest,
  TurnContextView,
  VaultRecordView,
  PingResult,
  PostMessageRequest,
  ProjectFileListing,
  ProjectFileRequest,
  ProjectFileStat,
  ProjectFileText,
  ProjectScopeRequest,
  ProjectView,
  RoutineRunRequest,
  RoutineRunView,
  RoutineView,
  ScheduleRoutineRequest,
  SearchRequest,
  TaskView,
  TeamView,
  UpdateProjectRequest,
  AutonomyConfig,
  FireProactiveEventRequest,
  OverviewNowView,
  PersonaScopeRequest,
  ProactivityTickView,
  TickProactivityRequest,
  WhileAwayView,
  ApprovalView,
  ConfirmImportRequest,
  DecideApprovalRequest,
  ImportBatchRequest,
  ImportBatchView,
  ImportPreviewView,
  InviteIdRequest,
  InviteView,
  IssueInviteRequest,
  MemoryView,
  MemoryWriteRequest,
  PreviewImportRequest,
  ProjectLimitsView,
  ProposeHireRequest,
  ProposeSkillRequest,
  ProposeVaultRequest,
  PutQuietWindowRequest,
  PutSkillRequest,
  PutTriageRuleRequest,
  QuietWindowView,
  RedeemInviteRequest,
  ReviseSkillRequest,
  ScreenDocRequest,
  SimulateTriageRequest,
  SkillView,
  TriageLogView,
  TriageRuleView,
  FetchGithubIssueRequest,
  GithubAvailableView,
  GithubIngestView,
  IngestGithubWebhookRequest,
  PostGithubCommentRequest,
} from './types.ts'

export { openHostSync, openHostSyncFromEnv } from './sync.ts'
export { ProactivityHost } from './proactivity.ts'
export { ScreensHost } from './screens.ts'
export { GithubSourceHost, detectGh } from './github.ts'
export { createHostRunner } from './runner.ts'
export type * from './types.ts'

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Persona Remote controller. */
    personaHost: PersonaHost
  }
}

/** Remote protocol revision; bump on incompatible Remote changes. */
export const PERSONA_PROTOCOL = 1

/** Optional on-disk path; empty means env or the Vitest memory fallback. */
export interface Config {
  readonly databasePath: string
}

/**
 * Resolve `<PERSONA_HOME>/db/persona.db`, a configured path, or `:memory:` under Vitest.
 * @param configured - Plugin config path.
 * @returns SQLite path.
 */
export function resolvePersonaDatabasePath(configured: string): string {
  if (configured !== '') return configured
  const home = process.env.PERSONA_HOME ?? process.env.DSH_HOME
  if (home !== undefined && home !== '') return join(home, 'db', 'persona.db')
  if (process.env.VITEST === 'true') return ':memory:'
  throw new Error('PERSONA_HOME or personaHost.databasePath is required')
}

/** Persona domain methods for the authenticated owner and invited peers. */
export default class PersonaHost extends TypertRemoteService {
  static inject = ['typert']

  readonly store: PersonaStore
  readonly product: ProductRepos
  readonly events: EventRepos
  readonly vault: VaultRepos
  readonly routines: RoutineRepos
  readonly orchestration: Orchestration
  readonly proactivity: ProactivityHost
  readonly screens: ScreensHost
  readonly github: GithubSourceHost

  /**
   * @param ctx - Host context.
   * @param config - Database path; default empty (env / Vitest memory).
   */
  constructor(ctx: Context, config: Config = { databasePath: '' }) {
    super(ctx, 'personaHost', { namespace: 'persona' })
    this.store = openPersonaStore({ path: resolvePersonaDatabasePath(config.databasePath) })
    this.product = new ProductRepos(this.store)
    this.events = new EventRepos(this.store)
    this.vault = new VaultRepos(this.store)
    this.routines = new RoutineRepos(this.store)
    this.orchestration = new Orchestration(this.product, this.events, this.store)
    this.proactivity = new ProactivityHost(
      this.product,
      this.routines,
      new ProactivityRepos(this.store),
      this.orchestration,
    )
    this.screens = new ScreensHost(
      this.product,
      this.vault,
      new ScreenRepos(this.store),
      new SqliteInviteBook(this.store),
      new SqliteImportStore(this.store),
      this.orchestration,
    )
    this.github = new GithubSourceHost(detectGh(), this.orchestration, this.proactivity)
    ctx.effect(() => () => {
      this.store.close()
    })
  }

  /**
   * Probe that the Persona host half is mounted.
   * @returns the product marker and protocol revision.
   */
  @Remote
  ping(): PingResult {
    return { ok: true, product: 'persona', protocol: PERSONA_PROTOCOL }
  }

  /**
   * List projects in a workspace, newest first.
   * @param request - Workspace and the caller's current project (tenant check).
   * @returns Project cards.
   */
  @Remote
  listProjects(request: ProjectScopeRequest): ProjectView[] {
    this.requireWorkspace(request)
    return this.product.listProjects(request.workspaceId).map(project => ({
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description,
      kind: project.kind,
    }))
  }

  /**
   * List members of the workspace plus personas of the project.
   * @param request - Workspace and project.
   * @returns The team roster.
   */
  @Remote
  listTeam(request: ProjectScopeRequest): TeamView {
    this.requireProject(request)
    return {
      members: this.product.listMembers(request.workspaceId).map(toMemberView),
      personas: this.product.listPersonas(request.projectId).map(toPersonaView),
    }
  }

  /**
   * List personas of the project, newest first.
   * @param request - Workspace and project.
   * @returns Persona cards.
   */
  @Remote
  listPersonas(request: ProjectScopeRequest): PersonaView[] {
    this.requireProject(request)
    return this.product.listPersonas(request.projectId).map(toPersonaView)
  }

  /**
   * List channels of the project, newest first.
   * @param request - Workspace and project.
   * @returns Channel cards.
   */
  @Remote
  listChannels(request: ProjectScopeRequest): ChannelView[] {
    this.requireProject(request)
    return this.product.listChannels(request.projectId).map(channel => ({
      id: channel.id,
      projectId: channel.projectId,
      name: channel.name,
      topic: channel.topic,
    }))
  }

  /**
   * List DMs of the project, newest first.
   * @param request - Workspace and project.
   * @returns DM cards.
   */
  @Remote
  listDms(request: ProjectScopeRequest): DmView[] {
    this.requireProject(request)
    return this.product.listDms(request.projectId).map(dm => ({
      id: dm.id,
      projectId: dm.projectId,
      participantA: dm.participantA,
      participantB: dm.participantB,
    }))
  }

  /**
   * List tasks for the project from the engine kanban projection.
   * @param request - Workspace and project.
   * @returns Task cards.
   */
  @Remote
  listTasks(request: ProjectScopeRequest): TaskView[] {
    this.requireProject(request)
    return this.orchestration.kanban(request.projectId).map(card => ({
      id: card.ticketId,
      projectId: request.projectId,
      title: card.title,
      stage: card.column,
      stageAction: card.chip === 'waiting' ? 'waiting' : card.stageAction,
    }))
  }

  /**
   * Visão geral: needs-you first (blocked/failed/review), then in-progress.
   * @param request - Workspace and project.
   * @returns Attention and in-progress cards.
   */
  @Remote
  getOverview(request: ProjectScopeRequest): OverviewView {
    this.requireProject(request)
    const cards = this.listTasks(request)
    return {
      needsYou: cards.filter(card => card.stage === 'blocked' || card.stage === 'review'),
      inProgress: cards.filter(card => card.stage === 'doing' || card.stage === 'todo'),
    }
  }

  /**
   * Visão geral "agora": o que cada persona faz, fila, ociosidade, entregas do dia.
   * @param request - Tenant.
   */
  @Remote
  getOverviewNow(request: ProjectScopeRequest): OverviewNowView {
    this.requireProject(request)
    return this.proactivity.overviewNow(request.projectId)
  }

  /**
   * "Enquanto você estava fora" since the last visit, then records this visit.
   * @param request - Tenant.
   */
  @Remote
  getWhileAway(request: ProjectScopeRequest): WhileAwayView {
    this.requireProject(request)
    return this.proactivity.whileAway(request.projectId)
  }

  /**
   * Record that the human opened the project (without reading the summary).
   * @param request - Tenant.
   */
  @Remote
  markVisit(request: ProjectScopeRequest): boolean {
    this.requireProject(request)
    this.proactivity.markVisit(request.projectId)
    return true
  }

  /**
   * Autonomy and attention budget for one persona.
   * @param request - Persona scope.
   */
  @Remote
  getAutonomy(request: PersonaScopeRequest): AutonomyConfig {
    this.requireProject(request)
    return toAutonomyView(request.workspaceId, this.proactivity.getAutonomy(request.projectId, request.personaId))
  }

  /**
   * Set autonomy mode and attention budget.
   * @param request - Config.
   */
  @Remote
  setAutonomy(request: AutonomyConfig): AutonomyConfig {
    this.requireProject(request)
    return toAutonomyView(request.workspaceId, this.proactivity.setAutonomy({
      projectId: request.projectId,
      personaId: request.personaId,
      mode: request.mode,
      proposalBudget: request.proposalBudget,
      tokenBudget: request.tokenBudget,
      executionBudget: request.executionBudget,
      ...(request.silenceStart === '' ? {} : { silenceStart: request.silenceStart }),
      ...(request.silenceEnd === '' ? {} : { silenceEnd: request.silenceEnd }),
    }))
  }

  /**
   * Ensure a daily initiative routine exists for every persona.
   * @param request - Tenant.
   */
  @Remote
  ensureInitiativeRoutines(request: ProjectScopeRequest): number {
    this.requireProject(request)
    return this.proactivity.ensureAllInitiativeRoutines(request.projectId)
  }

  /**
   * Event Source: PR, recurring error, deadline. Fires initiative when policy allows.
   * @param request - Event.
   */
  @Remote
  fireProactiveEvent(request: FireProactiveEventRequest): string[] {
    this.requireProject(request)
    return this.proactivity.fireEvent(request.projectId, request.title, request.subjectId)
  }

  /**
   * Scheduler: claim due initiative routines and run the Vigia snapshot.
   * @param request - Tenant, lease, stall threshold.
   */
  @Remote
  tickProactivity(request: TickProactivityRequest): ProactivityTickView {
    this.requireProject(request)
    return this.proactivity.tick(request.projectId, request.leaseUntil, request.stallAfterMs)
  }

  /**
   * Issue a one-time workspace invite.
   * @param request - Invite fields.
   */
  @Remote
  issueInvite(request: IssueInviteRequest): InviteView {
    this.requireProject(request)
    return this.screens.issue(request)
  }

  /**
   * List invites of the workspace.
   * @param request - Tenant.
   */
  @Remote
  listInvites(request: ProjectScopeRequest): InviteView[] {
    this.requireWorkspace(request)
    return this.screens.listInvites(request.workspaceId)
  }

  /**
   * Redeem an invite token as a new member.
   * @param request - Token and member.
   */
  @Remote
  redeemInvite(request: RedeemInviteRequest): InviteView {
    this.requireWorkspace(request)
    return this.screens.redeem(request)
  }

  /**
   * Revoke an open invite.
   * @param request - Invite id.
   */
  @Remote
  revokeInvite(request: InviteIdRequest): InviteView {
    this.requireWorkspace(request)
    return this.screens.revoke(request.workspaceId, request.inviteId)
  }

  /**
   * Preview an import; cookies and tokens are refused.
   * @param request - Files.
   */
  @Remote
  previewImport(request: PreviewImportRequest): ImportPreviewView {
    this.requireProject(request)
    return this.screens.preview(request.files)
  }

  /**
   * Apply a preview as proposed rows.
   * @param request - Batch id and files.
   */
  @Remote
  confirmImport(request: ConfirmImportRequest): ImportBatchView {
    this.requireProject(request)
    return this.screens.confirm(request)
  }

  /**
   * Import batch progress.
   * @param request - Batch id.
   */
  @Remote
  getImportBatch(request: ImportBatchRequest): ImportBatchView {
    this.requireProject(request)
    return this.screens.importBatch(request.batchId)
  }

  /**
   * Roll back an applied import batch.
   * @param request - Batch id.
   */
  @Remote
  rollbackImport(request: ImportBatchRequest): ImportBatchView {
    this.requireProject(request)
    return this.screens.rollback(request.batchId)
  }

  /**
   * Triage rules of the project.
   * @param request - Tenant.
   */
  @Remote
  listTriageRules(request: ProjectScopeRequest): TriageRuleView[] {
    this.requireProject(request)
    return this.screens.listRules(request.projectId)
  }

  /**
   * Create or replace a triage rule.
   * @param request - Rule.
   */
  @Remote
  putTriageRule(request: PutTriageRuleRequest): TriageRuleView {
    this.requireProject(request)
    return this.screens.putRule(request)
  }

  /**
   * Delete a triage rule.
   * @param request - Rule id.
   */
  @Remote
  deleteTriageRule(request: ScreenDocRequest): boolean {
    this.requireProject(request)
    return this.screens.deleteRule(request.projectId, request.id)
  }

  /**
   * Triage simulation log, newest first.
   * @param request - Tenant.
   */
  @Remote
  listTriageLog(request: ProjectScopeRequest): TriageLogView[] {
    this.requireProject(request)
    return this.screens.listLog(request.projectId)
  }

  /**
   * Simulate a rule (log-only unless the rule allows execute).
   * @param request - Rule and text.
   */
  @Remote
  simulateTriage(request: SimulateTriageRequest): TriageLogView {
    this.requireProject(request)
    return this.screens.simulate(request)
  }

  /**
   * Quiet windows of the project.
   * @param request - Tenant.
   */
  @Remote
  listQuietWindows(request: ProjectScopeRequest): QuietWindowView[] {
    this.requireProject(request)
    return this.screens.listQuiet(request.projectId)
  }

  /**
   * Create or replace a quiet window.
   * @param request - Window.
   */
  @Remote
  putQuietWindow(request: PutQuietWindowRequest): QuietWindowView {
    this.requireProject(request)
    return this.screens.putQuiet(request)
  }

  /**
   * Project attention limits.
   * @param request - Tenant.
   */
  @Remote
  getProjectLimits(request: ProjectScopeRequest): ProjectLimitsView {
    this.requireProject(request)
    return this.screens.getLimits(request.workspaceId, request.projectId)
  }

  /**
   * Set project attention limits.
   * @param request - Limits.
   */
  @Remote
  setProjectLimits(request: ProjectLimitsView): ProjectLimitsView {
    this.requireProject(request)
    return this.screens.setLimits(request)
  }

  /**
   * Approvals inbox (hire, vault, skill, attention).
   * @param request - Tenant.
   */
  @Remote
  listApprovals(request: ProjectScopeRequest): ApprovalView[] {
    this.requireProject(request)
    return this.screens.listApprovals(request.projectId)
  }

  /**
   * Propose hiring a persona (always asks).
   * @param request - Spec.
   */
  @Remote
  proposeHire(request: ProposeHireRequest): ApprovalView {
    this.requireProject(request)
    return this.screens.proposeHire(request)
  }

  /**
   * Propose a vault body update.
   * @param request - Record and next body.
   */
  @Remote
  proposeVault(request: ProposeVaultRequest): ApprovalView {
    this.requireProject(request)
    return this.screens.proposeVault(request)
  }

  /**
   * Propose enabling a skill.
   * @param request - Skill card.
   */
  @Remote
  proposeSkill(request: ProposeSkillRequest): ApprovalView {
    this.requireProject(request)
    return this.screens.proposeSkill(request)
  }

  /**
   * Accept or reject an approval card.
   * @param request - Decision.
   */
  @Remote
  decideApproval(request: DecideApprovalRequest): ApprovalView {
    this.requireProject(request)
    return this.screens.decide(request)
  }

  /**
   * Per-persona memory rows (pending + vault).
   * @param request - Tenant.
   */
  @Remote
  listMemory(request: ProjectScopeRequest): MemoryView[] {
    this.requireProject(request)
    return this.screens.listMemory(request.projectId)
  }

  /**
   * Propose a memory (pending until approved).
   * @param request - Body.
   */
  @Remote
  proposeMemory(request: MemoryWriteRequest): MemoryView {
    this.requireProject(request)
    return this.screens.proposeMemory(request)
  }

  /**
   * Approve a pending memory into the vault.
   * @param request - Memory id.
   */
  @Remote
  approveMemory(request: MemoryWriteRequest): MemoryView {
    this.requireProject(request)
    return this.screens.approveMemory(request)
  }

  /**
   * Edit pending or active memory.
   * @param request - New body.
   */
  @Remote
  editMemory(request: MemoryWriteRequest): MemoryView {
    this.requireProject(request)
    return this.screens.editMemory(request)
  }

  /**
   * Forget a memory (revoke).
   * @param request - Memory id.
   */
  @Remote
  forgetMemory(request: ScreenDocRequest): MemoryView {
    this.requireProject(request)
    return this.screens.forgetMemory(request.projectId, request.id)
  }

  /**
   * Skills of the project.
   * @param request - Tenant.
   */
  @Remote
  listSkills(request: ProjectScopeRequest): SkillView[] {
    this.requireProject(request)
    return this.screens.listSkills(request.projectId)
  }

  /**
   * Create a skill at version 1.
   * @param request - Skill.
   */
  @Remote
  putSkill(request: PutSkillRequest): SkillView {
    this.requireProject(request)
    return this.screens.putSkill(request)
  }

  /**
   * New skill version (candidate).
   * @param request - Body.
   */
  @Remote
  reviseSkill(request: ReviseSkillRequest): SkillView {
    this.requireProject(request)
    return this.screens.reviseSkill(request)
  }

  /**
   * Roll back a skill to the previous body.
   * @param request - Skill id.
   */
  @Remote
  rollbackSkill(request: ScreenDocRequest): SkillView {
    this.requireProject(request)
    return this.screens.rollbackSkill(request.projectId, request.id)
  }

  /**
   * Whether the `gh` CLI is available on this host.
   * @param request - Tenant (ACL).
   */
  @Remote
  githubAvailable(request: ProjectScopeRequest): GithubAvailableView {
    this.requireProject(request)
    return { available: this.github.cli.available }
  }

  /**
   * Ingest a Worker-forwarded GitHub webhook into the project engine.
   * @param request - Envelope as JSON text.
   */
  @Remote
  ingestGithubWebhook(request: IngestGithubWebhookRequest): GithubIngestView {
    this.requireProject(request)
    const payload = JSON.parse(request.payloadJson) as Record<string, unknown>
    return this.github.ingest(request.projectId, {
      deliveryId: request.deliveryId,
      event: asGithubEvent(request.event),
      action: request.action,
      repository: request.repository,
      payload,
    }, request.agentLogin)
  }

  /**
   * Fetch one issue/PR via `gh api` and ingest it.
   * @param request - Repository and number.
   */
  @Remote
  fetchGithubIssue(request: FetchGithubIssueRequest): GithubIngestView {
    this.requireProject(request)
    return this.github.fetchIssue(request.projectId, request.repository, request.number, request.agentLogin)
  }

  /**
   * Post a comment via `gh api`.
   * @param request - Repository, number, body.
   */
  @Remote
  postGithubComment(request: PostGithubCommentRequest): boolean {
    this.requireProject(request)
    this.github.comment(request.repository, request.number, request.body)
    return true
  }

  /**
   * Create a workspace and its Pessoal project.
   * @param request - Workspace id, name, and personal project id.
   * @returns The personal project card.
   */
  @Remote
  createWorkspace(request: CreateWorkspaceRequest): ProjectView {
    const created = this.product.createWorkspace({
      id: request.id, name: request.name, personalProjectId: request.personalProjectId,
    })
    return {
      id: created.personal.id,
      workspaceId: created.personal.workspaceId,
      name: created.personal.name,
      description: created.personal.description,
      kind: created.personal.kind,
    }
  }

  /**
   * Create a shared project.
   * @param request - Project fields.
   * @returns The project card.
   */
  @Remote
  createProject(request: CreateProjectRequest): ProjectView {
    this.requireWorkspace(request)
    const project = this.product.createProject({
      id: request.id,
      workspaceId: request.workspaceId,
      name: request.name,
      description: request.description,
    })
    return {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description,
      kind: project.kind,
    }
  }

  /**
   * Update a project's name, description, and file root.
   * @param request - Tenant plus fields. Empty `rootPath` clears the root.
   * @returns The updated card.
   */
  @Remote
  updateProject(request: UpdateProjectRequest): ProjectView {
    this.requireProject(request)
    const project = this.product.updateProject(request.projectId, {
      name: request.name,
      description: request.description,
      rootPath: request.rootPath === '' ? null : request.rootPath,
    })
    return {
      id: project.id,
      workspaceId: project.workspaceId,
      name: project.name,
      description: project.description,
      kind: project.kind,
    }
  }

  /**
   * Create a workspace member.
   * @param request - Member fields plus tenant project.
   * @returns The member card.
   */
  @Remote
  createMember(request: CreateMemberRequest): MemberView {
    this.requireProject(request)
    const member = this.product.createMember({
      id: request.id,
      workspaceId: request.workspaceId,
      displayName: request.displayName,
      handle: request.handle,
      role: request.role,
    })
    return toMemberView(member)
  }

  /**
   * Create a persona in the project.
   * @param request - Persona fields.
   * @returns The persona card.
   */
  @Remote
  createPersona(request: CreatePersonaRequest): PersonaView {
    this.requireProject(request)
    const now = new Date().toISOString()
    const stored = this.product.createPersona({
      id: request.id,
      workspaceId: request.workspaceId,
      name: request.name,
      title: request.title,
      description: request.description,
      personality: request.personality,
      instructions: request.instructions,
      avatar: { kind: request.avatarKind, ref: request.avatarRef },
      runner: request.runnerKind === 'dsh'
        ? { kind: 'dsh', model: request.runnerModel }
        : { kind: 'cli', cli: asCli(request.runnerCli), model: request.runnerModel },
      tools: {},
      skills: [],
      limits: {},
      systemRoles: request.systemRoles === undefined ? [] : [...request.systemRoles],
      canRecruit: request.canRecruit,
      createdAt: now,
      updatedAt: now,
      createdBy: request.createdBy,
    }, request.projectId)
    this.proactivity.ensureInitiativeRoutine(stored)
    this.orchestration.ensureCoordination(request.projectId)
    return toPersonaView(stored)
  }

  /**
   * Add a participation (project or channel).
   * @param request - Participation.
   * @returns true when stored.
   */
  @Remote
  addParticipation(request: ParticipationRequest): boolean {
    this.requireProject(request)
    this.product.addParticipation({
      personaId: request.personaId,
      projectId: request.projectId,
      kind: request.kind,
      targetId: request.targetId,
    })
    return true
  }

  /**
   * Remove a participation.
   * @param request - Participation.
   * @returns true when removed.
   */
  @Remote
  removeParticipation(request: ParticipationRequest): boolean {
    this.requireProject(request)
    this.product.removeParticipation(request.personaId, request.kind, request.targetId)
    return true
  }

  /**
   * Create a channel.
   * @param request - Channel fields.
   * @returns The channel card.
   */
  @Remote
  createChannel(request: CreateChannelRequest): ChannelView {
    this.requireProject(request)
    const channel = this.product.createChannel({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      name: request.name,
      topic: request.topic,
    })
    return { id: channel.id, projectId: channel.projectId, name: channel.name, topic: channel.topic }
  }

  /**
   * Create a DM.
   * @param request - Participants.
   * @returns The DM card.
   */
  @Remote
  createDm(request: CreateDmRequest): DmView {
    this.requireProject(request)
    const dm = this.product.createDm({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      participantA: request.participantA,
      participantB: request.participantB,
    })
    return {
      id: dm.id,
      projectId: dm.projectId,
      participantA: dm.participantA,
      participantB: dm.participantB,
    }
  }

  /**
   * Append a message to a channel or DM stream.
   * @param request - Message fields.
   * @returns The stored message.
   */
  @Remote
  postMessage(request: PostMessageRequest): MessageView {
    this.requireProject(request)
    const stored = this.events.append({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      streamKind: request.streamKind,
      ownerId: request.ownerId,
      type: 'message',
      body: request.body,
      actorId: request.actorId,
      subjectId: request.subjectId,
      occurredAt: request.occurredAt,
    })
    this.orchestration.ingest(stored, request.streamKind, request.ownerId)
    return toMessageView(stored)
  }

  /**
   * Page messages with ACL.
   * @param request - Stream, actor, cursor, limit.
   * @returns Authorized page.
   */
  @Remote
  listMessages(request: ListMessagesRequest): MessagePage {
    this.requireProject(request)
    const streamId = `${request.streamKind}:${request.ownerId}`
    const page = this.events.list(streamId, { id: request.actorId }, request.afterSeq, request.limit)
    return { events: page.events.map(toMessageView), nextSeq: page.nextSeq }
  }

  /**
   * Stream messages: one baseline frame, then upserts until `signal` aborts.
   * @param request - Same scope as listMessages.
   * @param signal - Client observation lifetime.
   * @returns Baseline then increment frames.
   */
  @Remote({ mode: 'stream' })
  async *followMessages(request: ListMessagesRequest, signal: AbortSignal): AsyncIterable<MessageStreamFrame> {
    this.requireProject(request)
    const streamId = `${request.streamKind}:${request.ownerId}`
    const queue: MessageView[] = []
    const dispose = this.events.subscribe((event) => {
      if (event.streamId !== streamId) return
      queue.push(toMessageView(event))
    })
    try {
      const page = this.events.list(streamId, { id: request.actorId }, request.afterSeq, request.limit)
      const events = page.events.map(toMessageView)
      const seen = new Set(events.map(item => item.id))
      yield { kind: 'baseline', events, order: events.map(item => item.id) }
      while (!signal.aborted) {
        const next = queue.shift()
        if (next !== undefined) {
          if (seen.has(next.id)) continue
          seen.add(next.id)
          yield { kind: 'upsert', events: [next], order: [next.id] }
          continue
        }
        await sleep(25, signal)
      }
    } finally {
      dispose()
    }
  }

  /**
   * Board command: stop, retry, reevaluate, or dismiss.
   * @param request - Ticket and command.
   * @returns true when applied.
   */
  @Remote
  runTicketCommand(request: TicketCommandRequest): boolean {
    this.requireProject(request)
    const engine = this.orchestration.runtime(request.projectId).engine
    const ticket = this.orchestration.runtime(request.projectId).repo.tickets.get(request.ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    if (request.command === 'stop') engine.stopTicket(request.ticketId, request.reason)
    else if (request.command === 'retry') engine.retryTicket(request.ticketId)
    else if (request.command === 'reevaluate') engine.reevaluate(ticket.origin.triggerId)
    else engine.dismiss(ticket.decisionId)
    return true
  }

  /**
   * A person's answer to Attention goes back to the ticket as a note.
   * @param request - Ticket and text.
   * @returns true when stored.
   */
  @Remote
  answerAttention(request: AttentionReplyRequest): boolean {
    this.requireProject(request)
    this.orchestration.runtime(request.projectId).engine.note(request.ticketId, request.text)
    return true
  }

  /**
   * List vault records of the project, newest first.
   * @param request - Tenant.
   * @returns Record cards.
   */
  @Remote
  listVaultRecords(request: ProjectScopeRequest): VaultRecordView[] {
    this.requireProject(request)
    return this.vault.listRecords(request.projectId).map(record => ({
      id: record.id,
      projectId: request.projectId,
      kind: record.kind,
      body: record.body,
      status: record.status,
    }))
  }

  /**
   * Create a vault record visible to the workspace.
   * @param request - Record fields.
   * @returns The stored card.
   */
  @Remote
  createVaultRecord(request: CreateVaultRecordRequest): VaultRecordView {
    this.requireProject(request)
    const record = this.vault.createRecord({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      kind: request.kind,
      body: request.body,
      authorId: request.authorId,
      visibility: { kind: 'workspace' },
    })
    return {
      id: record.id,
      projectId: request.projectId,
      kind: record.kind,
      body: record.body,
      status: record.status,
    }
  }

  /**
   * Onboarding: Pessoal exists; first use when the project has no personas.
   * @param request - Tenant.
   * @returns Flags.
   */
  @Remote
  getOnboarding(request: ProjectScopeRequest): OnboardingState {
    this.requireWorkspace(request)
    const personal = this.product.listProjects(request.workspaceId).find(item => item.kind === 'personal')
    return {
      hasPersonalProject: personal !== undefined,
      firstUse: personal === undefined || this.product.listPersonas(personal.id).length === 0,
      personalProjectId: personal?.id ?? '',
    }
  }

  /**
   * Known CLI/connection kinds. Availability is not probed here (read-only later).
   * @param request - Tenant (unused; required for ACL).
   * @returns Connection cards.
   */
  @Remote
  listConnections(request: ProjectScopeRequest): ConnectionView[] {
    this.requireProject(request)
    return [
      { id: 'dsh', kind: 'dsh', available: true },
      { id: 'claude', kind: 'claude', available: false },
      { id: 'codex', kind: 'codex', available: false },
      { id: 'cursor', kind: 'cursor', available: false },
      { id: 'opencode', kind: 'opencode', available: false },
    ]
  }

  /**
   * Triggers a ticket used (origin + later trigger inputs).
   * @param request - Ticket command envelope (`reason` unused).
   * @returns Context card.
   */
  @Remote
  getTurnContext(request: TicketCommandRequest): TurnContextView {
    this.requireProject(request)
    const ticket = this.orchestration.runtime(request.projectId).repo.tickets.get(request.ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    const extra = ticket.inputs
      .filter(input => input.kind === 'trigger')
      .map(input => input.triggerId)
    return {
      ticketId: ticket.id,
      triggerIds: [...new Set([ticket.origin.triggerId, ...ticket.origin.triggerIds, ...extra])],
      title: ticket.title,
    }
  }

  /**
   * Search events the actor may read. Does not leak DMs.
   * @param request - Tenant, actor, query, limit.
   * @returns Authorized hits.
   */
  @Remote
  search(request: SearchRequest): MessageView[] {
    this.requireProject(request)
    return this.events.search(request.projectId, { id: request.actorId }, request.query, request.limit)
      .map(toMessageView)
  }

  /**
   * List one directory under the project's file root.
   * @param request - Tenant, actor, relative path.
   * @returns Direct children.
   */
  @Remote
  listFiles(request: ProjectFileRequest): ProjectFileListing {
    return listProjectFiles(this.requireFileRoot(request), request.path)
  }

  /**
   * Stat one path under the project's file root.
   * @param request - Tenant, actor, relative path.
   * @returns Kind and size.
   */
  @Remote
  statFile(request: ProjectFileRequest): ProjectFileStat {
    return statProjectFile(this.requireFileRoot(request), request.path)
  }

  /**
   * Read a UTF-8 file under the project's file root.
   * @param request - Tenant, actor, relative path.
   * @returns Text and byte length.
   */
  @Remote
  readFile(request: ProjectFileRequest): ProjectFileText {
    return readProjectFile(this.requireFileRoot(request), request.path)
  }

  /**
   * Create a routine in the project.
   * @param request - Routine fields.
   * @returns The routine card.
   */
  @Remote
  createRoutine(request: CreateRoutineRequest): RoutineView {
    this.requireProject(request)
    return toRoutineView(this.routines.create({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      name: request.name,
      rrule: request.rrule,
      timeZone: request.timeZone,
      catchUp: request.catchUp,
      ...(request.silenceStart === '' ? {} : { silenceStart: request.silenceStart }),
      ...(request.silenceEnd === '' ? {} : { silenceEnd: request.silenceEnd }),
    }))
  }

  /**
   * List routines of the project, newest first.
   * @param request - Tenant.
   * @returns Routine cards.
   */
  @Remote
  listRoutines(request: ProjectScopeRequest): RoutineView[] {
    this.requireProject(request)
    return this.routines.list(request.projectId).map(toRoutineView)
  }

  /**
   * Pause or resume one routine. Pause cancels pending and leased runs.
   * @param request - Routine and flag.
   * @returns The updated card.
   */
  @Remote
  pauseRoutine(request: PauseRoutineRequest): RoutineView {
    this.requireProject(request)
    return toRoutineView(this.routines.setPaused(request.id, request.paused))
  }

  /**
   * Pause every routine in the project ("Pausar equipe").
   * @param request - Tenant.
   * @returns true when applied.
   */
  @Remote
  pauseTeam(request: ProjectScopeRequest): boolean {
    this.requireProject(request)
    this.routines.pauseTeam(request.projectId)
    return true
  }

  /**
   * Queue one occurrence. Duplicate `scheduledFor` returns the existing run.
   * @param request - Routine, run id, instant.
   * @returns The run.
   */
  @Remote
  scheduleRoutine(request: ScheduleRoutineRequest): RoutineRunView {
    this.requireProject(request)
    return toRunView(this.routines.schedule({
      id: request.runId, routineId: request.id, scheduledFor: request.scheduledFor,
    }))
  }

  /**
   * Lease due runs (fake-clock friendly: uses the store clock).
   * @param request - Tenant and lease expiry.
   * @returns Newly leased runs.
   */
  @Remote
  claimRoutines(request: ClaimRoutinesRequest): RoutineRunView[] {
    this.requireProject(request)
    return this.routines.claimDue(request.projectId, request.leaseUntil).map(toRunView)
  }

  /**
   * Re-queue a failed run.
   * @param request - Run id.
   * @returns The pending run.
   */
  @Remote
  retryRoutine(request: RoutineRunRequest): RoutineRunView {
    this.requireProject(request)
    return toRunView(this.routines.retry(request.runId))
  }

  /**
   * Draft one persona from a description. Valid against Forge's schema; tools empty.
   * @param request - Tenant and text.
   * @returns An editable draft.
   */
  @Remote
  draftPersona(request: DraftPersonaRequest): PersonaDraft {
    this.requireProject(request)
    return draftPersonaFromDescription(request.description)
  }

  /**
   * Draft a team from a description. No coordination role is assigned.
   * @param request - Tenant and text.
   * @returns Editable drafts.
   */
  @Remote
  draftTeam(request: DraftTeamRequest): PersonaDraft[] {
    this.requireProject(request)
    return draftTeamFromDescription(request.description)
  }

  private requireWorkspace(request: { workspaceId: string }): void {
    if (this.product.getWorkspace(request.workspaceId) === undefined) {
      throw new Error('workspace-not-found')
    }
  }

  private requireProject(request: { workspaceId: string; projectId: string }): void {
    this.requireWorkspace(request)
    const project = this.product.getProject(request.projectId)
    if (project === undefined || project.workspaceId !== request.workspaceId) {
      throw new Error('project-not-found')
    }
  }

  private requireFileRoot(request: ProjectFileRequest): string {
    this.requireProject(request)
    const member = this.product.getMember(request.actorId)
    if (member === undefined || member.workspaceId !== request.workspaceId) {
      throw new Error('files-forbidden')
    }
    const project = this.product.getProject(request.projectId)
    if (project === undefined) throw new Error('project-not-found')
    if (project.rootPath === undefined || project.rootPath === '') throw new Error('project-root-missing')
    return project.rootPath
  }
}

function asGithubEvent(event: string): 'issues' | 'issue_comment' | 'pull_request' | 'pull_request_review' | 'pull_request_review_comment' {
  if (
    event === 'issues' || event === 'issue_comment' || event === 'pull_request'
    || event === 'pull_request_review' || event === 'pull_request_review_comment'
  ) return event
  throw new Error('github-event')
}

function toMemberView(member: { id: string; workspaceId: string; displayName: string; handle: string; role: MemberView['role'] }): MemberView {
  return {
    id: member.id,
    workspaceId: member.workspaceId,
    displayName: member.displayName,
    handle: member.handle,
    role: member.role,
  }
}

function toPersonaView(persona: {
  id: string
  workspaceId: string
  projectId: string
  name: string
  title: string
  description: string
  avatar: { kind: 'gallery' | 'upload' | 'silhouette'; ref: string }
  systemRoles: readonly ('coordination' | 'watchdog')[]
  canRecruit: boolean
}): PersonaView {
  return {
    id: persona.id,
    workspaceId: persona.workspaceId,
    projectId: persona.projectId,
    name: persona.name,
    title: persona.title,
    description: persona.description,
    avatarKind: persona.avatar.kind,
    avatarRef: persona.avatar.ref,
    systemRoles: persona.systemRoles,
    canRecruit: persona.canRecruit,
  }
}

function toMessageView(event: {
  id: string
  streamId: string
  seq: number
  body: string
  actorId: string
  subjectId: string
  occurredAt: string
}): MessageView {
  return {
    id: event.id,
    streamId: event.streamId,
    seq: event.seq,
    body: event.body,
    actorId: event.actorId,
    subjectId: event.subjectId,
    occurredAt: event.occurredAt,
  }
}

function toRoutineView(routine: {
  id: string
  projectId: string
  name: string
  rrule: string
  timeZone: string
  paused: boolean
  catchUp: RoutineView['catchUp']
}): RoutineView {
  return {
    id: routine.id,
    projectId: routine.projectId,
    name: routine.name,
    rrule: routine.rrule,
    timeZone: routine.timeZone,
    paused: routine.paused,
    catchUp: routine.catchUp,
  }
}

function toRunView(run: {
  id: string
  routineId: string
  scheduledFor: string
  status: RoutineRunView['status']
  attempt: number
}): RoutineRunView {
  return {
    id: run.id,
    routineId: run.routineId,
    scheduledFor: run.scheduledFor,
    status: run.status,
    attempt: run.attempt,
  }
}

function toAutonomyView(workspaceId: string, row: {
  projectId: string
  personaId: string
  mode: AutonomyConfig['mode']
  proposalBudget: number
  tokenBudget: number
  executionBudget: number
  silenceStart?: string
  silenceEnd?: string
}): AutonomyConfig {
  return {
    workspaceId,
    projectId: row.projectId,
    personaId: row.personaId,
    mode: row.mode,
    proposalBudget: row.proposalBudget,
    tokenBudget: row.tokenBudget,
    executionBudget: row.executionBudget,
    silenceStart: row.silenceStart ?? '',
    silenceEnd: row.silenceEnd ?? '',
  }
}

function asCli(value: string): 'claude' | 'codex' | 'cursor' | 'opencode' {
  if (value === 'claude' || value === 'codex' || value === 'cursor' || value === 'opencode') return value
  throw new Error('invalid-cli')
}

function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve) => {
    if (signal.aborted) {
      resolve()
      return
    }
    const timer = setTimeout(resolve, ms)
    const onAbort = (): void => {
      clearTimeout(timer)
      resolve()
    }
    signal.addEventListener('abort', onAbort, { once: true })
  })
}
