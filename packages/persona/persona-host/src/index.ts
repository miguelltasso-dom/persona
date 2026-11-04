/** Persona host service and authenticated Remote controller. */
import { statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  AccountRepos,
  BrainRepos,
  EventRepos,
  GestorRepos,
  OptRepos,
  ProductRepos,
  ProactivityRepos,
  RoutineRepos,
  ScreenRepos,
  SqliteBoardRepos,
  SqliteCardRepos,
  SqliteGovernanceRepos,
  SqliteImportStore,
  SqliteInviteBook,
  SqliteMediaRepos,
  SqliteUsageStore,
  TeachRepos,
  TopicRepos,
  TurnLedgerRepos,
  VaultRepos,
  openPersonaStore,
  wipeProject,
  wipeWorkspace,
  type PersonaStore,
} from '@deepseek-ai/dsh-persona-store'
import { dedupeLimitAccounts, foldUsage, poolProviderLimits, usagePortWindow } from '@deepseek-ai/dsh-persona-usage'
import { resolveSessionActor, sessionCan } from './auth.ts'
import { ConnectionProbe } from './connection-probe.ts'
import { MutantRunBook } from './mutant-run.ts'
import { DeadLetterBook } from './dead-letter.ts'
import { collectDiagnostics, stringifyDiagnostics } from './diagnostics.ts'
import { exportMarkdown } from './export-md.ts'
import { GithubSourceHost, detectGh } from './github.ts'
import { ExternalSourcesHost } from './external-sources.ts'
import { CofreSecretVault } from './cofre-secrets.ts'
import { detectProjectGit, validateProjectRoot } from './project-root.ts'
import { hostRunnerFromContext } from './runner.ts'
import { githubWebhookHandler, WebhookReplayGuard } from './webhook-http.ts'
import { ProactivityHost } from './proactivity.ts'
import { BoardsHost } from './boards.ts'
import { MediaHost, mediaHttpHandler } from './media.ts'
import { VaultDocsHost } from './vault-docs.ts'
import { BrainHost } from './brain.ts'
import { GestorHost } from './gestor.ts'
import {
  SPEAK_REFUSED,
  canAddressPersona,
  cardQuotaOf,
  nowLineOf,
  resolveCharge,
  speakFromTalkAcl,
  talkAclFromSpeak,
} from './persona-card.ts'
import { GovernanceHost } from './governance.ts'
import { ScreensHost } from './screens.ts'
import { draftPersonaWithDriver, draftTeamWithDriver } from './draft.ts'
import { Orchestration, wantsWork } from './orchestration.ts'
import { rememberReviewFeedback } from './feedback-wire.ts'
import { computeActivationFunnel, computePersonaImpact, listPersonaImpact } from '@deepseek-ai/dsh-persona-engine'
import {
  defaultSkillDirIo,
  foldUsagePanel,
  parseBringPaste,
  type SkillDirIo,
} from '@deepseek-ai/dsh-persona-core'
import { selectedBringWrites } from './bring-context-apply.ts'
import { tickInitiativeBatch, tickLibrarianBatch } from './opt-batch.ts'
import { previewBringContextVaultFolder } from './bring-context-walk.ts'
import { foldInsightEvents } from './insights-fold.ts'
import { MediaError } from './media-detect.ts'
import {
  exportPersonaShare,
  exportTeamShare,
  importPersonaShare,
  importTeamShare,
  previewCliSkillViews,
  proposeCliSkillViews,
  rethrowShare,
  specOfPersona,
  specsFromTemplate,
} from './share-remote.ts'
import { OnboardingHost } from './onboarding.ts'
import { HostScheduler, inQuietWindow } from './scheduler.ts'
import { CHAT_STICKERS, isChatSticker } from './stickers.ts'
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
  AckAttentionRequest,
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
  DeleteVaultDocumentRequest,
  IngestVaultDocumentRequest,
  ReplaceVaultDocumentRequest,
  SearchVaultDocumentsRequest,
  VaultChunkHitView,
  VaultDocumentView,
  PreviewBringContextPasteRequest,
  PreviewBringContextVaultFolderRequest,
  BringContextPreviewView,
  ApplyContextProposalsRequest,
  ApplyContextProposalsView,
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
  GetUsagePanelRequest,
  GetUsageRequest,
  OfficialQuotaView,
  RecordTurnLedgerRequest,
  TurnLedgerView,
  UsagePanelView,
  UsageView,
  ExportRequest,
  FetchGithubIssueRequest,
  GithubAvailableView,
  GithubIngestView,
  IngestGithubWebhookRequest,
  PickDirectoryView,
  PostGithubCommentRequest,
  BoardSummaryView,
  CloseSprintRequest,
  CloseSprintView,
  CreateSprintRequest,
  CreateWorkflowRequest,
  MoveTicketRequest,
  MoveTicketView,
  PlanSprintRequest,
  ProjectBoardView,
  ProjectConversationView,
  ProposeWorkflowRequest,
  SprintIdRequest,
  SprintView,
  UpdateSprintRequest,
  UpdateWorkflowRequest,
  AcceptWorkflowProposalRequest,
  WorkflowProposalView,
  WorkflowTemplateView,
  WorkflowView,
  AttachFileRequest,
  AttachmentBytesView,
  AttachmentIdRequest,
  AttachmentView,
  AvatarUploadView,
  ListAttachmentsRequest,
  RemoveAvatarRequest,
  UploadAvatarRequest,
  ApplyGovernanceFixRequest,
  GetOrgChartRequest,
  GovernanceAuditView,
  OrgChartView,
  PersonaCardView,
  PutPersonaChargeRequest,
  RecommendStructureRequest,
  SetAvailabilityRequest,
  SetPersonaEngineRequest,
  SetPersonaGovernanceRequest,
  SetPersonaTalkAclRequest,
  SetResponsibleRequest,
  SetSectorRequest,
  SetSubstituteRequest,
  StructureRecommendationView,
  TalkAclView,
  TeamHealthView,
  TwoDayTestView,
  WorkspaceScopeRequest,
  PollExternalRequest,
  PollExternalView,
  ReplyExternalRequest,
  ReplyExternalView,
  BackupView,
  DeleteSharedProjectRequest,
  DeleteWorkspaceRequest,
  EditMessageRequest,
  MentionSuggestionView,
  MessageAuditView,
  MessageIdRequest,
  ReactMessageRequest,
  ReplyMessageRequest,
  StickerView,
  SuggestMentionsRequest,
  WalCheckpointView,
  ActivationFunnelView,
  CliSkillCandidateView,
  ExportPersonaRequest,
  ExportTeamRequest,
  ImportPersonaRequest,
  ImportPersonaView,
  ImportTeamRequest,
  ImportTeamView,
  PersonaImpactRequest,
  PersonaImpactView,
  ProposeCliSkillsRequest,
  RestoreBackupRequest,
  ShareFileView,
  StoreHealthView,
  AddConnectionAccountRequest,
  ArchiveConversationSubjectRequest,
  ConversationSubjectScope,
  ConversationSubjectsBundleView,
  ConnectionAccountsBundleView,
  CreateConversationSubjectRequest,
  MoveMessageToSubjectRequest,
  RemoveConnectionAccountRequest,
  RenameConversationSubjectRequest,
  SetRunnerSwapPolicyRequest,
  StartTeachSessionRequest,
  StopTeachSessionRequest,
  SubmitTeachDraftRequest,
  TeachDraftView,
  TeachSessionIdRequest,
  TeachSessionStartView,
  TeachSessionView,
  UpdateConnectionAccountRequest,
  BrainGrantIdRequest,
  BrainGrantView,
  BrainHomeView,
  BrainPageIdRequest,
  BrainPageView,
  BrainVaultFolderRequest,
  BrainVaultFolderView,
  BrainVersionView,
  GrantBrainPermissionRequest,
  ListBrainPagesRequest,
  PutBrainPageRequest,
  RestoreBrainPageRequest,
  UseBrainGrantRequest,
  ApproveGestorPlanRequest,
  RejectGestorPlanRequest,
  AssembleTeamRequest,
  AssembleTeamView,
  SystemRoleView,
  GetGestorMandateRequest,
  ListGestorAuditRequest,
  GestorAuditView,
  GestorMandateView,
  GestorPlanView,
  ProposeGestorAssembleRequest,
  ProposeGestorAssembleView,
  ProposeGestorHireRequest,
  ListGestorPlansRequest,
  SetGestorLimitsRequest,
  SetPersonaSystemRolesRequest,
  GetProviderLimitPoolRequest,
  GetSubjectSummaryRequest,
  LibrarianBatchView,
  ProviderLimitPoolView,
  PutProviderLimitReportsRequest,
  SubjectSummaryView,
} from './types.ts'
import {
  isolatedAccountHome,
  resolveAccountSeat,
  storedSwapPolicy,
  subjectViews,
  teachDraftFrom,
  TEACH_CONSENT,
  TEACH_RETENTION_DAYS,
  toStorePolicy,
  nextSubjectColor,
} from './wave2.ts'

export { openHostSync, openHostSyncFromEnv } from './sync.ts'
export { ProactivityHost } from './proactivity.ts'
export { BoardRemoteError, BoardsHost } from './boards.ts'
export { MediaHost } from './media.ts'
export { VaultDocsHost } from './vault-docs.ts'
export { BrainHost } from './brain.ts'
export { GestorHost } from './gestor.ts'
export { GovernanceHost } from './governance.ts'
export { ScreensHost } from './screens.ts'
export { GithubSourceHost, detectGh } from './github.ts'
export { ExternalSourcesHost } from './external-sources.ts'
export type { ExternalSourceEndpoints, SecretVault } from './external-sources.ts'
export {
  assertCliPermission,
  cliPermissionOf,
  permissionFor,
  resolveHostRunner,
} from './runner.ts'
// oxlint-disable-next-line typescript/no-deprecated -- public alias for resolveHostRunner
export { createHostRunner } from './runner.ts'
export type { HostPermissionMode, RunnerPurpose } from './runner.ts'
export { ConnectionProbe } from './connection-probe.ts'
export { ACL_EXCEPTIONS } from './auth.ts'
export { OnboardingHost } from './onboarding.ts'
export { HostScheduler } from './scheduler.ts'
export { CHAT_STICKERS, isChatSticker } from './stickers.ts'
export type { ChatSticker } from './stickers.ts'
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
  readonly boards: BoardsHost
  readonly media: MediaHost
  readonly cards: SqliteCardRepos
  readonly governance: GovernanceHost
  readonly github: GithubSourceHost
  readonly external: ExternalSourcesHost
  readonly onboarding: OnboardingHost
  readonly scheduler: HostScheduler
  readonly deadLetters: DeadLetterBook
  readonly connections: ConnectionProbe
  readonly usage: SqliteUsageStore
  readonly topics: TopicRepos
  readonly accounts: AccountRepos
  readonly teach: TeachRepos
  readonly vaultDocs: VaultDocsHost
  readonly brain: BrainHost
  readonly gestor: GestorHost
  readonly opt: OptRepos
  readonly ledger: TurnLedgerRepos
  readonly webhookGuard: WebhookReplayGuard = new WebhookReplayGuard()
  sessionMemberId: string | undefined
  readonly lastErrors: string[] = []
  skillIo: SkillDirIo = defaultSkillDirIo()

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
    this.boards = new BoardsHost(
      this.product,
      this.events,
      new SqliteBoardRepos(this.store, () => this.orchestration.now()),
      this.orchestration,
    )
    this.media = new MediaHost(
      this.product,
      new SqliteMediaRepos(this.store),
      this.store.path,
      () => this.orchestration.now(),
    )
    this.cards = new SqliteCardRepos(this.store, () => this.orchestration.now())
    this.governance = new GovernanceHost(
      this.product,
      this.cards,
      new SqliteGovernanceRepos(this.store, () => this.orchestration.now()),
      this.routines,
      this.proactivity,
      () => this.orchestration.now(),
    )
    this.orchestration.attachmentNamesOf = eventId => this.media.namesOf(eventId)
    this.orchestration.stageAttachments = (eventId, dest, hasVision) =>
      this.media.stageForRunner(eventId, dest, hasVision === true).stagedNames
    this.screens = new ScreensHost(
      this.product,
      this.vault,
      screenRepos,
      new SqliteInviteBook(this.store),
      new SqliteImportStore(this.store),
      this.orchestration,
    )
    this.orchestration.screens = screenRepos
    this.onboarding = new OnboardingHost(this.product, this.events, screenRepos, this.screens)
    this.scheduler = new HostScheduler(this.store, screenRepos)
    this.github = new GithubSourceHost(detectGh(), this.orchestration, this.proactivity)
    this.external = new ExternalSourcesHost(this.orchestration, new CofreSecretVault(this.vault, this.product))
    this.connections = new ConnectionProbe()
    this.topics = new TopicRepos(this.store, () => this.orchestration.now())
    this.accounts = new AccountRepos(this.store, () => this.orchestration.now())
    this.teach = new TeachRepos(this.store, () => this.orchestration.now())
    this.vaultDocs = new VaultDocsHost(this.product, this.vault, workspaceId => this.actorOf(workspaceId))
    const brainRepos = new BrainRepos(this.store, () => this.orchestration.now())
    this.brain = new BrainHost(this.product, brainRepos, workspaceId => this.actorOf(workspaceId))
    this.gestor = new GestorHost(
      this.product,
      new GestorRepos(this.store, () => this.orchestration.now()),
      () => this.orchestration.now(),
    )
    this.opt = new OptRepos(this.store, () => this.orchestration.now())
    this.ledger = new TurnLedgerRepos(this.store)
    this.orchestration.opt = this.opt
    this.orchestration.recordLedger = (projectId, entry) => {
      this.persistTurn(projectId, entry)
    }
    this.orchestration.accounts = this.accounts
    this.orchestration.accountSeatOf = (projectId, persona) => this.seatForPersona(projectId, persona)
    if (this.store.recoveryMessage !== undefined) this.lastErrors.push(this.store.recoveryMessage)
    if (process.env.VITEST !== 'true') {
      this.connections.warm()
      this.orchestration.prewarmAll()
    }
    this.mountGithubWebhook(ctx)
    this.mountMedia(ctx)
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
   * Aggregated Muse card: now-line, presence, charge, engine, official quota.
   * @param request - Persona.
   */
  @Remote
  getPersonaCard(request: PersonaScopeRequest): PersonaCardView {
    this.requireProject(request)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined || persona.projectId !== request.projectId) throw new Error('persona-not-found')
    const project = this.product.getProject(request.projectId)
    const charge = resolveCharge(this.product, this.cards, persona.id)
    const sectorId = this.cards.getCharge(persona.id)?.sectorId
    const sectorName = sectorId === undefined ? undefined : this.governance.gov.getSector(sectorId)?.name
    const nowRow = this.proactivity.overviewNow(request.projectId).personas.find(row => row.personaId === persona.id)
    const task = this.listTasks(request).find(row => row.id === nowRow?.currentTaskId)
    const provider = persona.runner.kind === 'cli' ? persona.runner.cli : 'dsh'
    const quota = cardQuotaOf(this.usage, request.projectId, provider)
    const runtime = this.personaRuntime(request.projectId, persona.id)
    const runnerLabel = persona.runner.kind === 'cli' ? persona.runner.cli : 'dsh'
    const now = nowLineOf({
      paused: runtime.paused,
      state: nowRow?.state ?? 'resting',
      title: nowRow?.currentTask ?? '',
      stage: task?.stage ?? '',
      engineLabel: runnerLabel,
      lastActiveAt: nowRow !== undefined && nowRow.currentTaskId !== ''
        ? this.orchestration.now()
        : persona.updatedAt,
      limitedUntil: quota?.limitedUntil ?? '',
    })
    return {
      personaId: persona.id,
      handle: handleOf(persona.name),
      name: persona.name,
      title: persona.title,
      systemRoles: persona.systemRoles,
      nowKind: now.nowKind,
      nowText: now.nowText,
      presence: now.presence,
      engine: { runnerLabel, modelLabel: persona.runner.model },
      ...(project === undefined ? {} : { currentProjectName: project.name }),
      ...(charge.ownerName === undefined ? {} : { ownerName: charge.ownerName }),
      ...(charge.substituteName === undefined ? {} : { substituteName: charge.substituteName }),
      ...(sectorName === undefined ? {} : { sectorName }),
      ...(quota === undefined ? {} : { quota }),
      ...this.activeAccountView(request.workspaceId, persona.id, provider),
    }
  }

  /**
   * Who may DM or @mention this persona.
   * @param request - Persona.
   */
  @Remote
  getPersonaTalkAcl(request: PersonaScopeRequest): TalkAclView {
    this.requireProject(request)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined || persona.projectId !== request.projectId) throw new Error('persona-not-found')
    return talkAclFromSpeak(this.product, this.cards.getSpeak(request.personaId))
  }

  /**
   * Replace talk ACL. Responsável or workspace owner.
   * @param request - Mode and principals.
   */
  @Remote
  setPersonaTalkAcl(request: SetPersonaTalkAclRequest): TalkAclView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    const stored = speakFromTalkAcl({ mode: request.mode, principals: request.principals })
    this.cards.putSpeak({
      personaId: request.personaId,
      mode: stored.mode,
      principalIds: stored.principalIds,
    })
    this.auditPersona(request.projectId, request.personaId, 'talk-acl')
    return this.getPersonaTalkAcl(request)
  }

  /**
   * Replace responsável / substituto. Responsável or workspace owner.
   * @param request - Human ids (`substituteHumanId` empty clears).
   */
  @Remote
  putPersonaCharge(request: PutPersonaChargeRequest): PersonaCardView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    if (request.substituteHumanId !== '' && request.substituteHumanId === request.responsibleHumanId) {
      throw new Error('substitute-is-responsible')
    }
    this.cards.putCharge({
      personaId: request.personaId,
      responsibleHumanId: request.responsibleHumanId,
      confirmed: true,
      ...(request.substituteHumanId === '' ? {} : { substituteHumanId: request.substituteHumanId }),
    })
    this.auditPersona(request.projectId, request.personaId, 'charge')
    return this.getPersonaCard(request)
  }

  /**
   * Pause a persona (card `offline`; no new talk/task from others).
   * @param request - Persona.
   */
  @Remote
  pausePersona(request: PersonaScopeRequest): PersonaCardView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    this.orchestration.setPersonaPaused(request.projectId, request.personaId, true)
    this.auditPersona(request.projectId, request.personaId, 'pause')
    return this.getPersonaCard(request)
  }

  /**
   * Resume a paused persona.
   * @param request - Persona.
   */
  @Remote
  resumePersona(request: PersonaScopeRequest): PersonaCardView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    this.orchestration.setPersonaPaused(request.projectId, request.personaId, false)
    this.auditPersona(request.projectId, request.personaId, 'resume')
    return this.getPersonaCard(request)
  }

  /**
   * Change the persona runner. Responsável or workspace owner.
   * @param request - Engine.
   */
  @Remote
  setPersonaEngine(request: SetPersonaEngineRequest): PersonaCardView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined) throw new Error('persona-not-found')
    this.product.updatePersona({
      ...persona,
      runner: request.runnerKind === 'dsh'
        ? { kind: 'dsh', model: request.runnerModel }
        : { kind: 'cli', cli: asCli(request.runnerCli), model: request.runnerModel },
      updatedAt: this.orchestration.now(),
    }, request.projectId)
    this.auditPersona(request.projectId, request.personaId, 'engine')
    return this.getPersonaCard(request)
  }

  /**
   * Organogram by person or sector.
   * @param request - Workspace and grouping.
   */
  @Remote
  getOrgChart(request: GetOrgChartRequest): OrgChartView {
    this.requireWorkspace(request)
    return this.governance.orgChartView(request)
  }

  /**
   * Team health in plain language.
   * @param request - Workspace.
   */
  @Remote
  getTeamHealth(request: WorkspaceScopeRequest): TeamHealthView {
    this.requireWorkspace(request)
    return this.withGestorAudit(request.workspaceId, this.governance.healthView(request.workspaceId))
  }

  /**
   * Fake-clock 48h walk over the live configuration.
   * @param request - Workspace.
   */
  @Remote
  runTwoDayTest(request: WorkspaceScopeRequest): TwoDayTestView {
    this.requireWorkspace(request)
    return this.governance.twoDayView(request.workspaceId)
  }

  /**
   * 1-click correction. Owner only.
   * @param request - Finding.
   */
  @Remote
  applyFix(request: ApplyGovernanceFixRequest): TeamHealthView {
    this.requireGovOwner(request.workspaceId)
    return this.withGestorAudit(
      request.workspaceId,
      this.governance.applyFix(request, this.actorOf(request.workspaceId)?.id ?? ''),
    )
  }

  /**
   * Alias for {@link applyFix} (Lumen client name).
   * @param request - Finding.
   */
  @Remote
  applyGovernanceFix(request: ApplyGovernanceFixRequest): TeamHealthView {
    this.requireGovOwner(request.workspaceId)
    return this.applyFix(request)
  }

  /**
   * Replace the responsável. Owner only.
   * @param request - Persona and human.
   */
  @Remote
  setResponsible(request: SetResponsibleRequest): OrgChartView {
    this.requireGovOwner(request.workspaceId)
    this.governance.setResponsible(request.workspaceId, request.personaId, request.humanId, this.actorOf(request.workspaceId)?.id ?? '')
    return this.governance.orgChartView({ workspaceId: request.workspaceId, groupBy: 'person' })
  }

  /**
   * Replace the substituto. Empty `humanId` clears. Owner only.
   * @param request - Persona and human.
   */
  @Remote
  setSubstitute(request: SetSubstituteRequest): OrgChartView {
    this.requireGovOwner(request.workspaceId)
    this.governance.setSubstitute(request.workspaceId, request.personaId, request.humanId, this.actorOf(request.workspaceId)?.id ?? '')
    return this.governance.orgChartView({ workspaceId: request.workspaceId, groupBy: 'person' })
  }

  /**
   * Assign a sector. Empty `sectorId` clears. Owner only.
   * @param request - Persona and sector.
   */
  @Remote
  setSector(request: SetSectorRequest): OrgChartView {
    this.requireGovOwner(request.workspaceId)
    this.governance.setSector(request.workspaceId, request.personaId, request.sectorId, this.actorOf(request.workspaceId)?.id ?? '')
    return this.governance.orgChartView({ workspaceId: request.workspaceId, groupBy: 'sector' })
  }

  /**
   * Mark a human away or available. Owner or the human themselves.
   * @param request - Window.
   */
  @Remote
  setAvailability(request: SetAvailabilityRequest): OrgChartView {
    this.requireGovAvailability(request.workspaceId, request.humanId)
    this.governance.setAvailability(request, this.actorOf(request.workspaceId)?.id ?? '')
    return this.governance.orgChartView({ workspaceId: request.workspaceId, groupBy: 'person' })
  }

  /**
   * Editor write: responsável + substituto + setor. Owner only.
   * @param request - Fields.
   */
  @Remote
  setPersonaGovernance(request: SetPersonaGovernanceRequest): PersonaCardView {
    this.requireWrite(request)
    this.requireGovOwner(request.workspaceId)
    this.governance.setPersonaGovernance(request, this.actorOf(request.workspaceId)?.id ?? '')
    return this.getPersonaCard(request)
  }

  /**
   * Structure assistant preview. Does not persist.
   * @param request - Company ask.
   */
  @Remote
  recommendStructure(request: RecommendStructureRequest): StructureRecommendationView {
    this.requireWorkspace(request)
    return this.governance.recommend(request)
  }

  /**
   * Persist sectors and routine owners from the recommendation. Does not hire.
   * @param request - Company ask.
   */
  @Remote
  applyStructure(request: RecommendStructureRequest): StructureRecommendationView {
    this.requireGovOwner(request.workspaceId)
    return this.governance.applyStructure(request, this.actorOf(request.workspaceId)?.id ?? '')
  }

  /**
   * Who approved what, in whose name.
   * @param request - Workspace.
   */
  @Remote
  listAudit(request: WorkspaceScopeRequest): GovernanceAuditView[] {
    this.requireWorkspace(request)
    return this.governance.listAudit(request.workspaceId)
  }

  /**
   * Read Gestor de equipe limits (default always_ask).
   * @param request - Persona.
   */
  @Remote
  getGestorMandate(request: GetGestorMandateRequest): GestorMandateView {
    this.requireWorkspace(request)
    return this.gestor.getMandate(request)
  }

  /**
   * Owner writes Gestor de equipe ceiling.
   * @param request - Limits.
   */
  @Remote
  setGestorLimits(request: SetGestorLimitsRequest): GestorMandateView {
    this.requireGovOwner(request.workspaceId)
    return this.gestor.setLimits(request)
  }

  /**
   * Propose a hire. always_ask stays pending; auto applies when in limits.
   * @param request - Draft.
   */
  @Remote
  proposeGestorHire(request: ProposeGestorHireRequest): GestorPlanView {
    this.requireWorkspace(request)
    return this.gestor.proposeHire(request)
  }

  /**
   * Human accept of a pending Gestor plan.
   * @param request - Plan.
   */
  @Remote
  approveGestorPlan(request: ApproveGestorPlanRequest): GestorPlanView {
    this.requireWorkspace(request)
    return this.gestor.approvePlan(request)
  }

  /**
   * Human decline of a pending Gestor plan.
   * @param request - Plan.
   */
  @Remote
  rejectGestorPlan(request: RejectGestorPlanRequest): GestorPlanView {
    this.requireWorkspace(request)
    return this.gestor.rejectPlan(request)
  }

  /**
   * Open Gestor plans awaiting human approval (chat cards).
   * @param request - Workspace.
   */
  @Remote
  listGestorPlans(request: ListGestorPlansRequest): GestorPlanView[] {
    this.requireWorkspace(request)
    return this.gestor.listPlans(request)
  }

  /**
   * Goal sentence → pending assemble plan + structure preview (chat card).
   * @param request - Gestor + goal.
   */
  @Remote
  proposeGestorAssemble(request: ProposeGestorAssembleRequest): ProposeGestorAssembleView {
    this.requireWorkspace(request)
    return this.gestor.proposeAssemble(request)
  }

  /**
   * Assign system roles (Coordenação, Vigia, Gestor de equipe).
   * @param request - Persona and roles.
   */
  @Remote
  setPersonaSystemRoles(request: SetPersonaSystemRolesRequest): PersonaCardView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined || persona.projectId !== request.projectId) throw new Error('persona-not-found')
    const roles = [...request.systemRoles]
    const now = this.orchestration.now()
    if (roles.includes('coordination')) {
      for (const row of this.product.listPersonas(request.projectId)) {
        if (row.id === request.personaId) continue
        if (!row.systemRoles.includes('coordination')) continue
        this.product.updatePersona({
          ...row,
          systemRoles: row.systemRoles.filter(role => role !== 'coordination'),
          updatedAt: now,
        }, request.projectId)
      }
    }
    this.product.updatePersona({ ...persona, systemRoles: roles, updatedAt: now }, request.projectId)
    this.auditPersona(request.projectId, request.personaId, 'engine')
    return this.getPersonaCard(request)
  }

  /**
   * Preview: team + flow + sprint 1 from a goal sentence.
   * @param request - Goal.
   */
  @Remote
  assembleTeamForGoal(request: AssembleTeamRequest): AssembleTeamView {
    this.requireWorkspace(request)
    return this.gestor.assemble(request)
  }

  /**
   * Gestor de equipe audit trail.
   * @param request - Workspace.
   */
  @Remote
  listGestorAudit(request: ListGestorAuditRequest): GestorAuditView[] {
    this.requireWorkspace(request)
    return this.gestor.listAudit(request)
  }

  /**
   * Poll Telegram / e-mail / Slack / Discord / CalDAV into the project engine.
   * Missing vault token skips that source. Tokens never appear in the view.
   * @param request - Tenant + vault owner.
   * @returns Intake results (`stored` / `duplicate` / `filtered`).
   */
  @Remote
  async pollExternal(request: PollExternalRequest): Promise<PollExternalView> {
    this.requireProject(request)
    const { results } = await this.external.poll(request.projectId, request.personId)
    return { results }
  }

  /**
   * Reply on the inbound origin. Missing token ⇒ `{ ok: false }` (no throw).
   * @param request - Origin address + body. No token on the wire.
   * @returns Whether the outbound send succeeded.
   */
  @Remote
  async replyExternal(request: ReplyExternalRequest): Promise<ReplyExternalView> {
    this.requireProject(request)
    this.requireWrite(request)
    return this.external.replyOrigin(request.personId, {
      source: request.source,
      ...(request.chat === undefined ? {} : { chat: request.chat }),
      ...(request.channel === undefined ? {} : { channel: request.channel }),
      ...(request.to === undefined ? {} : { to: request.to }),
      ...(request.subject === undefined ? {} : { subject: request.subject }),
    }, request.text)
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
   * Project board: flow, cards, counts, current sprint.
   * @param request - Tenant.
   */
  @Remote
  getProjectBoard(request: ProjectScopeRequest): ProjectBoardView {
    this.requireProject(request)
    return this.boards.getProjectBoard(request.projectId)
  }

  /**
   * Quadros list: one mini-summary per project. DMs are never included.
   * @param request - Workspace.
   */
  @Remote
  listBoards(request: ProjectScopeRequest): BoardSummaryView[] {
    this.requireWorkspace(request)
    return this.boards.listBoards(request.workspaceId)
  }

  /**
   * Built-in flow catalog for the Quadros / create-project picker.
   * @param request - Workspace (ACL).
   */
  @Remote
  listWorkflowTemplates(request: ProjectScopeRequest): WorkflowTemplateView[] {
    this.requireWorkspace(request)
    return this.boards.listWorkflowTemplates()
  }

  /**
   * Persist a built-in template. Coordination proposals do not call this.
   * @param request - Template id.
   */
  @Remote
  createWorkflowFromTemplate(request: CreateWorkflowRequest): WorkflowView {
    this.requireWrite(request)
    return this.boards.createWorkflowFromTemplate(request)
  }

  /**
   * Replace columns. Tickets on a removed column need a remaining destination.
   * @param request - Columns + dest map.
   */
  @Remote
  updateWorkflow(request: UpdateWorkflowRequest): WorkflowView {
    this.requireWrite(request)
    return this.boards.updateWorkflow(request)
  }

  /**
   * Move a ticket onto a column. WIP is a warning, not a refusal.
   * @param request - Ticket + column.
   */
  @Remote
  moveTicket(request: MoveTicketRequest): MoveTicketView {
    this.requireWrite(request)
    return this.boards.moveTicket(request.projectId, request.ticketId, request.columnId)
  }

  /**
   * @param request - Tenant.
   */
  @Remote
  listSprints(request: ProjectScopeRequest): SprintView[] {
    this.requireProject(request)
    return this.boards.listSprints(request.projectId)
  }

  /**
   * @param request - Sprint copy.
   */
  @Remote
  createSprint(request: CreateSprintRequest): SprintView {
    this.requireWrite(request)
    return this.boards.createSprint(request)
  }

  /**
   * @param request - Sprint + ticket ids.
   */
  @Remote
  planSprint(request: PlanSprintRequest): SprintView {
    this.requireWrite(request)
    return this.boards.planSprint(request)
  }

  /**
   * @param request - Sprint id.
   */
  @Remote
  startSprint(request: SprintIdRequest): SprintView {
    this.requireWrite(request)
    return this.boards.startSprint(request.projectId, request.sprintId)
  }

  /**
   * Rename or redate a sprint.
   * @param request - Fields to replace.
   */
  @Remote
  updateSprint(request: UpdateSprintRequest): SprintView {
    this.requireWrite(request)
    return this.boards.updateSprint(request)
  }

  /**
   * Drop a sprint. Tickets stay; seat.sprintId clears.
   * @param request - Sprint id.
   */
  @Remote
  deleteSprint(request: SprintIdRequest): boolean {
    this.requireWrite(request)
    return this.boards.deleteSprint(request.projectId, request.sprintId)
  }

  /**
   * Close after the person confirms leftover destination.
   * @param request - Leftover + confirm.
   */
  @Remote
  closeSprint(request: CloseSprintRequest): CloseSprintView {
    this.requireWrite(request)
    return this.boards.closeSprint(request)
  }

  /**
   * Peak-end digest without closing.
   * @param request - Sprint id.
   */
  @Remote
  sprintSummary(request: SprintIdRequest): string {
    this.requireProject(request)
    return this.boards.sprintSummary(request.projectId, request.sprintId)
  }

  /**
   * Propose a flow from the project description. Never writes until accept.
   * @param request - Description or Coordination JSON.
   */
  @Remote
  proposeWorkflow(request: ProposeWorkflowRequest): WorkflowProposalView {
    this.requireProject(request)
    return this.boards.proposeWorkflow(request)
  }

  /**
   * Apply the «Usar este fluxo?» card. Never called by `proposeWorkflow`.
   * @param request - Columns from the card + dest map.
   */
  @Remote
  acceptWorkflowProposal(request: AcceptWorkflowProposalRequest): WorkflowView {
    this.requireWrite(request)
    return this.boards.acceptWorkflowProposal(request)
  }

  /**
   * Decline the card. Store stays as it was.
   * @param request - Tenant.
   */
  @Remote
  rejectWorkflowProposal(request: ProjectScopeRequest): WorkflowView {
    this.requireWrite(request)
    return this.boards.rejectWorkflowProposal(request.projectId)
  }

  /**
   * `#geral` of this project (PB-5 Conversa). Creates it when missing.
   * @param request - Tenant.
   */
  @Remote
  getProjectConversation(request: ProjectScopeRequest): ProjectConversationView {
    this.requireProject(request)
    return this.ensureProjectConversation(request.workspaceId, request.projectId)
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
   * Bibliotecário lote: só páginas mudadas desde o cursor.
   * @param request - Tenant.
   */
  @Remote
  tickLibrarianBatch(request: ProjectScopeRequest): LibrarianBatchView {
    this.requireProject(request)
    return tickLibrarianBatch(
      this.brain.brain,
      this.opt,
      request.projectId,
      () => this.orchestration.now(),
    )
  }

  /**
   * Iniciativa lote: só quando o projeto teve evento desde a última passada.
   * @param request - Tenant, lease, stall.
   */
  @Remote
  tickInitiativeBatch(request: TickProactivityRequest): ProactivityTickView {
    this.requireProject(request)
    return tickInitiativeBatch(
      this.proactivity,
      this.events,
      this.opt,
      request.projectId,
      request.leaseUntil,
      request.stallAfterMs,
    )
  }

  /**
   * Incremental subject fold (resumo + last_seq).
   * @param request - Topic.
   */
  @Remote
  getSubjectSummary(request: GetSubjectSummaryRequest): SubjectSummaryView {
    this.requireProject(request)
    const row = this.opt.getSummary(request.topicId)
    return {
      topicId: request.topicId,
      summary: row?.summary ?? '',
      lastSeq: row?.lastSeq ?? 0,
      messageCount: row?.messageCount ?? 0,
    }
  }

  /**
   * Persist Rivet harvest reports as one pool per provider (same login once).
   * @param request - Per-environment reports.
   */
  @Remote
  putProviderLimitReports(request: PutProviderLimitReportsRequest): ProviderLimitPoolView[] {
    this.requireProject(request)
    const now = Date.parse(this.orchestration.now())
    const pools = poolProviderLimits(dedupeLimitAccounts(request.reports), Number.isFinite(now) ? now : 0)
    for (const pool of pools) this.opt.putPool(request.projectId, pool.provider, pool)
    return pools.map(toPoolView)
  }

  /**
   * Folded provider limit pool.
   * @param request - Tenant + optional provider.
   */
  @Remote
  getProviderLimitPool(request: GetProviderLimitPoolRequest): ProviderLimitPoolView[] {
    this.requireProject(request)
    return this.opt.listPools(request.projectId, request.provider).map(row => toPoolView(row.body))
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
    if (request.template !== undefined) {
      this.boards.createWorkflowFromTemplate({
        workspaceId: request.workspaceId,
        projectId: project.id,
        template: request.template,
      })
    }
    this.ensureProjectConversation(request.workspaceId, project.id)
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
    const owner = this.product.listMembers(request.workspaceId).find(row => row.role === 'owner')
    this.cards.putCharge({
      personaId: stored.id,
      responsibleHumanId: request.createdBy === '' ? (owner?.id ?? request.createdBy) : request.createdBy,
      confirmed: true,
    })
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
    const actor = this.actorOf(request.workspaceId)
    if (actor !== undefined) {
      this.assertCanAddress(request.workspaceId, request.participantA, actor.id)
      this.assertCanAddress(request.workspaceId, request.participantB, actor.id)
    }
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
    const actor = this.actorOf(request.workspaceId)
    if (actor !== undefined) {
      if (request.streamKind === 'dm') {
        const dm = this.product.getDm(request.ownerId)
        if (dm !== undefined) {
          this.assertCanAddress(request.workspaceId, dm.participantA, actor.id)
          this.assertCanAddress(request.workspaceId, dm.participantB, actor.id)
        }
      }
      for (const persona of this.product.listPersonas(request.projectId)) {
        if (request.body.includes(`@${persona.name}`)) {
          this.assertCanAddress(request.workspaceId, persona.id, actor.id)
        }
      }
    }
    const topicId = request.topicId
      ?? this.activeSubjectId(request.projectId, request.streamKind, request.ownerId)
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
      ...(request.replyToId === undefined || request.replyToId === '' ? {} : { replyToId: request.replyToId }),
      ...(topicId === undefined || topicId === '' ? {} : { topicId }),
    })
    this.media.bindToMessage(
      stored.id,
      request.attachmentIds ?? [],
      request.projectId,
      request.streamKind,
      request.ownerId,
    )
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
    return this.viewMessage(stored)
  }

  /**
   * Store one file on a channel or DM. Bind ids with `postMessage.attachmentIds`.
   * @param request - Stream + base64 bytes.
   */
  @Remote
  attachFile(request: AttachFileRequest): AttachmentView {
    this.requireWrite(request)
    this.assertStreamWrite(request)
    const bytes = decodeBase64(request.bytesBase64)
    try {
      return this.media.attachFile({
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        streamKind: request.streamKind,
        ownerId: request.ownerId,
        name: request.name,
        bytes,
      })
    } catch (error: unknown) {
      throwMedia(error)
    }
  }

  /**
   * List attachments of a message, or of the stream when `messageId` is empty.
   * @param request - Message or stream.
   */
  @Remote
  listAttachments(request: ListAttachmentsRequest): AttachmentView[] {
    try {
      this.requireProject(request)
    } catch {
      return []
    }
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) return []
    if (request.streamKind === 'dm') {
      const dm = this.product.getDm(request.ownerId)
      if (dm === undefined || (actor.id !== dm.participantA && actor.id !== dm.participantB)) return []
    }
    if (request.messageId !== '') return this.media.listByMessage(request.messageId)
    return this.media.listByStream(request.projectId, request.streamKind, request.ownerId)
  }

  /**
   * Attachment metadata. ACL: channel = workspace member; DM = participants.
   * @param request - Attachment id.
   */
  @Remote
  getAttachment(request: AttachmentIdRequest): AttachmentView {
    this.requireProject(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    const row = this.media.requireReadable(request.attachmentId, actor.id)
    return {
      id: row.id,
      name: row.name,
      mime: row.mime,
      bytes: row.bytes,
      hash: row.hash,
      credentialWarning: row.credentialWarning,
      messageId: row.messageId ?? '',
    }
  }

  /**
   * Attachment bytes as base64. Same ACL as {@link getAttachment}.
   * @param request - Attachment id.
   */
  @Remote
  getAttachmentBytes(request: AttachmentIdRequest): AttachmentBytesView {
    this.requireProject(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    return this.media.readAttachment(request.attachmentId, actor.id)
  }

  /**
   * Upload a PNG/JPEG/WebP avatar (≤ 2 MB, max edge 2048). SVG refused.
   * @param request - Persona + bytes.
   */
  @Remote
  uploadPersonaAvatar(request: UploadAvatarRequest): AvatarUploadView {
    this.requireWrite(request)
    const bytes = decodeBase64(request.bytesBase64)
    let stored: { hash: string; mime: string }
    try {
      stored = this.media.uploadAvatar(request.personaId, request.projectId, request.name, bytes)
    } catch (error: unknown) {
      throwMedia(error)
    }
    return {
      personaId: request.personaId,
      avatarKind: 'upload',
      avatarRef: stored.hash,
      mime: stored.mime,
    }
  }

  /**
   * Remove an uploaded avatar. Unused blob is deleted.
   * @param request - Persona.
   */
  @Remote
  removePersonaAvatar(request: RemoveAvatarRequest): boolean {
    this.requireWrite(request)
    this.media.removeAvatar(request.personaId, request.projectId)
    return true
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
      const page = request.topicId === undefined || request.topicId === ''
        ? this.events.list(streamId, { id: actor.id }, request.afterSeq, request.limit)
        : this.events.listTopic(streamId, { id: actor.id }, request.topicId, request.afterSeq, request.limit)
      return { events: page.events.map(event => this.viewMessage(event)), nextSeq: page.nextSeq }
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
      queue.push(this.viewMessage(event))
    })
    try {
      const actor = this.actorOf(request.workspaceId)
      const page = this.events.list(streamId, { id: actor?.id ?? '' }, request.afterSeq, request.limit)
      const events = page.events.map(event => this.viewMessage(event))
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
   * Brush sticker catalog (ids Muse binds in the composer).
   */
  @Remote
  listStickers(): StickerView[] {
    return CHAT_STICKERS.map(item => ({ id: item.id, asset: item.asset }))
  }

  /**
   * Add the session actor's sticker on a message.
   * @param request - Event + catalog id.
   */
  @Remote
  reactToMessage(request: ReactMessageRequest): MessageView {
    this.requireWrite(request)
    const event = this.requireAliveMessage(request)
    if (!isChatSticker(request.stickerId)) throw new Error('unknown-sticker')
    const actor = this.requireActor(request.workspaceId)
    this.events.addReaction({
      eventId: event.id, actorId: actor.id, stickerId: request.stickerId, projectId: request.projectId,
    })
    this.events.addAudit({
      id: `react:${event.id}:${actor.id}:${request.stickerId}`,
      eventId: event.id, projectId: request.projectId, actorId: actor.id,
      action: 'react', detail: request.stickerId,
    })
    return this.viewMessage(event)
  }

  /**
   * Remove the session actor's sticker.
   * @param request - Event + catalog id.
   */
  @Remote
  unreactToMessage(request: ReactMessageRequest): MessageView {
    this.requireWrite(request)
    const event = this.requireAliveMessage(request)
    const actor = this.requireActor(request.workspaceId)
    this.events.removeReaction({ eventId: event.id, actorId: actor.id, stickerId: request.stickerId })
    this.events.addAudit({
      id: `unreact:${event.id}:${actor.id}:${request.stickerId}:${this.orchestration.now()}`,
      eventId: event.id, projectId: request.projectId, actorId: actor.id,
      action: 'unreact', detail: request.stickerId,
    })
    return this.viewMessage(event)
  }

  /**
   * Post a reply that quotes `eventId` (same stream).
   * @param request - Parent + body.
   */
  @Remote
  replyToMessage(request: ReplyMessageRequest): MessageView {
    this.requireWrite(request)
    const parent = this.requireAliveMessage(request)
    const kind = parent.streamId.startsWith('dm:') ? 'dm' : 'channel'
    const ownerId = parent.streamId.slice(kind.length + 1)
    return this.postMessage({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      streamKind: kind,
      ownerId,
      body: request.body,
      actorId: this.requireActor(request.workspaceId).id,
      subjectId: parent.subjectId,
      occurredAt: this.orchestration.now(),
      replyToId: parent.id,
    })
  }

  /**
   * Pin a message on its stream.
   * @param request - Event.
   */
  @Remote
  pinMessage(request: MessageIdRequest): MessageView {
    this.requireWrite(request)
    const event = this.requireAliveMessage(request)
    const actor = this.requireActor(request.workspaceId)
    this.events.pin({
      streamId: event.streamId, eventId: event.id, projectId: request.projectId, pinnedBy: actor.id,
    })
    this.events.addAudit({
      id: `pin:${event.id}:${this.orchestration.now()}`,
      eventId: event.id, projectId: request.projectId, actorId: actor.id,
      action: 'pin', detail: '',
    })
    return this.viewMessage(event)
  }

  /**
   * Unpin a message.
   * @param request - Event.
   */
  @Remote
  unpinMessage(request: MessageIdRequest): MessageView {
    this.requireWrite(request)
    const event = this.requireAliveMessage(request)
    const actor = this.requireActor(request.workspaceId)
    this.events.unpin(event.streamId, event.id)
    this.events.addAudit({
      id: `unpin:${event.id}:${this.orchestration.now()}`,
      eventId: event.id, projectId: request.projectId, actorId: actor.id,
      action: 'unpin', detail: '',
    })
    return this.viewMessage(event)
  }

  /**
   * Pinned messages on a stream, newest pin first.
   * @param request - Same scope as listMessages.
   */
  @Remote
  listPinned(request: ListMessagesRequest): MessageView[] {
    this.requireProject(request)
    const streamId = `${request.streamKind}:${request.ownerId}`
    return this.events.listPins(streamId)
      .map(id => this.events.get(id))
      .filter((event): event is NonNullable<typeof event> => event !== undefined && !event.deleted)
      .map(event => this.viewMessage(event))
  }

  /**
   * Edit the caller's own message. Owner may edit any.
   * @param request - Event + new body.
   */
  @Remote
  editMessage(request: EditMessageRequest): MessageView {
    this.requireWrite(request)
    const event = this.requireAliveMessage(request)
    const actor = this.requireActor(request.workspaceId)
    this.assertOwnMessage(request.workspaceId, event, actor.id)
    const at = this.orchestration.now()
    this.events.edit(event.id, request.body, at)
    this.events.addAudit({
      id: `edit:${event.id}:${at}`,
      eventId: event.id, projectId: request.projectId, actorId: actor.id,
      action: 'edit', detail: request.body.slice(0, 80),
    })
    const next = this.events.get(event.id)
    if (next === undefined) throw new Error('not-found')
    return this.viewMessage(next)
  }

  /**
   * Soft-delete the caller's own message. Owner may delete any.
   * @param request - Event.
   */
  @Remote
  deleteMessage(request: MessageIdRequest): boolean {
    this.requireWrite(request)
    const event = this.requireAliveMessage(request)
    const actor = this.requireActor(request.workspaceId)
    this.assertOwnMessage(request.workspaceId, event, actor.id)
    this.events.tombstone(event.id)
    this.events.addAudit({
      id: `delete:${event.id}:${this.orchestration.now()}`,
      eventId: event.id, projectId: request.projectId, actorId: actor.id,
      action: 'delete', detail: '',
    })
    return true
  }

  /**
   * Audit trail for one message.
   * @param request - Event.
   */
  @Remote
  listMessageAudit(request: MessageIdRequest): MessageAuditView[] {
    this.requireProject(request)
    this.requireOwnableMessage(request)
    return this.events.listAudit(request.eventId).map(row => ({
      id: row.id,
      eventId: request.eventId,
      actorId: row.actorId,
      action: row.action,
      at: row.at,
      detail: row.detail,
    }))
  }

  /**
   * Personas the session actor may @mention (talk ACL).
   * @param request - Query prefix.
   */
  @Remote
  suggestMentions(request: SuggestMentionsRequest): MentionSuggestionView[] {
    this.requireProject(request)
    const actor = this.requireActor(request.workspaceId)
    const q = request.query.trim().replace(/^@/u, '').toLowerCase()
    const owner = this.product.listMembers(request.workspaceId).find(row => row.role === 'owner')
    const out: MentionSuggestionView[] = []
    for (const persona of this.product.listPersonas(request.projectId)) {
      const charge = resolveCharge(this.product, this.cards, persona.id)
      const acl = talkAclFromSpeak(this.product, this.cards.getSpeak(persona.id))
      if (!canAddressPersona(acl, actor.id, owner?.id ?? '', charge.responsibleHumanId)) continue
      if (q !== '' && !persona.name.toLowerCase().includes(q) && !persona.title.toLowerCase().includes(q)) continue
      out.push({ personaId: persona.id, name: persona.name, title: persona.title })
    }
    return out
  }

  /**
   * Truncate the WAL. Local only.
   */
  @Remote
  checkpointWal(): WalCheckpointView {
    return this.store.checkpointWal()
  }

  /**
   * Export one persona as `.persona.json`. Gallery avatar only.
   * @param request - Tenant and persona.
   */
  @Remote
  exportPersona(request: ExportPersonaRequest): ShareFileView {
    this.requireProject(request)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined || persona.projectId !== request.projectId) throw new Error('persona-not-found')
    const author = this.actorOf(request.workspaceId)?.id ?? 'local'
    try {
      return exportPersonaShare(persona, author, this.orchestration.now())
    } catch (error: unknown) {
      return rethrowShare(error)
    }
  }

  /**
   * Import `.persona.json` as a pending hire proposal. Never applies it.
   * @param request - Tenant and JSON text.
   */
  @Remote
  importPersona(request: ImportPersonaRequest): ImportPersonaView {
    this.requireWrite(request)
    try {
      return importPersonaShare(this.screens, {
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        json: request.json,
        creatorPersonaId: this.importCreatorId(request.projectId),
        now: this.orchestration.now(),
      })
    } catch (error: unknown) {
      return rethrowShare(error)
    }
  }

  /**
   * Export a team file. `templateId` uses a built-in roster; else live personas.
   * @param request - Tenant and optional ids / template.
   */
  @Remote
  exportTeam(request: ExportTeamRequest): ShareFileView {
    this.requireProject(request)
    const author = this.actorOf(request.workspaceId)?.id ?? 'local'
    const now = this.orchestration.now()
    try {
      if (request.templateId !== undefined && request.templateId !== '') {
        const template = specsFromTemplate(request.templateId)
        if (template === undefined) throw new Error('template-not-found')
        return exportTeamShare(template, author, now)
      }
      const wanted = request.personaIds === undefined || request.personaIds.length === 0
        ? undefined
        : new Set(request.personaIds)
      const personas = this.product.listPersonas(request.projectId)
        .filter(persona => wanted === undefined || wanted.has(persona.id))
        .map(specOfPersona)
      const project = this.product.getProject(request.projectId)
      return exportTeamShare({
        id: request.projectId,
        name: project?.name ?? request.projectId,
        description: project?.description ?? '',
        personas,
      }, author, now)
    } catch (error: unknown) {
      return rethrowShare(error)
    }
  }

  /**
   * Import `.team.json` as pending hire proposals. Never applies them.
   * @param request - Tenant and JSON text.
   */
  @Remote
  importTeam(request: ImportTeamRequest): ImportTeamView {
    this.requireWrite(request)
    try {
      return importTeamShare(this.screens, {
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        json: request.json,
        creatorPersonaId: this.importCreatorId(request.projectId),
        now: this.orchestration.now(),
      })
    } catch (error: unknown) {
      return rethrowShare(error)
    }
  }

  /**
   * Scan `~/.claude/skills` and `~/.codex/skills`. Candidates stay disabled.
   */
  @Remote
  previewCliSkills(): CliSkillCandidateView[] {
    return previewCliSkillViews(this.skillIo)
  }

  /**
   * Persist selected CLI skills as disabled candidates. Never `enabled: true`.
   * @param request - Tenant, persona, skill keys.
   */
  @Remote
  proposeCliSkills(request: ProposeCliSkillsRequest): SkillView[] {
    this.requireWrite(request)
    if (this.product.getPersona(request.personaId) === undefined) throw new Error('persona-not-found')
    return proposeCliSkillViews(this.screens, {
      projectId: request.projectId,
      personaId: request.personaId,
      skillKeys: request.skillKeys,
      io: this.skillIo,
    })
  }

  /**
   * Local activation funnel. Owner only. Nothing leaves the machine.
   * @param request - Tenant.
   */
  @Remote
  getActivationFunnel(request: ProjectScopeRequest): ActivationFunnelView {
    this.requireGovOwner(request.workspaceId)
    this.requireProject(request)
    return computeActivationFunnel(this.insightEvents(request.projectId, request.workspaceId))
  }

  /**
   * Impact for one persona. Owner only.
   * @param request - Tenant and persona.
   */
  @Remote
  getPersonaImpact(request: PersonaImpactRequest): PersonaImpactView {
    this.requireGovOwner(request.workspaceId)
    this.requireProject(request)
    return computePersonaImpact(this.insightEvents(request.projectId, request.workspaceId), request.personaId)
  }

  /**
   * Impact for every persona in the project. Owner only.
   * @param request - Tenant.
   */
  @Remote
  listPersonaImpact(request: ProjectScopeRequest): PersonaImpactView[] {
    this.requireGovOwner(request.workspaceId)
    this.requireProject(request)
    const ids = this.product.listPersonas(request.projectId).map(persona => persona.id)
    return listPersonaImpact(this.insightEvents(request.projectId, request.workspaceId), ids)
  }

  /**
   * Schema, safe-mode, and last recovery. Local only.
   */
  @Remote
  getStoreHealth(): StoreHealthView {
    return {
      schemaVersion: this.store.schemaVersion(),
      safeMode: this.store.safeMode,
      recovered: this.store.recoveredFrom !== undefined,
      recoveredFrom: this.store.recoveredFrom ?? '',
      recoveryMessage: this.store.recoveryMessage ?? '',
      backups: this.listBackups(),
    }
  }

  /**
   * Replace the live file with a listed backup and reopen.
   * @param request - Filename from `listBackups`.
   */
  @Remote
  restoreBackup(request: RestoreBackupRequest): StoreHealthView {
    this.store.restoreBackup(request.filename)
    if (this.store.recoveryMessage !== undefined) this.lastErrors.push(this.store.recoveryMessage)
    return this.getStoreHealth()
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
   * Ingest a Cofre file (PDF, DOCX, MD, TXT, CSV). Local extract, chunks, FTS.
   * @param request - Tenant + base64 bytes.
   */
  @Remote
  ingestVaultDocument(request: IngestVaultDocumentRequest): VaultDocumentView {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    return this.vaultDocs.ingest(request, actor?.id ?? 'owner')
  }

  /**
   * Replace the file of a Cofre document and re-index chunks.
   * @param request - Existing document + new bytes.
   */
  @Remote
  replaceVaultDocument(request: ReplaceVaultDocumentRequest): VaultDocumentView {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    return this.vaultDocs.replace(request, actor?.id ?? 'owner')
  }

  /**
   * Delete a Cofre document, its chunks, and FTS rows.
   * @param request - Document.
   */
  @Remote
  deleteVaultDocument(request: DeleteVaultDocumentRequest): boolean {
    this.requireWrite(request)
    return this.vaultDocs.delete(request.workspaceId, request.projectId, request.documentId)
  }

  /**
   * List Cofre documents the actor may see.
   * @param request - Tenant.
   */
  @Remote
  listVaultDocuments(request: ProjectScopeRequest): VaultDocumentView[] {
    this.requireProject(request)
    return this.vaultDocs.list(request.workspaceId, request.projectId)
  }

  /**
   * Search Cofre chunks. Hits include document + page/section for Contexto usado.
   * @param request - Tenant + query.
   */
  @Remote
  searchVaultDocuments(request: SearchVaultDocumentsRequest): VaultChunkHitView[] {
    this.requireProject(request)
    return this.vaultDocs.search(request)
  }

  /**
   * Create or edit a Segundo cérebro page (markdown is the source).
   * @param request - Page + editor.
   */
  @Remote
  putBrainPage(request: PutBrainPageRequest): BrainPageView {
    this.requireWrite(request)
    return this.brain.put(request)
  }

  /**
   * @param request - Page.
   */
  @Remote
  getBrainPage(request: BrainPageIdRequest): BrainPageView {
    this.requireProject(request)
    return this.brain.get(request.workspaceId, request.pageId)
  }

  /**
   * List or FTS-search pages the actor may see.
   * @param request - Optional kind and query.
   */
  @Remote
  listBrainPages(request: ListBrainPagesRequest): BrainPageView[] {
    this.requireProject(request)
    return this.brain.list(request)
  }

  /**
   * Search alias for `listBrainPages` with `query`.
   * @param request - Query + optional kind.
   */
  @Remote
  searchBrainPages(request: ListBrainPagesRequest): BrainPageView[] {
    this.requireProject(request)
    return this.brain.list(request)
  }

  /**
   * Version history (never deleted).
   * @param request - Page.
   */
  @Remote
  listBrainVersions(request: BrainPageIdRequest): BrainVersionView[] {
    this.requireProject(request)
    return this.brain.versions(request.workspaceId, request.pageId)
  }

  /**
   * Write a prior revision back as a new version.
   * @param request - Page + revision.
   */
  @Remote
  restoreBrainPage(request: RestoreBrainPageRequest): BrainPageView {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    return this.brain.restore(
      request.workspaceId,
      request.projectId,
      request.pageId,
      request.revision,
      actor?.id ?? 'owner',
    )
  }

  /**
   * Pages edited today (store clock).
   * @param request - Tenant.
   */
  @Remote
  listBrainChangedToday(request: ProjectScopeRequest): BrainPageView[] {
    this.requireProject(request)
    return this.brain.changedToday(request.workspaceId, request.projectId)
  }

  /**
   * Pages edited today + grants + Comece aqui.
   * @param request - Tenant.
   */
  @Remote
  getBrainHome(request: ProjectScopeRequest): BrainHomeView {
    this.requireProject(request)
    return this.brain.home(request.workspaceId, request.projectId)
  }

  /**
   * Remember an approval. Exact scope only.
   * @param request - Persona + action + target.
   */
  @Remote
  grantBrainPermission(request: GrantBrainPermissionRequest): BrainGrantView {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    return this.brain.grant(request, actor?.id ?? 'owner')
  }

  /**
   * Immediate revoke. Page stays.
   * @param request - Grant.
   */
  @Remote
  revokeBrainPermission(request: BrainGrantIdRequest): BrainGrantView {
    this.requireWrite(request)
    return this.brain.revoke(request.workspaceId, request.projectId, request.grantId)
  }

  /**
   * @param request - Tenant.
   */
  @Remote
  listBrainPermissions(request: ProjectScopeRequest): BrainGrantView[] {
    this.requireProject(request)
    return this.brain.listGrants(request.workspaceId, request.projectId)
  }

  /**
   * Record an exact-scope use. Wider/other persona/expired/revoked is forbidden.
   * @param request - Grant + claimed action.
   */
  @Remote
  useBrainPermission(request: UseBrainGrantRequest): BrainGrantView {
    this.requireProject(request)
    return this.brain.use(request)
  }

  /**
   * One-way write to a local vault folder. `twoWay` also imports.
   * @param request - Folder path.
   */
  @Remote
  exportBrainVault(request: BrainVaultFolderRequest): BrainVaultFolderView {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    return this.brain.syncFolder(
      request.workspaceId,
      request.projectId,
      request.folderPath,
      request.twoWay === true,
      actor?.id ?? 'owner',
    )
  }

  /**
   * Two-way folder sync (export then import; same slug+hash is a skip).
   * @param request - Folder path.
   */
  @Remote
  importBrainVault(request: BrainVaultFolderRequest): BrainVaultFolderView {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    return this.brain.syncFolder(
      request.workspaceId,
      request.projectId,
      request.folderPath,
      true,
      actor?.id ?? 'owner',
    )
  }

  /**
   * BYC: parse pasted AI summary into review proposals (no write).
   * @param request - Tenant + paste + provider hint.
   */
  @Remote
  previewBringContextPaste(request: PreviewBringContextPasteRequest): BringContextPreviewView {
    this.requireProject(request)
    return parseBringPaste({
      text: request.text,
      provider: request.provider,
      at: new Date().toISOString(),
      existing: this.vault.listRecords(request.projectId).map(row => ({
        id: row.id, kind: row.kind, body: row.body,
      })),
    })
  }

  /**
   * BYC: scan a local Obsidian/.md folder into review proposals (no write).
   * @param request - Tenant + absolute folder from desktop picker.
   */
  @Remote
  previewBringContextVaultFolder(request: PreviewBringContextVaultFolderRequest): BringContextPreviewView {
    this.requireProject(request)
    return previewBringContextVaultFolder(
      request.rootPath,
      this.vault.listRecords(request.projectId).map(row => ({
        id: row.id, kind: row.kind, body: row.body,
      })),
    )
  }

  /**
   * BYC: persist accepted / edited / private review rows into the Cofre.
   * Discard, blocked, conflict and duplicate never write.
   * @param request - Last preview + person choices.
   */
  @Remote
  applyContextProposals(request: ApplyContextProposalsRequest): ApplyContextProposalsView {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    const authorId = actor?.id ?? 'owner'
    const { writes, privateIds } = selectedBringWrites(request.preview, request.items)
    const ids: string[] = []
    for (const proposal of writes) {
      if (this.vault.getRecord(proposal.id) !== undefined) continue
      const visibility = privateIds.has(proposal.id) && actor !== undefined
        ? { kind: 'members' as const, memberIds: [actor.id] }
        : { kind: 'workspace' as const }
      this.vault.createRecord({
        id: proposal.id,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        kind: proposal.kind,
        body: proposal.provenance === ''
          ? proposal.body
          : `${proposal.body}\n\n(${proposal.provenance})`,
        authorId,
        visibility,
        ...(proposal.hash === '' ? {} : { factKey: `byc:${proposal.hash}` }),
      })
      ids.push(proposal.id)
    }
    return {
      written: ids.length,
      skipped: Math.max(0, request.items.length - ids.length),
      ids,
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
  listConnections(request: ProjectScopeRequest): ConnectionView[] {
    this.requireProject(request)
    return this.connections.list()
  }

  /**
   * Colored subjects for one channel or DM.
   * @param request - Stream.
   */
  @Remote
  listConversationSubjects(request: ConversationSubjectScope): ConversationSubjectsBundleView {
    this.requireProject(request)
    const actor = this.requireActor(request.workspaceId)
    const subjects = subjectViews(this.topics, request, actor.id)
      .filter(row => !row.archived)
    const active = this.activeSubjectId(request.projectId, request.streamKind, request.ownerId)
      ?? subjects[0]?.id ?? ''
    return { subjects, activeSubjectId: active }
  }

  /**
   * New messages and persona replies go to this subject.
   * @param request - Stream + subject.
   */
  @Remote
  setActiveConversationSubject(request: ArchiveConversationSubjectRequest): ConversationSubjectsBundleView {
    this.requireWrite(request)
    const found = this.topics.get(request.subjectId)
    if (found === undefined || found.archived) throw new Error('not-found')
    this.screens.screens.put(request.projectId, 'conversation_active', `${request.streamKind}:${request.ownerId}`, {
      subjectId: request.subjectId,
    })
    return this.listConversationSubjects(request)
  }

  /**
   * @param request - Name and optional color.
   */
  @Remote
  createConversationSubject(request: CreateConversationSubjectRequest): ConversationSubjectsBundleView {
    this.requireWrite(request)
    const existing = this.topics.list(request.projectId, request.streamKind, request.ownerId, true)
    const colorIndex = request.colorIndex ?? nextSubjectColor(existing)
    const id = `${request.streamKind}:${request.ownerId}:t${String(colorIndex)}`
    const archived = existing.find(row => row.id === id && row.archived)
    if (archived !== undefined) this.topics.archive(id, false)
    if (this.topics.get(id) === undefined) {
      this.topics.create({
        id,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        streamKind: request.streamKind,
        ownerId: request.ownerId,
        colorIndex,
        name: request.name,
      })
    } else {
      this.topics.rename(id, request.name)
    }
    return this.setActiveConversationSubject({ ...request, subjectId: id })
  }

  /**
   * @param request - Subject + name.
   */
  @Remote
  renameConversationSubject(request: RenameConversationSubjectRequest): ConversationSubjectsBundleView {
    this.requireWrite(request)
    this.topics.rename(request.subjectId, request.name)
    return this.listConversationSubjects(request)
  }

  /**
   * @param request - Subject to hide.
   */
  @Remote
  archiveConversationSubject(request: ArchiveConversationSubjectRequest): ConversationSubjectsBundleView {
    this.requireWrite(request)
    this.topics.archive(request.subjectId, true)
    return this.listConversationSubjects(request)
  }

  /**
   * @param request - Message + destination subject.
   */
  @Remote
  moveMessageToSubject(request: MoveMessageToSubjectRequest): boolean {
    this.requireWrite(request)
    this.topics.moveEvent(request.eventId, request.subjectId)
    return true
  }

  /**
   * Several seats per provider. Falls back to one synthetic row per probe.
   * @param request - Tenant.
   */
  @Remote
  listConnectionAccounts(request: ProjectScopeRequest): ConnectionAccountsBundleView {
    this.requireProject(request)
    const probes = this.connections.list()
    const stored = this.accounts.list(request.workspaceId)
    const accounts = stored.length > 0
      ? stored.map((row) => {
        const probe = probes.find(item => item.kind === row.provider)
        const used = this.accounts.usageForAccount(row.id)[0]
        const runs = used?.runs ?? 0
        return {
          id: row.id,
          provider: (probe?.kind ?? row.provider) as ConnectionView['kind'],
          label: row.label,
          available: probe?.available ?? row.status !== 'error',
          loggedIn: probe?.loggedIn ?? row.status === 'ok',
          loginHint: probe?.loginHint ?? '',
          phase: probe?.phase ?? (row.status === 'checking' ? 'checking' as const : 'ready' as const),
          ...(probe?.error === undefined ? {} : { error: probe.error }),
          ...(runs === 0 ? {} : { inUseCount: runs }),
        }
      })
      : probes.map(row => ({
        id: row.id,
        provider: row.kind,
        label: row.kind,
        available: row.available,
        loggedIn: row.loggedIn,
        loginHint: row.loginHint,
        phase: row.phase,
        ...(row.error === undefined ? {} : { error: row.error }),
      }))
    const swap = storedSwapPolicy(this.accounts, request.workspaceId, accounts[0]?.provider ?? 'dsh')
    return { accounts, swapPolicy: swap.policy, swapPolicyScope: swap.scope }
  }

  /**
   * @param request - Explicit policy.
   */
  @Remote
  setRunnerSwapPolicy(request: SetRunnerSwapPolicyRequest): boolean {
    this.requireWrite(request)
    const named = request.personaId === undefined
      ? undefined
      : this.product.getPersona(request.personaId)
    const providers = new Set(
      this.accounts.list(request.workspaceId).map(row => row.provider),
    )
    if (named?.runner.kind === 'cli') providers.add(named.runner.cli)
    if (providers.size === 0) providers.add('dsh')
    for (const provider of providers) {
      const seats = this.accounts.list(request.workspaceId, provider)
      this.accounts.putPolicy({
        workspaceId: request.workspaceId,
        scope: request.scope,
        scopeId: request.scope === 'persona' ? (request.personaId ?? request.workspaceId) : request.workspaceId,
        provider,
        mode: toStorePolicy(request.policy),
        accountIds: seats.length > 0 ? seats.map(row => row.id) : ['none'],
      })
    }
    return true
  }

  /**
   * @param request - Provider + label. Home is isolated.
   */
  @Remote
  async addConnectionAccount(request: AddConnectionAccountRequest): Promise<ConnectionAccountsBundleView> {
    this.requireWrite(request)
    const id = `${request.provider}:${request.label.trim().toLowerCase().replace(/\s+/g, '-')}`
    const home = request.homeDir ?? isolatedAccountHome(this.requireActor(request.workspaceId).id, request.provider, id)
    this.accounts.create({
      id,
      workspaceId: request.workspaceId,
      provider: request.provider,
      label: request.label,
      homeDir: home,
    })
    return await this.listConnectionAccounts(request)
  }

  /**
   * @param request - Account.
   */
  @Remote
  removeConnectionAccount(request: RemoveConnectionAccountRequest): boolean {
    this.requireWrite(request)
    this.accounts.delete(request.accountId)
    return true
  }

  /**
   * @param request - Account + label.
   */
  @Remote
  updateConnectionAccount(request: UpdateConnectionAccountRequest): boolean {
    this.requireWrite(request)
    this.accounts.update(request.accountId, { label: request.label })
    return true
  }

  /**
   * Private teach recording. Web callers get `unsupported` via empty filename.
   * @param request - Persona + consent copy id.
   */
  @Remote
  startTeachSession(request: StartTeachSessionRequest): TeachSessionStartView {
    this.requireWrite(request)
    if (request.consentVersion !== TEACH_CONSENT) throw new Error('consent')
    const sessionId = `teach-${request.personaId}-${this.orchestration.now()}`
    this.teach.create({
      id: sessionId,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      personaId: request.personaId,
      filename: `teach/${request.personaId}/${sessionId}.webm`,
    })
    return {
      sessionId,
      retentionDays: TEACH_RETENTION_DAYS,
      storageHintPt: 'A gravação fica só neste computador. Nada sobe sem você exportar.',
    }
  }

  /**
   * @param request - Session.
   */
  @Remote
  pauseTeachSession(request: TeachSessionIdRequest): TeachSessionView {
    this.requireWrite(request)
    this.screens.screens.put(request.projectId, 'teach_pause', request.sessionId, { paused: true, at: this.orchestration.now() })
    return this.getTeachSession(request)
  }

  /**
   * @param request - Session.
   */
  @Remote
  resumeTeachSession(request: TeachSessionIdRequest): TeachSessionView {
    this.requireWrite(request)
    this.screens.screens.delete(request.projectId, 'teach_pause', request.sessionId)
    return this.getTeachSession(request)
  }

  /**
   * @param request - Session + optional transcript/frames from Rivet.
   */
  @Remote
  async stopTeachSession(request: StopTeachSessionRequest): Promise<TeachSessionView> {
    this.requireWrite(request)
    const row = this.teach.get(request.sessionId)
    if (row === undefined) throw new Error('not-found')
    const draft = await teachDraftFrom({
      personaId: row.personaId,
      title: 'Skill ensinada',
      frames: request.frames ?? [],
      transcript: request.transcript ?? '',
    })
    this.teach.putDraft(request.sessionId, request.transcript ?? '', JSON.stringify(draft))
    return this.getTeachSession(request)
  }

  /**
   * @param request - Session.
   */
  @Remote
  getTeachSession(request: TeachSessionIdRequest): TeachSessionView {
    this.requireProject(request)
    const row = this.teach.get(request.sessionId)
    if (row === undefined) return { status: 'unsupported', elapsedMs: 0 }
    const paused = this.screens.screens.get<{ paused: boolean }>(request.projectId, 'teach_pause', request.sessionId)
    const status = paused?.paused === true
      ? 'paused' as const
      : row.status === 'recording' ? 'recording' as const : row.status
    return {
      status,
      elapsedMs: Math.max(0, Date.parse(this.orchestration.now()) - Date.parse(row.createdAt)),
    }
  }

  /**
   * @param request - Session.
   */
  @Remote
  getTeachDraft(request: TeachSessionIdRequest): TeachDraftView {
    this.requireProject(request)
    const row = this.teach.get(request.sessionId)
    if (row === undefined || row.skillDraft === '') {
      return { steps: [], skillTitle: '' }
    }
    const parsed = JSON.parse(row.skillDraft) as { steps?: TeachDraftView['steps']; title?: string }
    return { steps: parsed.steps ?? [], skillTitle: parsed.title ?? 'Skill ensinada' }
  }

  /**
   * Saves the candidate. `activate` is ignored unless the person already confirmed in UI.
   * @param request - Edited steps.
   */
  @Remote
  submitTeachDraft(request: SubmitTeachDraftRequest): TeachDraftView {
    this.requireWrite(request)
    const row = this.teach.get(request.sessionId)
    if (row === undefined) throw new Error('not-found')
    this.teach.putDraft(request.sessionId, row.transcript, JSON.stringify({
      title: 'Skill ensinada',
      steps: request.steps,
      activate: false,
    }))
    this.screens.putCandidateSkill({
      id: `taught-${request.sessionId}`,
      projectId: request.projectId,
      personaId: row.personaId,
      name: 'Skill ensinada',
      body: request.steps.map(step => `${String(step.order)}. ${step.instruction}`).join('\n'),
    })
    return { steps: request.steps, skillTitle: 'Skill ensinada', candidateSkillId: `taught-${request.sessionId}` }
  }

  /**
   * Persist one core turn. Canonical kinds stay `execution` / `evaluation`.
   * Rivet `exec`/`eval` is applied only on the usage-port write.
   * @param request - Tenant + entry.
   * @returns The stored row.
   */
  @Remote
  recordTurnLedger(request: RecordTurnLedgerRequest): TurnLedgerView {
    this.requireWrite(request)
    return this.persistTurn(request.projectId, request.entry)
  }

  /**
   * OPT-7 Uso e limites: `foldUsagePanel` of the persisted book.
   * Empty book is `estimate`, never 0% quota.
   * @param request - Period and optional tenant / persona / finished tickets.
   */
  @Remote
  getUsagePanel(request: GetUsagePanelRequest): UsagePanelView {
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
    const entries = projects.flatMap(projectId => this.ledger.list({
      projectId,
      ...(request.personaId === undefined ? {} : { personaId: request.personaId }),
      ...(request.period === undefined ? {} : { from: request.period.from, to: request.period.to }),
    }))
    return foldUsagePanel(entries, request.successfulTicketIds ?? [])
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
    })).filter(row => request.accountId === undefined || row.accountId === request.accountId)
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
      return stored.map((row): OfficialQuotaView => {
        const view = toOfficialView(row)
        if (request.accountId === undefined) return view
        const account = this.accounts.get(request.accountId)
        return account === undefined
          ? { ...view, accountId: request.accountId }
          : { ...view, accountId: account.id, accountLabel: account.label }
      })
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
   * Desktop toast ack. Acked ids leave the next {@link attentionEvents} baseline.
   * @param request - Event ids.
   * @returns True when stored.
   */
  @Remote
  ackAttention(request: AckAttentionRequest): boolean {
    this.requireProject(request)
    const current = this.screens.screens.get<string[]>(request.projectId, 'attention_ack', 'ids') ?? []
    this.screens.screens.put(request.projectId, 'attention_ack', 'ids', [
      ...new Set([...current, ...request.eventIds]),
    ])
    return true
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
    return this.events.search(request.projectId, { id: actor.id }, request.query, request.limit, request.topicId)
      .map(event => this.viewMessage(event))
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
    try {
      return readProjectFile(root, request.path)
    } catch (error: unknown) {
      throwMedia(error)
    }
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
    const json = stringifyDiagnostics(collectDiagnostics({
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
      rememberReviewFeedback(this.vault, request, 'review_accepted', request.ticketId)
      return { kind: 'merged', mode: result.mode, explanation: '' }
    }
    rememberReviewFeedback(this.vault, request, 'review_changes', result.explanation)
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
    rememberReviewFeedback(this.vault, request, 'review_changes', request.feedback)
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
    }, this.actorOf(request.workspaceId)?.id ?? '', this.boards.board, this.governance.gov))
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
    }, this.actorOf(request.workspaceId)?.id ?? '', this.boards.board, this.governance.gov))
  }

  /**
   * On-demand `VACUUM INTO` copy of `persona.db`. Local only.
   * @returns Filename, path, and mtime.
   */
  @Remote
  backupNow(): BackupView {
    const path = this.store.backupNow()
    return backupViewOf(path)
  }

  /**
   * Manual and pre-migration copies, newest first.
   */
  @Remote
  listBackups(): BackupView[] {
    return this.store.listBackups().map(item => backupViewOf(item.path, item.filename))
  }

  /**
   * Irreversible workspace wipe. Owner + `confirmed`.
   * @param request - Workspace + confirm.
   * @returns True when the workspace is gone.
   */
  @Remote
  deleteWorkspace(request: DeleteWorkspaceRequest): boolean {
    this.requireGovOwner(request.workspaceId)
    if (!request.confirmed) throw new Error('not-confirmed')
    wipeWorkspace(this.store, request.workspaceId)
    return this.product.getWorkspace(request.workspaceId) === undefined
  }

  /**
   * Irreversible shared-project wipe. Owner + `confirmed`. Personal stays.
   * @param request - Project + confirm.
   * @returns True when the project is gone.
   */
  @Remote
  deleteSharedProject(request: DeleteSharedProjectRequest): boolean {
    this.requireGovOwner(request.workspaceId)
    this.requireProject(request)
    if (!request.confirmed) throw new Error('not-confirmed')
    wipeProject(this.store, request.projectId)
    return this.product.getProject(request.projectId) === undefined
  }

  /**
   * Recruiter persona for an imported hire card, or `import` when the roster is empty.
   * @param projectId - Tenant.
   * @returns Persona id used as proposal creator.
   */
  private importCreatorId(projectId: string): string {
    const personas = this.product.listPersonas(projectId)
    return personas.find(persona => persona.canRecruit)?.id ?? personas[0]?.id ?? 'import'
  }

  /**
   * Fold persisted rows into insight events.
   * @param projectId - Tenant.
   * @param workspaceId - Workspace.
   * @returns Events for the engine fold.
   */
  private insightEvents(projectId: string, workspaceId: string) {
    const workspace = this.product.getWorkspace(workspaceId)
    const onboarded = this.onboarding.read(workspaceId).completed
    const welcome = this.events.get('onb-welcome')
    const personas = this.product.listPersonas(projectId)
    return foldInsightEvents({
      onboarded,
      onboardedAt: Date.parse(welcome?.occurredAt ?? workspace?.createdAt ?? this.orchestration.now()),
      workspaceCreatedAt: Date.parse(workspace?.createdAt ?? this.orchestration.now()),
      now: Date.parse(this.orchestration.now()),
      events: this.events.listProject(projectId),
      personaIds: new Set(personas.map(persona => persona.id)),
      tickets: this.orchestration.runtime(projectId).repo.tickets.list(),
      personas,
      approvals: this.screens.listApprovals(projectId),
    })
  }

  private withGestorAudit(workspaceId: string, health: TeamHealthView): TeamHealthView {
    return { ...health, gestorAudit: this.gestor.listAudit({ workspaceId }) }
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

  private requireWrite(request: { workspaceId: string; projectId: string }): void {
    this.requireProject(request)
    if (this.product.listMembers(request.workspaceId).length === 0) return
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    if (!sessionCan(actor, 'write', { type: 'project', workspaceId: request.workspaceId, projectId: request.projectId })) {
      throw new Error('forbidden')
    }
  }

  private requireGovOwner(workspaceId: string): void {
    this.requireWorkspace({ workspaceId })
    const actor = this.actorOf(workspaceId)
    if (actor === undefined || actor.workspaceRole !== 'owner') throw new Error('forbidden')
  }

  private requireGovAvailability(workspaceId: string, humanId: string): void {
    this.requireWorkspace({ workspaceId })
    const actor = this.actorOf(workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    if (actor.workspaceRole === 'owner' || actor.id === humanId) return
    throw new Error('forbidden')
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
    const acked = new Set(this.screens.screens.get<string[]>(request.projectId, 'attention_ack', 'ids') ?? [])
    return events.filter(item => !acked.has(item.id)).slice(0, policy.proposalBudget)
  }

  private viewMessage(event: {
    id: string
    streamId: string
    seq: number
    body: string
    actorId: string
    subjectId: string
    occurredAt: string
    type?: string
    replyToId?: string
    editedAt?: string
    topicId?: string
  }): MessageView {
    const reactions = groupReactions(this.events.listReactions(event.id))
    return {
      ...toMessageView(event),
      attachmentIds: this.media.listByMessage(event.id).map(row => row.id),
      replyToId: event.replyToId ?? '',
      editedAt: event.editedAt ?? '',
      pinned: this.events.isPinned(event.id),
      reactions,
    }
  }

  private activeSubjectId(
    projectId: string,
    streamKind: 'channel' | 'dm',
    ownerId: string,
  ): string | undefined {
    return this.screens.screens.get<{ subjectId: string }>(
      projectId, 'conversation_active', `${streamKind}:${ownerId}`,
    )?.subjectId
  }

  private activeAccountView(
    workspaceId: string,
    personaId: string,
    provider: string,
  ): { activeAccount?: { provider: string; label: string } } {
    const chosen = this.screens.screens.get<{ accountId: string }>(
      this.product.getPersona(personaId)?.projectId ?? '', 'active_account', personaId,
    )
    const row = chosen === undefined ? this.accounts.list(workspaceId, provider)[0] : this.accounts.get(chosen.accountId)
    if (row === undefined) return {}
    return { activeAccount: { provider: row.provider, label: row.label } }
  }

  private seatForPersona(projectId: string, persona: { id: string; name: string; runner: { kind: string; cli?: string } }): {
    home: string
    accountId?: string
    activity?: string
  } {
    const project = this.product.getProject(projectId)
    const workspaceId = project?.workspaceId ?? ''
    const provider = persona.runner.kind === 'cli' ? (persona.runner.cli ?? 'dsh') : 'dsh'
    const seats = this.accounts.list(workspaceId, provider)
    const swap = storedSwapPolicy(this.accounts, workspaceId, provider, persona.id)
    const last = this.screens.screens.get<{ accountId: string }>(projectId, 'active_account', persona.id)
    const resolved = resolveAccountSeat({
      accounts: seats,
      policy: swap.policy,
      policyScope: swap.scope,
      preferredEngines: [
        provider === 'claude' || provider === 'codex' || provider === 'cursor'
          || provider === 'opencode' || provider === 'dsh'
          ? provider
          : 'dsh',
      ],
      ...(last?.accountId === undefined ? {} : { currentId: last.accountId }),
      personaName: persona.name,
    })
    if (resolved.accountId !== undefined) {
      this.screens.screens.put(projectId, 'active_account', persona.id, { accountId: resolved.accountId })
    }
    if (resolved.activity !== undefined) {
      this.screens.screens.put(projectId, 'account_activity', `${persona.id}:${this.orchestration.now()}`, {
        body: resolved.activity,
      })
    }
    if (resolved.ask !== undefined) {
      this.screens.screens.put(projectId, 'account_ask', persona.id, resolved.ask)
    }
    return {
      home: resolved.home,
      ...(resolved.accountId === undefined ? {} : { accountId: resolved.accountId }),
      ...(resolved.activity === undefined ? {} : { activity: resolved.activity }),
    }
  }

  private requireActor(workspaceId: string): { id: string } {
    const actor = this.actorOf(workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    return actor
  }

  private requireOwnableMessage(request: { workspaceId: string; projectId: string; eventId: string }) {
    this.requireProject(request)
    const event = this.events.get(request.eventId)
    if (event === undefined || event.projectId !== request.projectId) throw new Error('not-found')
    return event
  }

  private requireAliveMessage(request: { workspaceId: string; projectId: string; eventId: string }) {
    const event = this.requireOwnableMessage(request)
    if (event.deleted) throw new Error('not-found')
    return event
  }

  private assertOwnMessage(workspaceId: string, event: { actorId: string }, actorId: string): void {
    const owner = this.product.listMembers(workspaceId).find(row => row.role === 'owner')
    if (event.actorId === actorId || owner?.id === actorId) return
    throw new Error('forbidden')
  }

  private assertCanAddress(workspaceId: string, targetId: string, actorId: string): void {
    const persona = this.product.getPersona(targetId)
    if (persona === undefined) return
    const owner = this.product.listMembers(workspaceId).find(row => row.role === 'owner')
    const charge = resolveCharge(this.product, this.cards, persona.id)
    const acl = talkAclFromSpeak(this.product, this.cards.getSpeak(persona.id))
    if (!canAddressPersona(acl, actorId, owner?.id ?? '', charge.responsibleHumanId)) {
      throw new Error(SPEAK_REFUSED)
    }
  }

  private assertCardEditor(workspaceId: string, personaId: string): void {
    const actor = this.actorOf(workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    const owner = this.product.listMembers(workspaceId).find(row => row.role === 'owner')
    const persona = this.product.getPersona(personaId)
    if (persona === undefined) throw new Error('persona-not-found')
    const charge = resolveCharge(this.product, this.cards, personaId)
    if (actor.id !== charge.responsibleHumanId && actor.id !== owner?.id) throw new Error('forbidden')
  }

  private personaRuntime(projectId: string, personaId: string): { paused: boolean } {
    return { paused: this.orchestration.isPersonaPaused(projectId, personaId) }
  }

  /**
   * `#geral` of `projectId`. Id is `geral` on Pessoal when it already exists, else `geral:<projectId>`.
   * @param workspaceId - Tenant.
   * @param projectId - Project.
   */
  private ensureProjectConversation(workspaceId: string, projectId: string): ProjectConversationView {
    const existing = this.product.listChannels(projectId)
    const preferred = existing.find(channel => channel.id === `geral:${projectId}`)
      ?? existing.find(channel => channel.name === 'geral')
      ?? existing[0]
    if (preferred !== undefined) {
      return { projectId, channelId: preferred.id, name: preferred.name }
    }
    const created = this.product.createChannel({
      id: `geral:${projectId}`,
      workspaceId,
      projectId,
      name: 'geral',
      topic: '',
    })
    return { projectId, channelId: created.id, name: created.name }
  }

  private auditPersona(projectId: string, personaId: string, action: string): void {
    const actor = this.actorOf(this.product.getProject(projectId)?.workspaceId ?? '')
    this.screens.screens.put(projectId, 'persona_audit', `${action}:${personaId}:${this.orchestration.now()}`, {
      at: this.orchestration.now(),
      action,
      personaId,
      actorId: actor?.id ?? '',
    })
  }

  private assertStreamWrite(request: { workspaceId: string; streamKind: 'channel' | 'dm'; ownerId: string }): void {
    if (request.streamKind !== 'dm') return
    const actor = this.actorOf(request.workspaceId)
    const dm = this.product.getDm(request.ownerId)
    if (actor === undefined || dm === undefined) throw new Error('forbidden')
    if (actor.id !== dm.participantA && actor.id !== dm.participantB) throw new Error('forbidden')
  }

  private mountMedia(ctx: Context): void {
    const server = webserverOf(ctx)
    if (server === undefined) return
    ctx.effect(() => server.register({
      kind: 'exact',
      path: '/api/persona/media',
      handler: mediaHttpHandler(() => ({
        media: this.media,
        actorId: this.sessionMemberId ?? this.actorOf(this.product.listWorkspaces()[0]?.id ?? '')?.id ?? '',
      })),
    }))
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

  /**
   * Write the canonical turn, then the Rivet usage port with mapped kinds.
   * @param projectId - Tenant.
   * @param entry - Core ledger row.
   * @returns The stored row.
   */
  persistTurn(projectId: string, entry: TurnLedgerView): TurnLedgerView {
    const stored = this.ledger.put(projectId, entry)
    const publishedCache = stored.cacheReadTokens > 0 || stored.cacheWriteTokens > 0
    this.usage.record({
      id: stored.id,
      projectId,
      personaId: stored.personaId,
      provider: stored.engine,
      model: stored.engine,
      window: usagePortWindow(stored.kind),
      kind: stored.kind,
      inputTokens: stored.inputTokens,
      outputTokens: stored.outputTokens,
      origin: stored.origin === 'measured' ? 'measured' : 'estimate',
      at: stored.at,
      ...(stored.accountId === undefined ? {} : { accountId: stored.accountId }),
      ...(publishedCache
        ? { cacheReadTokens: stored.cacheReadTokens, cacheWriteTokens: stored.cacheWriteTokens }
        : {}),
    })
    return stored
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

function backupViewOf(path: string, filename: string = basename(path)): BackupView {
  let at = new Date(0).toISOString()
  try {
    at = statSync(path).mtime.toISOString()
  } catch (error: unknown) {
    void error
  }
  return { filename, path, at }
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

function toPoolView(body: unknown): ProviderLimitPoolView {
  const pool = body as {
    provider?: string
    accounts?: readonly unknown[]
    windows?: readonly {
      id?: string
      kind?: string
      remainingPercent?: number
      nextResetAt?: string
    }[]
  }
  const windows = (pool.windows ?? []).map(row => ({
    id: row.id ?? '',
    kind: row.kind ?? 'other',
    ...(row.remainingPercent === undefined ? {} : { remainingPercent: row.remainingPercent }),
    ...(row.nextResetAt === undefined ? {} : { nextResetAt: row.nextResetAt }),
  }))
  const next = windows
    .map(row => row.nextResetAt)
    .filter((at): at is string => at !== undefined)
    .sort()[0] ?? ''
  return {
    provider: pool.provider ?? '',
    accountCount: pool.accounts?.length ?? 0,
    nextResetAt: next,
    windows,
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
  systemRoles: readonly SystemRoleView[]
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
  topicId?: string
}): MessageView {
  const type = event.type ?? 'message'
  const topicId = event.topicId ?? ''
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
    attachmentIds: [],
    replyToId: '',
    editedAt: '',
    pinned: false,
    reactions: [],
    topicId,
    conversationSubjectId: topicId,
  }
}

function groupReactions(rows: readonly { stickerId: string; actorId: string }[]): Array<{ stickerId: string; actorIds: readonly string[] }> {
  const by = new Map<string, string[]>()
  for (const row of rows) {
    const list = by.get(row.stickerId) ?? []
    list.push(row.actorId)
    by.set(row.stickerId, list)
  }
  return [...by.entries()].map(([stickerId, actorIds]) => ({ stickerId, actorIds }))
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

/**
 * @param raw - Base64 payload from the wire.
 */
/**
 * Surface the pt-BR line of a media refusal.
 * @param error - Caught error.
 * @returns Never.
 */
function throwMedia(error: unknown): never {
  if (error instanceof MediaError) throw new Error(error.userMessage)
  throw error
}

function decodeBase64(raw: string): Uint8Array {
  if (raw === '') throw new Error('empty-file')
  try {
    return Uint8Array.from(Buffer.from(raw, 'base64'))
  } catch {
    throw new Error('invalid-base64')
  }
}

function handleOf(name: string): string {
  const slug = name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/gu, '-').replace(/^-|-$/gu, '')
  return slug === '' ? 'persona' : slug
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
