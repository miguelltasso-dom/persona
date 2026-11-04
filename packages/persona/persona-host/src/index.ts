/** Persona host service and authenticated Remote controller. */
import { statSync } from 'node:fs'
import { basename, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { accountLoginStatus } from '@deepseek-ai/dsh-persona-runners'
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
  type Routine,
} from '@deepseek-ai/dsh-persona-store'
import { dedupeLimitAccounts, foldUsage, poolProviderLimits } from '@deepseek-ai/dsh-persona-usage'
import { resolveSessionActor, sessionCan } from './auth.ts'
import { ConnectionProbe } from './connection-probe.ts'
import { cachedEngineReadiness } from './engine-readiness.ts'
import { calibrationFromLedger, calibrationWindowStart } from './estimate-calibration.ts'
import { ticketAttention } from './attention.ts'
import { curateSettledReport, rememberReportAudience } from './report-curation.ts'
import { RemoteTeamHost, type RemoteTeamVault } from './remote-team.ts'
import type { AcceptRemoteInviteRequest, ConnectRemoteTeamRequest, RemoteTeamAvailability, RemoteTeamState,
  RestorePointListView, UndoApplyRequest, UndoApplyView, ProjectStorageUsageView } from './types.ts'
import type { RemoteMemberView } from './types.ts'
import { projectStorageUsage } from './history-storage.ts'
import type { EngineStatusView, EngineTriggerActionRequest } from './types.ts'
import { persistProbeQuota } from './official-quota-persist.ts'
import { installRemoteGuard, RemoteGuard, RemoteFault as HostRemoteFault } from './remote-guard.ts'
import { MutantRunBook } from './mutant-run.ts'
import { DeadLetterBook } from './dead-letter.ts'
import { collectDiagnostics, stringifyDiagnostics } from './diagnostics.ts'
import { exportMarkdown } from './export-md.ts'
import { GithubSourceHost, detectGh } from './github.ts'
import { ExternalSourcesHost } from './external-sources.ts'
import { CofreSecretVault } from './cofre-secrets.ts'
import { detectProjectGit, validateProjectRoot } from './project-root.ts'
import { allowsScriptedReplies, ensureProductionRealCli, hostRunnerFromContext, loggedCliFromCards, specFromConnection, type DetectedCli } from './runner.ts'
import { githubWebhookHandler, WebhookReplayGuard } from './webhook-http.ts'
import { ProactivityHost } from './proactivity.ts'
import { createProactivityScheduler, postTeamRequest } from './proactivity-wire.ts'
import { TaskProposalHost } from './task-proposals.ts'
import { taskProposalFromBody } from './task-proposal-wire.ts'
import { ROUTINE_SPEC_KIND, type ProactivityScheduler, type ProactivityStatusView } from './proactivity-scheduler.ts'
import { TeamStateBook, type TeamStateView } from './team-state.ts'
import { DraftFilesBook } from './draft-files.ts'
import { MessageFlags } from './message-flags.ts'
import { WorkingControl } from './working-control.ts'
import type {
  FlushWorkingQueueRequest,
  RestoreQueuedMessageRequest,
  SteerWorkingTurnRequest,
  SteerWorkingTurnView,
  StopTurnRequest,
  StopTurnView,
} from './types.ts'
import { checkAttentionAnswer } from './attention-answer.ts'
import { firstRequestAsk, normalizeFirstRequest, suggestFirstRequests } from './first-request.ts'
import {
  checkRoutineCatchUp,
  checkRoutineId,
  checkRoutineName,
  checkRoutineOwner,
  checkRoutinePrompt,
  checkRoutineRrule,
  checkRoutineSilence,
  checkRoutineTimeZone,
  INITIATIVE_ROUTINE_PREFIX,
  readRoutineSpec,
  requireRoutineIn,
  routineViewOf,
  writeRoutineSpec,
} from './routine-remotes.ts'
import type { SuggestFirstRequestsRequest, SuggestFirstRequestsView } from './types.ts'
import { BoardsHost } from './boards.ts'
import { MediaHost, mediaHttpHandler } from './media.ts'
import { VaultDocsHost } from './vault-docs.ts'
import { BrainHost } from './brain.ts'
import { GestorHost, withDefaultGestor } from './gestor.ts'
import { WorkingSendHost } from './working-send-host.ts'
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
import { quotaRecheckDelay } from './quota-wait.ts'
import { AccountSwapHost } from './account-swap-host.ts'
import { accountAskFromBody, accountSwapFromBody } from './account-swap-wire.ts'
import { rememberReviewFeedback } from './feedback-wire.ts'
import {
  computeActivationFunnel,
  computePersonaImpact,
  emitGestorPropose,
  listPersonaImpact,
  measureGestorToolsAcceptance,
  measureGestorV1,
  measureOpt3Acceptance,
  measureOpt4Acceptance,
  measureOpt5Acceptance,
  measureOpt6Acceptance,
  measureOpt8View,
  acceptTaughtCandidate,
  activateTaughtSkill,
  cheapModelForFirstDelivery,
  firstDeliveryAsk,
  measureFirstDeliveryAcceptance as scoreFirstDeliveryAcceptance,
  publishTaughtSkill as promoteTaughtSkill,
  rollbackTaughtSkill as disableTaughtSkill,
  measureProactivityAcceptance,
  measureV1CloseView,
  parseReviewRestorePointId,
  gateRememberedPermission,
  estimateAsk as estimateAskFor,
} from '@deepseek-ai/dsh-persona-engine'
import {
  defaultSkillDirIo,
  canReadVault,
  foldUsagePanel,
  parseBringPaste,
  usagePortKind,
  vaultToBringExisting,
  type GestorPlan,
  type SkillDirIo,
} from '@deepseek-ai/dsh-persona-core'
import { selectedBringWrites } from './bring-context-apply.ts'
import { runErrorFromBody } from './run-error-wire.ts'
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
import { FIRST_DELIVERY_EVENT_ID, FIRST_DELIVERY_MILESTONE_EVENT_ID, OnboardingHost } from './onboarding.ts'
import { HostScheduler } from './scheduler.ts'
import { CHAT_STICKERS, isChatSticker } from './stickers.ts'
import {
  listProjectFiles,
  readProjectFile,
  statProjectFile,
} from './files.ts'
import type {
  AccountLimitBookView,
  AccountSwapProposalView,
  AccountSwapRecordView,
  GetAccountLimitBookRequest,
  AccountSwapResultView,
  ConfirmAccountSwapRequest,
  DeclineAccountSwapRequest,
  UndoAccountSwapRequest,
  UndoAccountSwapResultView,
  ChannelView,
  EstimateAskRequest,
  EstimateAskView,
  ClaimRoutinesRequest,
  CreateChannelRequest,
  CreateDmRequest,
  CreateMemberRequest,
  CreatePersonaRequest,
  CreateProjectRequest,
  CreateRoutineRequest,
  DecideTaskProposalRequest,
  DeleteRoutineRequest,
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
  FirstDeliveryStartView,
  FirstDeliveryView,
  DiagnosticsJson,
  OnboardingState,
  RequestChangesRequest,
  ReviewAcceptView,
  ReviewSummaryView,
  ReviewTicketRequest,
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
  ProjectRootListView,
  ProjectRootView,
  RoutineScheduleView,
  UpdateRoutineRequest,
  ProposalStatsView,
  ReopenTaskProposalRequest,
  TaskProposalView,
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
  FirstDeliveryMeasureView,
  GestorMeasureView,
  GestorToolsMeasureView,
  Opt8MeasureView,
  OptPolicyMeasureView,
  ProactivityMeasureView,
  V1CloseMeasureView,
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
  SprintGoalView,
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
  ListConnectionAccountsRequest,
  CreateConversationSubjectRequest,
  MoveMessageToSubjectRequest,
  RemoveConnectionAccountRequest,
  RenameConversationSubjectRequest,
  SetRunnerSwapPolicyRequest,
  ActivateTaughtSkillRequest,
  PublishTaughtSkillRequest,
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
  ProposeGestorAllocateRequest,
  ProposeGestorReorganizeRequest,
  CommentGestorPlanRequest,
  ResolveGestorTieRequest,
  EnqueueWorkingMessageRequest,
  EditQueuedMessageRequest,
  WorkingQueueRequest,
  OpenAsideAskRequest,
  AsideAskView,
  QueuedMessageView,
  RecordTurnActivityRequest,
  ListTurnActivityRequest,
  ActivityGroupView,
  TurnActivityView,
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
  isolatedAccountLoginCommand,
  resolveAccountSeat,
  storedSwapPolicy,
  subjectViews,
  workingBySubject,
  allowedToolsOf,
  taughtDraftOf,
  taughtStepToolsOf,
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
  ensureProductionRealCli,
  permissionFor,
  resolveHostRunner,
} from './runner.ts'
// oxlint-disable-next-line typescript/no-deprecated -- public alias for resolveHostRunner
export { createHostRunner } from './runner.ts'
export type { HostPermissionMode, RunnerPurpose } from './runner.ts'
export { ConnectionProbe } from './connection-probe.ts'
export { persistProbeQuota, storedQuotaFromPut } from './official-quota-persist.ts'
export {
  installRemoteGuard,
  RemoteFault,
  RemoteGuard,
  RemoteRequestSchema,
  REMOTE_PAYLOAD_LIMIT,
  REMOTE_RATE_MAX,
  REMOTE_RATE_WRITE_MAX,
} from './remote-guard.ts'

/** `listConversationSubjects` is a SQLite topic list — collapse boot storms. */
export const SUBJECT_LIST_CACHE_MS = 750
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
  /** Poll connected projects; zero disables automatic polling. Default 2500 ms. */
  readonly remoteTeamPollMs?: number
  /** Local edge request timeout. Default 20000 ms. */
  readonly remoteTeamTimeoutMs?: number
  /** Recheck retained messages; zero disables the retry timer. Default 15000 ms. */
  readonly engineRetryPollMs?: number
  /** Team scheduler cycle (routines, Vigia, planning); zero disables it. Default 30000 ms. Never armed under Vitest. */
  readonly proactivityCycleMs?: number
  /** Ordinary-folder draft size limit; defaults to the engine's configured default. */
  readonly historyMaxCopyBytes?: number
  /** Deadline for private-history git commands; defaults to the engine's default. */
  readonly historyGitTimeoutMs?: number
  /** Optional resolved executable; omitted uses the system PATH. */
  readonly historyGit?: string
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
  /** The account switch at the quota limit (D-078): limit book, proposals, switch, Desfazer. */
  readonly accountSwap: AccountSwapHost
  readonly teach: TeachRepos
  readonly vaultDocs: VaultDocsHost
  readonly brain: BrainHost
  readonly gestor: GestorHost
  readonly workingSend: WorkingSendHost
  readonly teamState: TeamStateBook
  readonly draftFiles: DraftFilesBook
  readonly messageFlags: MessageFlags
  readonly workingControl: WorkingControl
  readonly taskProposals: TaskProposalHost
  readonly proactivityScheduler: ProactivityScheduler
  readonly opt: OptRepos
  readonly ledger: TurnLedgerRepos
  readonly remoteTeam: RemoteTeamHost
  private readonly engineRetryPollMs: number
  private engineRetryTimer: ReturnType<typeof setInterval> | undefined
  private quotaRecheckTimer: ReturnType<typeof setTimeout> | undefined
  private engineReadinessDisposed = false
  readonly webhookGuard: WebhookReplayGuard = new WebhookReplayGuard()
  readonly remoteGuard: RemoteGuard
  /** Short TTL for `listConversationSubjects` (boot storms hit the same stream). */
  private readonly subjectListCache = new Map<string, { at: number; value: ConversationSubjectsBundleView }>()
  sessionMemberId: string | undefined
  readonly lastErrors: string[] = []
  skillIo: SkillDirIo = defaultSkillDirIo()

  /**
   * @param ctx - Host context.
   * @param config - Database path; default empty (env / Vitest memory).
   */
  constructor(ctx: Context, config: Config = { databasePath: '' }) {
    super(ctx, 'personaHost', { namespace: 'persona' })
    this.engineRetryPollMs = config.engineRetryPollMs ?? 15000
    if (!Number.isInteger(this.engineRetryPollMs) || this.engineRetryPollMs < 0) throw new Error('invalid-engine-retry-poll-ms')
    ensureProductionRealCli()
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
      () => this.orchestration.now(), // one clock for the whole host (a test that injects it moves Vigia, fires and away together)
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
      (persona) => { this.governance.registerPersona(persona) },
    )
    this.orchestration.screens = screenRepos
    this.orchestration.onTaskSettled = (event, failed) => {
      if (event.id === FIRST_DELIVERY_EVENT_ID) {
        this.sealFirstDelivery({ workspaceId: event.workspaceId, projectId: event.projectId }, failed ? 'failed' : undefined)
        return
      }
      if (failed) return
      this.curateProjectReports(event.projectId)
    }
    this.onboarding = new OnboardingHost(this.product, this.events, screenRepos, this.screens)
    this.scheduler = new HostScheduler(this.store, screenRepos)
    this.github = new GithubSourceHost(detectGh(), this.orchestration, this.proactivity)
    this.external = new ExternalSourcesHost(this.orchestration, new CofreSecretVault(this.vault, this.product))
    this.connections = new ConnectionProbe({
      persistQuota: (snaps) => { this.persistOfficialQuota(snaps) },
      onReady: () => { this.handleReadyEngines() },
    })
    this.orchestration.engineReadinessOf = () => allowsScriptedReplies()
      ? { state: 'ready', reason: null }
      : cachedEngineReadiness(this.connections.list())
    this.orchestration.onEngineDeferred = () => { this.armEngineRetry() }
    this.orchestration.onQuotaWaiting = (info) => {
      this.armQuotaRecheck()
      // after the current failure is fully recorded (its done line is posted synchronously, under the Assignment that failed)
      queueMicrotask(() => {
        void this.accountSwap.onQuotaStop(info.projectId, info.ticketId).catch((error: unknown) => { void error })
      })
    }
    for (const value of [config.historyMaxCopyBytes, config.historyGitTimeoutMs]) {
      if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new Error('invalid-history-limit')
    }
    if (config.historyGit !== undefined && (typeof config.historyGit !== 'string' || config.historyGit.trim() === '')) {
      throw new Error('invalid-history-git')
    }
    this.orchestration.reviewOptions = {
      ...(config.historyMaxCopyBytes === undefined ? {} : { maxCopyBytes: config.historyMaxCopyBytes }),
      ...(config.historyGitTimeoutMs === undefined ? {} : { gitTimeoutMs: config.historyGitTimeoutMs }),
      ...(config.historyGit === undefined ? {} : { git: config.historyGit }),
    }
    this.orchestration.loggedCliOf = () => this.loggedCli()
    this.remoteGuard = new RemoteGuard({
      peerOf: () => this.sessionMemberId ?? 'local',
    })
    this.topics = new TopicRepos(this.store, () => this.orchestration.now())
    this.accounts = new AccountRepos(this.store, () => this.orchestration.now())
    this.accountSwap = new AccountSwapHost({
      product: this.product,
      accounts: this.accounts,
      screens: this.screens.screens,
      events: this.events,
      usage: this.usage,
      orchestration: this.orchestration,
      connections: () => this.connections.list(),
      loginStatus: accountLoginStatus,
    })
    this.teach = new TeachRepos(this.store, () => this.orchestration.now())
    this.vaultDocs = new VaultDocsHost(this.product, this.vault, workspaceId => this.actorOf(workspaceId))
    const brainRepos = new BrainRepos(this.store, () => this.orchestration.now())
    this.brain = new BrainHost(this.product, brainRepos, workspaceId => this.actorOf(workspaceId))
    this.gestor = new GestorHost(
      this.product,
      new GestorRepos(this.store, () => this.orchestration.now()),
      () => this.orchestration.now(),
      this.boards,
      (persona, sectorName) => { this.governance.registerPersona(persona, sectorName) },
    )
    this.workingSend = new WorkingSendHost(screenRepos, () => this.orchestration.now())
    this.teamState = new TeamStateBook(screenRepos, this.routines, () => this.orchestration.now())
    this.draftFiles = new DraftFilesBook(screenRepos, () => this.orchestration.now())
    this.messageFlags = new MessageFlags(screenRepos)
    this.workingControl = new WorkingControl({
      product: this.product,
      events: this.events,
      screens: screenRepos,
      workingSend: this.workingSend,
      flags: this.messageFlags,
      orchestration: this.orchestration,
      send: request => this.appendMessage(request),
      actorOf: workspaceId => this.actorOf(workspaceId),
    })
    this.proactivity.draftFilesOf = (projectId, ticketId) => this.draftFiles.get(projectId, ticketId)
    this.proactivity.approvalsOf = projectId => this.screens.listApprovals(projectId)
    this.taskProposals = new TaskProposalHost({
      product: this.product,
      screens: screenRepos,
      events: this.events,
      proactivity: this.proactivity,
      orchestration: this.orchestration,
      activeGoal: (projectId) => {
        this.boards.listSprintGoals(projectId) // rebuilds the in-memory board from the stored sprints
        return this.boards.goals.list(projectId).find(goal => goal.phase === 'active')?.objective
      },
      postRequest: request => postTeamRequest(this, request),
      humanActorId: workspaceId => this.actorOf(workspaceId)?.id ?? this.product.listMembers(workspaceId).find(row => row.role === 'owner')?.id,
    })
    this.proactivityScheduler = createProactivityScheduler({
      product: this.product,
      events: this.events,
      routines: this.routines,
      proactivity: this.proactivity,
      screens: screenRepos,
      orchestration: this.orchestration,
      boards: this.boards,
      teamState: this.teamState,
      governance: this.governance,
      draftFiles: this.draftFiles,
      workingControl: this.workingControl,
      taskProposals: this.taskProposals,
    }, { cycleMs: config.proactivityCycleMs ?? 30_000 })
    this.opt = new OptRepos(this.store, () => this.orchestration.now())
    this.ledger = new TurnLedgerRepos(this.store)
    this.orchestration.opt = this.opt
    this.orchestration.recordLedger = (projectId, entry) => {
      this.persistTurn(projectId, entry)
    }
    this.orchestration.recordActivity = (projectId, row) => {
      const project = this.product.getProject(projectId)
      if (project === undefined) return
      this.workingSend.recordActivity({
        workspaceId: project.workspaceId,
        projectId,
        id: row.id,
        personaId: row.personaId,
        subjectId: row.threadId,
        kind: row.kind,
        title: row.title,
        status: row.status,
        at: row.at,
      })
    }
    this.orchestration.accounts = this.accounts
    this.orchestration.accountSeatOf = (projectId, persona) => this.seatForPersona(projectId, persona)
    this.remoteTeam = new RemoteTeamHost({
      store: this.store, screens: screenRepos, events: this.events,
      pollMs: config.remoteTeamPollMs ?? 2500, timeoutMs: config.remoteTeamTimeoutMs ?? 20000,
      topicOf: (projectId, channelId) => this.activeSubjectId(projectId, 'channel', channelId),
      vault: () => {
        const vault = (ctx.get('personaVault') ?? ctx.get('credentials')) as RemoteTeamVault | undefined
        if (vault === undefined || typeof vault.sealInviteToken !== 'function' || typeof vault.dropInviteToken !== 'function') {
          return undefined
        }
        return vault
      },
    })
    if (this.store.recoveryMessage !== undefined) this.lastErrors.push(this.store.recoveryMessage)
    if (process.env.VITEST !== 'true') {
      this.connections.warm()
      this.orchestration.prewarmAll()
      this.proactivityScheduler.start()
    }
    this.mountGithubWebhook(ctx)
    this.mountMedia(ctx)
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        for (const persona of this.product.listPersonas(project.id)) this.governance.registerPersona(persona)
        this.scheduler.arm(project.id)
        this.remoteTeam.resume({ workspaceId: workspace.id, projectId: project.id })
        if (!allowsScriptedReplies()) {
          this.orchestration.runtime(project.id)
          this.curateProjectReports(project.id)
        }
      }
    }
    ctx.effect(() => async () => {
      this.engineReadinessDisposed = true
      this.proactivityScheduler.dispose()
      if (this.engineRetryTimer !== undefined) clearInterval(this.engineRetryTimer)
      if (this.quotaRecheckTimer !== undefined) clearTimeout(this.quotaRecheckTimer)
      this.scheduler.dispose()
      try {
        await this.orchestration.work
        await this.remoteTeam.dispose()
      } finally {
        try {
          await this.orchestration.disposeRunners()
        } finally {
          this.store.close()
        }
      }
    })
    installRemoteGuard(this, this.remoteGuard)
  }

  /**
   * True when Rivet's `personaRunners` plugin is live on this context.
   * @returns Whether `ctx.get('personaRunners')` resolved.
   */
  get usedPersonaRunners(): boolean {
    return runnersOf(this.ctx) !== undefined
  }

  /** Drop the short `listConversationSubjects` cache (writes and test reset). */
  forgetSubjectListCache(): void {
    this.subjectListCache.clear()
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
      ...this.gestorAuditOnCard(request.workspaceId, persona.id, persona.systemRoles),
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
    const plan = this.gestor.proposeHire(request)
    this.emitProposedGestor(plan, request.projectId)
    return plan
  }

  /**
   * Human accept of a pending Gestor plan.
   * @param request - Plan.
   */
  @Remote
  approveGestorPlan(request: ApproveGestorPlanRequest): GestorPlanView {
    this.requireGovOwner(request.workspaceId)
    return this.gestor.approvePlan(request)
  }

  /**
   * Human decline of a pending Gestor plan.
   * @param request - Plan.
   */
  @Remote
  rejectGestorPlan(request: RejectGestorPlanRequest): GestorPlanView {
    this.requireGovOwner(request.workspaceId)
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
    const pack = this.gestor.proposeAssemble(request)
    this.emitProposedGestor(pack.plan, request.projectId)
    return pack
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
    const roles = withDefaultGestor(request.systemRoles)
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
   * Second Gestor comments; the original plan stays proposed.
   * @param request - Open plan and commenter.
   */
  @Remote
  commentGestorPlan(request: CommentGestorPlanRequest): GestorPlanView {
    this.requireWorkspace(request)
    return this.gestor.commentPlan(request)
  }

  /**
   * Human picks the winner; others on the same scope are rejected.
   * @param request - Chosen plan.
   */
  @Remote
  resolveGestorTie(request: ResolveGestorTieRequest): GestorPlanView {
    this.requireWorkspace(request)
    return this.gestor.resolveTie(request)
  }

  /**
   * Propose placing a persona on projects.
   * @param request - Allocation draft.
   */
  @Remote
  proposeGestorAllocate(request: ProposeGestorAllocateRequest): GestorPlanView {
    this.requireWorkspace(request)
    const plan = this.gestor.proposeAllocate(request)
    this.emitProposedGestor(plan, request.projectIds[0])
    return plan
  }

  /**
   * Propose moving work, pausing idle, or setting autonomy.
   * @param request - Reorganize draft.
   */
  @Remote
  proposeGestorReorganize(request: ProposeGestorReorganizeRequest): GestorPlanView {
    this.requireWorkspace(request)
    const plan = this.gestor.proposeReorganize(request)
    this.emitProposedGestor(plan, request.projectId)
    return plan
  }

  /**
   * Queue a dashed composer bubble. Does not join the open turn.
   * @param request - Persona, subject, text.
   */
  @Remote
  enqueueWorkingMessage(request: EnqueueWorkingMessageRequest): QueuedMessageView {
    this.requireProject(request)
    return this.workingControl.enqueue(request)
  }

  /**
   * @param request - Persona + subject.
   */
  @Remote
  listWorkingQueue(request: WorkingQueueRequest): QueuedMessageView[] {
    this.requireProject(request)
    return this.workingControl.list(request)
  }

  /**
   * Edit text or drop the row when `text` is omitted.
   * @param request - Row.
   */
  @Remote
  editQueuedMessage(request: EditQueuedMessageRequest): QueuedMessageView[] {
    this.requireProject(request)
    return this.workingSend.edit(request)
  }

  /**
   * Remove one dashed bubble.
   * @param request - Row id (omit `text`).
   */
  @Remote
  dropQueuedMessage(request: EditQueuedMessageRequest): QueuedMessageView[] {
    this.requireProject(request)
    return this.workingControl.drop(request)
  }

  /**
   * Send the dashed queue now, in order, and clear it.
   * @param request - Persona + subject.
   */
  @Remote
  flushWorkingQueue(request: FlushWorkingQueueRequest): QueuedMessageView[] {
    this.requireWrite(request)
    return this.workingControl.flush(request)
  }

  /**
   * “Direcionar agora”: the text is the person's message and goes into the persona's open turn right away; with no open
   * turn it is a normal send. The message keeps a `steeredPersonaId` flag so the chip survives a reload.
   * @param request - Persona, subject, text and conversation.
   * @returns `steer` or `sent`, with the message id.
   */
  @Remote
  async steerWorkingTurn(request: SteerWorkingTurnRequest): Promise<SteerWorkingTurnView> {
    this.requireWrite(request)
    return this.workingControl.steer(request)
  }

  /**
   * Parar: cancel the open turn (the queue is kept), end the task as stopped by the person and say so in the thread.
   * `none` (nothing was running) is not an error.
   * @param request - Persona and, optionally, the ticket or the reply in flight.
   * @returns What was stopped and the line posted.
   */
  @Remote
  async stopTurn(request: StopTurnRequest): Promise<StopTurnView> {
    this.requireWrite(request)
    return this.workingControl.stop(request)
  }

  /**
   * Put a removed dashed bubble back where it was (“Desfazer” of Tirar).
   * @param request - The removed row.
   * @returns The queue after the restore.
   */
  @Remote
  restoreQueuedMessage(request: RestoreQueuedMessageRequest): QueuedMessageView[] {
    this.requireWrite(request)
    return this.workingControl.restore(request)
  }

  /**
   * `/lado` — stays off the thread.
   * @param request - Question.
   */
  @Remote
  openAsideAsk(request: OpenAsideAskRequest): AsideAskView {
    this.requireProject(request)
    return this.workingSend.aside(request)
  }

  /**
   * Persist one T3 §9 activity event.
   * @param request - Event.
   */
  @Remote
  recordTurnActivity(request: RecordTurnActivityRequest): TurnActivityView {
    this.requireProject(request)
    return this.workingSend.recordActivity(request)
  }

  /**
   * Fold turn activity for a subject. Empty is not 0% success.
   * @param request - Subject filter.
   */
  @Remote
  listTurnActivity(request: ListTurnActivityRequest): ActivityGroupView[] {
    this.requireProject(request)
    return this.workingSend.listActivity(request)
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
    return this.orchestration.kanban(request.projectId).map((card) => {
      const subjectLink = this.screens.screens.get<{ subjectId: string }>(
        request.projectId,
        'ticket_subject',
        card.ticketId,
      )
      return {
        id: card.ticketId,
        projectId: request.projectId,
        title: card.title,
        stage: card.column,
        stageAction: card.chip === 'waiting' ? 'waiting' : card.stageAction,
        ...(subjectLink === undefined || subjectLink.subjectId === ''
          ? {}
          : { topicId: subjectLink.subjectId, conversationSubjectId: subjectLink.subjectId }),
      }
    })
  }

  /**
   * Visão geral: needs-you first (blocked/failed/review), then in-progress.
   * @param request - Workspace and project.
   * @returns Attention, in-progress cards, and the first-delivery milestone when not idle.
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
    const firstDelivery = this.readFirstDelivery(request.projectId)
    return {
      needsYou: [...letters, ...cards.filter(card => card.stage === 'blocked' || card.stage === 'review')],
      inProgress: cards.filter(card => card.stage === 'doing' || card.stage === 'todo'),
      ...(firstDelivery.status === 'idle' ? {} : { firstDelivery }),
      ...(allowsScriptedReplies() ? {} : { engineStatus: this.engineStatus(request.projectId) }),
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
   * Coordination goals bound to sprints. Rebuilds from SQLite after remount.
   * @param request - Tenant.
   */
  @Remote
  listSprintGoals(request: ProjectScopeRequest): SprintGoalView[] {
    this.requireProject(request)
    return this.boards.listSprintGoals(request.projectId)
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
   * "Enquanto você estava fora": what the team did since the person was last here, and what waits for them now, from the
   * host's real records with a link to the real Task. Reading does NOT consume it: it stays the same for the whole session
   * until {@link dismissWhileAway}.
   * @param request - Tenant.
   */
  @Remote
  getWhileAway(request: ProjectScopeRequest): WhileAwayView {
    this.requireProject(request)
    return this.proactivity.whileAway(request.projectId)
  }

  /**
   * Record that the human opened the project (opens this session's window if needed; never resets an open one).
   * @param request - Tenant.
   */
  @Remote
  markVisit(request: ProjectScopeRequest): boolean {
    this.requireProject(request)
    this.proactivity.markVisit(request.projectId)
    return true
  }

  /**
   * The person saw "Enquanto você estava fora": the next summary starts now.
   * @param request - Tenant.
   */
  @Remote
  dismissWhileAway(request: ProjectScopeRequest): boolean {
    this.requireProject(request)
    this.proactivity.dismissWhileAway(request.projectId)
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
    this.curateProjectReports(request.projectId)
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
  async issueInvite(request: IssueInviteRequest): Promise<InviteView> {
    this.requireProject(request)
    if (!allowsScriptedReplies()) this.remoteTeam.requireVault()
    const remote = this.remoteTeam.state(request)
    if (remote !== undefined) {
      const actor = this.actorOf(request.workspaceId)
      if (actor?.workspaceRole !== 'owner' || actor.id !== remote.actorId) throw new Error('forbidden')
      return this.remoteTeam.issue(request)
    }
    return this.screens.issue(request)
  }

  /**
   * List invites of the workspace.
   * @param request - Tenant.
   */
  @Remote
  listInvites(request: ProjectScopeRequest): InviteView[] {
    this.requireWorkspace(request)
    if (this.remoteTeam.state(request) !== undefined) return this.remoteTeam.invites(request)
    return this.screens.listInvites(request.workspaceId)
  }

  /** @param request - Local edge and explicit channel selection. @returns Durable connection metadata without credentials. */
  @Remote
  async connectRemoteTeam(request: ConnectRemoteTeamRequest): Promise<RemoteTeamState> {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined || actor.workspaceRole !== 'owner') throw new Error('forbidden')
    for (const id of request.channelIds) {
      const channel = this.product.getChannel(id)
      if (channel === undefined || channel.projectId !== request.projectId) throw new Error('channel-not-found')
    }
    const displayName = this.product.listMembers(request.workspaceId).find(row => row.id === actor.id)?.displayName ?? actor.id
    return this.remoteTeam.connect(request, actor, displayName)
  }

  /** @param request - Single-use token; the caller cannot choose a remote role. @returns Granted channel state. */
  @Remote
  async acceptInvite(request: AcceptRemoteInviteRequest): Promise<RemoteTeamState> {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    const displayName = this.product.listMembers(request.workspaceId).find(row => row.id === actor.id)?.displayName ?? actor.id
    return this.remoteTeam.accept(request, actor, displayName)
  }

  /** @param request - Authorized connected project. @returns Accepted members and revocation metadata without credentials. */
  @Remote
  async listRemoteMembers(request: ProjectScopeRequest): Promise<RemoteMemberView[]> {
    this.requireProject(request)
    return this.remoteTeam.members(request)
  }

  /** @param request - Invite whose redeemed member is revoked. @returns True after the edge acknowledges revocation. */
  @Remote
  async revokeMember(request: InviteIdRequest): Promise<boolean> {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor?.workspaceRole !== 'owner') throw new Error('forbidden')
    await this.remoteTeam.revoke(request, request.inviteId)
    return true
  }

  /** @param request - Connected local project. @returns State after serialized push/pull, null before connection. */
  @Remote
  async syncRemoteTeam(request: ProjectScopeRequest): Promise<RemoteTeamState | null> {
    this.requireProject(request)
    return await this.remoteTeam.sync(request) ?? null
  }

  /** @param request - Local project. @returns Persisted connection/cursor/revocation metadata, null before connection. */
  @Remote
  getRemoteTeamState(request: ProjectScopeRequest): RemoteTeamState | null {
    this.requireProject(request)
    return this.remoteTeam.state(request) ?? null
  }

  /** @param request - Local project. @returns Cofre capability for connecting and inviting. */
  @Remote
  getRemoteTeamAvailability(request: ProjectScopeRequest): RemoteTeamAvailability {
    this.requireProject(request)
    return { vault: this.remoteTeam.vaultAvailability() }
  }

  /** @param request - Authorized project. @returns Supported history metadata without private directory paths. */
  @Remote
  async listRestorePoints(request: ProjectScopeRequest): Promise<RestorePointListView> {
    this.requireProject(request)
    const delivery = await this.orchestration.reviewDelivery(request.projectId)
    if (delivery === undefined) return { status: 'unconfigured', points: [] }
    if (delivery.listRestorePoints === undefined) return { status: 'unsupported', points: [] }
    return { status: 'available', points: await delivery.listRestorePoints() }
  }

  /** @param request - Person-authorized point in the same project. @returns Restoration, expiry, or a safe refusal preserving later edits. */
  @Remote
  async undoApply(request: UndoApplyRequest): Promise<UndoApplyView> {
    this.requireWrite(request)
    if (this.actorOf(request.workspaceId)?.kind !== 'user') throw new Error('forbidden')
    const pointId = parseReviewRestorePointId(request.restorePointId)
    const delivery = await this.orchestration.reviewDelivery(request.projectId)
    if (delivery?.listRestorePoints === undefined || delivery.undoApply === undefined) {
      return { kind: 'blocked', explanation: 'Este projeto não tem restauração disponível pela Persona.' }
    }
    if (!(await delivery.listRestorePoints()).some(point => point.id === pointId)) {
      throw new HostRemoteFault('not-found', 'Ponto de restauração não encontrado neste projeto.')
    }
    return delivery.undoApply(pointId)
  }

  /** @param request - Authorized project. @returns Logical private-history/draft bytes for Usage, with explicit scan failure. */
  @Remote
  async getProjectStorageUsage(request: ProjectScopeRequest): Promise<ProjectStorageUsageView> {
    this.requireProject(request)
    return projectStorageUsage(request.projectId)
  }

  /** @param request - Project scope. @returns Cached readiness and retained message count, without waiting for a probe. */
  @Remote
  getEngineStatus(request: ProjectScopeRequest): EngineStatusView {
    this.requireProject(request)
    return this.engineStatus(request.projectId)
  }

  /** @param request - Project scope. @returns Readiness after one forced check; model execution remains asynchronous. */
  @Remote
  async retryEngine(request: ProjectScopeRequest): Promise<EngineStatusView> {
    this.requireWrite(request)
    await this.connections.ready()
    this.handleReadyEngines()
    return this.engineStatus(request.projectId)
  }

  /** @param request - A person's confirmation of one expired retained message. @returns Current readiness and pending count. */
  @Remote
  async confirmEngineTrigger(request: EngineTriggerActionRequest): Promise<EngineStatusView> {
    this.requireEngineTriggerActor(request)
    await this.connections.ready()
    if (this.engineStatus(request.projectId).state === 'ready') {
      this.orchestration.resumeEngineTriggers(request.projectId, request.triggerId)
    }
    return this.engineStatus(request.projectId)
  }

  /** @param request - Retained message owned by the caller or workspace owner. @returns True on its first dismissal. */
  @Remote
  dismissEngineTrigger(request: EngineTriggerActionRequest): boolean {
    this.requireEngineTriggerActor(request)
    const dismissed = this.orchestration.runtime(request.projectId).engine.dismissEngineTrigger(request.triggerId)
    this.handleReadyEngines()
    return dismissed
  }

  /**
   * "Na hora, com outra conta": for each Task the quota window stopped, the other logged-in account of the same engine it could
   * move to now (or none). A proposal only: nothing changes until `confirmAccountSwap` (or the person's own policy switches it).
   * @param request - Project scope.
   * @returns One proposal per Task that has somewhere else to go.
   */
  @Remote
  getAccountSwapProposals(request: ProjectScopeRequest): AccountSwapProposalView[] {
    this.requireProject(request)
    return this.accountSwap.proposals(request.projectId)
  }

  /**
   * The person confirms the swap ("Continuar na {conta}"): the persona uses the chosen account from now on and the stopped Task
   * runs again on it, at once. Refused when the Task no longer waits or the account is not one of the proposed ones.
   * @param request - Task and the account chosen among the proposal's.
   * @returns Whether it was applied and whether the Task was run again.
   */
  @Remote
  async confirmAccountSwap(request: ConfirmAccountSwapRequest): Promise<AccountSwapResultView> {
    this.requireWrite(request)
    if (this.actorOf(request.workspaceId)?.kind !== 'user') throw new Error('forbidden')
    return this.accountSwap.confirm(request.projectId, request.ticketId, request.toAccountId)
  }

  /**
   * "Esperar até {hora}": the Task keeps waiting for the window and the Notice closes.
   * @param request - The waiting Task.
   * @returns True when it was waiting.
   */
  @Remote
  declineAccountSwap(request: DeclineAccountSwapRequest): boolean {
    this.requireWrite(request)
    if (this.actorOf(request.workspaceId)?.kind !== 'user') throw new Error('forbidden')
    return this.accountSwap.decline(request.projectId, request.ticketId)
  }

  /**
   * "Desfazer": the persona goes back to the account she left and waits there until that limit clears.
   * @param request - The switch (`swapId` of the thread line).
   * @returns Whether it was undone, or why not.
   */
  @Remote
  undoAccountSwap(request: UndoAccountSwapRequest): UndoAccountSwapResultView {
    this.requireWrite(request)
    if (this.actorOf(request.workspaceId)?.kind !== 'user') throw new Error('forbidden')
    return this.accountSwap.undo(request.projectId, request.swapId)
  }

  /**
   * The auditable history for "Uso e limites": every time an account hit its limit (with the vendor's clock and when it was
   * cleared) and every switch (automatic or confirmed, with whether it was undone), newest first. Append-only.
   * @param request - Project scope and an optional page size.
   * @returns The limit and switch history.
   */
  @Remote
  getAccountLimitBook(request: GetAccountLimitBookRequest): AccountLimitBookView {
    this.requireProject(request)
    return this.accountSwap.book(request.projectId, request.limit)
  }

  /**
   * Switches of the last 24 h, newest first: the "na conta Pessoal" subtitle and the Desfazer (`undoable`).
   * @param request - Project scope.
   * @returns The recent switches.
   */
  @Remote
  getAccountSwaps(request: ProjectScopeRequest): AccountSwapRecordView[] {
    this.requireProject(request)
    return this.accountSwap.recent(request.projectId)
  }

  /** Other engines that are connected, logged in and not at their limit ("Usar {outro motor} enquanto isso"). */
  private alternativeEngines(projectId: string): string[] {
    const waitingProviders = new Set(this.orchestration.quotaRows(projectId).flatMap((row) => {
      const persona = row.personaId === undefined ? undefined : this.product.getPersona(row.personaId)
      return persona?.runner.kind === 'cli' && persona.runner.cli !== undefined ? [persona.runner.cli] : []
    }))
    return this.connections.list()
      .filter(card => card.kind !== 'dsh' && card.available && card.loggedIn && card.error?.code !== 'quota_exhausted' && !waitingProviders.has(card.kind))
      .map(card => card.kind)
  }

  private engineStatus(projectId: string): EngineStatusView {
    const status = this.orchestration.engineReadinessOf?.() ?? { state: 'checking' as const, reason: null }
    const waiting = this.orchestration.quotaWaiting().filter(row => row.projectId === projectId)
    const resetsAt = waiting.map(row => row.resetAt).filter((clock): clock is string => clock !== undefined).sort()[0]
    return {
      ...status,
      pending: this.orchestration.runtime(projectId).engine.pendingEngineTriggers().length,
      ...(waiting.length === 0 ? {} : { quotaWaiting: waiting.length, alternativeEngines: this.alternativeEngines(projectId) }),
      ...(resetsAt === undefined ? {} : { quotaResetsAt: resetsAt }),
    }
  }

  private requireEngineTriggerActor(request: EngineTriggerActionRequest): void {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    const trigger = this.orchestration.runtime(request.projectId).repo.triggers.get(request.triggerId)
    if (trigger === undefined) throw new Error('not-found')
    if (actor?.kind !== 'user' || (actor.workspaceRole !== 'owner' && actor.id !== trigger.actor.id)) throw new Error('forbidden')
  }

  private handleReadyEngines(): void {
    if (this.engineReadinessDisposed || allowsScriptedReplies()) return
    if (cachedEngineReadiness(this.connections.list()).state !== 'ready') return
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        this.accountSwap.expireLimits(project.id)
        this.orchestration.resumeEngineTriggers(project.id)
        // A Task the quota window stopped runs again now that an engine is ready (IV-7).
        void this.orchestration.resumeQuotaWaiting(project.id).catch((error: unknown) => {
          // The row stays out of the list only after it ran or went stale; a failure here leaves the Ticket blocked for Retomar.
          void error
        })
      }
    }
  }

  /** Look again when the quota window resets (or in 5 min when the vendor gave no clock), while a Task waits for it. */
  private armQuotaRecheck(): void {
    if (this.engineReadinessDisposed) return
    if (this.quotaRecheckTimer !== undefined) clearTimeout(this.quotaRecheckTimer)
    const rows = this.orchestration.quotaWaiting()
    const delay = quotaRecheckDelay(rows, Date.now(), 5 * 60_000)
    if (delay === undefined) {
      this.quotaRecheckTimer = undefined
      return
    }
    this.quotaRecheckTimer = setTimeout(() => {
      this.quotaRecheckTimer = undefined
      void this.connections.ready().then(() => {
        this.handleReadyEngines()
        if (this.orchestration.quotaWaiting().length > 0) this.armQuotaRecheck()
      }).catch((error: unknown) => {
        void error
        this.armQuotaRecheck()
      })
    }, delay)
    this.quotaRecheckTimer.unref()
  }

  private armEngineRetry(): void {
    if (this.engineReadinessDisposed || this.engineRetryTimer !== undefined || this.engineRetryPollMs === 0) return
    this.engineRetryTimer = setInterval(() => {
      const pending = [...this.orchestration.runtimes.values()].some(rt => rt.engine.pendingEngineTriggers().length > 0)
      if (!pending) {
        if (this.engineRetryTimer !== undefined) clearInterval(this.engineRetryTimer)
        this.engineRetryTimer = undefined
        return
      }
      void this.connections.ready().catch((error: unknown) => {
        // The retained triggers stay durable until a later check succeeds.
        void error
      })
    }, this.engineRetryPollMs)
    this.engineRetryTimer.unref()
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
    return this.routines.list(request.projectId).map((routine) => {
      const view = this.routineView(routine)
      return {
        ...view,
        silenceStart: routine.silenceStart ?? '',
        silenceEnd: routine.silenceEnd ?? '',
        runs: this.routines.listRuns(routine.id).map(toRunView),
      }
    })
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
   * Registered project folders for Rivet `revealInFolder` (not PERSONA_HOME / session picks).
   * @param request - Workspace.
   */
  @Remote
  listProjectRoots(request: WorkspaceScopeRequest): ProjectRootListView {
    this.requireWorkspace(request)
    const actor = this.actorOf(request.workspaceId)
    const roots = this.product.listProjects(request.workspaceId)
      .filter(project => actor === undefined || sessionCan(actor, 'read', {
        type: 'project', workspaceId: request.workspaceId, projectId: project.id,
      }))
      .flatMap((project) => {
        const rootPath = project.rootPath
        if (rootPath === undefined || rootPath === '') return []
        return [{ workspaceId: request.workspaceId, projectId: project.id, rootPath }]
      })
    return { roots }
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
    return this.screens.listApprovals(request.projectId).map((card) => {
      const audit = this.screens.screens.get<{ grantId: string; explanation: string }>(
        request.projectId, 'remembered_approval', `${card.kind}:${card.id}`)
      return { ...this.governance.approval(request.workspaceId, card),
        ...(audit === undefined ? {} : { permissionGrantId: audit.grantId, permissionAudit: audit.explanation }) }
    })
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
    return this.applyRememberedApproval(request, this.screens.proposeVault(request))
  }

  /**
   * Propose enabling a skill.
   * @param request - Skill card.
   */
  @Remote
  proposeSkill(request: ProposeSkillRequest): ApprovalView {
    this.requireProject(request)
    return this.applyRememberedApproval(request, this.screens.proposeSkill(request))
  }

  /**
   * Accept or reject an approval card.
   * @param request - Decision.
   */
  @Remote
  decideApproval(request: DecideApprovalRequest): ApprovalView {
    this.requireWrite(request)
    const card = this.listApprovals(request).find(row => row.id === request.id && row.kind === request.kind)
    if (card === undefined) throw new Error('approval-not-found')
    if (card.status !== 'pending') return card
    const actor = this.actorOf(request.workspaceId)
    if (card.waitNotice !== undefined) throw new HostRemoteFault('approval-waiting', card.waitNotice)
    if (actor?.id !== card.routedToId && actor?.workspaceRole !== 'owner') throw new Error('forbidden')
    return this.store.tx(() => {
      const decided = this.screens.decide(request)
      this.screens.screens.put(request.projectId, 'approval_decision', `${request.kind}:${request.id}`, {
        actorId: actor?.id ?? '', routedToId: card.routedToId ?? '', onBehalfOfId: card.onBehalfOfId ?? '',
        accept: request.accept, at: this.orchestration.now(),
      })
      return { ...card, ...decided }
    })
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
    return this.store.tx(() => {
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
        systemRoles: withDefaultGestor(request.systemRoles === undefined ? [] : request.systemRoles),
        canRecruit: request.canRecruit,
        createdAt: now,
        updatedAt: now,
        createdBy: request.createdBy,
      }, request.projectId)
      this.governance.registerPersona(stored)
      this.orchestration.ensureCoordination(request.projectId)
      return toPersonaView(stored)
    })
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
    return this.appendMessage(request)
  }

  private appendMessage(request: PostMessageRequest, firstDelivery?: { executorId: string; title: string }): MessageView {
    this.requireProject(request)
    const timestamp = z.iso.datetime({ offset: true }).safeParse(request.occurredAt ?? this.orchestration.now())
    if (!timestamp.success) throw new HostRemoteFault('invalid-payload', 'Informe um horário ISO válido para a mensagem.')
    this.forgetSubjectListCache()
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
      occurredAt: timestamp.data,
      ...(request.replyToId === undefined || request.replyToId === '' ? {} : { replyToId: request.replyToId }),
      ...(topicId === undefined || topicId === '' ? {} : { topicId }),
    })
    rememberReportAudience(this.product, this.screens.screens, stored)
    this.media.bindToMessage(
      stored.id,
      request.attachmentIds ?? [],
      request.projectId,
      request.streamKind,
      request.ownerId,
    )
    this.orchestration.ingest(stored, request.streamKind, request.ownerId, request.responderId ?? '', undefined, firstDelivery)
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
    const queue: Array<{ view: MessageView; changed: boolean }> = []
    const disposeAppends = this.events.subscribe((event) => {
      if (event.streamId !== streamId) return
      queue.push({ view: this.viewMessage(event), changed: false })
    })
    // A reply that is being written grows in place: its changes are re-sent as upserts of the same id.
    const disposeChanges = this.events.subscribeChanges((event) => {
      if (event.streamId !== streamId) return
      queue.push({ view: this.viewMessage(event), changed: true })
    })
    const dispose = (): void => { disposeAppends(); disposeChanges() }
    try {
      const actor = this.actorOf(request.workspaceId)
      const page = this.events.list(streamId, { id: actor?.id ?? '' }, request.afterSeq, request.limit)
      const events = page.events.map(event => this.viewMessage(event))
      const seen = new Set(events.map(item => item.id))
      yield { kind: 'baseline', events, order: events.map(item => item.id) }
      while (!signal.aborted) {
        const head = queue.shift()
        if (head !== undefined) {
          const next = head.view
          // Skip a stale intermediate state when a newer one of the same message is already waiting.
          if (head.changed && queue.some(item => item.changed && item.view.id === next.id)) continue
          if (!head.changed && seen.has(next.id)) continue
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
    else if (request.command === 'retry') {
      engine.retryTicket(request.ticketId)
      const delivery = this.readFirstDelivery(request.projectId)
      if (ticket.origin.triggerId === FIRST_DELIVERY_EVENT_ID && delivery.status === 'failed') {
        this.persistFirstDelivery(request.projectId, { ...delivery, status: 'working' })
      }
    }
    else if (request.command === 'reevaluate') engine.reevaluate(ticket.origin.triggerId)
    else if (request.command === 'complete') this.orchestration.completeReview(request.projectId, request.ticketId)
    else engine.dismiss(ticket.decisionId)
    return true
  }

  /**
   * A person's answer to a persona's question (IV-10): text and/or files, INSIDE the thread. The answer is posted as the
   * person's own message in the conversation the question was asked in (files bound to it), the ticket receives the text with
   * the file names, the files are copied next to the worker, and the worker wakes and reads it. Answering twice is refused
   * (`conflict`) — one answer per question, and the first one stays.
   * @param request - Ticket, text and optional `attachFile` ids (uploaded to the conversation the question was asked in).
   * @returns true when the question is cleared.
   */
  @Remote
  answerAttention(request: AttentionReplyRequest): boolean {
    this.requireWrite(request)
    const answer = checkAttentionAnswer(request.text, request.attachmentIds)
    const ticket = this.orchestration.runtime(request.projectId).repo.tickets.get(request.ticketId)
    if (ticket === undefined) throw new HostRemoteFault('not-found', 'Tarefa não encontrada neste projeto.')
    const question = ticket.attention
    if (question === undefined) throw new HostRemoteFault('conflict', 'Essa pergunta já foi respondida.')
    const where = this.orchestration.conversationOfTicket(request.projectId, ticket.id)
    const owner = this.actorOf(request.workspaceId) ?? this.product.listMembers(request.workspaceId).find(row => row.role === 'owner')
    if (where === undefined || owner === undefined) throw new HostRemoteFault('forbidden', 'forbidden')
    const messageId = `answer:${ticket.id}:${question.id}`
    // Files first: a bad id fails before anything is posted. They belong to the conversation of the question.
    try {
      this.media.bindToMessage(messageId, answer.attachmentIds, request.projectId, where.streamKind, where.ownerId)
    } catch (error: unknown) {
      if (error instanceof Error && /attachment-(not-found|mismatch|bound)|too-many-files/u.test(error.message)) {
        throw new HostRemoteFault('invalid-payload', 'Um dos arquivos não pertence a esta conversa. Anexe de novo.')
      }
      throwMedia(error)
    }
    if (!this.events.has(messageId)) {
      this.events.append({
        id: messageId,
        workspaceId: request.workspaceId,
        projectId: request.projectId,
        streamKind: where.streamKind,
        ownerId: where.ownerId,
        type: 'message',
        body: answer.text,
        actorId: owner.id,
        subjectId: where.subjectId,
        occurredAt: this.orchestration.now(),
        ...(where.topicId === '' ? {} : { topicId: where.topicId }),
      })
    }
    return this.orchestration.deliverAttentionAnswer(request.projectId, ticket.id, answer.text, messageId)
  }

  /**
   * List vault records of the project, newest first.
   * @param request - Tenant.
   * @returns Record cards.
   */
  @Remote
  listVaultRecords(request: ProjectScopeRequest): VaultRecordView[] {
    this.requireProject(request)
    return this.visibleVaultRecords(request).map(record => ({
      id: record.id,
      projectId: request.projectId,
      kind: record.kind,
      body: record.body,
      status: record.status,
    }))
  }

  private visibleVaultRecords(request: ProjectScopeRequest): ReturnType<VaultRepos['listRecords']> {
    const actor = this.actorOf(request.workspaceId)
    return actor === undefined ? [] : this.vault.listRecords(request.projectId).filter(record => canReadVault(actor, record))
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
    const stored = this.screens.screens.get<{ leftover: readonly string[] }>(
      request.projectId, 'brain_vault_leftover', 'last',
    )
    return {
      ...this.brain.home(request.workspaceId, request.projectId),
      leftover: stored?.leftover ?? this.brain.lastLeftover,
    }
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
    const result = this.brain.syncFolder(
      request.workspaceId,
      request.projectId,
      request.folderPath,
      request.twoWay === true,
      actor?.id ?? 'owner',
    )
    this.persistVaultLeftover(request.projectId, request.folderPath, result.leftover)
    return result
  }

  /**
   * Two-way folder sync imports authorized edits before export; same slug+hash is a skip.
   * @param request - Folder path.
   */
  @Remote
  importBrainVault(request: BrainVaultFolderRequest): BrainVaultFolderView {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    const result = this.brain.syncFolder(
      request.workspaceId,
      request.projectId,
      request.folderPath,
      true,
      actor?.id ?? 'owner',
    )
    this.persistVaultLeftover(request.projectId, request.folderPath, result.leftover)
    return result
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
      existing: vaultToBringExisting(this.visibleVaultRecords(request)),
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
      vaultToBringExisting(this.visibleVaultRecords(request)),
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
    return this.store.tx(() => {
      const ids: string[] = []
      const projectRecordIds = new Set(this.vault.listRecords(request.projectId).map(row => row.id))
      for (const proposal of writes) {
        const existing = this.vault.getRecord(proposal.id)
        if (existing !== undefined) {
          if (existing.workspaceId !== request.workspaceId || !projectRecordIds.has(existing.id)
            || actor === undefined || !canReadVault(actor, existing)) throw new Error('forbidden')
          const body = vaultToBringExisting([existing])[0]?.body ?? ''
          if (existing.kind !== proposal.kind || body.trim() !== proposal.body.trim()) {
            throw new HostRemoteFault('conflict', 'Há conteúdo diferente com a mesma identificação. Nada foi gravado.')
          }
          continue
        }
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
        projectRecordIds.add(proposal.id)
        ids.push(proposal.id)
      }
      return {
        written: ids.length,
        skipped: Math.max(0, request.items.length - ids.length),
        ids,
      }
    })
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
      if (this.connections.list().some(card => card.phase === 'checking')) await this.connections.ready()
      this.bindPersonasToLoggedCli(state.personalProjectId)
      this.scheduler.arm(state.personalProjectId)
      void this.orchestration.prewarmProject(state.personalProjectId)
      this.postFirstDeliveryAsk(request, state.personalProjectId)
    }
    return state
  }

  /**
   * Kick Intake→Ticket→Assignment on #geral for the first real delivery.
   * Idempotent. Uses the logged-in CLI when the persona is still `dsh`.
   * @param request - Tenant.
   * @returns Ticket created (or the previous one).
   */
  @Remote
  async startFirstDelivery(request: ProjectScopeRequest): Promise<FirstDeliveryStartView> {
    this.requireWrite(request)
    this.bindPersonasToLoggedCli(request.projectId)
    const prior = this.readFirstDelivery(request.projectId)
    if (prior.status === 'ready' || prior.status === 'failed') {
      return { started: true, eventId: prior.eventId, ticketId: prior.ticketId, idempotent: true }
    }
    const workspace = this.product.getWorkspace(request.workspaceId)
    this.postFirstDeliveryAsk({
      workspaceId: request.workspaceId,
      personalProjectId: request.projectId,
      displayName: workspace?.name ?? '',
      team: [],
      templateIds: [],
      runnerChoices: [],
      cofreSeed: '',
    }, request.projectId)
    try {
      await this.orchestration.flush(request.projectId)
    } catch (error) {
      this.sealFirstDelivery(request, 'failed')
      throw error
    }
    this.sealFirstDelivery(request)
    const sealed = this.readFirstDelivery(request.projectId)
    return {
      started: true,
      eventId: sealed.eventId || FIRST_DELIVERY_EVENT_ID,
      ticketId: sealed.ticketId,
      idempotent: false,
    }
  }

  /**
   * Persisted first-delivery status. Always idle|working|ready|failed — never a hang.
   * @param request - Tenant.
   * @returns Milestone card; idle before the ask.
   */
  @Remote
  getFirstDelivery(request: ProjectScopeRequest): FirstDeliveryView {
    this.requireProject(request)
    return this.readFirstDelivery(request.projectId)
  }

  /**
   * Step 5 chips: up to three requests derived from what the person wrote about the business (no AI, no invented facts).
   * Empty when there is nothing to derive from, so the UI keeps its fixed suggestions.
   * @param request - The step-2 company text.
   * @returns 0–3 short pt-BR requests.
   */
  @Remote
  suggestFirstRequests(request: SuggestFirstRequestsRequest): SuggestFirstRequestsView {
    return { suggestions: suggestFirstRequests(typeof request.cofreSeed === 'string' ? request.cofreSeed : '') }
  }

  /**
   * What an ask will cost before it is sent: how many calls of the person's AI, whether it becomes a Ticket, token and cost
   * ranges, and time only when a real run measured it. Local and synchronous: no model is called
   * (persona-spec/contracts/estimate-ask.md).
   * @param request - Text, stream and whether it is the step 5 first delivery.
   * @returns The estimate with a ready-to-show line.
   */
  @Remote
  estimateAsk(request: EstimateAskRequest): EstimateAskView {
    this.requireProject(request)
    const personas = this.product.listPersonas(request.projectId)
    const dm = request.streamKind === 'dm' ? this.product.getDm(request.ownerId) : undefined
    const persona = dm === undefined
      ? personas.find(row => row.systemRoles.includes('coordination'))
      : [dm.participantA, dm.participantB].map(id => this.product.getPersona(id)).find(row => row !== undefined)
    const logged = this.orchestration.loggedCliOf?.(request.projectId)
    const spec = persona === undefined ? undefined : specFromConnection(persona.runner, logged)
    const cli = spec?.kind === 'cli' ? spec.cli : (logged ?? 'none')
    // OPT-9: this person's own measured turns on the same engine and account (read-only; none ⇒ no calibration, never a guess).
    const account = persona === undefined ? undefined
      : this.screens.screens.get<{ accountId: string }>(request.projectId, 'active_account', persona.id)?.accountId
    const now = this.orchestration.now()
    const windowStart = calibrationWindowStart(now)
    const calibracao = cli === 'none' ? undefined : calibrationFromLedger(
      this.ledger.list({ projectId: request.projectId, ...(windowStart === undefined ? {} : { from: windowStart }) }),
      { engine: cli, ...(account === undefined || account === '' ? {} : { accountId: account }), now },
    )
    return estimateAskFor({
      texto: request.texto,
      ...(persona === undefined ? {} : {
        persona: { id: persona.id, name: persona.name, title: persona.title, personality: persona.personality, instructions: persona.instructions },
      }),
      motor: { cli, connected: cli !== 'none' },
      contexto: {
        primeiraEntrega: request.primeiraEntrega === true,
        pendenteDaPersona: this.orchestration.pendingFromPersonaIn(request.projectId, `${request.streamKind}:${request.ownerId}`),
      },
      host: { skipTriage: this.orchestration.skipTriage, courtesyNoModel: this.orchestration.courtesyNoModel },
      ...(calibracao === undefined ? {} : { calibracao }),
    })
  }

  /**
   * Persist the logged-in CLI on personas that are still `dsh`.
   * @param projectId - Tenant.
   * @returns Bound CLI, or undefined when none is logged in.
   */
  bindPersonasToLoggedCli(projectId: string): DetectedCli | undefined {
    const logged = this.orchestration.loggedCliOf?.(projectId)
    if (logged === undefined) return undefined
    for (const persona of this.product.listPersonas(projectId)) {
      if (persona.runner.kind === 'cli') continue
      this.product.updatePersona({
        ...persona,
        runner: {
          kind: 'cli',
          cli: logged,
          model: persona.runner.model === '' || persona.runner.model === 'default'
            ? cheapModelForFirstDelivery(logged)
            : persona.runner.model,
        },
        updatedAt: this.orchestration.now(),
      }, projectId)
    }
    return logged
  }

  /**
   * First logged-in CLI card (not `dsh`).
   * @returns Detected CLI or undefined while checking / logged out.
   */
  loggedCli(): DetectedCli | undefined {
    return loggedCliFromCards(this.connections.list())
  }

  /**
   * Post the engine `firstDeliveryAsk` on #geral and ingest it (Ticket).
   * Idempotent on `first-delivery`.
   * @param request - Onboarding fields (brief from Cofre seed or display name).
   * @param projectId - Tenant.
   */
  postFirstDeliveryAsk(request: CompleteOnboardingRequest, projectId: string): void {
    if (!this.events.has(FIRST_DELIVERY_EVENT_ID)) {
      const owner = this.actorOf(request.workspaceId)
        ?? this.product.listMembers(request.workspaceId).find(row => row.role === 'owner')
        ?? this.product.listMembers(request.workspaceId)[0]
      if (owner === undefined) return
      const brief = request.cofreSeed !== '' ? request.cofreSeed : request.displayName
      const firstRequest = normalizeFirstRequest(request.firstRequest)
      const executor = this.product.listPersonas(projectId).find(persona => !persona.systemRoles.includes('coordination'))
        ?? this.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
      if (executor === undefined) return
      this.appendMessage({
        id: FIRST_DELIVERY_EVENT_ID,
        workspaceId: request.workspaceId,
        projectId,
        streamKind: 'channel',
        ownerId: 'geral',
        body: firstRequest === '' ? firstDeliveryAsk({ companyBrief: brief }) : firstRequestAsk(firstRequest, brief),
        actorId: owner.id,
        subjectId: 'first-delivery',
        occurredAt: this.orchestration.now(),
      }, { executorId: executor.id, title: 'Primeira entrega' })
    }
    this.markFirstDeliveryWorking(projectId)
  }

  /**
   * Persist `working` after the ask is on #geral. Ready/failed stay sealed.
   * @param projectId - Tenant.
   */
  markFirstDeliveryWorking(projectId: string): void {
    const current = this.readFirstDelivery(projectId)
    if (current.status === 'ready' || current.status === 'failed') return
    const ticket = this.firstDeliveryTicket(projectId)
    const who = this.firstDeliveryActor(projectId, ticket?.execution?.name ?? current.personaName)
    this.persistFirstDelivery(projectId, {
      status: 'working',
      eventId: FIRST_DELIVERY_EVENT_ID,
      ticketId: ticket?.id ?? current.ticketId,
      title: ticket?.title ?? current.title,
      personaId: who.id,
      personaName: who.name,
      feedEventId: current.feedEventId,
    })
  }

  /**
   * Seal after flush: ready when the runner delivered, failed when blocked, else working.
   * Posts `first-delivery-milestone` on #geral without ingest. Auto-completes review.
   * @param request - Tenant.
   * @param force - Optional failed seal when flush throws.
   */
  sealFirstDelivery(request: ProjectScopeRequest, force?: 'failed'): void {
    const current = this.readFirstDelivery(request.projectId)
    if (current.status === 'ready') return
    const ticket = this.firstDeliveryTicket(request.projectId)
    const who = this.firstDeliveryActor(request.projectId, ticket?.execution?.name ?? current.personaName)
    if (force === 'failed' || ticket === undefined) {
      this.persistFirstDelivery(request.projectId, {
        status: 'failed',
        eventId: FIRST_DELIVERY_EVENT_ID,
        ticketId: ticket?.id ?? current.ticketId,
        title: ticket?.title ?? current.title,
        personaId: who.id,
        personaName: who.name,
        feedEventId: current.feedEventId,
      })
      return
    }
    const column = this.orchestration.kanban(request.projectId)
      .find(card => card.ticketId === ticket.id)?.column
    if (column === 'blocked') {
      this.persistFirstDelivery(request.projectId, {
        status: 'failed',
        eventId: FIRST_DELIVERY_EVENT_ID,
        ticketId: ticket.id,
        title: ticket.title,
        personaId: who.id,
        personaName: who.name,
        feedEventId: current.feedEventId,
      })
      return
    }
    if (column !== 'review' && column !== 'done') {
      this.persistFirstDelivery(request.projectId, {
        status: 'working',
        eventId: FIRST_DELIVERY_EVENT_ID,
        ticketId: ticket.id,
        title: ticket.title,
        personaId: who.id,
        personaName: who.name,
        feedEventId: current.feedEventId,
      })
      return
    }
    if (column === 'review') this.orchestration.completeReview(request.projectId, ticket.id)
    this.postFirstDeliveryMilestone(request, ticket.title, who.id)
    this.persistFirstDelivery(request.projectId, {
      status: 'ready',
      eventId: FIRST_DELIVERY_EVENT_ID,
      ticketId: ticket.id,
      title: ticket.title,
      personaId: who.id,
      personaName: who.name,
      feedEventId: FIRST_DELIVERY_MILESTONE_EVENT_ID,
    })
  }

  /**
   * Append-only milestone on #geral. Does not ingest (no second Ticket).
   * @param request - Tenant.
   * @param title - Ticket title.
   * @param actorId - Executor or owner.
   */
  postFirstDeliveryMilestone(request: ProjectScopeRequest, title: string, actorId: string): void {
    if (this.events.has(FIRST_DELIVERY_MILESTONE_EVENT_ID)) return
    const speaker = actorId !== ''
      ? actorId
      : (this.actorOf(request.workspaceId)?.id
        ?? this.product.listMembers(request.workspaceId).find(row => row.role === 'owner')?.id
        ?? '')
    if (speaker === '') return
    this.events.append({
      id: FIRST_DELIVERY_MILESTONE_EVENT_ID,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      streamKind: 'channel',
      ownerId: 'geral',
      type: 'message',
      body: `Primeira entrega pronta: ${title}`,
      actorId: speaker,
      subjectId: 'first-delivery',
      occurredAt: this.orchestration.now(),
    })
  }

  /**
   * Ticket opened by `first-delivery`, or the persisted id.
   * @param projectId - Tenant.
   */
  firstDeliveryTicket(projectId: string): { id: string; title: string; execution?: { name: string } } | undefined {
    const tickets = this.orchestration.runtime(projectId).repo.tickets.list()
    const byOrigin = tickets.find(row => row.origin.triggerId === FIRST_DELIVERY_EVENT_ID)
    if (byOrigin !== undefined) return byOrigin
    const stored = this.readFirstDelivery(projectId)
    if (stored.ticketId === '') return undefined
    return tickets.find(row => row.id === stored.ticketId)
  }

  /**
   * Executor (or coordination) for the milestone card.
   * @param projectId - Tenant.
   * @param preferredName - Ticket execution name when present.
   */
  firstDeliveryActor(projectId: string, preferredName: string): { id: string; name: string } {
    const personas = this.product.listPersonas(projectId)
    const named = preferredName === '' ? undefined : personas.find(row => row.name === preferredName)
    const executor = personas.find(row => !row.systemRoles.includes('coordination'))
    const coord = personas.find(row => row.systemRoles.includes('coordination'))
    const who = named ?? executor ?? coord
    return { id: who?.id ?? '', name: who?.name ?? '' }
  }

  /**
   * Idle when nothing is persisted. Never a loading sentinel.
   * @param projectId - Tenant.
   */
  readFirstDelivery(projectId: string): FirstDeliveryView {
    return this.screens.screens.get<FirstDeliveryView>(projectId, 'first_delivery', 'v1')
      ?? {
        status: 'idle',
        eventId: '',
        ticketId: '',
        title: '',
        personaId: '',
        personaName: '',
        feedEventId: '',
      }
  }

  /**
   * Persist the milestone row (screen `first_delivery` / `v1`).
   * @param projectId - Tenant.
   * @param row - Status and card fields.
   */
  persistFirstDelivery(projectId: string, row: FirstDeliveryView): void {
    this.screens.screens.put(projectId, 'first_delivery', 'v1', row)
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
    this.persistOfficialQuota(this.connections.snaps(), request.projectId)
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
    const cacheKey = `${request.projectId}:${request.streamKind}:${request.ownerId}:${actor.id}`
    const hit = this.subjectListCache.get(cacheKey)
    const now = Date.parse(this.orchestration.now())
    if (hit !== undefined && now - hit.at < SUBJECT_LIST_CACHE_MS) return hit.value
    const working = workingBySubject(
      this.orchestration.runtime(request.projectId).repo.tickets.list(),
      ticketId => this.screens.screens.get<{ subjectId: string }>(request.projectId, 'ticket_subject', ticketId)?.subjectId,
    )
    const subjects = subjectViews(this.topics, request, actor.id, working)
      .filter(row => !row.archived)
    const active = this.activeSubjectId(request.projectId, request.streamKind, request.ownerId)
      ?? subjects[0]?.id ?? ''
    const value = { subjects, activeSubjectId: active }
    this.subjectListCache.set(cacheKey, { at: now, value })
    return value
  }

  /**
   * New messages and persona replies go to this subject.
   * @param request - Stream + subject.
   */
  @Remote
  setActiveConversationSubject(request: ArchiveConversationSubjectRequest): ConversationSubjectsBundleView {
    this.requireWrite(request)
    this.requireConversationSubject(request)
    const found = this.topics.get(request.subjectId)
    if (found === undefined || found.archived) throw new Error('not-found')
    this.screens.screens.put(request.projectId, 'conversation_active', `${request.streamKind}:${request.ownerId}`, {
      subjectId: request.subjectId,
    })
    this.subjectListCache.clear()
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
    if (existing.some(row => !row.archived && row.colorIndex === colorIndex)) {
      throw new HostRemoteFault('invalid-payload', 'Esta cor já está em uso nesta conversa.')
    }
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
    this.requireConversationSubject(request)
    this.topics.rename(request.subjectId, request.name)
    this.subjectListCache.clear()
    return this.listConversationSubjects(request)
  }

  /**
   * @param request - Subject to hide.
   */
  @Remote
  archiveConversationSubject(request: ArchiveConversationSubjectRequest): ConversationSubjectsBundleView {
    this.requireWrite(request)
    this.requireConversationSubject(request)
    this.topics.archive(request.subjectId, true)
    this.subjectListCache.clear()
    return this.listConversationSubjects(request)
  }

  private requireConversationSubject(request: ArchiveConversationSubjectRequest): void {
    const row = this.topics.get(request.subjectId)
    if (row === undefined || row.workspaceId !== request.workspaceId || row.projectId !== request.projectId
      || row.streamKind !== request.streamKind || row.ownerId !== request.ownerId) {
      throw new HostRemoteFault('not-found', 'Assunto não encontrado nesta conversa.')
    }
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
  listConnectionAccounts(request: ListConnectionAccountsRequest): ConnectionAccountsBundleView {
    this.requireProject(request)
    const named = request.personaId === undefined ? undefined : this.product.getPersona(request.personaId)
    if (request.personaId !== undefined && (named?.workspaceId !== request.workspaceId || named.projectId !== request.projectId)) {
      throw new Error('not-found')
    }
    const probes = this.connections.list()
    const stored = this.accounts.list(request.workspaceId)
    const accounts = stored.length > 0
      ? stored.map((row) => {
        const probe = probes.find(item => item.kind === row.provider)
        const used = this.accounts.usageForAccount(row.id)[0]
        const runs = used?.runs ?? 0
        const loggedIn = row.homeDir === '' ? probe?.loggedIn ?? false : accountLoginStatus(row.homeDir) === 'logged_in'
        const loginCommand = isolatedAccountLoginCommand(row.provider, row.homeDir)
        return {
          id: row.id,
          provider: (probe?.kind ?? row.provider) as ConnectionView['kind'],
          label: row.label,
          available: probe?.available ?? false,
          loggedIn,
          loginHint: probe?.loginHint ?? '',
          phase: probe?.phase ?? (row.status === 'checking' ? 'checking' as const : 'ready' as const),
          ...(!loggedIn && row.homeDir !== ''
            ? { error: { code: 'not_logged_in' as const, message: 'Entre na conta usando o comando de login desta conta.' } }
            : probe?.error === undefined || probe.error.code === 'not_logged_in' ? {} : { error: probe.error }),
          ...(runs === 0 ? {} : { inUseCount: runs }),
          ...(loginCommand === undefined ? {} : { loginCommand }),
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
    const provider = named?.runner.kind === 'cli' ? named.runner.cli : accounts[0]?.provider ?? 'dsh'
    const swap = storedSwapPolicy(this.accounts, request.workspaceId, provider, request.personaId)
    const personaPolicies = this.product.listPersonas(request.projectId).flatMap((persona) => {
      const policy = storedSwapPolicy(this.accounts, request.workspaceId, provider, persona.id)
      return policy.scope === 'persona' ? [{ personaId: persona.id, policy: policy.policy }] : []
    })
    return { accounts, swapPolicy: swap.policy, swapPolicyScope: swap.scope, personaPolicies }
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
    if (request.scope === 'persona' && (named?.workspaceId !== request.workspaceId || named.projectId !== request.projectId)) {
      throw new Error('not-found')
    }
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
  addConnectionAccount(request: AddConnectionAccountRequest): ConnectionAccountsBundleView {
    this.requireWrite(request)
    const labelKey = request.label.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
    if (labelKey === '') throw new Error('invalid-label')
    const id = `${request.provider}:${labelKey}`
    if (this.accounts.get(id) !== undefined) throw new Error('conflict')
    const home = request.homeDir ?? isolatedAccountHome(this.requireActor(request.workspaceId).id, request.provider, id)
    this.accounts.create({
      id,
      workspaceId: request.workspaceId,
      provider: request.provider,
      label: request.label,
      homeDir: home,
    })
    return this.listConnectionAccounts(request)
  }

  /**
   * @param request - Account.
   */
  @Remote
  removeConnectionAccount(request: RemoveConnectionAccountRequest): boolean {
    this.requireWrite(request)
    if (this.accounts.get(request.accountId)?.workspaceId !== request.workspaceId) throw new Error('not-found')
    this.accounts.delete(request.accountId)
    return true
  }

  /**
   * @param request - Account + label.
   */
  @Remote
  updateConnectionAccount(request: UpdateConnectionAccountRequest): boolean {
    this.requireWrite(request)
    if (this.accounts.get(request.accountId)?.workspaceId !== request.workspaceId) throw new Error('not-found')
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
    if (row !== undefined && (row.projectId !== request.projectId || row.workspaceId !== request.workspaceId)) throw new Error('forbidden')
    if (row === undefined || row.skillDraft === '') {
      return { steps: [], skillTitle: '' }
    }
    const parsed = JSON.parse(row.skillDraft) as { steps?: TeachDraftView['steps']; title?: string }
    return { steps: parsed.steps ?? [], skillTitle: parsed.title ?? 'Skill ensinada' }
  }

  /**
   * Saves the candidate. `activate` is ignored — only {@link activateTaughtSkill} enables it.
   * @param request - Edited steps.
   */
  @Remote
  submitTeachDraft(request: SubmitTeachDraftRequest): TeachDraftView {
    this.requireWrite(request)
    const row = this.teach.get(request.sessionId)
    if (row === undefined) throw new Error('not-found')
    if (row.projectId !== request.projectId || row.workspaceId !== request.workspaceId) throw new Error('forbidden')
    this.teach.putDraft(request.sessionId, row.transcript, JSON.stringify({
      title: 'Skill ensinada',
      steps: request.steps,
      activate: false,
    }))
    const accepted = this.acceptTaughtCandidate(request)
    return { steps: request.steps, skillTitle: accepted.name, candidateSkillId: accepted.id }
  }

  /**
   * Persist the reviewed draft as a disabled taught candidate. Never enables it.
   * @param request - Session that already has a draft.
   * @returns Candidate skill (`status: candidate`).
   */
  @Remote
  acceptTaughtCandidate(request: TeachSessionIdRequest): SkillView {
    this.requireWrite(request)
    const row = this.teach.get(request.sessionId)
    if (row === undefined) throw new Error('not-found')
    const draftView = this.getTeachDraft(request)
    if (draftView.steps.length === 0) throw new Error('not-found')
    try {
      const skill = acceptTaughtCandidate(taughtDraftOf({
        sessionId: request.sessionId,
        personaId: row.personaId,
        projectId: request.projectId,
        title: draftView.skillTitle,
        steps: draftView.steps,
      }))
      return this.screens.putCandidateSkill({
        id: skill.id,
        projectId: request.projectId,
        personaId: skill.personaId ?? row.personaId,
        name: skill.name,
        body: skill.body,
        origin: 'taught',
      })
    } catch (error) {
      return rethrowShare(error)
    }
  }

  /**
   * Enable a taught candidate after review. Extra tools throw `ACCESS_ESCALATION`.
   * @param request - Skill id.
   * @returns Enabled skill (`status: active`).
   */
  @Remote
  activateTaughtSkill(request: ActivateTaughtSkillRequest): SkillView {
    this.requireWrite(request)
    const stored = this.screens.getSkillRecord(request.projectId, request.skillId)
    if (stored === undefined) throw new Error('skill-not-found')
    const personaId = stored.personaId
    if (personaId === undefined) throw new Error('persona-not-found')
    const persona = this.product.getPersona(personaId)
    if (persona === undefined || persona.projectId !== request.projectId) {
      throw new Error('persona-not-found')
    }
    try {
      const next = activateTaughtSkill(
        stored,
        allowedToolsOf(persona.tools),
        taughtStepToolsOf(stored.body),
      )
      return this.screens.saveSkillRecord(request.projectId, next)
    } catch (error) {
      return rethrowShare(error)
    }
  }

  /**
   * Promote a taught skill. Team/project scope requires `explicit: true`.
   * @param request - Skill + requested scope + human confirmation.
   * @returns Skill with the new scope. Stays disabled unless already active.
   */
  @Remote
  publishTaughtSkill(request: PublishTaughtSkillRequest): SkillView {
    this.requireWrite(request)
    const stored = this.screens.getSkillRecord(request.projectId, request.skillId)
    if (stored === undefined) throw new Error('skill-not-found')
    try {
      const next = promoteTaughtSkill(stored, request.scope, request.explicit)
      return this.screens.saveSkillRecord(request.projectId, next)
    } catch (error) {
      return rethrowShare(error)
    }
  }

  /**
   * Turn an activated taught skill back off. Version still increases.
   * @param request - Skill id.
   * @returns Disabled taught skill (`status: candidate`).
   */
  @Remote
  rollbackTaughtSkill(request: ActivateTaughtSkillRequest): SkillView {
    this.requireWrite(request)
    const stored = this.screens.getSkillRecord(request.projectId, request.skillId)
    if (stored === undefined) throw new Error('skill-not-found')
    try {
      const next = disableTaughtSkill(stored)
      return this.screens.saveSkillRecord(request.projectId, next)
    } catch (error) {
      return rethrowShare(error)
    }
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
   * PRO-6 / fechamento v1. Probe scores this; do not reassemble flags.
   * @param request - Workspace (dono ou dev; uma persona nunca mede).
   */
  @Remote
  measureProactivityV1(request: WorkspaceScopeRequest): ProactivityMeasureView {
    this.requireWorkspace(request)
    const measured = measureProactivityAcceptance()
    return { passed: measured.passed, total: measured.total, failed: measured.failed }
  }

  /**
   * V1-P0-1 engine checklist. Probe does not remount flags.
   * @param request - Workspace (dono ou dev; uma persona nunca mede).
   */
  @Remote
  measureFirstDeliveryAcceptance(request: WorkspaceScopeRequest): FirstDeliveryMeasureView {
    this.requireWorkspace(request)
    const measured = scoreFirstDeliveryAcceptance()
    return { passed: measured.passed, total: measured.total, failed: measured.failed }
  }

  /**
   * GES-6 / fechamento v1. Probe scores this; do not reassemble flags.
   * @param request - Workspace (dono ou dev; uma persona nunca mede).
   */
  @Remote
  measureGestorV1(request: WorkspaceScopeRequest): GestorMeasureView {
    this.requireWorkspace(request)
    const measured = measureGestorV1()
    return { passed: measured.passed, total: measured.total, failed: measured.failed }
  }

  /**
   * GES-2 hire / allocate / reorganize / assemble. Probe does not remount flags.
   * @param request - Workspace (dono ou dev; uma persona nunca mede).
   */
  @Remote
  measureGestorToolsAcceptance(request: WorkspaceScopeRequest): GestorToolsMeasureView {
    this.requireWorkspace(request)
    return measureGestorToolsAcceptance()
  }

  /**
   * OPT-3 prefix/cache. Probe does not remount flags.
   * @param request - Workspace (dono ou dev; uma persona nunca mede).
   */
  @Remote
  measureOpt3(request: WorkspaceScopeRequest): OptPolicyMeasureView {
    this.requireWorkspace(request)
    return measureOpt3Acceptance()
  }

  /**
   * OPT-4 min tools / dedupe / layer budget.
   * @param request - Workspace (dono ou dev; uma persona nunca mede).
   */
  @Remote
  measureOpt4(request: WorkspaceScopeRequest): OptPolicyMeasureView {
    this.requireWorkspace(request)
    return measureOpt4Acceptance()
  }

  /**
   * OPT-5 cheap vs persona + session reuse.
   * @param request - Workspace (dono ou dev; uma persona nunca mede).
   */
  @Remote
  measureOpt5(request: WorkspaceScopeRequest): OptPolicyMeasureView {
    this.requireWorkspace(request)
    return measureOpt5Acceptance()
  }

  /**
   * OPT-6 lean channel + initiative batch + router burst.
   * @param request - Workspace (dono ou dev; uma persona nunca mede).
   */
  @Remote
  measureOpt6(request: WorkspaceScopeRequest): OptPolicyMeasureView {
    this.requireWorkspace(request)
    return measureOpt6Acceptance()
  }

  /**
   * PRO-6 + GES-6 + OPT-8 via `measureV1CloseView`. Probe does not remount flags.
   * @param request - Workspace for live ledger metadata, separate from the faithful estimate baseline.
   */
  @Remote
  measureV1Close(request: WorkspaceScopeRequest): V1CloseMeasureView {
    this.requireWorkspace(request)
    const view = measureV1CloseView(
      this.product.listProjects(request.workspaceId)
        .flatMap(project => this.ledger.list({ projectId: project.id })),
    )
    const evidence = view.opt8.evidence
    return { ...view, origin: evidence.origin, baseline: evidence.baseline,
      opt8: { ...view.opt8, origin: evidence.origin, baseline: evidence.baseline } }
  }

  /**
   * OPT-8 faithful estimates; live ledger metadata never changes the comparable baseline or the goal.
   * @param request - Workspace whose ledger is the live book.
   */
  @Remote
  measureOpt8(request: WorkspaceScopeRequest): Opt8MeasureView {
    this.requireWorkspace(request)
    const view = measureOpt8View(
      this.product.listProjects(request.workspaceId)
        .flatMap(project => this.ledger.list({ projectId: project.id })),
    )
    return { ...view, origin: view.evidence.origin, baseline: view.evidence.baseline }
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
      .filter(row => request.accountId === undefined || row.accountId === request.accountId)
    if (stored.length > 0) return stored.map(toOfficialView)
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
    const initial = snapshot()
    yield { kind: 'baseline', events: initial }
    let previous = new Set(initial.map(item => item.id))
    while (!signal.aborted) {
      await sleep(1_000, signal)
      const next = snapshot()
      const fresh = next.filter(item => !previous.has(item.id))
      const current = new Set(next.map(item => item.id))
      const resolved = [...previous].filter(id => !current.has(id))
      previous = current
      if (resolved.length > 0) yield { kind: 'resolved', events: [], eventIds: resolved }
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
    this.requireWrite(request)
    const id = checkRoutineId(request.id)
    const silence = checkRoutineSilence(request.silenceStart, request.silenceEnd)
    const fields = {
      name: checkRoutineName(request.name),
      rrule: checkRoutineRrule(request.rrule),
      timeZone: checkRoutineTimeZone(request.timeZone),
      catchUp: checkRoutineCatchUp(request.catchUp),
    }
    const prompt = request.prompt === undefined ? '' : checkRoutinePrompt(request.prompt)
    const ownerPersonaId = checkRoutineOwner(this.product, request.projectId, request.ownerPersonaId)
    if (this.routines.get(id) !== undefined) {
      throw new HostRemoteFault('conflict', 'Já existe uma rotina com esta identificação. Nada foi gravado.')
    }
    const created = this.routines.create({
      id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      ...fields,
      ...(silence ?? {}),
    })
    try {
      writeRoutineSpec(this.screens.screens, request.projectId, id, { prompt, ownerPersonaId })
    } catch (error: unknown) {
      this.routines.delete(id) // no half-made routine: either both rows or none
      throw error
    }
    return this.routineView(created)
  }

  /**
   * Edit a routine (IV-9): name, “O que fazer”, “Quem faz”, schedule, zone, catch-up and quiet window. Absent fields stay.
   * A new schedule or zone cancels the occurrences still queued for the old one.
   * @param request - Routine id and the fields to change.
   * @returns The updated card.
   */
  @Remote
  updateRoutine(request: UpdateRoutineRequest): RoutineView {
    this.requireWrite(request)
    const current = requireRoutineIn(this.routines, request.projectId, request.id)
    const spec = readRoutineSpec(this.screens.screens, request.projectId, current.id)
    const nextSpec = {
      prompt: request.prompt === undefined ? spec.prompt : checkRoutinePrompt(request.prompt),
      ownerPersonaId: request.ownerPersonaId === undefined
        ? spec.ownerPersonaId
        : checkRoutineOwner(this.product, request.projectId, request.ownerPersonaId),
    }
    const silenceTouched = request.silenceStart !== undefined || request.silenceEnd !== undefined
    const silence = silenceTouched
      ? checkRoutineSilence(request.silenceStart ?? current.silenceStart ?? '', request.silenceEnd ?? current.silenceEnd ?? '')
      : undefined
    const updated = this.routines.update(current.id, {
      ...(request.name === undefined ? {} : { name: checkRoutineName(request.name) }),
      ...(request.rrule === undefined ? {} : { rrule: checkRoutineRrule(request.rrule) }),
      ...(request.timeZone === undefined ? {} : { timeZone: checkRoutineTimeZone(request.timeZone) }),
      ...(request.catchUp === undefined ? {} : { catchUp: checkRoutineCatchUp(request.catchUp) }),
      ...(silenceTouched ? { silenceStart: silence?.silenceStart ?? null, silenceEnd: silence?.silenceEnd ?? null } : {}),
    })
    writeRoutineSpec(this.screens.screens, request.projectId, current.id, nextSpec)
    return this.routineView(updated)
  }

  /**
   * Delete a routine, its “what/who” document, its runs and its governance charge. The same id can be created again
   * (the client's Desfazer). The routines the host keeps alive for each persona (`initiative:`) are paused, never deleted.
   * @param request - Routine id.
   * @returns true when deleted.
   */
  @Remote
  deleteRoutine(request: DeleteRoutineRequest): boolean {
    this.requireWrite(request)
    const current = requireRoutineIn(this.routines, request.projectId, request.id)
    if (current.id.startsWith(INITIATIVE_ROUTINE_PREFIX)) {
      throw new HostRemoteFault('invalid-payload', 'Esta rotina é da própria equipe e não pode ser apagada. Pause-a se não quiser que rode.')
    }
    this.routines.delete(current.id)
    this.screens.screens.delete(request.projectId, ROUTINE_SPEC_KIND, current.id)
    this.governance.gov.deleteRoutineCharge(request.workspaceId, current.id)
    return true
  }

  /**
   * List routines of the project, newest first.
   * @param request - Tenant.
   * @returns Routine cards.
   */
  @Remote
  listRoutines(request: ProjectScopeRequest): RoutineView[] {
    this.requireProject(request)
    return this.routines.list(request.projectId).map(routine => this.routineView(routine))
  }

  /**
   * Pause or resume one routine. Pause cancels pending and leased runs.
   * @param request - Routine and flag.
   * @returns The updated card.
   */
  @Remote
  pauseRoutine(request: PauseRoutineRequest): RoutineView {
    this.requireWrite(request)
    const current = requireRoutineIn(this.routines, request.projectId, request.id)
    return this.routineView(this.routines.setPaused(current.id, request.paused))
  }

  private routineView(routine: Routine): RoutineView {
    return routineViewOf(routine, readRoutineSpec(this.screens.screens, routine.projectId, routine.id), Date.parse(this.orchestration.now()))
  }

  /**
   * P1-9: what the team proposed in #geral, newest first, with the live state of each (open · accepted · declined · expired).
   * @param request - Tenant.
   * @returns Proposals.
   */
  @Remote
  listTaskProposals(request: ProjectScopeRequest): TaskProposalView[] {
    this.requireProject(request)
    return this.taskProposals.list(request.projectId)
  }

  /**
   * P1-9: Aceitar (a real Ticket is made from the proposal) or Agora não (the same proposal stays quiet for 7 days). The answer
   * feeds the persona's acceptance rate, which sets how often she proposes. Idempotent: deciding again returns the state.
   * @param request - Proposal and the choice.
   * @returns The proposal with its new state.
   */
  @Remote
  decideTaskProposal(request: DecideTaskProposalRequest): TaskProposalView {
    this.requireWrite(request)
    if (typeof request.id !== 'string' || request.id === '' || typeof request.accept !== 'boolean') {
      throw new HostRemoteFault('invalid-payload', 'Escolha Aceitar ou Agora não.')
    }
    return this.taskProposals.decide(request.workspaceId, request.projectId, request.id, request.accept)
  }

  /**
   * P1-9: Desfazer of “Agora não” — only a declined proposal opens again, and the acceptance goes back to what it was.
   * @param request - Proposal.
   * @returns The proposal with its new state.
   */
  @Remote
  reopenTaskProposal(request: ReopenTaskProposalRequest): TaskProposalView {
    this.requireWrite(request)
    if (typeof request.id !== 'string' || request.id === '') throw new HostRemoteFault('invalid-payload', 'Proposta inválida.')
    return this.taskProposals.reopen(request.projectId, request.id)
  }

  /**
   * P1-9 / PROACTIVITY §7: how each persona's proposals were received (accepted, declined, rolling rate).
   * @param request - Tenant.
   * @returns One row per persona.
   */
  @Remote
  getProposalStats(request: ProjectScopeRequest): ProposalStatsView[] {
    this.requireProject(request)
    return this.taskProposals.stats(request.projectId)
  }

  /**
   * Pause every routine in the project ("Pausar equipe").
   * @param request - Tenant.
   * @returns true when applied.
   */
  @Remote
  pauseTeam(request: ProjectScopeRequest): boolean {
    this.requireProject(request)
    this.teamState.pause(request.projectId)
    void this.orchestration.disposeRunners()
    return true
  }

  /**
   * "Retomar equipe": the routines the pause switched off come back; occurrences missed meanwhile are not replayed.
   * @param request - Tenant.
   * @returns The new team state.
   */
  @Remote
  resumeTeam(request: ProjectScopeRequest): TeamStateView {
    this.requireWrite(request)
    return this.teamState.resume(request.projectId)
  }

  /**
   * Whether the team is paused ("Pausar equipe" survives a reload).
   * @param request - Tenant.
   * @returns Pause state.
   */
  @Remote
  getTeamState(request: ProjectScopeRequest): TeamStateView {
    this.requireProject(request)
    return this.teamState.get(request.projectId)
  }

  /**
   * What the team's scheduler is doing now (working, resting, paused, waiting for an AI) and its last actions.
   * @param request - Tenant.
   * @returns Scheduler state for the Visão geral and Rotinas.
   */
  @Remote
  getProactivityStatus(request: ProjectScopeRequest): ProactivityStatusView {
    this.requireProject(request)
    return this.proactivityScheduler.status(request.projectId)
  }

  /**
   * "Verificar agora": run one scheduler cycle now instead of waiting for the timer.
   * @param request - Tenant.
   * @returns Scheduler state after the cycle.
   */
  @Remote
  async runProactivityCycle(request: ProjectScopeRequest): Promise<ProactivityStatusView> {
    this.requireWrite(request)
    await this.proactivityScheduler.cycle()
    return this.proactivityScheduler.status(request.projectId)
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
  exportDiagnostics(): DiagnosticsJson {
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
  async prepareReview(request: ReviewTicketRequest): Promise<ReviewSummaryView> {
    this.requireWrite(request)
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
  async reviewSummary(request: ReviewTicketRequest): Promise<ReviewSummaryView> {
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
    this.requireWrite(request)
    const result = await this.orchestration.acceptReview(request.projectId, request.ticketId, request.mode,
      request.conflicts === undefined ? undefined : { conflicts: request.conflicts })
    if (result.kind === 'merged') {
      this.orchestration.completeReview(request.projectId, request.ticketId)
      rememberReviewFeedback(this.vault, request, 'review_accepted', request.ticketId)
      return { kind: 'merged', mode: result.mode, explanation: '',
        ...(result.restorePointId === undefined ? {} : { restorePointId: result.restorePointId }) }
    }
    rememberReviewFeedback(this.vault, request, 'review_changes', result.explanation)
    return { kind: 'blocked', mode: request.mode, explanation: result.explanation,
      ...(result.conflicts === undefined ? {} : { conflicts: result.conflicts }) }
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
  async discardReview(request: ReviewTicketRequest): Promise<boolean> {
    this.requireWrite(request)
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

  /**
   * Persist Rivet probe snaps into the official quota pool (all projects, or one).
   * @param snaps - `detectConnections` cards.
   * @param projectId - When set, only that tenant.
   */
  private persistOfficialQuota(
    snaps: readonly import('@deepseek-ai/dsh-persona-runners').ConnectionSnapshot[],
    projectId?: string,
  ): void {
    if (snaps.length === 0) return
    if (projectId !== undefined) {
      persistProbeQuota(this.usage, projectId, snaps)
      return
    }
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        persistProbeQuota(this.usage, project.id, snaps)
      }
    }
  }

  /**
   * Dest extras after vault sync. Never deleted.
   * @param projectId - Tenant.
   * @param folderPath - Dest folder.
   * @param leftover - Relative markdown paths still on disk.
   */
  private persistVaultLeftover(
    projectId: string,
    folderPath: string,
    leftover: readonly string[],
  ): void {
    this.screens.screens.put(projectId, 'brain_vault_leftover', 'last', {
      leftover, folderPath, at: this.orchestration.now(),
    })
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

  private applyRememberedApproval(scope: ProjectScopeRequest, card: ApprovalView): ApprovalView {
    const action = card.permissionAction
    const target = card.permissionTarget
    if (card.status !== 'pending' || action === undefined || target === undefined || card.kind === 'hire') return card
    const routed = this.governance.approval(scope.workspaceId, card)
    const at = this.orchestration.now()
    if (!Number.isFinite(Date.parse(at))) return routed
    const grants = this.brain.brain.listGrants(scope.projectId).filter((grant) => {
      if (grant.workspaceId !== scope.workspaceId || Object.keys(grant.limits).some(key => key !== 'maxUses')) return false
      if (!Number.isFinite(Date.parse(grant.createdAt))
        || (grant.expiresAt !== undefined && !Number.isFinite(Date.parse(grant.expiresAt)))) return false
      const maxUses = grant.limits.maxUses
      if (maxUses !== undefined && (!/^\d+$/u.test(maxUses) || !Number.isSafeInteger(Number(maxUses)))) return false
      const grantor = resolveSessionActor(this.product, scope.workspaceId, grant.grantorId)
      if (grantor === undefined || !sessionCan(grantor, 'write', { type: 'project', ...scope })) return false
      return grantor.workspaceRole === 'owner' || grantor.id === routed.routedToId || grantor.id === routed.onBehalfOfId
    })
    const hit = gateRememberedPermission(grants.map(row => ({
      id: row.id, grantorId: row.grantorId, personaId: row.personaId, action: row.action, target: row.target,
      maxUses: row.limits.maxUses === undefined ? 0 : Number(row.limits.maxUses),
      validity: row.validity === 'once' ? 'once' : row.validity === '7d' ? 'days7' : 'until_revoked',
      grantedAt: Date.parse(row.createdAt), expiresAt: row.expiresAt === undefined ? 0 : Date.parse(row.expiresAt),
      revoked: row.revokedAt !== undefined, uses: row.useCount,
    })), { personaId: card.personaId, action, target, now: Date.parse(at) })
    if (hit.kind !== 'skip') return routed
    return this.store.tx(() => {
      const spent = this.brain.brain.recordUse(hit.grantId, card.personaId, action, target)
      if (spent === undefined) return routed
      const decided = this.screens.decide({ ...scope, id: card.id, kind: card.kind, accept: true })
      this.screens.screens.put(scope.projectId, 'remembered_approval', `${card.kind}:${card.id}`, {
        grantId: hit.grantId, grantorId: spent.grantorId, explanation: hit.audit, at,
      })
      return { ...decided, permissionAction: action, permissionTarget: target,
        permissionGrantId: hit.grantId, permissionAudit: hit.audit }
    })
  }

  private curateProjectReports(projectId: string): void {
    for (const ticket of this.orchestration.runtime(projectId).repo.tickets.list()) {
      const event = this.events.get(ticket.origin.triggerId)
      if (event === undefined) continue
      try {
        curateSettledReport({ event, ticket, brain: this.brain.brain, screens: this.screens.screens,
          firstDelivery: event.id === FIRST_DELIVERY_EVENT_ID })
      } catch (error: unknown) {
        // The report remains durable for the next librarian pass; curation must not fail an already delivered task.
        void error
        const notice = 'Não conseguimos atualizar o conhecimento da equipe. O relatório foi guardado para tentar de novo.'
        if (!this.lastErrors.includes(notice)) this.lastErrors.push(notice)
      }
    }
  }

  private collectAttention(request: ProjectScopeRequest): AttentionEventView[] {
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) return []
    const events = ticketAttention({ projectId: request.projectId, actorId: actor.id,
      tickets: this.orchestration.runtime(request.projectId).repo.tickets.list(),
      stages: new Map(this.listTasks(request).map(row => [row.id, row.stage])), events: this.events, product: this.product })
    for (const letter of this.deadLetters.list(request.projectId)) {
      events.push({
        id: `dead:${letter.id}`, kind: 'needs-you', title: letter.cause, ticketId: letter.id, at: letter.at,
      })
    }
    const acked = new Set(this.screens.screens.get<string[]>(request.projectId, 'attention_ack', 'ids') ?? [])
    return events.filter(item => !acked.has(item.id))
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
    projectId?: string
  }): MessageView {
    const reactions = groupReactions(this.events.listReactions(event.id))
    const flags = event.projectId === undefined ? {} : this.messageFlags.of(event.projectId, event.id)
    return {
      ...toMessageView(event),
      ...(flags.steeredPersonaId === undefined ? {} : { steeredPersonaId: flags.steeredPersonaId }),
      ...(flags.stopped === true ? { stopped: true as const } : {}),
      ...(flags.stoppedTicketId === undefined ? {} : { stoppedTicketId: flags.stoppedTicketId }),
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
    this.accountSwap.expireLimits(projectId)
    const swap = storedSwapPolicy(this.accounts, workspaceId, provider, persona.id)
    const last = this.screens.screens.get<{ accountId: string }>(projectId, 'active_account', persona.id)
    // Desfazer holds the persona on the account she went back to: the policy must not take her away again until it clears.
    const held = last?.accountId !== undefined && this.accountSwap.isHeld(projectId, persona.id, last.accountId)
    const resolved = resolveAccountSeat({
      accounts: seats,
      policy: held ? 'fixed' : swap.policy,
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
      if (last?.accountId !== undefined && resolved.accountId !== undefined) {
        // a policy the person chose moved her at resolve time: leave the record Desfazer works on (never silent)
        this.accountSwap.recordSeatSwitch(projectId, {
          personaId: persona.id, personaName: persona.name, provider, fromId: last.accountId, toId: resolved.accountId,
        })
      }
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

  /**
   * GES-5: latest audit reason for a Gestor persona, for the profile card.
   * @param workspaceId - Workspace.
   * @param personaId - Persona.
   * @param roles - Current roles.
   */
  private gestorAuditOnCard(
    workspaceId: string,
    personaId: string,
    roles: readonly string[],
  ): { gestorAuditReason?: string } {
    if (!roles.includes('team_manager')) return {}
    const reason = this.gestor.listAudit({ workspaceId })
      .find(row => row.gestorId === personaId)?.reason
    return reason === undefined || reason === '' ? {} : { gestorAuditReason: reason }
  }

  /**
   * One write when a Gestor plan is proposed: `#geral` body + waiting activity.
   * @param plan - Open plan.
   * @param projectId - Tenant when the draft named one.
   */
  private emitProposedGestor(plan: GestorPlanView, projectId: string | undefined): void {
    if (plan.status !== 'proposed') return
    const project = projectId
      ?? this.product.listProjects(plan.workspaceId)[0]?.id
    if (project === undefined) return
    const channelId = this.ensureProjectConversation(plan.workspaceId, project).channelId
    const posted = emitGestorPropose({
      plan: {
        id: plan.id,
        workspaceId: plan.workspaceId,
        gestorId: plan.gestorId,
        action: plan.action as GestorPlan['action'],
        scopeKey: plan.scopeKey,
        summary: plan.summary,
        reason: plan.reason,
        status: 'proposed',
        createdAt: plan.createdAt,
        ...(plan.commentOnId === undefined ? {} : { commentOnId: plan.commentOnId }),
      },
      threadId: channelId,
      at: plan.createdAt,
    })
    this.recordTurnActivity({
      workspaceId: plan.workspaceId,
      projectId: project,
      id: posted.activity.id,
      personaId: posted.activity.personaId,
      subjectId: posted.activity.threadId,
      kind: posted.activity.kind,
      title: posted.activity.title,
      status: 'waiting',
      at: posted.activity.at,
    })
    this.events.append({
      id: `ges-msg-${plan.id}`,
      workspaceId: plan.workspaceId,
      projectId: project,
      streamKind: 'channel',
      ownerId: channelId,
      type: 'message',
      body: posted.channelBody,
      actorId: plan.gestorId,
      subjectId: channelId,
      occurredAt: posted.activity.at,
    })
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
      window: usagePortKind(stored.kind),
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
  const nextRefillAt = nextRefillOf(row)
  return {
    provider: row.provider,
    origin: row.origin,
    windows,
    ...(row.detail === undefined ? {} : { detail: row.detail }),
    ...(row.accountId === undefined || row.accountId === '' ? {} : { accountId: row.accountId }),
    ...(row.accountLabel === undefined || row.accountLabel === '' ? {} : { accountLabel: row.accountLabel }),
    ...(row.at === undefined || row.at === '' ? {} : { at: row.at }),
    ...(nextRefillAt === undefined ? {} : { nextRefillAt }),
    ...(row.refillHistory === undefined || row.refillHistory.length === 0
      ? {}
      : { refillHistory: row.refillHistory }),
  }
}

function nextRefillOf(row: import('@deepseek-ai/dsh-persona-store').StoredOfficialQuota): string | undefined {
  let soonest: string | undefined
  let soonestMs = Number.POSITIVE_INFINITY
  for (const window of row.windows) {
    if (window.resetsAt === undefined) continue
    const at = Date.parse(window.resetsAt)
    if (!Number.isNaN(at) && at < soonestMs) {
      soonest = window.resetsAt
      soonestMs = at
    }
  }
  if (soonest !== undefined) return soonest
  const last = row.refillHistory?.[row.refillHistory.length - 1]
  return last?.resetsAt
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
  const value: unknown = ctx.get('webServer')
  if (value === undefined || value === null || typeof value !== 'object') return undefined
  if (!('register' in value) || typeof Reflect.get(value, 'register') !== 'function') return undefined
  return value as {
    register: (route: {
      kind: 'exact'
      path: string
      handler: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void | Promise<void>
    }) => () => void
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
  const runError = runErrorFromBody(event.body)
  const accountSwap = accountSwapFromBody(event.body)
  const accountAsk = accountAskFromBody(event.body)
  const taskProposal = taskProposalFromBody(event.body)
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
    ...(type === 'partial' ? { streaming: true as const } : {}),
    ...(runError === undefined ? {} : { runError }),
    ...(accountSwap === undefined ? {} : { accountSwap }),
    ...(accountAsk === undefined ? {} : { accountAsk }),
    ...(taskProposal === undefined ? {} : { taskProposal }),
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
