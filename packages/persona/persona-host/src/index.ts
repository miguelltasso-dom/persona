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
  SqliteUsageStore,
  VaultRepos,
  openPersonaStore,
  type PersonaStore,
} from '@deepseek-ai/dsh-persona-store'
import { foldUsage } from '@deepseek-ai/dsh-persona-usage'
import { resolveSessionActor, sessionCan } from './auth.ts'
import { ConnectionProbe } from './connection-probe.ts'
import { MutantRunBook } from './mutant-run.ts'
import { DeadLetterBook } from './dead-letter.ts'
import { collectDiagnostics, stringifyDiagnostics } from './diagnostics.ts'
import { exportMarkdown } from './export-md.ts'
import { GithubSourceHost, detectGh } from './github.ts'
import { detectProjectGit, validateProjectRoot } from './project-root.ts'
import { hostRunnerFromContext } from './runner.ts'
import { githubWebhookHandler, WebhookReplayGuard } from './webhook-http.ts'
import { ProactivityHost } from './proactivity.ts'
import { ScreensHost } from './screens.ts'
import { draftPersonaWithDriver, draftTeamWithDriver } from './draft.ts'
import { Orchestration, wantsWork } from './orchestration.ts'
import { OnboardingHost } from './onboarding.ts'
import { HostScheduler, inQuietWindow } from './scheduler.ts'
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
  AttentionEventView,
  AttentionPolicyView,
  AttentionStreamFrame,
  AcceptReviewRequest,
  CancelReplyRequest,
  CompleteOnboardingRequest,
  DiagnosticsJson,
  OnboardingState,
  RequestChangesRequest,
  ReviewAcceptView,
  ReviewSummaryView,
  PutAttentionPolicyRequest,
  PutRetentionPolicyRequest,
  RetentionLogView,
  RetentionPolicyView,
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
  UsedContextRequest,
  UsedContextView,
  VaultRecordView,
  PingResult,
  PostMessageRequest,
  ProjectFileListing,
  ProjectFileRequest,
  ProjectFileStat,
  ProjectFileText,
  ProjectRootView,
  RoutineScheduleView,
  SetProjectRootRequest,
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
  CanvasGraphView,
  ConfirmImportRequest,
  DailySummaryView,
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
  DeadLetterView,
  ExportArchiveView,
  GetOfficialQuotaRequest,
  GetUsageRequest,
  OfficialQuotaView,
  UsageView,
  ExportRequest,
  FetchGithubIssueRequest,
  GithubAvailableView,
  GithubIngestView,
  IngestGithubWebhookRequest,
  PickDirectoryView,
  PostGithubCommentRequest,
} from './types.ts'

export { openHostSync, openHostSyncFromEnv } from './sync.ts'
export { ProactivityHost } from './proactivity.ts'
export { ScreensHost } from './screens.ts'
export { GithubSourceHost, detectGh } from './github.ts'
export {
  assertCliPermission,
  cliPermissionOf,
  createHostRunner,
  permissionFor,
  resolveHostRunner,
} from './runner.ts'
export type { HostPermissionMode, RunnerPurpose } from './runner.ts'
export { ConnectionProbe } from './connection-probe.ts'
export { ACL_EXCEPTIONS } from './auth.ts'
export { OnboardingHost } from './onboarding.ts'
export { HostScheduler } from './scheduler.ts'
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
  /**
   * `typert` is required. `personaRunners` and `webServer` are optional: Cordis
   * treats every `inject` key as required (fiber stays PENDING), so those are
   * read with {@link Context.get} (vendor/cordis reflect).
   */
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
  readonly onboarding: OnboardingHost
  readonly scheduler: HostScheduler
  readonly deadLetters: DeadLetterBook
  readonly connections: ConnectionProbe
  readonly usage: SqliteUsageStore
  readonly webhookGuard: WebhookReplayGuard = new WebhookReplayGuard()
  sessionMemberId: string | undefined
  readonly lastErrors: string[] = []

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
    const screenRepos = new ScreenRepos(this.store)
    this.deadLetters = new DeadLetterBook(screenRepos, () => this.orchestration.now())
    this.usage = new SqliteUsageStore(this.store)
    this.orchestration = new Orchestration(
      this.product, this.events, this.store, () => new Date().toISOString(),
      hostRunnerFromContext(ctx),
      undefined,
      this.deadLetters,
      this.usage,
      new MutantRunBook(screenRepos),
    )
    this.orchestration.vault = this.vault
    this.proactivity = new ProactivityHost(
      this.product,
      this.routines,
      new ProactivityRepos(this.store),
      this.orchestration,
    )
    this.screens = new ScreensHost(
      this.product,
      this.vault,
      screenRepos,
      new SqliteInviteBook(this.store),
      new SqliteImportStore(this.store),
      this.orchestration,
    )
    this.onboarding = new OnboardingHost(this.product, this.events, screenRepos, this.screens)
    this.scheduler = new HostScheduler(this.store, screenRepos)
    this.github = new GithubSourceHost(detectGh(), this.orchestration, this.proactivity)
    this.connections = new ConnectionProbe()
    if (process.env.VITEST !== 'true') {
      this.connections.warm()
      this.orchestration.prewarmAll()
    }
    this.mountGithubWebhook(ctx)
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        this.scheduler.arm(project.id)
      }
    }
    ctx.effect(() => () => {
      this.scheduler.dispose()
      void this.orchestration.disposeRunners()
      this.store.close()
    })
  }

  /**
   * True when Rivet's `personaRunners` plugin is live on this context.
   * @returns Whether `ctx.get('personaRunners')` resolved.
   */
  get usedPersonaRunners(): boolean {
    return runnersOf(this.ctx) !== undefined
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
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) return []
    return this.product.listProjects(request.workspaceId)
      .filter(project => sessionCan(actor, 'read', {
        type: 'project', workspaceId: request.workspaceId, projectId: project.id,
      }))
      .map(project => ({
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
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) return []
    return this.product.listDms(request.projectId)
      .filter(dm => sessionCan(actor, 'read', {
        type: 'dm', workspaceId: request.workspaceId, dmId: dm.id, memberIds: [dm.participantA, dm.participantB],
      }))
      .map(dm => ({
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
    const letters = this.deadLetters.list(request.projectId).map((letter): TaskView => ({
      id: letter.id,
      projectId: request.projectId,
      title: letter.cause,
      stage: 'blocked',
      stageAction: 'retry',
    }))
    return {
      needsYou: [...letters, ...cards.filter(card => card.stage === 'blocked' || card.stage === 'review')],
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
   * Today's pending proposals grouped by persona (Aprovações — resumo diário).
   * @param request - Tenant.
   */
  @Remote
  listDailySummaries(request: ProjectScopeRequest): DailySummaryView[] {
    this.requireProject(request)
    return this.screens.listDailySummaries(request.projectId)
  }

  /**
   * Spatial graph for Canvas: personas, tickets, edges.
   * @param request - Tenant.
   */
  @Remote
  listCanvas(request: ProjectScopeRequest): CanvasGraphView {
    this.requireProject(request)
    return this.screens.listCanvas(request.projectId)
  }

  /**
   * Routines plus scheduler runs (RoutinesView).
   * @param request - Tenant.
   */
  @Remote
  listRoutineSchedule(request: ProjectScopeRequest): RoutineScheduleView[] {
    this.requireProject(request)
    return this.routines.list(request.projectId).map(routine => ({
      id: routine.id,
      projectId: routine.projectId,
      name: routine.name,
      rrule: routine.rrule,
      timeZone: routine.timeZone,
      paused: routine.paused,
      catchUp: routine.catchUp,
      silenceStart: routine.silenceStart ?? '',
      silenceEnd: routine.silenceEnd ?? '',
      runs: this.routines.listRuns(routine.id).map(toRunView),
    }))
  }

  /**
   * Set the project file root. Empty path clears it.
   * @param request - Tenant and absolute path.
   */
  @Remote
  setProjectRoot(request: SetProjectRootRequest): ProjectRootView {
    this.requireProject(request)
    const current = this.product.getProject(request.projectId)
    if (current === undefined) throw new Error('project-not-found')
    if (request.rootPath === '') {
      this.product.updateProject(request.projectId, {
        name: current.name, description: current.description, rootPath: null,
      })
      return emptyRootView(request.projectId, 'cleared', 'Pasta do projeto removida.')
    }
    const decision = validateProjectRoot(request.rootPath, this.product, request.projectId)
    if (!decision.ok) return emptyRootView(request.projectId, 'invalid', decision.message)
    this.product.updateProject(request.projectId, {
      name: current.name, description: current.description, rootPath: decision.path,
    })
    const git = detectProjectGit(decision.path)
    return {
      projectId: request.projectId,
      rootPath: decision.path,
      status: 'ok',
      message: git.isRepo ? (git.dirty ? 'Repositório git com alterações locais.' : 'Repositório git.') : 'Pasta sem git.',
      ...git,
    }
  }

  /**
   * Current folder + git facts. Empty root → need-root.
   * @param request - Tenant.
   */
  @Remote
  getProjectRoot(request: ProjectScopeRequest): ProjectRootView {
    this.requireProject(request)
    const current = this.product.getProject(request.projectId)
    const root = current?.rootPath
    if (root === undefined || root === '') {
      return emptyRootView(request.projectId, 'need-root', 'escolha a pasta do projeto')
    }
    const git = detectProjectGit(root)
    return {
      projectId: request.projectId,
      rootPath: root,
      status: 'ok',
      message: git.isRepo ? (git.dirty ? 'Repositório git com alterações locais.' : 'Repositório git.') : 'Pasta sem git.',
      ...git,
    }
  }

  /**
   * Rivet owns the OS dialog. This host never opens it.
   * @returns Always `path: null` here (Rivet IPC fills it on desktop).
   */
  @Remote
  pickDirectory(): PickDirectoryView {
    return { path: null }
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
    this.orchestration.ingest(stored, request.streamKind, request.ownerId, request.responderId ?? '')
    const ticketed = this.orchestration.runtime(request.projectId).repo.tickets.list()
      .some(ticket => ticket.origin.triggerId === request.id)
    const answered = this.events.has(`coord-${request.id}-reply`)
      || this.events.has(`coord-${request.id}-partial`)
      || (!ticketed && !wantsWork(request.body) && this.canSpeak(request.projectId, request.body, request.responderId))
    if (ticketed || answered) {
      this.screens.recordTriage(request.projectId, {
        at: this.orchestration.now(),
        summary: request.body.slice(0, 80),
        mode: 'execute',
        threadId: request.ownerId,
        gateText: 'mensagem humana',
        assessmentText: ticketed ? 'Ticket' : 'Resposta',
        decidedBy: this.product.listPersonas(request.projectId)
          .find(persona => persona.systemRoles.includes('coordination'))?.name ?? '',
        reason: ticketed ? 'accept' : 'answered',
      })
    }
    return toMessageView(stored)
  }

  /**
   * Page messages with ACL.
   * @param request - Stream, actor, cursor, limit.
   * @returns Authorized page.
   */
  @Remote
  listMessages(request: ListMessagesRequest): MessagePage {
    try {
      this.requireProject(request)
    } catch {
      return { events: [], nextSeq: request.afterSeq }
    }
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) return { events: [], nextSeq: request.afterSeq }
    if (request.streamKind === 'dm') {
      const dm = this.product.getDm(request.ownerId)
      if (dm === undefined || !sessionCan(actor, 'read', {
        type: 'dm', workspaceId: request.workspaceId, dmId: dm.id, memberIds: [dm.participantA, dm.participantB],
      })) {
        return { events: [], nextSeq: request.afterSeq }
      }
    }
    const streamId = `${request.streamKind}:${request.ownerId}`
    try {
      const page = this.events.list(streamId, { id: actor.id }, request.afterSeq, request.limit)
      return { events: page.events.map(toMessageView), nextSeq: page.nextSeq }
    } catch {
      return { events: [], nextSeq: request.afterSeq }
    }
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
      const actor = this.actorOf(request.workspaceId)
      const page = this.events.list(streamId, { id: actor?.id ?? '' }, request.afterSeq, request.limit)
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
    else if (request.command === 'complete') this.orchestration.completeReview(request.projectId, request.ticketId)
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
    const ticket = this.orchestration.runtime(request.projectId).engine.answerAttention(
      request.ticketId, request.text,
    )
    return ticket.attention === undefined
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
    if (this.product.getWorkspace(request.workspaceId) === undefined) {
      return { hasPersonalProject: false, firstUse: true, personalProjectId: '', completed: false }
    }
    return this.onboarding.read(request.workspaceId)
  }

  /**
   * Idempotent first-run: Pessoal, team, cofre proposal, welcome on #geral.
   * @param request - Display name and drafts.
   */
  @Remote
  async completeOnboarding(request: CompleteOnboardingRequest): Promise<OnboardingState> {
    const drafts = await this.onboarding.resolveTeam(request)
    const state = this.onboarding.complete(request, drafts)
    if (state.personalProjectId !== '') {
      this.scheduler.arm(state.personalProjectId)
      void this.orchestration.prewarmProject(state.personalProjectId)
    }
    return state
  }

  /**
   * CLI cards. First paint is `phase: 'checking'` (never a false `not_logged_in`);
   * a 60 s cache and ≥8 s per-CLI timeout run in the background from boot.
   * @param request - Tenant (unused; required for ACL).
   * @returns Connection cards.
   */
  @Remote
  async listConnections(request: ProjectScopeRequest): Promise<ConnectionView[]> {
    this.requireProject(request)
    return this.connections.list()
  }

  /**
   * Folded spend for a period. Server actor + `can(read, project)`.
   * Empty book is `origin: unavailable` — never `usedPercent: 0`.
   * @param request - Period and optional tenant / persona.
   */
  @Remote
  getUsage(request: GetUsageRequest): UsageView {
    this.requireWorkspace(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined && this.product.listMembers(request.workspaceId).length > 0) {
      throw new Error('forbidden')
    }
    const projects = request.projectId === undefined
      ? this.product.listProjects(request.workspaceId)
        .filter(project => actor === undefined || sessionCan(actor, 'read', {
          type: 'project', workspaceId: request.workspaceId, projectId: project.id,
        }))
        .map(project => project.id)
      : (this.requireProject({ workspaceId: request.workspaceId, projectId: request.projectId }), [request.projectId])
    const rows = projects.flatMap(projectId => this.usage.list({
      projectId,
      from: request.period.from,
      to: request.period.to,
      ...(request.personaId === undefined ? {} : { personaId: request.personaId }),
    }))
    const folds = foldUsage(rows.map(row => ({
      provider: row.provider,
      model: row.model,
      window: row.window,
      inputTokens: row.inputTokens,
      outputTokens: row.outputTokens,
      origin: row.origin,
      at: row.at,
    })))
    const tokens = rows.reduce((sum, row) => sum + row.inputTokens + row.outputTokens, 0)
    const origin = folds.length === 0
      ? 'unavailable'
      : folds.reduce((weak, fold) => weakerOrigin(weak, fold.origin), folds[0]!.origin)
    const limit = request.projectId === undefined
      ? undefined
      : this.screens.getLimits(request.workspaceId, request.projectId).tokensPerProjectMonth
    const view: UsageView = {
      period: request.period,
      folds,
      tokens,
      runs: rows.length,
      origin,
      originLabel: originLabelOf(origin),
    }
    return limit === undefined ? view : { ...view, tokensPerMonthLimit: limit }
  }

  /**
   * Official quota windows. Missing vendor data stays `unavailable` (not 0%).
   * @param request - Tenant and optional provider.
   */
  @Remote
  getOfficialQuota(request: GetOfficialQuotaRequest): OfficialQuotaView[] {
    this.requireProject(request)
    const stored = this.usage.listQuota(request.projectId, request.provider)
    if (stored.length > 0) {
      return stored.map((row): OfficialQuotaView => toOfficialView(row))
    }
    const providers = request.provider === undefined ? ['claude', 'codex', 'dsh'] : [request.provider]
    return providers.map(provider => ({ provider, origin: 'unavailable' as const, windows: [] }))
  }

  /**
   * Desktop notification policy: budget, quiet window, summary vs ping.
   * @param request - Tenant.
   */
  @Remote
  getAttentionPolicy(request: ProjectScopeRequest): AttentionPolicyView {
    this.requireProject(request)
    const stored = this.screens.screens.get<AttentionPolicyView>(request.projectId, 'attention_policy', 'default')
    const limits = this.screens.getLimits(request.workspaceId, request.projectId)
    return stored ?? {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      delivery: 'summary',
      proposalBudget: limits.maxProposalsPerDay,
      quietStart: '22:00',
      quietEnd: '07:00',
    }
  }

  /**
   * @param request - Policy.
   */
  @Remote
  putAttentionPolicy(request: PutAttentionPolicyRequest): AttentionPolicyView {
    this.requireProject(request)
    const row: AttentionPolicyView = {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      delivery: request.delivery,
      proposalBudget: request.proposalBudget,
      quietStart: request.quietStart,
      quietEnd: request.quietEnd,
    }
    this.screens.screens.put(request.projectId, 'attention_policy', 'default', row)
    return row
  }

  /**
   * Grouped Precisa de você / review events, filtered by the attention policy.
   * @param request - Tenant.
   * @param signal - Observation lifetime.
   */
  @Remote({ mode: 'stream' })
  async *attentionEvents(request: ProjectScopeRequest, signal: AbortSignal): AsyncIterable<AttentionStreamFrame> {
    this.requireProject(request)
    const snapshot = (): AttentionEventView[] => this.collectAttention(request)
    yield { kind: 'baseline', events: snapshot() }
    let previous = new Set(snapshot().map(item => item.id))
    while (!signal.aborted) {
      await sleep(1_000, signal)
      const next = snapshot()
      const fresh = next.filter(item => !previous.has(item.id))
      previous = new Set(next.map(item => item.id))
      if (fresh.length > 0) yield { kind: 'upsert', events: fresh }
    }
  }

  /**
   * @param request - Tenant.
   */
  @Remote
  getRetentionPolicy(request: ProjectScopeRequest): RetentionPolicyView {
    this.requireProject(request)
    return this.scheduler.getPolicy(request.projectId)
  }

  /**
   * @param request - Policy. `archiveOnly` true (default) never deletes.
   */
  @Remote
  putRetentionPolicy(request: PutRetentionPolicyRequest): RetentionPolicyView {
    this.requireProject(request)
    return this.scheduler.putPolicy(request.projectId, {
      archiveOnly: request.archiveOnly,
      quietStart: request.quietStart,
      quietEnd: request.quietEnd,
    })
  }

  /**
   * Archive tick (archive-only unless the user opted into delete).
   * @param request - Tenant.
   */
  @Remote
  tickRetention(request: ProjectScopeRequest): RetentionLogView[] {
    this.requireProject(request)
    return this.scheduler.tickRetention(request.projectId, true)
  }

  /**
   * @param request - Tenant.
   */
  @Remote
  listRetentionLog(request: ProjectScopeRequest): RetentionLogView[] {
    this.requireProject(request)
    return this.scheduler.listLog(request.projectId)
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
      records: this.orchestration.usedContext.get(ticket.id) ?? [],
    }
  }

  /**
   * Cofre records that entered (or were restricted from) one human message.
   * @param request - Tenant + event id.
   * @returns Contexto usado.
   */
  @Remote
  listUsedContext(request: UsedContextRequest): UsedContextView {
    this.requireProject(request)
    return {
      eventId: request.eventId,
      records: this.orchestration.usedContext.get(request.eventId) ?? [],
    }
  }

  /**
   * Search events the actor may read. Does not leak DMs.
   * @param request - Tenant, actor, query, limit.
   * @returns Authorized hits.
   */
  @Remote
  search(request: SearchRequest): MessageView[] {
    try {
      this.requireProject(request)
    } catch {
      return []
    }
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) return []
    return this.events.search(request.projectId, { id: actor.id }, request.query, request.limit)
      .map(toMessageView)
  }

  /**
   * List one directory under the project's file root.
   * @param request - Tenant, actor, relative path.
   * @returns Direct children.
   */
  @Remote
  listFiles(request: ProjectFileRequest): ProjectFileListing {
    const root = this.requireFileRoot(request)
    if (root === undefined) {
      return { status: 'need-root', path: request.path, entries: [], message: 'escolha a pasta do projeto' }
    }
    return listProjectFiles(root, request.path)
  }

  /**
   * Stat one path under the project's file root.
   * @param request - Tenant, actor, relative path.
   * @returns Kind and size.
   */
  @Remote
  statFile(request: ProjectFileRequest): ProjectFileStat {
    const root = this.requireFileRoot(request)
    if (root === undefined) {
      return { status: 'need-root', path: request.path, kind: 'missing', bytes: 0, message: 'escolha a pasta do projeto' }
    }
    return statProjectFile(root, request.path)
  }

  /**
   * Read a UTF-8 file under the project's file root.
   * @param request - Tenant, actor, relative path.
   * @returns Text and byte length.
   */
  @Remote
  readFile(request: ProjectFileRequest): ProjectFileText {
    const root = this.requireFileRoot(request)
    if (root === undefined) {
      return { status: 'need-root', path: request.path, text: '', bytes: 0, message: 'escolha a pasta do projeto' }
    }
    return readProjectFile(root, request.path)
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
    void this.orchestration.disposeRunners()
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
  async draftPersona(request: DraftPersonaRequest): Promise<PersonaDraft> {
    this.requireProject(request)
    return draftPersonaWithDriver(request.description)
  }

  /**
   * Draft a team from a description. No coordination role is assigned.
   * @param request - Tenant and text.
   * @returns Editable drafts.
   */
  @Remote
  async draftTeam(request: DraftTeamRequest): Promise<PersonaDraft[]> {
    this.requireProject(request)
    return draftTeamWithDriver(request.description)
  }

  /**
   * Cancel an in-flight conversation reply.
   * @param request - Human message id.
   */
  @Remote
  cancelReply(request: CancelReplyRequest): boolean {
    this.requireProject(request)
    this.orchestration.cancelReply(request.eventId)
    return true
  }

  /**
   * Support dump (no secrets, no message bodies).
   * @returns JSON string.
   */
  @Remote
  async exportDiagnostics(): Promise<DiagnosticsJson> {
    const json = stringifyDiagnostics(await collectDiagnostics({
      protocol: PERSONA_PROTOCOL,
      product: this.product,
      store: this.store,
      lastErrors: [...this.lastErrors, ...this.orchestration.lastErrors],
      scheduler: this.scheduler,
    }))
    return { json }
  }

  /**
   * Create the review worktree at assignment start. No folder → task without code.
   * @param request - Ticket.
   */
  @Remote
  async prepareReview(request: TicketCommandRequest): Promise<ReviewSummaryView> {
    this.requireProject(request)
    const ticket = this.orchestration.runtime(request.projectId).repo.tickets.get(request.ticketId)
    const latest = ticket === undefined ? undefined : ticket.assignments.at(-1)
    if (ticket === undefined || latest === undefined) throw new Error('ticket-not-found')
    await this.orchestration.prepareReview(request.projectId, request.ticketId, latest.id)
    return this.reviewSummary(request)
  }

  /**
   * Revisar panel card.
   * @param request - Ticket.
   */
  @Remote
  async reviewSummary(request: TicketCommandRequest): Promise<ReviewSummaryView> {
    this.requireProject(request)
    const sum = await this.orchestration.reviewSummary(request.projectId, request.ticketId)
    return {
      ticketId: sum.ticketId,
      files: sum.files,
      added: sum.added,
      deleted: sum.deleted,
      patch: sum.patch,
      patchTruncated: sum.patchTruncated,
      secretsRedacted: sum.secretsRedacted,
      testsClaimed: sum.testsClaimed,
      hasWorktree: sum.patchLimitBytes > 0 || sum.files.length > 0,
    }
  }

  /**
   * Accept (ff or squash). Conflict → Bloqueado · Precisa de você.
   * @param request - Ticket and mode.
   */
  @Remote
  async acceptReview(request: AcceptReviewRequest): Promise<ReviewAcceptView> {
    this.requireProject(request)
    const result = await this.orchestration.acceptReview(request.projectId, request.ticketId, request.mode)
    if (result.kind === 'merged') {
      this.orchestration.completeReview(request.projectId, request.ticketId)
      return { kind: 'merged', mode: result.mode, explanation: '' }
    }
    return { kind: 'blocked', mode: request.mode, explanation: result.explanation }
  }

  /**
   * New assignment round with feedback. Mandate stays.
   * @param request - Ticket and text.
   */
  @Remote
  async requestChanges(request: RequestChangesRequest): Promise<boolean> {
    this.requireProject(request)
    await this.orchestration.requestChanges(request.projectId, request.ticketId, request.feedback)
    return true
  }

  /**
   * Drop worktree and branch. No push.
   * @param request - Ticket.
   */
  @Remote
  async discardReview(request: TicketCommandRequest): Promise<boolean> {
    this.requireProject(request)
    await this.orchestration.discardReview(request.projectId, request.ticketId)
    return true
  }

  /**
   * Failed effects/outbox that exhausted retries.
   * @param request - Tenant.
   */
  @Remote
  listDeadLetters(request: ProjectScopeRequest): DeadLetterView[] {
    this.requireProject(request)
    return this.deadLetters.list(request.projectId)
  }

  /**
   * Retry a dead letter: drop the card so the next tick can run again.
   * @param request - Letter id.
   */
  @Remote
  retryDeadLetter(request: ScreenDocRequest): boolean {
    this.requireProject(request)
    const found = this.deadLetters.discard(request.projectId, request.id)
    if (found) this.orchestration.retryOutbox(request.projectId)
    return found
  }

  /**
   * Discard a dead letter without retrying.
   * @param request - Letter id.
   */
  @Remote
  discardDeadLetter(request: ScreenDocRequest): boolean {
    this.requireProject(request)
    return this.deadLetters.discard(request.projectId, request.id)
  }

  /**
   * Markdown zip of the workspace. DMs only when listed.
   * @param request - Workspace + optional DMs.
   */
  @Remote
  exportWorkspace(request: ExportRequest): ExportArchiveView {
    this.requireWorkspace(request)
    return toExportView(exportMarkdown(this.product, this.events, this.vault, {
      workspaceId: request.workspaceId,
      includeDmIds: request.includeDmIds,
    }, this.actorOf(request.workspaceId)?.id ?? ''))
  }

  /**
   * Markdown zip of one project. DMs only when listed.
   * @param request - Project + optional DMs.
   */
  @Remote
  exportProject(request: ExportRequest): ExportArchiveView {
    this.requireProject(request)
    return toExportView(exportMarkdown(this.product, this.events, this.vault, {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      includeDmIds: request.includeDmIds,
    }, this.actorOf(request.workspaceId)?.id ?? ''))
  }

  private actorOf(workspaceId: string) {
    return resolveSessionActor(this.product, workspaceId, this.sessionMemberId)
  }

  private canSpeak(projectId: string, body: string, responderId?: string): boolean {
    if (responderId !== undefined && responderId !== '') return true
    if (/@\S+/u.test(body)) return true
    return this.product.listPersonas(projectId).some(persona => persona.systemRoles.includes('coordination'))
  }

  private requireWorkspace(request: { workspaceId: string }): void {
    if (this.product.getWorkspace(request.workspaceId) === undefined) {
      throw new Error('workspace-not-found')
    }
    if (this.product.listMembers(request.workspaceId).length === 0) return
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    if (!sessionCan(actor, 'read', { type: 'workspace', workspaceId: request.workspaceId })) {
      throw new Error('forbidden')
    }
  }

  private requireProject(request: { workspaceId: string; projectId: string }): void {
    this.requireWorkspace(request)
    const project = this.product.getProject(request.projectId)
    if (project === undefined || project.workspaceId !== request.workspaceId) {
      throw new Error('project-not-found')
    }
    if (this.product.listMembers(request.workspaceId).length === 0) return
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    if (!sessionCan(actor, 'read', { type: 'project', workspaceId: request.workspaceId, projectId: request.projectId })) {
      throw new Error('forbidden')
    }
  }

  private collectAttention(request: ProjectScopeRequest): AttentionEventView[] {
    const policy = this.getAttentionPolicy(request)
    if (policy.delivery === 'ping' && inQuietWindow(Date.now(), policy.quietStart, policy.quietEnd)) {
      return []
    }
    const events: AttentionEventView[] = []
    for (const card of this.listTasks(request)) {
      if (card.stage === 'blocked') {
        events.push({
          id: `need:${card.id}`, kind: 'needs-you', title: card.title, ticketId: card.id, at: this.orchestration.now(),
        })
      }
      if (card.stage === 'review') {
        events.push({
          id: `review:${card.id}`, kind: 'review', title: card.title, ticketId: card.id, at: this.orchestration.now(),
        })
      }
    }
    for (const letter of this.deadLetters.list(request.projectId)) {
      events.push({
        id: `dead:${letter.id}`, kind: 'needs-you', title: letter.cause, ticketId: letter.id, at: letter.at,
      })
    }
    return events.slice(0, policy.proposalBudget)
  }

  private mountGithubWebhook(ctx: Context): void {
    const server = webserverOf(ctx)
    if (server === undefined) return
    const handler = githubWebhookHandler({
      secretOf: (projectId: string) => webhookSecretOf(this.vault, projectId),
      ingest: (projectId: string, event: string, action: string, repository: string, deliveryId: string, payload: Record<string, unknown>) => {
        const project = this.product.getProject(projectId)
        if (project === undefined) return { kind: 'ignore', detail: 'project' }
        return this.github.ingest(projectId, {
          deliveryId,
          event: asGithubEvent(event),
          action,
          repository,
          payload,
        }, '')
      },
      now: () => Date.now(),
    }, this.webhookGuard)
    ctx.effect(() => server.register({
      kind: 'exact',
      path: '/api/persona/webhooks/github',
      handler,
    }))
  }

  private requireFileRoot(request: ProjectFileRequest): string | undefined {
    this.requireProject(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('files-forbidden')
    const project = this.product.getProject(request.projectId)
    if (project === undefined) throw new Error('project-not-found')
    if (project.rootPath === undefined || project.rootPath === '') return undefined
    return project.rootPath
  }
}

function toOfficialView(row: import('@deepseek-ai/dsh-persona-store').StoredOfficialQuota): OfficialQuotaView {
  const windows = row.windows.map((window) => {
    const view: import('./types.ts').UsageWindowView = { id: window.id, origin: window.origin }
    return {
      ...view,
      ...(window.usedPercent === undefined ? {} : { usedPercent: window.usedPercent }),
      ...(window.windowMinutes === undefined ? {} : { windowMinutes: window.windowMinutes }),
      ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
    }
  })
  return row.detail === undefined
    ? { provider: row.provider, origin: row.origin, windows }
    : { provider: row.provider, origin: row.origin, windows, detail: row.detail }
}

function originLabelOf(origin: import('./types.ts').UsageOrigin): string {
  if (origin === 'official') return 'oficial da CLI'
  if (origin === 'measured') return 'medido por nós'
  if (origin === 'estimate') return 'estimado'
  return 'indisponível'
}

function weakerOrigin(
  left: import('./types.ts').UsageOrigin,
  right: import('./types.ts').UsageOrigin,
): import('./types.ts').UsageOrigin {
  const rank: Record<import('./types.ts').UsageOrigin, number> = {
    official: 4, measured: 3, estimate: 2, unavailable: 1,
  }
  return rank[left] <= rank[right] ? left : right
}

function emptyRootView(projectId: string, status: ProjectRootView['status'], message: string): ProjectRootView {
  return {
    projectId, rootPath: '', status, message, isRepo: false, defaultBranch: '', dirty: false,
  }
}

function toExportView(archive: { filename: string; bytes: Uint8Array }): ExportArchiveView {
  return { filename: archive.filename, base64: Buffer.from(archive.bytes).toString('base64') }
}

function webhookSecretOf(vault: VaultRepos, projectId: string): string {
  const env = process.env.PERSONA_GITHUB_WEBHOOK_SECRET
  if (env !== undefined && env !== '') return env
  const row = vault.listRecords(projectId).find(item => item.factKey === 'github.webhook.secret')
  return row?.body ?? ''
}

function runnersOf(ctx: Context): import('./runner.ts').PersonaRunnersSlice | undefined {
  return ctx.get('personaRunners')
}

function webserverOf(ctx: Context): {
  register: (route: {
    kind: 'exact'
    path: string
    handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void>
  }) => () => void
} | undefined {
  return ctx.get('webServer')
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
  type?: string
}): MessageView {
  const type = event.type ?? 'message'
  return {
    id: event.id,
    streamId: event.streamId,
    seq: event.seq,
    body: event.body,
    actorId: event.actorId,
    subjectId: event.subjectId,
    occurredAt: event.occurredAt,
    type,
    source: type === 'runner' ? 'runner' : 'host',
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
