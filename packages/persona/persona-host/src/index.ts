/** Persona host service and authenticated Remote controller. */
import { statSync } from 'node:fs'
import { freemem } from 'node:os'
import { basename, dirname, join } from 'node:path'
import { Context } from '@deepseek-ai/cordis'
import { z } from 'zod'
import { EMAIL_PRESETS, accountLoginStatus, createMcpGateway, hasBrowserGate, prewarmCliIsolation, probeImap, readImapInboxFromSecret, registerSecretWindow, type EmailArrivalFilter } from '@deepseek-ai/dsh-persona-runners'
import { Remote, TypertRemoteService } from '@deepseek-ai/dsh-typert-protocol'
import {
  AccountRepos,
  BrainRepos,
  CategoryRepos,
  EquipeRepos,
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
  StoreError,
  TeachRepos,
  TopicRepos,
  TurnLedgerRepos,
  ChannelRepos,
  ConnectorGrantRepos,
  TicketConnectorAuthRepos,
  VaultRepos,
  openPersonaStore,
  wipeProject,
  wipeWorkspace,
  type PersonaStore,
  type Routine,
  type StoredPersona,
} from '@deepseek-ai/dsh-persona-store'
import { dedupeLimitAccounts, foldUsage, poolProviderLimits, windowReserveOf as reserveOf, type WindowReserve } from '@deepseek-ai/dsh-persona-usage'
import { CofreSecrets, createPersonaVault, VaultUnavailableError } from '@deepseek-ai/dsh-persona-vault'
import { resolveSessionActor, sessionCan } from './auth.ts'
import { ConnectionProbe } from './connection-probe.ts'
import { cachedEngineReadiness } from './engine-readiness.ts'
import { TeamConnect, type ConnectTeamRequest, type RetryTeamPersonaRequest, type StartResult, type TeamAiView, type TeamConnectView } from './team-connect.ts'
import { teamConnectPorts } from './team-connect-host.ts'
import { ConnectorGrantsHost, type ConnectorPorts } from './connector-grants-host.ts'
import { auditBodyForReader, connectorHandleOf, eventIdForReader } from './connector-handle.ts'
import { connectorCatalog, type ConnectorCatalogView } from './connector-catalog.ts'
import { connectorHealth, TOKEN_PROVIDERS, type ConnectorHealthView } from './connector-health.ts'
import { SkillImportError, SkillImportHost } from './skill-import-host.ts'
import { OAuthVault, type OAuthCredentialView } from './oauth-vault.ts'
import { accountForEstimate } from './estimate-account.ts'
import { calibrationFromLedger, calibrationWindowStart } from './estimate-calibration.ts'
import { ticketAttention } from './attention.ts'
import { curateSettledReport, rememberReportAudience } from './report-curation.ts'
import { captureOwnerMemory } from './owner-memory.ts'
import { assertMemoryReachable, readableUsedRows } from './private-records.ts'
import { forgetPlaybookNote, playbookViews } from './playbook-view.ts'
import { accessLabelOf, accessMapOf } from './access-map.ts'
import { RemoteTeamHost, type RemoteTeamVault } from './remote-team.ts'
import type { AcceptRemoteInviteRequest, ConnectRemoteTeamRequest, RemoteTeamAvailability, RemoteTeamState,
  RestorePointListView, UndoApplyRequest, UndoApplyView, ProjectStorageUsageView } from './types.ts'
import type { RemoteMemberView } from './types.ts'
import type { BrowserProfileGrantRequest, BrowserProfileNameRequest, BrowserProfileRenameRequest, BrowserProfileRequest, BrowserScreenView } from './types.ts'
import type { StationPairingCode, StationPairRequest, StationRunningRequest, StationView } from './types.ts'
import { projectStorageUsage } from './history-storage.ts'
import type { EngineStatusView, EngineTriggerActionRequest } from './types.ts'
import type {
  CancelCofreCodeRequest, CofreCodeRequestView, CofreEntryView, CofreImportPreview, CofreImportRequest, CofreImportResult, CofreStatusView,
  ConnectorSecretRequest, ConnectorSecretStateView, FillCofreCodeRequest, RemoveCofreEntryRequest, SaveCofreCompanyRequest, SaveCofreKeyRequest,
  SaveCofreLoginRequest, SaveConnectorSecretRequest,
} from './types.ts'
import { persistProbeQuota } from './official-quota-persist.ts'
import { WindowResumeQueue, WINDOW_OVERRIDE_KIND, type WindowReserveOverride } from './window-reserve.ts'
import { installRemoteGuard, RemoteGuard, RemoteFault as HostRemoteFault } from './remote-guard.ts'
import { MutantRunBook } from './mutant-run.ts'
import { DeadLetterBook } from './dead-letter.ts'
import { collectDiagnostics, stringifyDiagnostics } from './diagnostics.ts'
import { exportMarkdown } from './export-md.ts'
import { GithubSourceHost, detectGh } from './github.ts'
import { ExternalPoller } from './external-poll.ts'
import { ExternalSourcesHost } from './external-sources.ts'
import { CofreSecretVault } from './cofre-secrets.ts'
import { CofreHost } from './cofre.ts'
import { CofreMigration, connectorSlot, GITHUB_WEBHOOK_FACT, SECRET_FACT_KEYS, type CofreMigrationResult } from './cofre-migrate.ts'
import { VaultCodePorts } from './harness-vault.ts'
import { detectProjectGit, validateProjectRoot } from './project-root.ts'
import { engineChoiceOf, isEffortLevel, nextRunner } from './engine-menu.ts'
import { animalFor } from './hire-identity.ts'
import { ConnectorAsks } from './connector-asks.ts'
import { ActionBridge } from './action-bridge.ts'
import { claudeConnectorBridge, type ConnectorBridge } from './connector-bridge.ts'
import { flagsBootLine, resolveHostFlags, type HostFlagsView } from './flags.ts'
import { FEATURE_OFF_REASON, FEATURE_OFF_TEXT, resolveSurfaces, surfaceRefuses, surfacesBootLine, type Surface, type SurfacesView } from './surface-gates.ts'
import { CofreIdentityStore } from './e2ee-identity.ts'
import { loadOrCreateIdentity, parseInviteLink } from '@deepseek-ai/dsh-persona-sync'
import { PersonaSheets } from './persona-sheet-host.ts'
import { resolveTurnClose } from './turn-close-host.ts'
import { ExternalActions, type ExternalActionDoc } from './external-actions.ts'
import { ActivityUndo, activityUndoDeps } from './activity-undo.ts'
import { TeamCards } from './team-cards.ts'
import { isTechnicalAuthor } from './thread-authors.ts'
import { MORNING_ROUTINE_PREFIX, MorningBriefHost, NOW_TEXT } from './morning-brief-host.ts'
import { readReviewPolicy, reviewPolicyView } from './review-policy.ts'
import { TeamworkSettings } from './teamwork-settings.ts'
import { allowsScriptedReplies, ensureProductionRealCli, hostRunnerFromContext, loggedCliFromCards, specFromConnection, type DetectedCli, type PersonaRunnersSlice } from './runner.ts'
import { canSaveFiles, gatewayLevelOf, withFilesSaving } from './file-tools.ts'
import { withReviewImages } from './review-images.ts'
import { harnessMcpPorts } from './harness-dispatch.ts'
import { offeredToolNames, productToolsOpener, type ProductToolsRules } from './harness-turn.ts'
import { StableTools } from './tool-stability.ts'
import { githubWebhookHandler, WebhookReplayGuard } from './webhook-http.ts'
import { ProactivityHost } from './proactivity.ts'
import { offerContinueCard } from './continue-card.ts'
import { directoryOverTeamChannels, type ChannelDirectory } from './channel-directory.ts'
import { BootMarks } from './boot-marks.ts'
import { EquipeDesk, EquipeDeskError, FAULT_OF, type ArrangeChannelsRequest, type EquipeLayoutView } from './equipe-desk.ts'
import { ChannelWire } from './channel-wire.ts'
import { houseOver, originsOf, type HouseWirePorts } from './channel-house-wire.ts'
import type { ChannelHouse } from './channel-house.ts'
import type { HereGroup } from './channel-here.ts'
import type { MessageOrigin } from './channel-origins.ts'
import type { ChannelSuggestion } from './channel-suggestions.ts'
import type { ChannelUnread, UnreadMember } from './channel-unread.ts'
import type { AckChannelReadRequest, ChannelOriginsRequest } from './types.ts'
import { channelHeaderViewOf, channelLayoutViewOf, mentionOptionsOf, type ChannelHeaderView, type ChannelLayoutView, type MentionOptionsRequest, type MentionOptionView, type ViewPersona } from './channel-views.ts'
import { createProactivityScheduler, postTeamRequest } from './proactivity-wire.ts'
import { TaskProposalHost } from './task-proposals.ts'
import { taskProposalFromBody } from './task-proposal-wire.ts'
import { PersonaAsks } from './persona-asks.ts'
import { choiceMessageOf, PersonaChoices } from './persona-choices.ts'
import { IndicatorError, Indicators } from './indicators.ts'
import { Handoffs } from './handoffs.ts'
import { hiddenFromList, TaskThreads, ticketIdOfThread } from './task-thread.ts'
import { PersonWaiting } from './person-waiting.ts'
import { HiringPorts } from './harness-hiring.ts'
import { HireDirect } from './hire-direct.ts'
import { createAskTool } from './persona-ask-tool.ts'
import { handoffFromBody } from './handoff-wire.ts'
import { reviewFromBody } from './review-wire.ts'
import { personaAskFromBody } from './persona-ask-wire.ts'
import { isDelivered } from './proactivity.ts'
import { ROUTINE_SPEC_KIND, type ProactivityScheduler, type ProactivityStatusView } from './proactivity-scheduler.ts'
import { TeamStateBook, type TeamStateView } from './team-state.ts'
import { AsideAsks } from './aside-ask.ts'
import { SUMMARY_SHOWN, summaryQuestion, type SummaryLine } from './conversation-summary.ts'
import { DraftFilesBook } from './draft-files.ts'
import { MessageFlags } from './message-flags.ts'
import { mentionsOf } from './mentions.ts'
import { TeamFanout } from './fanout-host.ts'
import { TeamOpinions } from './opinion-run.ts'
import { TeamChannels } from './team-channels.ts'
import { OpinionTool, withOpinionTool } from './opinion-host.ts'
import { engineSeesImages } from './turn-images.ts'
import { svgBlocksIn, svgToPng } from './svg-to-png.ts'
import { BoardPorts } from './harness-boards.ts'
import { releaseAccountDocs, sameAccountHome } from './account-docs.ts'
import { HarnessPorts } from './harness-ports.ts'
import { TeamTools, withTeamTools } from './harness-team.ts'
import { RoutinePorts } from './harness-routines.ts'
import { collaboratorPrompt, countFanout, fanoutCalls, fanoutPrompt, planFanout, type FanoutSource } from './fanout-plan.ts'
import { collaboratorViews, getCollaborators } from './ticket-collaborators.ts'
import { WorkingControl } from './working-control.ts'
import { ensureVoiceModelBytes, voiceModelStateOf } from './voice-model-host.ts'
import { maskDmApprovalCard, PRIVATE_DM_TASK_TITLE, ticketOfActionCard, ticketSeenByActor, withoutDmWords } from './dm-ticket-view.ts'
import { resolveMailHost } from './mail-host-guard.ts'
import type {
  GetAsideAskRequest,
  ListAsideAsksRequest,
  SummarizeConversationRequest,
  FlushWorkingQueueRequest,
  RestoreQueuedMessageRequest,
  SteerWorkingTurnRequest,
  SteerWorkingTurnView,
  StopTurnRequest,
  StopTurnView,
  VoiceModelBytesView,
  VoiceModelStateView,
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
  checkRoutineTrigger,
  INITIATIVE_ROUTINE_PREFIX,
  readRoutineSpec,
  requireRoutineIn,
  routineViewOf,
  writeRoutineSpec,
} from './routine-remotes.ts'
import { EVENT_DOC_KIND, EVENT_RRULE, isEventRunId, type EventSource } from './routine-events.ts'
import { RoutineEventIntake, SOURCE_CONNECT_LABEL, SOURCE_PROVIDER } from './routine-event-intake.ts'
import type { SuggestFirstRequestsRequest, SuggestFirstRequestsView } from './types.ts'
import { BoardsHost } from './boards.ts'
import { BrowserHost } from './browser/host.ts'
import { dropScratchBrowserRoot, scratchBrowserRoot } from './browser/scratch-root.ts'
import { resolveBrowserServerPath } from './browser/turn-browser.ts'
import { BrowserLoginPorts, loginLeakActivity } from './browser/login-port.ts'
import { Station } from './station/station.ts'
import { StationGate } from './station/station-gate.ts'
import { loadStationState, saveStationState, type StationState } from './station/station-store.ts'
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
import { ruleKindsView } from './house-rules.ts'
import { draftPersonaWithDriver, draftTeamWithDriver } from './draft.ts'
import { Orchestration, wantsWork } from './orchestration.ts'
import { quotaRecheckDelay } from './quota-wait.ts'
import { AccountSwapHost } from './account-swap-host.ts'
import { accountAskFromBody, accountSwapFromBody } from './account-swap-wire.ts'
import { learnFromAcceptedReview, learnFromRequestedChanges } from './feedback-wire.ts'
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
  firstDeliveryVisibleLine,
  projectKanban,
  type MorningTask,
  type ReviewPolicy,
  measureFirstDeliveryAcceptance as scoreFirstDeliveryAcceptance,
  publishTaughtSkill as promoteTaughtSkill,
  rollbackTaughtSkill as disableTaughtSkill,
  measureProactivityAcceptance,
  measureV1CloseView,
  parseReviewRestorePointId,
  gateRememberedPermission,
  estimateAsk as estimateAskFor,
  AskError,
  checkAskAnswer,
  choiceAnswerText,
  readChoiceMarker,
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
import { blockedReasonField } from './blocked-reason.ts'
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
import { stickerMessageEvent, type SendStickerRequest } from './sticker-send.ts'
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
  ChannelMemberView,
  ChannelScopeRequest,
  ChannelView,
  RenameChannelRequest,
  SetChannelPinnedRequest,
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
  RuleKindsView,
  OverviewView,
  ParticipationRequest,
  PauseRoutineRequest,
  PersonaDraft,
  PersonaView,
  AttentionReplyRequest,
  ConnectionView,
  CreateVaultRecordRequest,
  OpenTaskConversationRequest,
  MarkTaskThreadReadRequest,
  TaskConversationView,
  TicketCommandRequest,
  TurnContextView,
  UsedContextRecord,
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
  ListPersonaAsksRequest,
  AnswerChoiceRequest,
  IndicatorRequest,
  IndicatorTestView,
  IndicatorView,
  PinIndicatorRequest,
  TestIndicatorRequest,
  PersonaAskView,
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
  DailyBriefNowRequest,
  IncludeOpinionTextOnlyRequest,
  IncludeOpinionTextOnlyView,
  DailyBriefNowView,
  ActionPreviewWire,
  ActionEventView,
  UndoPersonaActionRequest,
  UndoPersonaActionView,
  DailyBriefView,
  RetiredPersonaView,
  DeliveryCardView,
  TeamPlanView,
  GetReviewPolicyRequest,
  HandoffNoteView,
  OpinionView,
  ReviewedByView,
  ReviewingView,
  ReviewPolicyView,
  SetReviewPolicyRequest,
  PathStepView,
  BoardCardView,
  BoardHandoffView,
  UpdateProjectRequest,
  AutonomyConfig,
  FireProactiveEventRequest,
  OverviewNowView,
  PersonaScopeRequest,
  ProactivityTickView,
  TickProactivityRequest,
  WhileAwayView,
  ConnectorGrantCostView,
  ConnectorGrantView,
  EstimateConnectorGrantCostRequest,
  GrantConnectorByNameRequest,
  GrantConnectorRequest,
  ListConnectorGrantsRequest,
  RevokeConnectorRequest,
  ApprovalView,
  CanvasGraphView,
  ConfirmImportRequest,
  DailySummaryView,
  DecideApprovalRequest,
  ImportBatchRequest,
  ImportBatchView,
  ImportPreviewView,
  InviteIdRequest,
  DecideJoinRequest,
  InviteLinkView,
  InvitePreview,
  InviteView,
  IssueInviteRequest,
  JoinRequestView,
  JoinStatus,
  JoinTeamRequest,
  PersonaSheetRequest,
  PersonaSheetStatus,
  PresenceView,
  PreviewInviteRequest,
  ListPlaybookRequest,
  MemoryView,
  MemoryWriteRequest,
  PlaybookNoteView,
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
  PreviewSkillImportRequest,
  ImportSkillsRequest,
  RefreshSkillRequest,
  SkillRefreshView,
  SkillImportPreview,
  TriageLogView,
  TriageRuleView,
  DeadLetterView,
  ExportArchiveView,
  GetOfficialQuotaRequest,
  EmailFilterView,
  EmailPresetView,
  EmailConnectionView,
  EmailConnectionTestView,
  TestEmailConnectionRequest,
  PutEmailFilterRequest,
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
  WindowReserveView,
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
  SetPersonaCanRecruitRequest,
  SetPersonaCanSaveFilesRequest,
  RetryFanoutReplyRequest,
  RetryFanoutReplyView,
  SetPersonaHireDirectRequest,
  SetPersonaEngineRequest,
  SetPersonaTeamworkRequest,
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
// P0-C2: the SVG -> PNG the team SEES. Exposed so the installed app's verifier can call the product's own function (Rivet's 5 s check).
export { renderSvgSiblings, svgBlocksIn, svgToPng } from './svg-to-png.ts'
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
export { createHostRunner } from './runner.ts'
export type { HostPermissionMode, PersonaRunnersSlice, RunnerPurpose } from './runner.ts'
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
/** The most messages one `listMessages` page may ask for (the store's own bound): more is read by paging with `nextSeq`. */
export const MAX_PAGE_LIMIT = 200
/** Boot diet (lever 2 of the opening plan): how long after the constructor the background work (CLI/connector warmups, prewarm, scheduler, reports curation, the `gh` probe) waits so the first screen has the CPU. */
export const BOOT_BACKGROUND_DELAY_MS = 1500
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
  /** F4: a live WebSocket per connected team (wake-up + presence). Default: on in the app, off under Vitest. */
  readonly remoteTeamLive?: boolean
  /** Local edge request timeout. Default 20000 ms. */
  readonly remoteTeamTimeoutMs?: number
  /** Recheck retained messages; zero disables the retry timer. Default 15000 ms. */
  readonly engineRetryPollMs?: number
  /** Team scheduler cycle (routines, Vigia, planning); zero disables it. Default 30000 ms. Never armed under Vitest. */
  readonly proactivityCycleMs?: number
  /**
   * Harvest 19b: poll the connected sources (Telegram, Slack, Discord, CalDAV, e-mail) of every project; zero disables the
   * timer. Default 300000 ms. A pass skips a paused team and an active window reserve.
   */
  readonly externalPollMs?: number
  /** HT-3 (v1.1): the persona starts the moment the person moves its card to “Fazendo”. Default ON (TEAM-15); `false` or `PERSONA_START_ON_BOARD=0` turns it off. */
  readonly startOnBoardMove?: boolean
  /** CV-8 (v1.1): “Toda a equipe”, “Quem tiver algo a dizer” and several @menções answered as a block of typed lines. Default ON (TEAM-15); `false` or `PERSONA_FANOUT=0` turns it off. */
  readonly fanout?: boolean
  /** D-090 (v1.1): the personas work as a team (hand work over, ask for help and opinion, review each other, the morning brief). Default ON (TEAM-15); `false` or `PERSONA_TEAMWORK=0` turns it off. */
  readonly teamwork?: boolean
  /** HT-0 (v1.1): offer the product tools (board, sprints, routines) to a persona's Task on a CLI. Default ON (TEAM-15); `false` or `PERSONA_PRODUCT_TOOLS=0` turns it off. */
  readonly productTools?: boolean
  /**
   * TEAM-15: `'production'` makes the default of the four switches above ON even under Vitest (suites that must prove what the installed app does with
   * no Config and no env). Same as `PERSONA_HOST_FLAGS=production`. A switch named in Config, or `PERSONA_<FLAG>=0`, still wins.
   */
  readonly flagDefaults?: 'production'
  /** D-113: the surfaces under construction (invite, station, channels, skillImport, sharedBrowser). OFF in the product, ON under Vitest; a name here wins over `PERSONA_SURFACE_<NAME>`. */
  readonly surfaces?: Partial<Record<Surface, boolean>>
  /** Ordinary-folder draft size limit; defaults to the engine's configured default. */
  readonly historyMaxCopyBytes?: number
  /** Deadline for private-history git commands; defaults to the engine's default. */
  readonly historyGitTimeoutMs?: number
  /** Optional resolved executable; omitted uses the system PATH. */
  readonly historyGit?: string
  /**
   * COLHEITA 17: the Chrome DevTools MCP entry file the personas' browser attaches. Omitted = resolved from this
   * installation; when neither is found the browser says it is unavailable instead of failing a turn.
   */
  readonly browserServerPath?: string
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
  /** Boot diet (Forge 10:31): the host's own boot marks, ms since the process started; ONE "bootMarks" line goes to stderr when the projects are armed. */
  private readonly bootMarks = new BootMarks()
  readonly product: ProductRepos
  readonly events: EventRepos
  readonly vault: VaultRepos
  readonly routines: RoutineRepos
  readonly orchestration: Orchestration
  readonly proactivity: ProactivityHost
  readonly screens: ScreensHost
  readonly boards: BoardsHost
  /** COLHEITA 17: the personas' browser — profiles of the Chrome on this machine, the turn of each one and the screen. */
  readonly browser: BrowserHost
  /** The folder of the browser's profiles and grants: the data folder of a real host, or ONE throw-away folder per in-memory host (removed with it). */
  readonly browserDataRoot: string
  /** COLHEITA 24: this machine as a dedicated station (pairing, awake while busy, RAM admission, Tailscale). */
  readonly station: Station
  readonly media: MediaHost
  readonly cards: SqliteCardRepos
  readonly governance: GovernanceHost
  readonly github: GithubSourceHost
  readonly external: ExternalSourcesHost
  readonly onboarding: OnboardingHost
  readonly scheduler: HostScheduler
  /** D-090: what the person decided about teamwork, per persona (the engine's handoff door reads it through a port). */
  readonly teamwork: TeamworkSettings
  /** EQUIPE-REAL §0: the plan card and the ONE delivery card of a request done in parts (they replace the status lines). */
  readonly teamCards: TeamCards
  /** The (CLI version, models) whose isolation proof was already started: one proof per pair for the life of the app. */
  private readonly warmedIsolation = new Set<string>()
  /** Proves the environment mode ahead of the first call (zero model, never throws). Replaced by tests. */
  prewarmIsolation: (modelArgs: readonly string[]) => Promise<unknown> = modelArgs => prewarmCliIsolation({ modelArgs: [...modelArgs] })
  /** D-084/TEAM-3: "a persona needs a connector she cannot use yet" — one card in Aprovações (colleague or initiative). */
  readonly connectorAsks: ConnectorAsks
  /** HT-9: the PREVIEW of an external action (e-mail, post, payment, delete) a persona wants to take: one card in Aprovações (Enviar · Editar · Cancelar). */
  readonly externalActions: ExternalActions
  /** COLHEITA 5: what the personas did inside the product on their own, with the Desfazer of 5 minutes (`activity-undo.ts`). */
  readonly activityUndo: ActivityUndo
  /** HT-9: the gate of a Task's runner turned into cards (Aprovações) and back into an approved call (`action-bridge.ts`). */
  readonly actionBridge: ActionBridge
  /**
   * HT-9: the person approved a call; the Task must be reopened with `approvedFor(...)` so the gate lets THAT call through, once. Set by
   * the runner wiring; until it exists the approval is kept and nothing is executed (fail closed).
   */
  onActionApproved: ((action: ExternalActionDoc) => void) | undefined = undefined
  /** TEAM-7: the morning meeting of the Coordenação (the card in #geral, at zero cost). Inert without `Config.teamwork`. */
  readonly morningBrief: MorningBriefHost
  /** EQUIPE-REAL: what waits for the person in review for days is asked for, once a day at most (inert unless `Config.teamwork`). */
  readonly personWaiting: PersonWaiting
  /** TEAM-7: minutes the person's local time is ahead of UTC at an instant; the machine's zone unless a test sets it. */
  timezoneOffsetMinutes: (nowIso: string) => number = nowIso => -new Date(nowIso).getTimezoneOffset()
  /** D-090: `Config.teamwork`. With it off, nothing of the real-team behavior becomes an event and no view carries its fields. */
  teamworkEnabled: boolean
  readonly deadLetters: DeadLetterBook
  readonly connections: ConnectionProbe
  readonly usage: SqliteUsageStore
  readonly topics: TopicRepos
  /** CV-6: channels beyond {id, name, topic} (kind, archive, name lock, members, pins). */
  readonly channelRepos: ChannelRepos
  /** CV-6: the channels of the organogram (team channels, #diretoria) and who is on each. */
  readonly teamChannels: TeamChannels
  readonly accounts: AccountRepos
  /** The account switch at the quota limit (D-078): limit book, proposals, switch, Desfazer. */
  readonly accountSwap: AccountSwapHost
  /** Item 13: "Ligar a IA para a equipe toda". */
  readonly teamConnect: TeamConnect
  /** ISO-2: connectors of the person's CLI granted to a persona. */
  readonly connectorGrants: ConnectorGrantsHost
  /** The runner's read-only ports (connector definition, CLI isolation, cost). The desktop bridge installs them; absent = nothing is grantable. */
  connectorPorts: ConnectorPorts = {}
  /**
   * HT-8/9: the connectors of the person's Claude account, read with control requests (zero model) and answered as ports. Created at boot (never under
   * Vitest); a test or the shell may set its own. What `connectorPorts` names wins over it.
   */
  connectorBridge: ConnectorBridge | undefined = undefined
  readonly teach: TeachRepos
  /** Item 26.10: bring a skill in from a GitHub link (preview, import, refresh from the same source). */
  readonly skillImport: SkillImportHost
  /** Item 26 wave B: the OAuth credentials of MCP servers (sealed slots + non-secret metadata; the host is the only reader). */
  readonly oauthVault: OAuthVault
  readonly vaultDocs: VaultDocsHost
  /** Cofre v2: Logins, Chaves, the company Ficha, the CSV import and the 2FA code requests (secrets sealed by the vault). */
  readonly cofre: CofreHost
  /** The sealed slots themselves: connector tokens live under `connector:<provider>` (harvest 19b writes the mailbox there). */
  readonly cofreSecrets: CofreSecrets
  /** Whether this machine can seal secrets (DPAPI available): the Cofre screen disables Logins and Chaves without it. */
  readonly cofreSealable: boolean
  /** H15b: the boot sweep that moves connector tokens out of the record bodies; awaitable so a test can settle it. */
  readonly cofreMigration: Promise<CofreMigrationResult>
  readonly brain: BrainHost
  readonly gestor: GestorHost
  readonly workingSend: WorkingSendHost
  readonly teamState: TeamStateBook
  readonly draftFiles: DraftFilesBook
  readonly messageFlags: MessageFlags
  readonly asides: AsideAsks
  readonly workingControl: WorkingControl
  readonly taskProposals: TaskProposalHost
  readonly personaAsks: PersonaAsks
  /** Item 22: the directory of teams, sections and channels (the organogram's sectors are the equipes), read by the channel rules and the sidebar views. */
  readonly channelDirectory: ChannelDirectory
  /** Item 22 (H22): the door that ARRANGES the equipes, the categories and where a channel sits (owner only). */
  readonly equipeDesk: EquipeDesk
  /** Colheita item 11: the answers to end-of-turn choice cards (the card itself is read from the persona's message). */
  readonly personaChoices: PersonaChoices
  /** Colheita item 19a: "Seus números", the pinned numbers refreshed by a silent routine. */
  readonly indicators: Indicators
  private indicatorTimer: ReturnType<typeof setInterval> | undefined
  /** Boot diet: the pending start of the background work, and whether it already started (or the host closed first). */
  private backgroundTimer: ReturnType<typeof setTimeout> | undefined
  private backgroundStarted = false
  /** EQUIPE-REAL: requests between personas (TEAM-2/3). Inert unless `Config.teamwork`. */
  readonly handoffs: Handoffs
  /** Item 18: the conversation of a Task, a thread of its stream (`topicId = task:<ticketId>`). */
  readonly taskThreads: TaskThreads
  readonly proactivityScheduler: ProactivityScheduler
  /** CV-8: the blocks of “Toda a equipe” / “Quem tiver algo a dizer” / several @menções. */
  readonly fanout: TeamFanout
  /** TEAM-4: rounds of opinion a persona asks of the team (the Tally's tool calls `opinions.run` after the budget said `ask`). Inert unless `Config.teamwork`. */
  readonly opinions: TeamOpinions
  /** HT-6: the person's “Contratar direto” switch per persona (off unless she turned it on). */
  readonly hireDirect: HireDirect
  /** `Config.productTools`: the persona tools (and what only they need, like “Contratar direto”) exist. */
  readonly productToolsEnabled: boolean
  /** TEAM-15: the four v1.1 switches as they resolved at boot (diagnostics and the boot line show them). */
  readonly hostFlags: HostFlagsView
  /** D-113: the five surfaces under construction as they resolved at boot (OFF in the product, ON under Vitest). Consume as `if (this.surfaces.station)`. */
  readonly surfaces: SurfacesView
  /** TEAM-4: the `ask_team_opinion` tool in front of `opinions`: identity, rounds per Task, requests per day and the budget (Tally). Inert unless `Config.teamwork`. */
  readonly opinionTool: OpinionTool
  /** The team tools of a real persona (ask a colleague, pass the work on, a review's verdict) in front of `handoffs`. Inert unless `Config.teamwork`. */
  readonly teamTools: TeamTools
  /** HT-0 (host half): the ports a persona's tools call (board, sprints, routines) and the identity of a run. Not served to a CLI until the transport exists. */
  readonly harness: HarnessPorts
  /** CV-8: who is the team of a channel. Default: every persona of the project; Anvil's `teamPersonasOf` (CV-6) replaces it. */
  teamOf: (projectId: string, channelId: string) => StoredPersona[] = projectId => this.product.listPersonas(projectId)
  readonly opt: OptRepos
  readonly ledger: TurnLedgerRepos
  readonly remoteTeam: RemoteTeamHost
  /** F4 law 3: a persona of a connected team only acts on a sheet her owner signed. */
  readonly personaSheets: PersonaSheets
  private readonly engineRetryPollMs: number
  private engineRetryTimer: ReturnType<typeof setInterval> | undefined
  private readonly externalPollMs: number
  private externalPollTimer: ReturnType<typeof setInterval> | undefined
  private externalPoller: ExternalPoller | undefined
  private quotaRecheckTimer: ReturnType<typeof setTimeout> | undefined
  private engineReadinessDisposed = false
  readonly webhookGuard: WebhookReplayGuard = new WebhookReplayGuard()
  readonly remoteGuard: RemoteGuard
  /** Short TTL for `listConversationSubjects` (boot storms hit the same stream). */
  private readonly subjectListCache = new Map<string, { at: number; value: ConversationSubjectsBundleView }>()
  sessionMemberId: string | undefined
  /** Carbon P0-13b / MH-1 / MH-2: the ONE vetted address a mail connection may use for a host (a public name resolved once, or a public literal), or undefined when it is refused (never the machine or its network; a failed resolution is a refusal). The probe, the poller and the sealing of a credential all ask it. Specs that probe a fake server on loopback replace it. */
  mailTarget: (host: string) => Promise<string | undefined> = host => resolveMailHost(host)
  readonly lastErrors: string[] = []
  skillIo: SkillDirIo = defaultSkillDirIo()

  /**
   * @param ctx - Host context.
   * @param config - Database path; default empty (env / Vitest memory).
   */
  constructor(ctx: Context, config: Config = { databasePath: '' }) {
    super(ctx, 'personaHost', { namespace: 'persona' })
    this.bootMarks.mark('ctor-start')
    this.engineRetryPollMs = config.engineRetryPollMs ?? 15000
    if (!Number.isInteger(this.engineRetryPollMs) || this.engineRetryPollMs < 0) throw new Error('invalid-engine-retry-poll-ms')
    this.externalPollMs = config.externalPollMs ?? 300_000
    if (!Number.isInteger(this.externalPollMs) || this.externalPollMs < 0) throw new Error('invalid-external-poll-ms')
    ensureProductionRealCli()
    this.store = openPersonaStore({ path: resolvePersonaDatabasePath(config.databasePath) })
    this.bootMarks.mark('store-open')
    this.product = new ProductRepos(this.store)
    this.events = new EventRepos(this.store)
    this.vault = new VaultRepos(this.store)
    this.routines = new RoutineRepos(this.store, () => this.orchestration.now(), nowIso => this.timezoneOffsetMinutes(nowIso))
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
    // COLHEITA 17: the browser of the personas. Profiles live beside the database; a memory database (tests) gets a
    // throw-away folder instead of writing into the checkout.
    this.browserDataRoot = this.store.path === ':memory:' ? scratchBrowserRoot() : dirname(this.store.path) // one throw-away folder PER host (a shared fixed path leaked grants between specs)
    this.browser = new BrowserHost({
      dataRoot: this.browserDataRoot,
      serverPath: config.browserServerPath ?? resolveBrowserServerPath() ?? '',
      // The browser only goes where the product has a per-call gate for it (today, the Claude hook): without one, clicks and
      // typing would run with no card. Lumen's table is the truth (authority/cli-gates.ts).
      carriesMcp: cli => hasBrowserGate(cli),
      onTakeover: (holder) => {
        // The person has the window: the persona's live CLI is stopped, so nothing else is sent to that Chrome.
        for (const workspace of this.product.listWorkspaces()) {
          for (const project of this.product.listProjects(workspace.id)) this.orchestration.evictWarmRunners(project.id, holder.id)
        }
      },
    })
    // Carbon P0-02: the hook gates of the runners follow the mask window of this browser host: while a typed secret is live, the browser reads that carry raw page data are refused,
    // and what any browser tool answers is masked before the model reads it.
    registerSecretWindow(() => this.browser.mask.live(Date.now()), text => this.browser.mask.redact(text, Date.now()))
    this.orchestration.browserOf = async (personaId, cli) => {
      if (!this.surfaces.sharedBrowser) return undefined // D-113: OFF for real: no Chrome opened, no profile turn taken, no browser server in the turn
      const result = await this.browser.opener({ personaId, cli })
      return result.ok ? result.browser : undefined
    }
    // COLHEITA 24: the dedicated station of this machine. The RAM reading is the real one; the queue and the warm CLIs are
    // filled by the runner pool when it exposes them (the station still refuses by RAM without them).
    // P1-10: what the machine remembered (paired, turned off) comes back on boot, and every turn now passes the station's gate (off holds on any machine; the RAM floor and the
    // awake request only on the paired station). A Task the gate stopped runs again by itself when the station is turned on or there is memory again.
    // D-113: the station is still being built, so it is OFF for real in the product (`resolveSurfaces(config).station`; `this.surfaces` is assigned further down): no `station.json` read
    // or written, no gate on the turns (no admission, no awake request, no "Desligada" holding a turn) and the four `@Remote` calls refuse at the ACL funnel.
    const stationOn = resolveSurfaces(config).station
    this.station = new Station({
      freeBytes: () => freemem(),
      // P1-08: the screen's counters are the real ones (the CLIs warm right now, and the Tasks the station stopped), not a fixed zero.
      running: () => [...this.orchestration.warmRunners.keys()].map(id => ({ id, idleSince: 0 })),
      queue: () => this.orchestration.stationGate?.waitingCount() ?? 0,
      ...(stationOn ? { initial: loadStationState(this.browserDataRoot), persist: (state: StationState) => { saveStationState(this.browserDataRoot, state) } } : {}),
    })
    if (stationOn) this.orchestration.stationGate = new StationGate(this.station, { resume: () => this.orchestration.resumeStationWaiting() })
    this.proactivity = new ProactivityHost(
      this.product,
      this.routines,
      new ProactivityRepos(this.store, () => this.orchestration.now()), // S1 P1-12: one clock for every repository the scheduler and the Vigia read
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
    this.orchestration.imagesFor = (eventIds, destDir) => this.media.stageTurnImages(eventIds, destDir)
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
      () => this.orchestration.now(), // S1 P1-12: the host's one clock (invites, books), not `Date.now()`
      () => Date.parse(this.orchestration.now()),
    )
    // HONEST-1: the rules' books and the team's quiet window read the HOST's clock and the person's local time (one source for both).
    this.screens.houseRules.now = () => this.orchestration.now()
    this.screens.houseRules.offsetMinutes = nowIso => this.timezoneOffsetMinutes(nowIso)
    // S1 P1-12: the persona's own silence window (autonomy) is read on the same local clock; `proactivity` is built above, `routines` bind it at construction.
    this.proactivity.offsetMinutes = nowIso => this.timezoneOffsetMinutes(nowIso)
    this.orchestration.localOffsetMinutes = nowIso => this.timezoneOffsetMinutes(nowIso)
    this.orchestration.screens = screenRepos
    // Cofre v2: the sealed slots come from the vault plugin; without it every secret operation fails loud with its own message.
    const sealedProvider = ctx.get('personaVault')
    const canSealCofre = sealedProvider !== undefined && sealedProvider.availability !== 'unavailable'
    const sealedVault = sealedProvider?.vault ?? createPersonaVault({
      seal: () => Promise.reject(new VaultUnavailableError()),
      open: () => Promise.reject(new VaultUnavailableError()),
    })
    const cofreSecrets = new CofreSecrets(sealedVault)
    this.cofreSecrets = cofreSecrets
    this.cofreSealable = canSealCofre
    this.cofre = new CofreHost({
      screens: screenRepos,
      vault: this.vault,
      secrets: cofreSecrets,
      workspaceOf: projectId => this.product.getProject(projectId)?.workspaceId,
      now: () => this.orchestration.now(),
      // Carbon P1-04: the owner filled the card: the persona's Task goes on (the digits never pass through the persona; the host types them with `browser_login` + `code: true`).
      onCodeFilled: (view) => {
        if (view.ticketId === undefined) return
        this.orchestration.wakeTicket(view.projectId, view.ticketId, 'O dono preencheu o código do cartão (o código não passa por você). Clique no campo do código na página e chame browser_login com o mesmo login e code: true.')
      },
    })
    // H15b: connector tokens that older builds kept as a record body move to the sealed store; the sweep never blocks the boot.
    this.cofreMigration = new CofreMigration({ product: this.product, vault: this.vault, secrets: cofreSecrets }).run()
      .catch((error: unknown) => {
        this.orchestration.lastErrors.push(error instanceof Error ? error.message : String(error))
        return { migrated: 0 }
      })
    this.teamwork = new TeamworkSettings(screenRepos)
    this.boards.teamworkOf = (projectId, ticketId) => this.boardTeamwork(projectId, ticketId)
    // TEAM-15: the v1.1 behaviors are ON in the real app; `Config` or `PERSONA_<FLAG>=0` turns one off (flags.ts, contracts/flags-defaults.md).
    this.hostFlags = resolveHostFlags(config)
    this.surfaces = resolveSurfaces(config) // D-113: what is still being built is OFF in the product (surface-gates.ts)
    this.teamworkEnabled = this.hostFlags.teamwork
    this.productToolsEnabled = this.hostFlags.productTools
    this.hireDirect = new HireDirect(screenRepos)
    this.orchestration.onTaskSettled = (event, failed) => {
      try {
        if (event.id === FIRST_DELIVERY_EVENT_ID) {
          this.sealFirstDelivery({ workspaceId: event.workspaceId, projectId: event.projectId }, failed ? 'failed' : undefined)
          return
        }
        if (failed) return
        this.curateProjectReports(event.projectId)
      } catch (error: unknown) {
        // Quit race: the Task settled after the store closed. Nothing can be written now; boot curates the reports again
        // (the same "not open" rule `settleTask` applies to the turn itself). Any other error still surfaces.
        if (error instanceof Error && /not open/i.test(error.message)) return
        throw error
      }
    }
    this.onboarding = new OnboardingHost(this.product, this.events, screenRepos, this.screens)
    this.scheduler = new HostScheduler(this.store, screenRepos, () => Date.parse(this.orchestration.now()))
    this.github = new GithubSourceHost(detectGh(), this.orchestration, this.proactivity)
    this.external = new ExternalSourcesHost(this.orchestration, new CofreSecretVault(this.vault, this.product, cofreSecrets))
    // Harvest 19b: the inbox rule is read at the origin, before any Trigger or model.
    this.external.emailFilter = projectId => this.screens.screens.get<EmailArrivalFilter>(projectId, 'external_email_filter', 'default')
    this.external.emailReader = secret => readImapInboxFromSecret(secret, { resolveHost: host => this.mailTarget(host) }) // Carbon MH-1: the real poller connects only where the policy says
    // Item 26: a routine that listens to a source takes its events at the origin, before the engine sees them (one door: it queues a run the scheduler claims).
    const eventIntake = new RoutineEventIntake({
      routines: this.routines,
      screens: this.screens.screens,
      now: () => this.orchestration.now(),
      audit: (row) => { this.proactivity.repos.recordAudit({ projectId: row.projectId, id: row.id, at: row.at, kind: 'sched:routine_skipped', subjectId: row.subjectId, detail: row.detail }) },
    })
    this.external.routineEvents = (projectId, triggers) => eventIntake.take(projectId, triggers).rest
    this.connections = new ConnectionProbe({
      persistQuota: (snaps) => { this.persistOfficialQuota(snaps) },
      onReady: () => { this.handleReadyEngines() },
    })
    this.orchestration.engineReadinessOf = () => allowsScriptedReplies()
      ? { state: 'ready', reason: null }
      : cachedEngineReadiness(this.connections.list())
    // Harvest 10: the official window decides whether the team's own work runs (95% reserve, 100% stop).
    this.orchestration.windowReserveOf = projectId => this.reserveOf(projectId)
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
      surfaceOff: method => surfaceRefuses(this.surfaces, method), // D-113: an OFF surface refuses its calls in the funnel
    })
    this.topics = new TopicRepos(this.store, () => this.orchestration.now())
    this.channelRepos = new ChannelRepos(this.store, () => this.orchestration.now())
    this.teamChannels = new TeamChannels({
      channels: this.channelRepos,
      personas: projectId => this.product.listPersonas(projectId),
      project: projectId => this.product.getProject(projectId),
      sectors: workspaceId => this.governance.gov.listSectors(workspaceId),
      sectorOf: workspaceId => new Map(this.cards.listCharges(workspaceId).flatMap(charge => (charge.sectorId === undefined ? [] : [[charge.personaId, charge.sectorId] as const]))),
      ownerIds: workspaceId => this.product.listMembers(workspaceId).filter(member => member.role === 'owner').map(member => member.id),
      say: (line) => {
        if (this.events.has(line.id)) return false
        this.events.append({
          id: line.id, workspaceId: line.workspaceId, projectId: line.projectId, streamKind: 'channel', ownerId: line.channelId,
          type: 'message', body: line.body, actorId: line.actorId, subjectId: '', occurredAt: line.at,
        })
        return true
      },
      now: () => this.orchestration.now(),
      enabled: () => this.teamworkEnabled,
    })
    // Item 22: the channel rules read the directory over CV-6 (the organogram's sectors are the equipes); off with the team layer.
    const workspaceOf = (projectId: string): string | undefined => this.product.getProject(projectId)?.workspaceId
    const equipeRepos = new EquipeRepos(this.store, () => this.orchestration.now())
    const categoryRepos = new CategoryRepos(this.store, () => this.orchestration.now())
    this.equipeDesk = new EquipeDesk({
      equipes: equipeRepos,
      categories: categoryRepos,
      channels: this.channelRepos,
      sectorNames: (projectId) => { const workspaceId = workspaceOf(projectId); return workspaceId === undefined ? [] : this.governance.gov.listSectors(workspaceId).map(sector => sector.name) },
      hasPersona: (projectId, personaId) => this.product.getPersona(personaId)?.projectId === projectId,
      newId: () => globalThis.crypto.randomUUID(),
    })
    this.channelDirectory = directoryOverTeamChannels({
      teamChannels: this.teamChannels,
      channels: this.channelRepos,
      equipes: projectId => equipeRepos.list(projectId),
      categories: projectId => categoryRepos.list(projectId),
      placements: projectId => new Map(categoryRepos.placements(projectId).map(place => [place.channelId, { categoryId: place.categoryId, position: place.position }])),
      sectors: (projectId) => { const workspaceId = workspaceOf(projectId); return workspaceId === undefined ? [] : this.governance.gov.listSectors(workspaceId) },
      sectorOf: (projectId) => { const workspaceId = workspaceOf(projectId); return new Map(workspaceId === undefined ? [] : this.cards.listCharges(workspaceId).flatMap(charge => (charge.sectorId === undefined ? [] : [[charge.personaId, charge.sectorId] as const]))) },
    })
    this.orchestration.channelWire = new ChannelWire({
      directory: () => (this.surfaces.channels && this.teamworkEnabled ? this.channelDirectory : undefined), // D-113: the surface OFF = no fence, no @equipe by name (the layer reads nothing)
      personas: projectId => this.product.listPersonas(projectId),
      isPaused: (projectId, personaId) => this.orchestration.isPersonaPaused(projectId, personaId),
    })
    // The organogram changed (a persona joined, left, moved or changed role): the team channels follow. Fail-soft: a channel never blocks a hire.
    this.governance.onOrganogramChange = (projectId) => {
      try { this.teamChannels.reconcile(projectId) } catch (error: unknown) { this.orchestration.softFailure('team-channels', error) }
    }
    // CV-8: who is the team of a channel is the organogram's answer now (was: every persona of the project).
    // A conversation with no channel row (an old base, a test host that writes to "geral" directly) keeps the old answer: the whole project.
    this.teamOf = (projectId, channelId) => (this.channelRepos.get(channelId) === undefined ? this.product.listPersonas(projectId) : this.teamChannels.teamPersonasOf(projectId, channelId))
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
    this.teamConnect = new TeamConnect(teamConnectPorts({
      product: this.product, accounts: this.accounts, usage: this.usage, screens: this.screens.screens, orchestration: this.orchestration,
      connections: () => this.connections.list(), recheck: () => this.connections.retry(), loginStatus: accountLoginStatus,
      audit: (projectId, personaId, action) => { this.auditPersona(projectId, personaId, action) },
    }))
    this.teach = new TeachRepos(this.store, () => this.orchestration.now())
    this.skillImport = new SkillImportHost({ screens: this.screens })
    this.oauthVault = new OAuthVault({ screens: this.screens.screens, secrets: cofreSecrets, now: () => this.orchestration.now() })
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
    this.asides = new AsideAsks(screenRepos, this.workingSend, {
      blocked: (projectId, personaId) => this.orchestration.asideBlocked(projectId, personaId),
      answer: (projectId, personaId, askId, question) => this.orchestration.answerAside(projectId, personaId, askId, question),
    }, () => this.orchestration.now())
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
    this.proactivity.stepSentenceOf = (projectId, ticketId) => this.orchestration.stepSentenceOf(projectId, ticketId)
    this.proactivity.approvalsOf = projectId => this.screens.listApprovals(projectId)
    this.proactivity.houseRules = this.screens.houseRules // HONEST-1: the team's quiet window also stops the events that would start an initiative
    this.proactivity.teamPaused = projectId => this.teamState.isPaused(projectId) // Muse's "Descansando" also covers the whole team paused
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
    this.personaAsks = new PersonaAsks({
      product: this.product,
      screens: screenRepos,
      events: this.events,
      orchestration: this.orchestration,
    })
    this.personaChoices = new PersonaChoices(screenRepos)
    this.indicators = new Indicators({
      product: this.product,
      screens: screenRepos,
      events: this.events,
      answerer: {
        blocked: (projectId, personaId) => this.orchestration.asideBlocked(projectId, personaId),
        // P0-07b: the numbers' quiet turn has a runner of its own (never the one `/lado` captures its text on).
        answer: (projectId, personaId, askId, question) => this.orchestration.answerIndicator(projectId, personaId, askId, question),
      },
      now: () => this.orchestration.now(),
      projects: () => this.product.listWorkspaces().flatMap(workspace => this.product.listProjects(workspace.id).map(project => project.id)),
    })
    // A refresh the previous process died in must not stay "Atualizando…" (P1-08): at boot every `updating` with nothing running goes back to the old value.
    this.indicators.recoverAll()
    // The quiet refresh: what is due is refreshed once a minute at most; the timer never keeps the process alive and never writes to a conversation.
    this.indicatorTimer = setInterval(() => { void this.indicators.tick().catch(() => undefined) }, 60_000)
    this.indicatorTimer.unref()
    // Harvest 19b: the connected sources (Telegram, Slack, Discord, CalDAV, e-mail) are read on their own timer; zero disables it.
    this.armExternalPoll()
    // A worker that ended its turn with a structured question (chips, a sequence) opens its card on the Ticket (budget applies).
    this.orchestration.structuredAsk = input => this.personaAsks.ask(input)
    // Item 7: the end-of-turn controller's `cartao-continuar` becomes the one-click card (her own words are not posted).
    this.orchestration.continueCard = (card) => {
      offerContinueCard({ orchestration: this.orchestration, asks: this.personaAsks }, { projectId: card.projectId, ticketId: card.ticketId, fala: card.fala, sentenceShown: true })
    }
    // What was answered (chips, words, files) is remembered for the read-only card, and a sequence opens its next card.
    this.orchestration.attentionAnswered = (info) => {
      this.personaAsks.recordAnswer(info.projectId, info.attentionId, {
        optionIds: info.optionIds,
        text: info.text,
        attachmentIds: this.media.listByMessage(info.messageId).map(row => row.id),
      })
      if (info.done) return
      const ticket = this.orchestration.runtime(info.projectId).repo.tickets.get(info.ticketId)
      if (ticket !== undefined) this.personaAsks.openCard(info.projectId, ticket)
    }
    // EQUIPE-REAL (TEAM-2/3): a persona asks a colleague; the Task of whoever asked waits and the delivery wakes it. Inert unless `Config.teamwork`.
    this.handoffs = new Handoffs({
      product: this.product,
      screens: screenRepos,
      events: this.events,
      enabled: () => this.teamworkEnabled,
      limitsOf: (projectId, personaId) => this.teamwork.get(projectId, personaId),
      // D-084: a colleague inherits the scope of the request; a connector the person's words need and she may not use waits for the person.
      connectorGate: (_projectId, toPersonaId, rootTicketId) => {
        const to = this.product.getPersona(toPersonaId)
        return to === undefined ? undefined : this.connectorGrants.gapFor(to, rootTicketId)
      },
      needConnector: (input) => {
        this.connectorAsks.open({
          id: `connector-ask:${input.requestId}`, projectId: input.projectId, reason: 'colleague', personaId: input.toPersonaId,
          connector: input.connector, access: input.access, requestedByPersonaId: input.fromPersonaId, handoffId: input.requestId, taskTitle: input.title,
        })
      },
      orchestration: this.orchestration,
    })
    this.connectorAsks = new ConnectorAsks({
      screens: screenRepos,
      product: this.product,
      // Lazy: the grants are built further down.
      grants: {
        grant: (request, actorId) => this.connectorGrants.grant(request, actorId),
        list: (workspaceId, personaId) => this.connectorGrants.list(workspaceId, personaId),
        authorizeOnce: (persona, connector, ticketId, messageId) => { this.connectorGrants.authorizeOnce(persona, connector, ticketId, messageId) },
      },
      release: (ask, choice) => ask.handoffId === undefined ? undefined : this.handoffs.release(ask.projectId, ask.handoffId, choice),
      now: () => this.orchestration.now(),
    })
    this.screens.extraApprovals.push(projectId => this.connectorAsks.approvals(projectId))
    this.externalActions = new ExternalActions({
      screens: screenRepos,
      product: this.product,
      grants: {
        grant: (request, actorId) => this.connectorGrants.grant(request, actorId),
        list: (workspaceId, personaId) => this.connectorGrants.list(workspaceId, personaId),
      },
      wake: (projectId, ticketId, note) => this.orchestration.wakeTicket(projectId, ticketId, note),
      changed: (doc) => { this.events.touch(`action-card:${doc.id}`) },
      now: () => this.orchestration.now(),
    })
    this.screens.extraApprovals.push(projectId => this.externalActions.approvals(projectId))
    this.activityUndo = new ActivityUndo(activityUndoDeps(this, screenRepos))
    // One number for the person: requests to colleagues (help, pass on) plus rounds of opinion (TEAM-4). Lazy, so `opinionTool` may be built later.
    this.teamwork.askedToday = (projectId, personaId) => {
      const day = this.orchestration.now().slice(0, 10)
      return this.handoffs.askedToday(projectId, personaId, day) + this.opinionTool.askedToday(projectId, personaId, day)
    }
    this.orchestration.handoffWait = (projectId, ticketId, delivered) => this.handoffs.waitingLine(projectId, ticketId, delivered)
    this.orchestration.handoffPending = (projectId, ticketId) => this.handoffs.waitingOnColleague(projectId, ticketId)
    // Carbon P1-02: a Task whose persona asked the owner for a six-digit code waits for it (the card is the ask); filling the card wakes it.
    this.orchestration.vaultCodeWait = (projectId, ticketId) => {
      const open = this.cofre.codes.pendingFor(projectId, ticketId)
      const site = open.find(request => request.site !== undefined)?.site
      return open.length === 0 ? undefined : `Esperando você: o código de 6 dígitos${site === undefined ? '' : ` do ${site}`}`
    }
    // Item 18: the conversation of a Task is a thread of its stream; who answers it, what the persona reads about the Task, and what the card carries.
    this.taskThreads = new TaskThreads({ product: this.product, screens: this.screens.screens, events: this.events, orchestration: this.orchestration })
    this.orchestration.threadResponderOf = event => this.taskThreads.responderOf(event)
    this.orchestration.threadContextOf = event => this.taskThreads.contextOf(event)
    this.boards.threadOf = (projectId, ticketId) => this.boardThread(projectId, ticketId)
    this.orchestration.inReview = (projectId, ticketId) => this.handoffs.reviewing(projectId, ticketId) !== undefined
    this.orchestration.humanTitles = () => this.teamworkEnabled // EQUIPE-REAL §0: short human titles, never the raw request
    this.orchestration.functionRouting = () => this.teamworkEnabled // TEAM-13: by function, only with the team behavior on
    this.orchestration.ticketSettled = (info) => { this.handoffs.settled(info) }
    this.orchestration.taskDelivered = info => this.handoffs.delivered(info)
    this.orchestration.entregaOf = (projectId, requestId) => this.handoffs.entregaBlock(projectId, requestId)
    this.orchestration.entregaImagesOf = (projectId, requestId, destDir) => this.handoffs.entregaImages(projectId, requestId, destDir)
    this.handoffs.svg = { blocksIn: svgBlocksIn, toPng: svg => svgToPng(svg) } // Forge's helper: the art of a delivery as a PNG for the colleague's turn
    this.orchestration.quietTask = (projectId, ticketId) => this.handoffs.isReviewTask(projectId, ticketId)
    // EQUIPE-REAL §0: the plan and delivery cards stand for the state lines and the closing sentence of a request done in parts.
    this.orchestration.hiddenByCards = (projectId, eventId) => this.teamCards.replaced(projectId, eventId)
    this.orchestration.requestIdOf = (projectId, ticketId) => this.handoffs.requestOf(projectId, ticketId)?.requestId
    this.orchestration.planCardsOn = () => this.teamworkEnabled
    // TEAM-12: the Gestor's approved plan opens the first part of the campaign (the mandate is the person who approved).
    this.gestor.campaignStarter = (input) => {
      const workspaceId = this.product.getProject(input.projectId)?.workspaceId
      const actor = workspaceId === undefined ? undefined : (this.actorOf(workspaceId) ?? this.product.listMembers(workspaceId).find(row => row.role === 'owner'))
      if (actor === undefined) return
      this.handoffs.startCampaign({ projectId: input.projectId, planId: input.planId, goal: input.goal, mandateActorId: actor.id, announcerId: input.gestorId, steps: input.steps })
    }
    this.teamCards = new TeamCards({
      enabled: () => this.teamworkEnabled,
      now: () => this.orchestration.now(),
      product: this.product,
      events: this.events,
      screens: screenRepos,
      tickets: projectId => this.orchestration.runtime(projectId).repo.tickets.list(),
      conversationOfTicket: (projectId, ticketId) => this.orchestration.conversationOfTicket(projectId, ticketId),
      requestOf: (projectId, ticketId) => this.handoffs.requestOf(projectId, ticketId),
      reviewing: (projectId, ticketId) => this.handoffs.reviewing(projectId, ticketId),
      reviewedBy: (projectId, ticketId) => this.handoffs.reviewedBy(projectId, ticketId),
      handoffChip: (projectId, ticketId) => this.handoffChipOf(projectId, ticketId),
      stateLineOf: (projectId, eventId) => this.messageFlags.of(projectId, eventId).stateLine,
    })
    this.morningBrief = new MorningBriefHost({
      enabled: () => this.teamworkEnabled,
      now: () => this.orchestration.now(),
      offsetMinutes: nowIso => this.timezoneOffsetMinutes(nowIso),
      product: this.product,
      events: this.events,
      screens: screenRepos,
      routines: this.routines,
      tasks: projectId => this.morningTasks(projectId),
      needsYou: projectId => this.needsYouCount(projectId),
      // Carbon P0-13: a Task born in a DM has no request line in the shared card (it is made from the DM's words).
      requestOf: (projectId, taskId) => (this.orchestration.conversationOfTicket(projectId, taskId)?.streamKind === 'dm' ? undefined : this.teamCards.requestOfLine(projectId, taskId)),
      timeZone: () => Intl.DateTimeFormat().resolvedOptions().timeZone,
    })
    this.personWaiting = new PersonWaiting({
      enabled: () => this.teamworkEnabled,
      now: () => this.orchestration.now(),
      product: this.product,
      events: this.events,
      screens: screenRepos,
      waiting: projectId => this.morningTasks(projectId, { keepWaiting: true }).filter(task => task.state === 'review' && this.waitingOnPerson(projectId).has(task.taskId)).map(task => ({
        taskId: task.taskId, personaId: task.personaId, title: task.title, since: task.updatedAt,
      })),
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
      houseRules: this.screens.houseRules, // HONEST-1: initiatives, routines, plans, the proposal card and the morning card wait for the quiet window to end
      // The morning ritual and the reminder of what waits for the person share the host's tick.
      morningBrief: { check: (projectId, event) => { const outcome = this.morningBrief.check(projectId, event); this.personWaiting.check(projectId); return outcome } },
    }, { cycleMs: config.proactivityCycleMs ?? 30_000, nowMs: () => Date.parse(this.orchestration.now()) }) // S1 P1-12: ONE clock for the whole host
    this.orchestration.startOnBoardMove = this.hostFlags.startOnBoardMove
    this.orchestration.fanoutEnabled = this.hostFlags.fanout
    this.orchestration.turnClose = resolveTurnClose(config) // colheita item 3: ON in the real app; PERSONA_TURN_CLOSE=0 turns it off
    this.fanout = new TeamFanout({
      gateOf: (projectId, persona) => this.orchestration.fanoutGateOf(projectId, persona),
      answer: (projectId, persona, session, prompt) => this.orchestration.answerOnce(projectId, persona, session, prompt, `Resposta de ${persona.name}.`),
      say: (event, persona, id, body) => { this.orchestration.postLine(event, persona, id, body) },
      flag: (projectId, lineId, view) => { this.messageFlags.set(projectId, lineId, { fanout: view }) },
      edit: (lineId, body) => { this.events.edit(lineId, body, this.orchestration.now()) },
      begin: (projectId, messageId, fanoutId) => { this.messageFlags.set(projectId, messageId, { ...this.messageFlags.of(projectId, messageId), fanoutId }) },
      queue: (job) => { this.orchestration.queueWork(job) },
      concurrency: 3,
    })
    this.opinions = new TeamOpinions({
      enabled: () => this.teamworkEnabled,
      persona: (projectId, id) => {
        const found = this.product.getPersona(id)
        return found !== undefined && found.projectId === projectId ? found : undefined
      },
      askerTask: (projectId, ticketId, askerName) => {
        const found = this.orchestration.runtime(projectId).repo.tickets.get(ticketId)
        return found !== undefined && found.ended === undefined && found.execution?.name === askerName
      },
      conversationOf: (projectId, ticketId) => this.orchestration.conversationOfTicket(projectId, ticketId),
      workspaceOf: projectId => this.product.getProject(projectId)?.workspaceId,
      now: () => this.orchestration.now(),
      gateOf: (projectId, persona) => this.orchestration.fanoutGateOf(projectId, persona),
      existingAttachments: (projectId, ids, stream) => this.media.existingIds(projectId, ids, stream),
      bindAttachments: (projectId, messageId, ids, stream) => {
        try {
          this.media.bindDraft(messageId, ids, projectId, stream)
        } catch (error: unknown) {
          void error // the round does not depend on the clip being tied; the image already reaches the colleagues
        }
      },
      stageImages: (projectId, ids, key) => this.media.stageAttachmentImages(projectId, ids, key),
      stageBufferImages: (items, key) => this.media.stageBufferImages(items, key),
      answer: (projectId, persona, session, prompt, images, scripted) => this.orchestration.answerOnce(projectId, persona, session, prompt, scripted, images),
      say: (line) => {
        if (this.events.has(line.id)) return false
        this.events.append({
          id: line.id, workspaceId: line.workspaceId, projectId: line.projectId, streamKind: line.streamKind, ownerId: line.ownerId,
          type: 'message', body: line.body, actorId: line.actorId, subjectId: line.subjectId, occurredAt: line.at,
          ...(line.topicId === '' ? {} : { topicId: line.topicId }),
        })
        return true
      },
      bodyOf: id => this.events.get(id)?.body,
      flag: (projectId, lineId, view) => { this.messageFlags.set(projectId, lineId, { opinion: view }) },
      flagOf: (projectId, lineId) => this.messageFlags.of(projectId, lineId).opinion,
      concurrency: 3,
    })
    this.harness = new HarnessPorts({
      product: this.product,
      ticketOf: (projectId, ticketId) => this.orchestration.runtime(projectId).repo.tickets.get(ticketId),
      eventActorOf: eventId => this.events.get(eventId)?.actorId,
      autonomyOf: (projectId, personaId) => this.proactivity.getAutonomy(projectId, personaId).mode,
      boards: new BoardPorts({
        product: this.product, boards: this.boards, ticketOf: (projectId, ticketId) => this.orchestration.runtime(projectId).repo.tickets.get(ticketId),
        screens: this.screens.screens, now: () => this.orchestration.now(), newId: () => `sp-${globalThis.crypto.randomUUID()}`,
      }),
      routines: new RoutinePorts({
        product: this.product, routines: this.routines, screens: this.screens.screens, now: () => this.orchestration.now(), newId: () => `rt-${globalThis.crypto.randomUUID()}`,
      }),
      hiring: new HiringPorts({
        product: this.product,
        propose: request => this.screens.proposeHire(request),
        decide: request => this.screens.decide(request),
        approvals: projectId => this.screens.listApprovals(projectId),
        hireDirectOf: (projectId, personaId) => this.hireDirect.get(projectId, personaId),
        directToday: (projectId, personaId, day) => this.hireDirect.hiredOn(projectId, personaId, day),
        noteDirect: (projectId, personaId, day) => { this.hireDirect.noteHire(projectId, personaId, day) },
        // HONEST-1: the house rule `never-hire` closes the one shortcut ("Contratar direto"); what it closed is written in the rule's book.
        directLocked: (projectId, what) => {
          const rules = this.screens.houseRules.rulesOfKind(projectId, 'never-hire')
          if (rules.length === 0) return false
          for (const rule of rules) this.screens.houseRules.record(projectId, rule.id, this.orchestration.now(), what, `hire:${what}:${this.orchestration.now()}`)
          return true
        },
        now: () => this.orchestration.now(),
      }),
      // Item 15: the 2FA card. Without a sealed store the port refuses with its own sentence instead of opening a card nobody can fill.
      vaultCode: new VaultCodePorts({ codes: this.cofre.codes, sealable: () => canSealCofre }),
      // COLHEITA 15b: the Cofre password goes into the page of its own site; the answer never carries the value.
      browserLogin: new BrowserLoginPorts({
        liveSessionOf: (personaId) => {
          const live = this.browser.service.liveSessionOf(personaId)
          return live === undefined ? undefined : { port: live.port, profileId: live.profile.id }
        },
        loginsOf: projectId => this.cofre.entries.list(projectId)
          .filter(entry => entry.kind === 'login')
          .map(entry => ({ id: entry.id, title: entry.title, site: entry.fields.site ?? '', username: entry.fields.username ?? '' })),
        secretOf: (projectId, entryId) => this.cofre.secretOf(projectId, entryId),
        // Carbon P1-04: the six digits the owner filled go into the page through `browser_login` with `code: true`, never through the model.
        codes: { filledFor: (projectId, who) => this.cofre.codes.filledFor(projectId, who), peek: (projectId, id) => this.cofre.codes.peek(projectId, id), take: (projectId, id) => this.cofre.codes.take(projectId, id) },
        mask: this.browser.mask,
        now: () => Date.now(),
        // Carbon P0-02 (Keel, 12/11): a password that reached the address bar after the call returned is told to the owner, in fixed words (no value, no address), in the book and the thread.
        onLeak: (leak) => {
          const workspaceId = this.product.getProject(leak.projectId)?.workspaceId ?? ''
          this.activityUndo.record(
            { workspaceId, projectId: leak.projectId, personaId: leak.personaId, callId: `${leak.ticketId}:browser_leak:${leak.loginId}` },
            loginLeakActivity(leak, this.orchestration.now()),
          )
        },
      }),
    })
    this.opinionTool = new OpinionTool({
      enabled: () => this.teamworkEnabled,
      now: () => this.orchestration.now(),
      product: this.product,
      screens: screenRepos,
      opinions: this.opinions,
      limitsOf: (projectId, personaId) => this.teamwork.get(projectId, personaId),
      otherAsksToday: (projectId, personaId, dayIso) => this.handoffs.askedToday(projectId, personaId, dayIso),
      isRunning: (projectId, ticketId, personaId) => {
        const found = this.orchestration.runtime(projectId).repo.tickets.get(ticketId)
        const who = this.product.getPersona(personaId)
        return found !== undefined && who !== undefined && found.ended === undefined && found.execution?.name === who.name
      },
      gateOf: (projectId, persona) => this.orchestration.fanoutGateOf(projectId, persona),
      // D-092: the asker's account decides whether the budget carries US$ (API) or the impact on the quota window (subscription).
      accountOf: (projectId, persona) => {
        const logged = this.orchestration.loggedCliOf?.(projectId)
        const spec = specFromConnection(persona.runner, logged)
        const cli = spec.kind === 'cli' ? spec.cli : (logged ?? 'none')
        const account = this.screens.screens.get<{ accountId: string }>(projectId, 'active_account', persona.id)?.accountId
        return accountForEstimate({
          specKind: spec.kind, cli, ...(logged === undefined ? {} : { loggedCli: logged }), env: process.env,
          quotas: this.usage.listQuota(projectId), ...(account === undefined ? {} : { accountId: account }),
          ledger: this.ledger.list({ projectId }),
        })
      },
      // "The team" of a round of opinion = the people LINKED to this work, not the whole project: the other Tasks of the same request of the
      // person (the parts of a split), the collaborators of the Task, and the Coordenação (Atlas, 05/11 00:05).
      involvedIn: (projectId, ticketId) => {
        const rt = this.orchestration.runtime(projectId)
        const mine = rt.repo.tickets.get(ticketId)
        const people = this.product.listPersonas(projectId)
        const linked = new Set<string>()
        // The parts of a split are each a Task of their own child event `split:<message>:<persona>`: they belong together by the message.
        const requestOf = (triggerId: string): string => (triggerId.startsWith('split:') ? triggerId.slice(0, triggerId.lastIndexOf(':')) : triggerId)
        if (mine !== undefined) {
          for (const other of rt.repo.tickets.list()) {
            if (other.id === mine.id || requestOf(other.origin.triggerId) !== requestOf(mine.origin.triggerId)) continue
            const who = people.find(row => row.name === other.execution?.name)
            if (who !== undefined) linked.add(who.id)
          }
        }
        for (const id of getCollaborators(this.screens.screens, projectId, ticketId)?.personaIds ?? []) linked.add(id)
        for (const row of people) if (row.systemRoles.includes('coordination')) linked.add(row.id)
        return [...linked]
      },
      motorOf: persona => ({ cli: persona.runner.kind === 'cli' ? persona.runner.cli : 'dsh', connected: true, readsImages: engineSeesImages(persona.runner) }),
      // P0-C2: the draft folder of the asker's Task, where the art she saved is (`draft.files`).
      draftRootOf: (projectId, ticketId) => this.orchestration.runtime(projectId).repo.tickets.get(ticketId)?.execution?.directory,
      // The model reads attachments by NAME: the tool takes a name for an id, and the image that came with the request is the draft when none is named.
      attachmentsOf: (projectId, ticketId) => {
        const ticket = this.orchestration.runtime(projectId).repo.tickets.get(ticketId)
        const where = this.orchestration.conversationOfTicket(projectId, ticketId)
        const named = (rows: ReadonlyArray<{ readonly id: string; readonly name: string }>): Array<{ id: string; name: string }> => rows.map(row => ({ id: row.id, name: row.name }))
        // A part of a split request (`split:<message>:<persona>`) is made from the message of the person: its files are that message's.
        const trigger = ticket?.origin.triggerId ?? ''
        const message = trigger.startsWith('split:') ? trigger.slice('split:'.length, trigger.lastIndexOf(':')) : trigger
        return {
          thread: where === undefined ? [] : named(this.media.listByStream(projectId, where.streamKind, where.ownerId)),
          request: message === '' ? [] : named(this.media.listByMessage(message)),
        }
      },
    })
    // The team tools of a REAL persona (ask a colleague, pass the work on, a review's verdict): the live CLI's door to `handoffs`. Inert unless `Config.teamwork`.
    this.teamTools = new TeamTools({
      enabled: () => this.teamworkEnabled,
      product: this.product,
      harness: this.harness,
      handoffs: this.handoffs,
      limitsOf: (projectId, personaId) => this.teamwork.get(projectId, personaId),
      ticketOf: (projectId, ticketId) => this.orchestration.runtime(projectId).repo.tickets.get(ticketId),
      plannedFor: (projectId, ticketId) => this.orchestration.plannedPartsOf(projectId, ticketId), // D-100: the other parts of the plan are never passed work
      // Item 16: what a colleague can reach rides on her entry in the team paragraph (lazy: the grants host is built after this).
      accessLabelOf: (projectId, personaId) => {
        const workspaceId = this.product.getProject(projectId)?.workspaceId
        return workspaceId === undefined ? '' : accessLabelOf(this.orchestration.accessOf?.(workspaceId) ?? [], personaId)
      },
    })
    if (this.productToolsEnabled) {
      // One process gateway; each turn of a Task opens its own lease. Only the harness tools are offered (see `productToolsOpener`).
      const gateway = createMcpGateway({
        // `persona_ask` is the one persona tool a CLI worker gets: it opens the question on the Task through `PersonaAsks` (D-079 b).
        hooks: {
          report: () => undefined, recall: () => '',
          ask: createAskTool({
            product: this.product, screens: screenRepos, asks: this.personaAsks,
            ticketOf: (projectId, ticketId) => this.orchestration.runtime(projectId).repo.tickets.get(ticketId),
            known: (_projectId, ticket) => this.orchestration.knownFactsOfTicket(ticket), // colheita item 3: no silly question reaches the person
          }),
        },
        harness: withTeamTools(withOpinionTool(harnessMcpPorts(this.harness, {
          // COLHEITA 5: the activity is kept (same `harness_activity` document), gets its thread line and, when it has an inverse, the 5 minute Desfazer.
          onActivity: (who, activity) => { this.activityUndo.record(who, activity) },
        }), this.opinionTool), this.teamTools),
        onlyWired: true,
        // Carbon P0-02: the one funnel of what a product tool answers: a typed secret (a Cofre password, the six digits of a code) never reaches the model, whatever carried it.
        redact: text => this.browser.mask.redact(text, Date.now()),
      })
      // What decides the tools of a turn: the words of the request for board/sprints/routines/hiring, and the HOST's rule (not the words) for the team tools (D-097).
      const stableTools = new StableTools() // item 9a: one tool list per persona, widened at most once (her warm session is kept)
      const toolRules = (persona: StoredPersona, projectId: string): ProductToolsRules => ({
        taskTextOf: (ticketId) => {
          const rt = this.orchestration.runtime(projectId)
          const found = rt.repo.tickets.get(ticketId)
          return found === undefined ? '' : `${found.title}\n${found.execution?.assignment ?? ''}\n${rt.repo.triggers.get(found.origin.triggerId)?.text ?? ''}`
        },
        teamToolsOf: turn => this.teamTools.toolsFor(projectId, persona, turn.ticketId),
        // COLHEITA 15b: the Cofre login is offered only where it can act (the turn has the browser and the Cofre has a login).
        browserLoginOf: turn => this.browser.service.liveSessionOf(turn.personaId) !== undefined
          && this.cofre.entries.list(projectId).some(entry => entry.kind === 'login'),
        stable: { memory: stableTools, key: `${projectId}:${persona.id}` },
      })
      this.orchestration.productToolsOf = (persona, projectId) => productToolsOpener({ gateway, toolLevel: gatewayLevelOf(persona.tools), ...toolRules(persona, projectId) })
      // Only a Task that runs on a CLI is offered tools (conversation and answer-only calls never are): the same test `resolveFor` makes.
      const onACli = (persona: StoredPersona, projectId: string): boolean => specFromConnection(persona.runner, this.orchestration.loggedCliOf?.(projectId)).kind === 'cli'
      // D-097: what the worker is told about the team, and the read-only record of each turn (the full prompt and the tools it was offered).
      this.orchestration.teamGuidanceOf = (projectId, persona, ticketId) => (onACli(persona, projectId) ? this.teamTools.guidanceFor(projectId, persona, ticketId) : undefined)
      this.orchestration.offeredToolsOf = (projectId, persona, ticketId) => (onACli(persona, projectId) ? offeredToolNames(toolRules(persona, projectId), gatewayLevelOf(persona.tools), { personaId: persona.id, ticketId }) : [])
    }
    this.orchestration.onMentionsFanout = (event, cited) => { this.fanout.start({ event, source: 'mentions', personas: cited }) }
    this.orchestration.onCollaborators = (event, ticket, lead, others) => {
      this.fanout.start({ event, source: 'mentions', personas: others, promptOf: () => collaboratorPrompt(ticket.title, lead.name, event.body) })
    }
    this.opt = new OptRepos(this.store, () => this.orchestration.now())
    this.ledger = new TurnLedgerRepos(this.store)
    this.connectorGrants = new ConnectorGrantsHost({
      grants: new ConnectorGrantRepos(this.store, () => this.orchestration.now()),
      auth: new TicketConnectorAuthRepos(this.store, () => this.orchestration.now()),
      product: this.product,
      ticketTriggers: (projectId, ticketId) => {
        const ticket = this.orchestration.runtime(projectId).repo.tickets.get(ticketId)
        return ticket === undefined ? undefined : [...ticket.origin.triggerIds, ...ticket.inputs.flatMap(input => (input.kind === 'trigger' ? [input.id] : []))]
      },
      eventOf: eventId => this.events.get(eventId),
      // Carbon P0-09: the connectors are the OWNER's (acesso ⊆ dono): only the owner's own words are a request that authorizes one; an invited member's never do.
      isHuman: (workspaceId, actorId) => this.product.listMembers(workspaceId).some(member => member.id === actorId && member.role === 'owner'),
      autonomyOf: (projectId, personaId) => this.proactivity.getAutonomy(projectId, personaId).mode,
      events: this.events,
      orchestration: this.orchestration,
      geralOf: (workspaceId, projectId) => this.ensureProjectConversation(workspaceId, projectId).channelId,
      ports: () => this.portsNow(),
      approvedFor: (projectId, ticketId) => this.externalActions.approvedWithConnector(projectId, ticketId),
      audit: (workspaceId, actorId, action, detail) => { this.governance.audit(workspaceId, actorId, action, detail) },
      now: () => this.orchestration.now(),
    })
    // Typed explicitly: the orchestration field still declares two parameters (Bolt adds the Task id there); the third one is optional.
    this.orchestration.connectorsOf = (persona: StoredPersona, cli: string, ticketId?: string) => this.connectorGrants.forRunner(persona, cli, ticketId)
    // Item 16: who holds which access, read from the grants the owner gave: a persona that lacks one asks the colleague who has it (the list of colleagues carries it).
    this.orchestration.accessOf = (workspaceId: string) => accessMapOf(this.connectorGrants.list(workspaceId), personaId => this.product.getPersona(personaId)?.name)
    // HT-9: a Task that carries connectors on Claude gets a gate; what it refuses becomes a card and the approval comes back as one allowed call.
    this.actionBridge = new ActionBridge({
      actions: this.externalActions,
      ports: () => this.portsNow(),
      rules: this.screens.houseRules,
      announce: (doc) => { this.announceAction(doc) },
      // COLHEITA 17: each browser interaction the gate let through is one line in the book — the tool word and the site, never a value.
      onInteractions: (who, items) => {
        const workspaceId = this.product.getProject(who.projectId)?.workspaceId ?? ''
        for (const item of items) {
          const fills = /fill|type/iu.test(item.tool)
          this.activityUndo.record(
            { workspaceId, projectId: who.projectId, personaId: who.personaId, callId: `${who.ticketId}:${item.tool}:${item.site ?? ''}` },
            {
              verb: fills ? 'browser_fill' : 'browser_click',
              target: { kind: 'browser-site', id: item.site ?? '', title: item.site ?? 'navegador' },
              initiator: 'persona-initiative',
              status: 'done',
              undoable: false,
              at: this.orchestration.now(),
            },
          )
        }
      },
    })
    this.orchestration.actions = this.actionBridge
    this.orchestration.connectorLabel = (cli, id) => this.portsNow().availableConnectors?.(cli).find(item => item.id === id)?.name
    // The person approved the preview: the Task wakes carrying the approval (its next runner is armed with exactly those arguments, once). What
    // she approved is DATA for the persona; the gate, not this sentence, is what lets the call through.
    this.onActionApproved = (action) => {
      this.orchestration.wakeTicket(action.projectId, action.ticketId, 'A pessoa aprovou a ação externa que você pediu. Faça de novo exatamente a mesma chamada, com os mesmos argumentos: ela passa uma vez. Se mudar qualquer coisa, será outro pedido.')
    }
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
      live: config.remoteTeamLive ?? false, // D-113: the live link is part of the invite surface, which ships OFF
      enabled: () => this.surfaces.invite, // D-113: OFF = inert (no resume at boot, no poll, no socket, no network)
      topicOf: (projectId, channelId) => this.activeSubjectId(projectId, 'channel', channelId),
      identity: () => loadOrCreateIdentity(new CofreIdentityStore(this.cofreSecrets)), // H23: the device identity lives in the Cofre's sealed slot
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
      process.stderr.write(`${flagsBootLine(this.hostFlags)}\n${surfacesBootLine(this.surfaces)}\n`) // a verifier reads the app's log: the four switches as they resolved, no env needed
      this.connectorBridge ??= claudeConnectorBridge(cli => this.connections.list().find(card => card.kind === cli)?.version) // the installed version decides what isolation can be called proven
      // Boot diet (lever 2): the warmups, the scheduler, the reports curation and the `gh` probe are NOT the first screen: they start after a short delay (`startBackground`), once.
      this.scheduleBackground(Number(process.env.PERSONA_BOOT_BACKGROUND_MS ?? BOOT_BACKGROUND_DELAY_MS))
    }
    this.mountGithubWebhook(ctx)
    this.mountMedia(ctx)
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        // Boot is fail-soft per project: an old base with something odd in one project (a subject nobody can read, an archived channel, a persona
        // that was retired) says so in one diagnostics line and never takes the whole host down.
        try {
          for (const persona of this.product.listPersonas(project.id)) this.governance.registerPersona(persona)
          this.bootMarks.time('reconcile', () => this.teamChannels.reconcile(project.id)) // heals a base that already had teams: their channels are born here
          this.scheduler.arm(project.id)
          this.remoteTeam.resume({ workspaceId: workspace.id, projectId: project.id })
        } catch (error: unknown) {
          this.orchestration.softFailure('boot-project', error)
        }
      }
    }
    this.bootMarks.mark('projects-done')
    if (process.env.VITEST !== 'true') process.stderr.write(`${this.bootMarks.line()}\n`)
    ctx.effect(() => async () => {
      this.engineReadinessDisposed = true
      this.backgroundStarted = true // a host that closes before the delay never starts the background work
      if (this.backgroundTimer !== undefined) { clearTimeout(this.backgroundTimer); this.backgroundTimer = undefined }
      this.proactivityScheduler.dispose()
      if (this.indicatorTimer !== undefined) clearInterval(this.indicatorTimer)
      if (this.engineRetryTimer !== undefined) clearInterval(this.engineRetryTimer)
      clearInterval(this.externalPollTimer)
      if (this.quotaRecheckTimer !== undefined) clearTimeout(this.quotaRecheckTimer)
      this.scheduler.dispose()
      try {
        await this.orchestration.work
        await this.remoteTeam.dispose()
      } finally {
        try {
          await this.orchestration.disposeRunners()
          await this.orchestration.whenBackgroundIdle() // P0-12: the Tasks whose turn was just cancelled wind down before the store closes under them
        } finally {
          try {
            this.station.setRunning(false, { remember: false }) // P0-12: the powershell that keeps Windows awake goes with the host (P1-10: the person's on/off switch is NOT rewritten by a quit)
            await this.browser.closeAll() // P0-12: every Chrome of the product, with its tree
          } finally {
            this.store.close()
            dropScratchBrowserRoot(this.browserDataRoot) // the throw-away folder of an in-memory host goes with it (a real host's data folder is never touched)
          }
        }
      }
    })
    this.personaSheets = new PersonaSheets({
      screens: screenRepos,
      identity: () => this.remoteTeam.deviceIdentity(),
      team: (workspaceId, projectId) => {
        try {
          if (!this.remoteTeam.isEnabled()) return undefined // D-113: with the invite surface off there is no team to defend
          const state = this.remoteTeam.state({ workspaceId, projectId })
          return state?.role === 'owner' && state.status !== 'revoked' ? { actorId: state.actorId } : undefined
        } catch (error) {
          void error // a state of another workspace: not a team of this project
          return undefined
        }
      },
    })
    this.wrapPersonaWrites()
    this.orchestration.sheetGate = persona => this.personaSheets.gate(persona)
    installRemoteGuard(this, this.remoteGuard)
  }

  /**
   * F4 law 3: every persona this host writes goes through the product repos, so this is the one place the owner's own writes are signed (a write made inside
   * `personaSheets.bypass`, or by anything that is not this host's code, is not: that is what the guard exists to catch).
   */
  private wrapPersonaWrites(): void {
    const product = this.product
    const update = product.updatePersona.bind(product)
    const create = product.createPersona.bind(product)
    product.updatePersona = (persona, projectId) => {
      const written = update(persona, projectId)
      this.personaSheets.signLater(written)
      return written
    }
    product.createPersona = (persona, projectId) => {
      const created = create(persona, projectId)
      this.personaSheets.signLater(created)
      return created
    }
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
   * Item 20: install the pinned voice model on demand and hand its archive to the renderer's worker.
   * @returns The `model.tar.gz` bytes as base64, or why they are not available.
   */
  @Remote
  ensureVoiceModel(): Promise<VoiceModelBytesView> {
    return ensureVoiceModelBytes(this.ctx)
  }

  /**
   * Item 20: whether the voice model is installed, before the renderer shows the consent card.
   * @returns Installed version, absent, or why the component store is unavailable.
   */
  @Remote
  voiceModelState(): VoiceModelStateView {
    return voiceModelStateOf(this.ctx)
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
      personas: this.product.listPersonas(request.projectId).map(persona => this.personaView(persona)),
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
    return this.product.listPersonas(request.projectId).map(persona => this.personaView(persona))
  }

  /**
   * TEAM-4: the view of the PERSON's own answer to a round of opinion, or undefined when the message is not one. Refuses, writing nothing,
   * when the team behavior is off, the mark is unknown or the request is not in this very conversation.
   */
  private personOpinionOf(request: PostMessageRequest): OpinionView | undefined {
    const on = request.opinionOn
    if (on === undefined) return undefined
    const mark: string | undefined = on.mark // a wire value
    if (!this.teamworkEnabled) throw new HostRemoteFault('invalid-payload', 'Esta equipe ainda não pede opinião.')
    if (mark !== undefined && mark !== 'liked' && mark !== 'suggestion' && mark !== 'attention') {
      throw new HostRemoteFault('invalid-payload', 'Escolha Gostei, Sugestão ou Ponto de atenção.')
    }
    const line = this.events.get(`opinion:${on.requestId}:request`)
    const asked = line === undefined ? undefined : this.messageFlags.of(request.projectId, line.id).opinion
    if (line === undefined || asked?.kind !== 'request' || line.projectId !== request.projectId || line.streamId !== `${request.streamKind}:${request.ownerId}`) {
      throw new HostRemoteFault('not-found', 'Esse pedido de opinião não existe mais.')
    }
    return { kind: 'reply', requestId: asked.requestId, taskId: asked.taskId, round: asked.round, maxRounds: asked.maxRounds, ...(on.mark === undefined ? {} : { mark: on.mark }) }
  }

  /**
   * What a person may read in a thread: never an internal author, and — with the team behavior on — never a status line that the plan card
   * or the delivery card of its request replaces.
   */
  private shownInThread(event: { readonly id: string; readonly actorId: string; readonly projectId: string }): boolean {
    return !isTechnicalAuthor(event.actorId) && !(this.teamworkEnabled && this.teamCards.absorbed(event.projectId, event.id))
  }

  /** The plan card and the delivery card of a thread message, when it is one. */
  private cardsOf(projectId: string, eventId: string): { teamPlan?: TeamPlanView; deliveryCard?: DeliveryCardView; actionPreview?: ActionPreviewWire; actionEvent?: ActionEventView; body?: string } {
    const teamPlan = this.teamCards.planViewOf(projectId, eventId)
    const deliveryCard = this.teamCards.deliveryViewOf(projectId, eventId)
    const action = eventId.startsWith('action-card:') ? this.externalActions.get(projectId, eventId.slice('action-card:'.length)) : undefined
    const actionEvent = eventId.startsWith('activity-line:') ? this.activityUndo.eventOf(projectId, eventId.slice('activity-line:'.length)) : undefined
    return {
      ...(action === undefined ? {} : { actionPreview: this.externalActions.previewOf(action) }),
      ...(actionEvent === undefined ? {} : { actionEvent }),
      ...(teamPlan === undefined ? {} : { teamPlan, body: this.teamCards.planText(teamPlan) }),
      ...(deliveryCard === undefined ? {} : { deliveryCard, body: this.teamCards.deliveryText(deliveryCard) }),
    }
  }

  /**
   * HT-9: a new pending action gets its card IN the thread: one message of the persona, `action-card:<id>`, with a fixed sentence and no argument (LEAK-1);
   * the content lives in the document and reaches the client as `MessageView.actionPreview`. Idempotent.
   */
  private announceAction(doc: ExternalActionDoc): void {
    const id = `action-card:${doc.id}`
    if (this.events.has(id)) return
    const where = this.orchestration.conversationOfTicket(doc.projectId, doc.ticketId)
    const project = this.product.getProject(doc.projectId)
    if (where === undefined || project === undefined) return
    const name = this.product.getPersona(doc.personaId)?.name ?? 'A persona'
    const verb = doc.actionClass === 'pay' ? 'pagar' : doc.actionClass === 'delete' ? 'apagar' : 'enviar'
    this.events.append({
      id, workspaceId: project.workspaceId, projectId: doc.projectId, streamKind: where.streamKind, ownerId: where.ownerId, type: 'message',
      body: `${name} quer ${verb} pelo ${doc.connector.name}. Confira antes.`, actorId: doc.personaId, subjectId: where.subjectId,
      occurredAt: this.orchestration.now(), ...(where.topicId === '' ? {} : { topicId: where.topicId }),
    })
  }

  /** TEAM-7: the morning card of a thread message, when it is one. */
  private briefOf(projectId: string, eventId: string): { dailyBrief?: DailyBriefView } {
    const dailyBrief = this.morningBrief.viewOf(projectId, eventId)
    return dailyBrief === undefined ? {} : { dailyBrief }
  }

  /** TEAM-7: the Tasks of a project as plain facts for the morning card (ids, the human title, the state and the instants; nothing else leaves). */
  private morningTasks(projectId: string, options: { readonly keepWaiting?: boolean } = {}): MorningTask[] {
    const personaByName = new Map(this.product.listPersonas(projectId).map(persona => [persona.name, persona.id]))
    const out: MorningTask[] = []
    for (const ticket of this.orchestration.runtime(projectId).repo.tickets.list()) {
      const personaId = personaByName.get(ticket.execution?.name ?? '')
      if (personaId === undefined) continue
      const card = projectKanban(ticket)
      const state: MorningTask['state'] | undefined = card.column === 'done'
        ? (isDelivered(ticket) ? 'done' : 'failed')
        : card.column === 'review' ? 'review' : card.column === 'blocked' ? 'blocked'
          : card.column === 'doing' ? (card.chip === 'waiting' ? 'waiting' : 'running') : undefined
      if (state === undefined) continue
      out.push({
        // Carbon P0-13: the morning card is a message of #geral, read by every member: a Task born in a DM enters it with the neutral title.
        taskId: ticket.id, personaId, title: this.orchestration.conversationOfTicket(projectId, ticket.id)?.streamKind === 'dm' ? PRIVATE_DM_TASK_TITLE : ticket.title, state, updatedAt: ticket.updatedAt,
        ...(state === 'done' && ticket.ended !== undefined ? { endedAt: ticket.ended.at } : {}),
      })
    }
    // A finished request is ONE line ("Campanha de Natal (Texto, Arte e Posts)"), not one per part with the long title; and a step the team
    // took between colleagues (a request for help, a hand-over that closed by itself) is not a line of its own: the work is the request's.
    const coordination = this.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
    const grouped = coordination === undefined ? out : this.teamCards.groupDone(projectId, out, coordination.id)
    const internal = new Set(this.orchestration.runtime(projectId).repo.tickets.list().filter(ticket => ticket.origin.triggerId.startsWith('handoff:')).map(ticket => ticket.id))
    // A Task that waits for the person is counted in "Precisa de você" and is NOT also a line of "Hoje": the same Task never appears in two sections.
    return grouped.filter(task => !(task.state === 'done' && internal.has(task.taskId)) && (options.keepWaiting === true || task.state !== 'review'))
  }

  /**
   * THE one criterion of "waits for the person" (Keel 04:16): the Tasks in review or blocked. A request for help or a review a colleague was asked
   * to do is a step of the team, never a decision of the person (it closes by itself); a PASSAGE of the work that was delivered is real work and waits
   * for the person's review like any Task. "Precisa de você", the reminder of what waits (EQ-14) and the lines of "Hoje" all read THIS, so a Task
   * is in exactly one place.
   * @param projectId - Tenant.
   * @returns The ids of the Tasks that wait for the person.
   */
  private waitingOnPerson(projectId: string): Set<string> {
    const tickets = this.orchestration.runtime(projectId).repo.tickets
    const ids = new Set<string>()
    for (const card of this.orchestration.kanban(projectId)) {
      if (card.column !== 'review' && card.column !== 'blocked') continue
      const handoff = (tickets.get(card.ticketId)?.origin.triggerId ?? '').startsWith('handoff:')
      if (handoff && !(card.column === 'review' && this.handoffs.isPassageTask(projectId, card.ticketId))) continue
      ids.add(card.ticketId)
    }
    return ids
  }

  /** TEAM-7: what waits for the person: the Tasks of {@link waitingOnPerson} and the approvals still pending. */
  private needsYouCount(projectId: string): number {
    // Carbon P1-02: a six-digit request the persona opened waits for the owner like any other card.
    return this.waitingOnPerson(projectId).size + this.screens.listApprovals(projectId).filter(item => item.status === 'pending' && item.kind !== 'attention').length
      + this.cofre.codes.list(projectId).filter(request => request.state === 'pending').length
  }

  /** D-096: the sentence that says the engine ran this Task differently from what was set (kept by the usage meter), when there is one. */
  private engineNoteField(projectId: string, ticketId: string): { engineNote?: string } {
    const kept = this.screens.screens.get<{ note: string }>(projectId, 'engine_note', ticketId)
    return kept === undefined ? {} : { engineNote: kept.note }
  }

  /** TEAM-1/6: what a board card carries of the team: the request chip, "Revisando: {R}" and the seal. */
  /** Item 18: what a card of the board carries of its Task's thread (the viewer is the session's person); nothing without one. */
  private boardThread(projectId: string, ticketId: string): Partial<Pick<BoardCardView, 'threadTopicId' | 'threadCount' | 'threadUnread' | 'threadLastSeq'>> | undefined {
    const workspaceId = this.product.getProject(projectId)?.workspaceId
    const actor = workspaceId === undefined ? undefined : this.actorOf(workspaceId)
    const summary = actor === undefined ? undefined : this.taskThreads.summaryOf(projectId, ticketId, actor.id)
    return summary === undefined ? undefined : { threadTopicId: summary.topicId, threadCount: summary.count, threadUnread: summary.unread, threadLastSeq: summary.lastSeq }
  }

  private boardTeamwork(projectId: string, ticketId: string): Partial<Pick<BoardCardView, 'handoff' | 'reviewing' | 'reviewedBy'>> | undefined {
    if (!this.teamworkEnabled) return undefined
    const handoff = this.handoffChipOf(projectId, ticketId)
    const reviewing = this.handoffs.reviewing(projectId, ticketId)
    const reviewedBy = this.handoffs.reviewedBy(projectId, ticketId)
    return {
      ...(handoff === undefined ? {} : { handoff }),
      ...(reviewing === undefined ? {} : { reviewing }),
      ...(reviewedBy === undefined ? {} : { reviewedBy }),
    }
  }

  /** TEAM-1/6: the bilhete this Task received, the path the work took, the review in progress and the seal (only what exists). */
  private taskTeamwork(projectId: string, ticketId: string): { note?: HandoffNoteView; path?: PathStepView[]; reviewing?: ReviewingView; reviewedBy?: ReviewedByView; reviewFailed?: 'unreadable' | 'engine' } {
    const path = this.handoffs.pathOf(projectId, ticketId)
    const received = this.handoffs.notesOf(projectId, ticketId).filter(row => row.role === 'asked').at(-1)
    const reviewing = this.handoffs.reviewing(projectId, ticketId)
    const reviewedBy = this.handoffs.reviewedBy(projectId, ticketId)
    const reviewFailed = this.handoffs.reviewFailure(projectId, ticketId)
    return {
      ...(reviewing === undefined ? {} : { reviewing }),
      ...(reviewedBy === undefined ? {} : { reviewedBy }),
      ...(reviewFailed === undefined ? {} : { reviewFailed }),
      ...(received === undefined ? {} : {
        note: {
          fromPersonaId: received.fromPersonaId, toPersonaId: received.toPersonaId, taskId: ticketId,
          done: received.note.done, needed: received.note.needed, files: received.note.files, decisions: received.note.decisions, at: received.at,
        },
      }),
      ...(path.length === 0 ? {} : { path }),
    }
  }

  /**
   * TEAM-1: the chip of a card in a request between colleagues. Whoever asked and still waits shows "Esperando {B}"; the colleague's
   * Task shows "Pedido por {A}". A Task that is both (asked by A, waiting for C) shows what it waits for.
   */
  private handoffChipOf(projectId: string, ticketId: string): BoardHandoffView | undefined {
    if (!this.teamworkEnabled) return undefined
    const rows = this.handoffs.notesOf(projectId, ticketId)
    const waiting = rows.filter(row => row.role === 'asker' && (row.status === 'asked' || row.status === 'held')).at(-1)
    if (waiting !== undefined) return { role: 'waiting', otherPersonaId: waiting.toPersonaId }
    const asked = rows.filter(row => row.role === 'asked').at(-1)
    return asked === undefined ? undefined : { role: 'asked', otherPersonaId: asked.fromPersonaId }
  }

  /** The roster view plus what Configurações › Personas reads: the engine choice and, with `Config.teamwork`, the teamwork settings. */
  private personaView(persona: StoredPersona): PersonaView {
    return {
      ...toPersonaView(persona),
      engine: {
        runnerKind: persona.runner.kind, runnerCli: persona.runner.kind === 'cli' ? persona.runner.cli : '', ...engineChoiceOf(persona.runner),
      },
      ...(this.teamworkEnabled ? { teamwork: this.teamwork.view(persona.projectId, persona.id) } : {}),
      ...(this.productToolsEnabled && persona.canRecruit ? { hireDirect: this.hireDirect.get(persona.projectId, persona.id) } : {}),
      canSaveFiles: canSaveFiles(persona.tools),
      canSaveFilesAvailable: this.projectHasFolder(persona.projectId),
      ...this.proactivity.restFacts(persona.projectId, persona.id), // `paused` / `quiet`, only when true (Muse's state words)
    }
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
      engine: { runnerLabel, modelLabel: persona.runner.model, ...engineChoiceOf(persona.runner) },
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
    // HT-6: a retired persona comes back to the team the same way a paused one does (the contract: "reverter = resumePersona").
    if (this.product.retiredAt(request.personaId) !== undefined) this.product.unretirePersona(request.personaId)
    this.orchestration.setPersonaPaused(request.projectId, request.personaId, false)
    this.auditPersona(request.projectId, request.personaId, 'resume')
    return this.getPersonaCard(request)
  }

  /**
   * HT-6 / D-084 ("aposentar", the undo of a direct hire): the person RETIRES a persona. She leaves the team, her history stays (everything
   * she wrote and did, and her name in it), and her name and face are free again. Reversible with `resumePersona`. Idempotent. Workspace
   * owner only; the Coordenação cannot be retired (the team would have nobody to answer).
   * @param request - Persona.
   */
  @Remote
  retirePersona(request: PersonaScopeRequest): RetiredPersonaView {
    this.requireProject(request)
    this.requireWrite(request)
    this.requireGovOwner(request.workspaceId)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined || persona.projectId !== request.projectId) throw new HostRemoteFault('not-found', 'Essa persona não existe mais.')
    if (persona.systemRoles.includes('coordination')) {
      throw new HostRemoteFault('invalid-payload', 'A Coordenação não pode ser aposentada. Escolha outra pessoa para coordenar antes.')
    }
    const at = this.orchestration.now()
    if (this.product.retirePersona(persona.id, at)) {
      this.orchestration.evictWarmRunners(request.projectId, persona.id)
      this.auditPersona(request.projectId, persona.id, 'retire')
      this.teamChannels.reconcile(request.projectId) // a team that lost its last person is archived (never deleted)
    }
    return { personaId: persona.id, retiredAt: this.product.retiredAt(persona.id) ?? at }
  }

  /**
   * The personas the person retired: not in the team, but old messages and Tasks still name them.
   * @param request - Project.
   */
  @Remote
  listRetiredPersonas(request: ProjectScopeRequest): PersonaView[] {
    this.requireProject(request)
    return this.product.listRetiredPersonas(request.projectId).map(persona => ({ ...this.personaView(persona), retiredAt: this.product.retiredAt(persona.id) ?? '' }))
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
    // EFF-1: the model and the "Capricho" are the person's choice; null/absent = the engine's default (nothing is sent to the CLI).
    this.product.updatePersona({
      ...persona,
      runner: nextRunner(persona.runner, request, request.runnerKind === 'dsh' ? undefined : asCli(request.runnerCli)),
      updatedAt: this.orchestration.now(),
    }, request.projectId)
    // A warm session was opened with the previous model/level: the next turn must open with the new choice.
    this.orchestration.evictWarmRunners(request.projectId, request.personaId)
    this.auditPersona(request.projectId, request.personaId, 'engine')
    return this.getPersonaCard(request)
  }

  /**
   * D-090 / TEAM-3: the person decides whether a persona may ask colleagues for help, how many asks a day and how many opinion rounds.
   * Responsável or workspace owner. Only the named fields change; a number outside its range is refused whole.
   * @param request - Persona and the new values.
   */
  @Remote
  setPersonaTeamwork(request: SetPersonaTeamworkRequest): PersonaView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined) throw new HostRemoteFault('not-found', 'Essa persona não existe mais.')
    this.teamwork.set(request.projectId, request)
    this.auditPersona(request.projectId, request.personaId, 'teamwork')
    return this.personaView(persona)
  }

  /**
   * TEAM-6: how the project reviews its deliveries. A project nobody configured reviews EVERY delivery, by the Coordenação (the person turns it off).
   * @param request - Project.
   */
  @Remote
  getReviewPolicy(request: GetReviewPolicyRequest): ReviewPolicyView {
    this.requireProject(request)
    return reviewPolicyView(this.screens.screens.get<ReviewPolicy>(request.projectId, 'review_policy', 'v1'))
  }

  /**
   * TEAM-6: the person turns the review before delivery off, on for every delivery, or on for some task types, and says who reviews.
   * Workspace owner. A reviewer persona must be of the project; nothing is half-written.
   * @param request - The new policy.
   */
  @Remote
  setReviewPolicy(request: SetReviewPolicyRequest): ReviewPolicyView {
    this.requireProject(request)
    this.requireGovOwner(request.workspaceId)
    const policy = readReviewPolicy(request, personaId => this.product.getPersona(personaId)?.projectId === request.projectId)
    this.screens.screens.put(request.projectId, 'review_policy', 'v1', policy)
    return reviewPolicyView(policy)
  }

  /**
   * "Pode contratar": whether a persona may bring people to the team (each hire still asks the person). Responsável or workspace owner.
   * @param request - Persona and the choice.
   */
  @Remote
  setPersonaCanRecruit(request: SetPersonaCanRecruitRequest): PersonaView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined) throw new HostRemoteFault('not-found', 'Essa persona não existe mais.')
    const updated = { ...persona, canRecruit: request.canRecruit, updatedAt: this.orchestration.now() }
    this.product.updatePersona(updated, request.projectId)
    this.auditPersona(request.projectId, request.personaId, 'recruit')
    return this.personaView(updated)
  }

  /**
   * “Contratar direto” (HT-6): whether a persona who may hire can do it WITHOUT the card in Aprovações. Off unless the person turns it on;
   * only for a persona who may hire. Responsável or workspace owner.
   * @param request - Persona and the choice.
   */
  @Remote
  setPersonaHireDirect(request: SetPersonaHireDirectRequest): PersonaView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined) throw new HostRemoteFault('not-found', 'Essa persona não existe mais.')
    if (!persona.canRecruit && request.hireDirect) throw new HostRemoteFault('invalid-payload', 'Primeiro deixe esta persona contratar (“Pode contratar”).')
    this.hireDirect.set(request.projectId, request.personaId, request.hireDirect)
    this.auditPersona(request.projectId, request.personaId, 'recruit-direct')
    return this.personaView(persona)
  }

  /**
   * “Pode salvar arquivos no rascunho” (D-099): whether ONE persona saves files — only into the draft of the project's folder (the person applies them in Revisar
   * mudanças), never with a shell. On for every persona the product creates; on or off is the person's. Responsável or workspace owner. A warm session opened with
   * the previous grant is dropped, so the next Task opens with the new one.
   * @param request - Persona and the choice.
   */
  @Remote
  setPersonaCanSaveFiles(request: SetPersonaCanSaveFilesRequest): PersonaView {
    this.requireProject(request)
    this.requireWrite(request)
    this.assertCardEditor(request.workspaceId, request.personaId)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined) throw new HostRemoteFault('not-found', 'Essa persona não existe mais.')
    const updated = { ...persona, tools: withFilesSaving(persona.tools, request.canSaveFiles), updatedAt: this.orchestration.now() }
    this.product.updatePersona(updated, request.projectId)
    this.orchestration.evictWarmRunners(request.projectId, request.personaId)
    this.auditPersona(request.projectId, request.personaId, 'files')
    return this.personaView(updated)
  }

  private projectHasFolder(projectId: string): boolean {
    const root = this.product.getProject(projectId)?.rootPath
    return typeof root === 'string' && root !== ''
  }

  /**
   * Organogram by person or sector.
   * @param request - Workspace and grouping.
   */
  @Remote
  getOrgChart(request: GetOrgChartRequest): OrgChartView {
    this.requireWorkspace(request)
    return this.maskOrgChart(request.workspaceId, this.governance.orgChartView(request))
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
    return this.governance.listAudit(request.workspaceId).map(row => ({ ...row, body: auditBodyForReader(row.action, row.body) })) // CONN-1: the proxy URL of an account connector carries a key: it never leaves in the audit
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.workingSend.edit(request)
  }

  /**
   * Remove one dashed bubble.
   * @param request - Row id (omit `text`).
   */
  @Remote
  dropQueuedMessage(request: EditQueuedMessageRequest): QueuedMessageView[] {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    if (request.question.trim() === '') throw new HostRemoteFault('invalid-payload', 'Escreva a pergunta de lado.')
    return this.asides.open(request)
  }

  /**
   * One side question with its state (`asking` · `answered` · `failed`) and answer.
   * @param request - Ask id.
   * @returns The ask.
   */
  @Remote
  getAsideAsk(request: GetAsideAskRequest): AsideAskView {
    this.requireProject(request)
    const ask = this.asides.get(request.projectId, request.id)
    if (ask === undefined) throw new HostRemoteFault('not-found', 'Essa pergunta de lado não existe mais.')
    return ask
  }

  /**
   * Side questions of a persona in a subject (a reload finds them again).
   * @param request - Persona and subject.
   * @returns Asks, oldest first.
   */
  @Remote
  listAsideAsks(request: ListAsideAsksRequest): AsideAskView[] {
    this.requireProject(request)
    return this.asides.list(request.projectId, request.personaId, request.subjectId)
  }

  /**
   * `/resumo`: the persona summarises the conversation (last 30 messages) in up to 3 sentences, off the thread. Answered like
   * a `/lado` (`asking` → `answered` | `failed`); read it with `getAsideAsk`.
   * @param request - Persona and conversation.
   * @returns The ask in progress.
   */
  @Remote
  summarizeConversation(request: SummarizeConversationRequest): AsideAskView {
    this.requireProject(request)
    const viewer = this.actorOf(request.workspaceId)?.id ?? ''
    const lines: SummaryLine[] = []
    let after = 0
    for (let page = 0; page < 6; page += 1) {
      const got = this.listMessages({
        workspaceId: request.workspaceId, projectId: request.projectId, streamKind: request.streamKind, ownerId: request.ownerId,
        actorId: viewer, afterSeq: after, limit: 200, ...(request.topicId === undefined ? {} : { topicId: request.topicId }),
      })
      for (const message of got.events) {
        const who = this.product.getPersona(message.actorId)?.name ?? this.product.getMember(message.actorId)?.displayName ?? 'Alguém'
        lines.push({ who, body: message.body })
      }
      if (got.events.length < 200 || got.nextSeq <= after) break
      after = got.nextSeq
    }
    const question = summaryQuestion(lines)
    if (question === undefined) throw new HostRemoteFault('invalid-payload', 'Ainda não há conversa para resumir.')
    return this.asides.open({
      workspaceId: request.workspaceId, projectId: request.projectId, personaId: request.personaId, subjectId: request.subjectId, question,
      kind: 'summary', shown: SUMMARY_SHOWN, // the host's prompt is asked, never shown
    })
  }

  /**
   * Persist one T3 §9 activity event.
   * @param request - Event.
   */
  @Remote
  recordTurnActivity(request: RecordTurnActivityRequest): TurnActivityView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    return this.external.replyOrigin(request.projectId, request.personId, {
      source: request.source,
      ...(request.chat === undefined ? {} : { chat: request.chat }),
      ...(request.channel === undefined ? {} : { channel: request.channel }),
      ...(request.to === undefined ? {} : { to: request.to }),
      ...(request.subject === undefined ? {} : { subject: request.subject }),
    }, request.text)
  }

  /**
   * Harvest 19b: the mailbox presets the connection screen offers (host, port and TLS already filled in).
   * @returns The presets, in the order the screen shows them.
   */
  @Remote
  listEmailPresets(): EmailPresetView[] {
    return EMAIL_PRESETS.map(preset => ({ ...preset }))
  }

  /**
   * Harvest 19b: the inbox rule that decides which mail may wake the team. Empty lists = every message.
   * @param request - Tenant.
   * @returns The stored rule (the default when none was saved).
   */
  @Remote
  getEmailFilter(request: ProjectScopeRequest): EmailFilterView {
    this.requireProject(request)
    return this.screens.screens.get<EmailFilterView>(request.projectId, 'external_email_filter', 'default')
      ?? { to: [], from: [], subject: [], skipBulk: true }
  }

  /**
   * Harvest 19b: save the inbox rule. The filter runs at the origin; a message it rejects never becomes a Trigger.
   * @param request - Tenant and rule.
   * @returns The stored rule (trimmed, empty entries dropped, at most 20 per field).
   */
  @Remote
  putEmailFilter(request: PutEmailFilterRequest): EmailFilterView {
    this.requireProject(request)
    this.requireWrite(request)
    const clean = (values: readonly string[]): string[] =>
      values.map(value => value.trim()).filter(value => value !== '').slice(0, 20)
    const preset = EMAIL_PRESETS.some(item => item.id === request.filter.preset) ? request.filter.preset : undefined
    const filter: EmailFilterView = {
      to: clean(request.filter.to),
      from: clean(request.filter.from),
      subject: clean(request.filter.subject),
      skipBulk: request.filter.skipBulk !== false,
      ...(preset === undefined ? {} : { preset }),
    }
    this.screens.screens.put(request.projectId, 'external_email_filter', 'default', filter)
    return filter
  }

  /**
   * Harvest 19b: whether the project's mailbox credential is stored, and which server/account it points at. The
   * password never leaves the sealed store.
   * @param request - Tenant.
   * @returns The connection state without the secret.
   */
  @Remote
  async getEmailConnection(request: ProjectScopeRequest): Promise<EmailConnectionView> {
    this.requireProject(request)
    const stored = await this.storedEmailCredential(request.projectId)
    if (stored === undefined) return { connected: false }
    return {
      connected: true,
      host: stored.host,
      user: stored.user,
      ...(stored.port === undefined ? {} : { port: stored.port }),
      ...(stored.secure === undefined ? {} : { secure: stored.secure }),
    }
  }

  /**
   * Harvest 19b: “Testar conexão”. Opens the mailbox with EXAMINE and counts the folder; a body is never fetched and the
   * password is never logged. Absent fields use the stored credential.
   * @param request - Tenant plus the fields the person typed.
   * @returns Whether the login worked, the message count, or the failure category.
   */
  @Remote
  async testEmailConnection(request: TestEmailConnectionRequest): Promise<EmailConnectionTestView> {
    this.requireMachineOwner(request) // Carbon P0-13b: the host opens a connection to the typed address: the owner only
    const typed = request.host !== undefined && request.user !== undefined
      && request.password !== undefined && request.password !== ''
      ? { host: request.host, user: request.user, password: request.password, port: request.port, secure: request.secure }
      : undefined
    const stored = typed === undefined ? await this.storedEmailCredential(request.projectId) : undefined
    // Carbon P1-08: with no NEW password the stored one is used, but only for the SAME server: another host needs its own password (the stored one never goes to a server the form changed),
    // and the fields the form edited on the same server (user, port, security) are merged with it. It used to test the OLD stored server silently and say it connected.
    if (stored !== undefined && request.host !== undefined && request.host !== stored.host) return { ok: false, error: 'no-credential' }
    const merged = stored === undefined ? undefined : {
      ...stored,
      ...(request.user !== undefined && request.user !== '' ? { user: request.user } : {}),
      ...(request.port !== undefined ? { port: request.port } : {}),
      ...(request.secure !== undefined ? { secure: request.secure } : {}),
    }
    const credential = typed ?? merged
    if (credential === undefined) return { ok: false, error: 'no-credential' }
    // Carbon P0-13b (SSRF): a mail host is a public name; an address of the machine or its network is never probed (it reads as a network failure, the honest category).
    const address = await this.mailTarget(credential.host)
    if (address === undefined) return { ok: false, error: 'network' }
    try {
      const { messages } = await probeImap({
        host: credential.host,
        connectTo: address, // Carbon MH-2: the address that was vetted, not a second resolution of the name
        user: credential.user,
        password: credential.password,
        port: credential.port ?? 993,
        secure: credential.secure !== false,
      })
      return { ok: true, messages }
    } catch (error: unknown) {
      return { ok: false, error: emailFailureOf(error) }
    }
  }

  /** The stored mailbox credential, parsed from the sealed slot. Never returned to a screen. */
  private async storedEmailCredential(projectId: string): Promise<{ host: string; user: string; password: string; port?: number; secure?: boolean } | undefined> {
    const secret = await this.cofre.secretOf(projectId, connectorSlot('imap'))
    if (secret === undefined || secret === '') return undefined
    let parsed: unknown
    try {
      parsed = JSON.parse(secret)
    } catch {
      return undefined
    }
    if (typeof parsed !== 'object' || parsed === null) return undefined
    // Justified: JSON boundary; every field is read with a `typeof` check.
    const row = parsed as Record<string, unknown>
    const host = typeof row.host === 'string' ? row.host : ''
    const user = typeof row.user === 'string' ? row.user : ''
    const password = typeof row.password === 'string' ? row.password : ''
    if (host === '' || user === '' || password === '') return undefined
    return {
      host,
      user,
      password,
      ...(typeof row.port === 'number' && Number.isInteger(row.port) ? { port: row.port } : {}),
      ...(typeof row.secure === 'boolean' ? { secure: row.secure } : {}),
    }
  }

  /**
   * List channels of the project, newest first.
   * @param request - Workspace and project.
   * @returns Channel cards.
   */
  @Remote
  listChannels(request: ProjectScopeRequest): ChannelView[] {
    this.requireProject(request) // pure read: the team channels are reconciled at boot and when the organogram changes, never here
    const me = this.actorOf(request.workspaceId)?.id
    const pinned = me === undefined ? new Set<string>() : this.channelRepos.pinnedBy(me)
    const sectors = new Map(this.governance.gov.listSectors(request.workspaceId).map(sector => [sector.id, sector.name] as const))
    const rank = (view: ChannelView): number => (view.archived ? 3 : view.pinned ? 0 : view.kind === 'general' ? 1 : 2)
    return this.channelRepos.list(request.projectId)
      .map(channel => this.channelViewOf(channel, pinned, sectors))
      .sort((a, b) => rank(a) - rank(b) || a.name.localeCompare(b.name))
  }

  private channelViewOf(channel: ReturnType<ChannelRepos['get']> & object, pinned: ReadonlySet<string>, sectors: ReadonlyMap<string, string>): ChannelView {
    const teamName = channel.sourceId === undefined ? undefined : sectors.get(channel.sourceId)
    return {
      id: channel.id, projectId: channel.projectId, name: channel.name, topic: channel.topic,
      projectName: this.product.getProject(channel.projectId)?.name ?? '',
      kind: channel.kind,
      memberCount: this.teamChannels.membersOf(channel.projectId, channel.id).length,
      archived: channel.archivedAt !== undefined,
      ...(channel.archivedReason === undefined ? {} : { archivedReason: channel.archivedReason }),
      pinned: pinned.has(channel.id),
      ...(teamName === undefined ? {} : { teamName }),
    }
  }

  /**
   * Who is on a channel (the organogram's answer for team/directorate/general, the stored list for a channel the person made).
   * @param request - Channel.
   */
  @Remote
  listChannelMembers(request: ChannelScopeRequest): ChannelMemberView[] {
    this.requireProject(request)
    this.ownChannel(request)
    return this.teamChannels.membersOf(request.projectId, request.channelId).map((member) => {
      const name = member.kind === 'persona' ? this.product.getPersona(member.id)?.name : this.product.getMember(member.id)?.displayName
      return { kind: member.kind, id: member.id, name: name ?? '' }
    })
  }

  /**
   * Item 22: the sidebar as sections: the channels with no section first, then ONE section per equipe (on the screen "equipe" and "categoria" are one thing).
   * @param request - Project.
   */
  @Remote
  getChannelLayout(request: ProjectScopeRequest): ChannelLayoutView {
    this.requireProject(request)
    return channelLayoutViewOf(this.channelDirectory, request.projectId, this.viewRoster(request.projectId), {
      humanCount: this.product.listMembers(request.workspaceId).filter(member => member.role !== 'guest').length,
      companyName: this.product.getWorkspace(request.workspaceId)?.name ?? '',
      // A category the person made shows at once, even empty (else it would vanish the moment it is created); the automatic sections need a channel anyway.
      showEmptySections: true,
    })
  }

  /**
   * Item 22 (H22): the equipes the person assembled (a sector's mirror included) and the categories, in screen order. Read-only.
   * @param request - Project.
   */
  @Remote
  getEquipeLayout(request: ProjectScopeRequest): EquipeLayoutView {
    this.requireProject(request)
    return this.equipeDesk.layout(request.projectId)
  }

  /**
   * Item 22 (H22): ARRANGE — create or change an equipe, make or order categories, move a channel into one, put a persona on a channel the person made.
   * Owner only; the fence does not change (who answers in a channel is still its members). Answers the new layout; a refusal is a typed fault with the sentence the screen shows.
   * @param request - Project and ONE action.
   */
  @Remote
  updateChannelLayout(request: ArrangeChannelsRequest): EquipeLayoutView {
    this.requireProject(request)
    this.requireGovOwner(request.workspaceId)
    try {
      return this.equipeDesk.arrange(request)
    } catch (error: unknown) {
      if (error instanceof EquipeDeskError) throw new HostRemoteFault(FAULT_OF[error.code], error.message)
      throw error
    }
  }

  /**
   * Item 22: the header of a channel: its equipe, who is on it and "Respondem aqui: Lia, Téo e Bia". `undefined` for a DM.
   * @param request - Channel.
   */
  @Remote
  getChannelHeader(request: ChannelScopeRequest): ChannelHeaderView | undefined {
    this.requireProject(request)
    return channelHeaderViewOf(this.channelDirectory, request.projectId, request.channelId, this.viewRoster(request.projectId))
  }

  /**
   * Item 22: the entries of the `@` menu of a channel: the equipes first (the channel's own as "@equipe"), then the personas.
   * @param request - Project and, when writing in a channel, the channel.
   */
  @Remote
  listMentionOptions(request: MentionOptionsRequest): MentionOptionView[] {
    this.requireProject(request)
    return mentionOptionsOf(this.channelDirectory, request.projectId, request.channelId, this.viewRoster(request.projectId))
  }

  private houseCache: ChannelHouse | undefined

  /** Casa da Equipe: the house the channel screens ask (built on first use). */
  private house(): ChannelHouse {
    return this.houseCache ??= houseOver(this.houseWire())
  }

  /** The person asking, as the unread count needs her (handle and name for the `@` calls). */
  private houseMember(workspaceId: string): UnreadMember | undefined {
    const actor = this.actorOf(workspaceId)
    const member = actor === undefined ? undefined : this.product.getMember(actor.id)
    return member === undefined ? undefined : { id: member.id, handle: member.handle, displayName: member.displayName }
  }

  private houseWire(): HouseWirePorts {
    return {
      events: this.events,
      lastSeqOf: streamId => (this.store.db.prepare('SELECT last_seq AS lastSeq FROM stream_cursor WHERE stream_id = ?').get(streamId) as { lastSeq: number } | undefined)?.lastSeq ?? 0,
      directory: this.channelDirectory,
      reads: this.screens.screens,
      shown: event => this.shownInThread(event),
      personas: projectId => this.proactivity.overviewNow(projectId).personas.map(row => ({
        id: row.personaId, name: row.name, title: row.title, state: row.state,
        paused: this.proactivity.restFacts(projectId, row.personaId).paused === true,
        noEngine: this.orchestration.engineReadinessOf?.().state === 'unavailable', // a definitive "no AI to answer"; "checking" is not a logout
        ...(row.sentence === undefined ? {} : { sentence: row.sentence }),
      })),
      tickets: projectId => this.orchestration.runtime(projectId).repo.tickets.list().map(ticket => ({ id: ticket.id, triggerId: ticket.origin.triggerId })),
      routineName: (projectId, routineId) => {
        const routine = this.routines.get(routineId)
        return routine?.projectId === projectId ? routine.name : undefined
      },
    }
  }

  /**
   * Casa da Equipe H1: the unread figures of every channel of the project, for the person asking (a channel she never looked at starts at its last line: the history is not new).
   * @param request - Project.
   */
  @Remote
  getChannelUnread(request: ProjectScopeRequest): ChannelUnread[] {
    this.requireProject(request)
    const me = this.houseMember(request.workspaceId)
    return me === undefined ? [] : this.house().unread(request.projectId, me)
  }

  /**
   * Casa da Equipe H1: the person read the channel up to `seq` (her OWN mark: only forward, never past the last line). Answers the channel's figures after it.
   * @param request - Channel and the last line read.
   */
  @Remote
  ackChannelRead(request: AckChannelReadRequest): ChannelUnread {
    this.requireProject(request)
    this.ownChannel(request)
    if (!Number.isInteger(request.seq) || request.seq < 0) throw new HostRemoteFault('invalid-payload', 'seq deve ser um inteiro a partir de 0.')
    const me = this.houseMember(request.workspaceId)
    if (me === undefined) throw new HostRemoteFault('forbidden', 'Entre na equipe para marcar como lido.')
    return this.house().markRead(request.projectId, request.channelId, me, request.seq)
  }

  /**
   * Casa da Equipe H2: "Quem está aqui" of a channel: the owner, each equipe (only who is on THIS channel), who has none, and "Fora agora" last.
   * @param request - Channel.
   */
  @Remote
  getChannelHere(request: ChannelScopeRequest): HereGroup[] {
    this.requireProject(request)
    this.ownChannel(request)
    const owner = this.product.listMembers(request.workspaceId).find(member => member.role === 'owner')
    return this.house().here(request.projectId, request.channelId, owner === undefined ? undefined : { id: owner.id, name: owner.displayName })
  }

  /**
   * Casa da Equipe H3: where a line came from. The chip of each line a routine made (never a guess: the others are not in the answer).
   * @param request - Project and the ids on screen.
   */
  @Remote
  getMessageOrigins(request: ChannelOriginsRequest): Record<string, MessageOrigin> {
    this.requireProject(request)
    if (!Array.isArray(request.messageIds) || request.messageIds.some(id => typeof id !== 'string')) throw new HostRemoteFault('invalid-payload', 'messageIds deve ser uma lista de ids.')
    return originsOf(this.house(), { events: this.events }, request.projectId, request.messageIds)
  }

  /**
   * Casa da Equipe H4: the 3 starters of an empty channel, made from who is on it.
   * @param request - Channel.
   */
  @Remote
  getChannelSuggestions(request: ChannelScopeRequest): ChannelSuggestion[] {
    this.requireProject(request)
    this.ownChannel(request)
    return this.house().suggestions(request.projectId, request.channelId)
  }

  private viewRoster(projectId: string): ViewPersona[] {
    return this.product.listPersonas(projectId).map(persona => ({ id: persona.id, name: persona.name }))
  }

  /**
   * Rename a channel (not #geral: the morning card and the Tasks find it by that name). The person's name sticks: the organogram never renames it back.
   * @param request - Channel and the new name.
   */
  @Remote
  renameChannel(request: RenameChannelRequest): ChannelView {
    this.requireWrite(request)
    const channel = this.ownChannel(request)
    if (channel.kind === 'general') throw new HostRemoteFault('forbidden', 'O #geral não muda de nome.')
    const name = request.name.trim()
    if (name === '' || name.length > 32 || /[#\u0000-\u001f\u007f]/u.test(name)) {
      throw new HostRemoteFault('invalid-payload', 'O nome do canal tem de ter de 1 a 32 caracteres, sem “#”.')
    }
    try {
      this.channelRepos.rename(channel.id, name, true)
    } catch (error: unknown) {
      if (error instanceof StoreError && error.code === 'conflict') throw new HostRemoteFault('conflict', 'Já existe um canal com esse nome.')
      throw error
    }
    return this.channelView(request.projectId, channel.id)
  }

  /**
   * Archive a channel (it goes to Arquivados; nothing is deleted and the history stays). Not #geral.
   * @param request - Channel.
   */
  @Remote
  archiveChannel(request: ChannelScopeRequest): ChannelView {
    this.requireWrite(request)
    const channel = this.ownChannel(request)
    if (channel.kind === 'general') throw new HostRemoteFault('forbidden', 'O #geral não pode ser arquivado.')
    this.channelRepos.archive(channel.id, 'by-person')
    return this.channelView(request.projectId, channel.id)
  }

  /**
   * Bring an archived channel back (history intact).
   * @param request - Channel.
   */
  @Remote
  unarchiveChannel(request: ChannelScopeRequest): ChannelView {
    this.requireWrite(request)
    const channel = this.ownChannel(request)
    this.channelRepos.unarchive(channel.id)
    return this.channelView(request.projectId, channel.id)
  }

  /**
   * Pin or unpin a channel for the person who asks (each person pins their own).
   * @param request - Channel and the switch.
   */
  @Remote
  setChannelPinned(request: SetChannelPinnedRequest): ChannelView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    const channel = this.ownChannel(request)
    const me = this.actorOf(request.workspaceId)?.id
    if (me === undefined) throw new HostRemoteFault('forbidden', 'Entre para fixar um canal.')
    this.channelRepos.setPinned(channel.id, me, request.pinned)
    return this.channelView(request.projectId, channel.id)
  }

  /**
   * Make the team channels match the organogram NOW (the host does it at boot and when the organogram changes; this is for a flow that needs it sooner).
   * @param request - Project.
   */
  @Remote
  reconcileTeamChannels(request: ProjectScopeRequest): ChannelView[] {
    this.requireWrite(request)
    this.teamChannels.reconcile(request.projectId)
    return this.listChannels(request)
  }

  private ownChannel(request: ChannelScopeRequest): NonNullable<ReturnType<ChannelRepos['get']>> {
    const channel = this.channelRepos.get(request.channelId)
    if (channel === undefined || channel.projectId !== request.projectId) throw new HostRemoteFault('not-found', 'Esse canal não existe mais.')
    return channel
  }

  private channelView(projectId: string, channelId: string): ChannelView {
    const found = this.listChannels({ workspaceId: this.product.getProject(projectId)?.workspaceId ?? '', projectId }).find(view => view.id === channelId)
    if (found === undefined) throw new HostRemoteFault('not-found', 'Esse canal não existe mais.')
    return found
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
    const seenBy = this.ticketSeenFor(request.workspaceId) // Carbon P0-13 + perf: the session's actor is resolved ONCE per call (it re-reads the members: 0.4 ms a card, 100 cards a project)
    return this.orchestration.kanban(request.projectId).map((card) => {
      const subjectLink = this.screens.screens.get<{ subjectId: string }>(
        request.projectId,
        'ticket_subject',
        card.ticketId,
      )
      const collaborators = collaboratorViews(this.screens.screens, request.projectId, card.ticketId, id => this.product.getPersona(id)?.name)
      const teamwork = this.teamworkEnabled ? this.taskTeamwork(request.projectId, card.ticketId) : {}
      // IV-10: while the Task has an open question, the card knows where it was asked and what it says.
      const asking = this.orchestration.runtime(request.projectId).repo.tickets.get(card.ticketId)?.attention
      const where = asking === undefined ? undefined : this.orchestration.conversationOfTicket(request.projectId, card.ticketId)
      const seen = seenBy(request.projectId, card.ticketId) // Carbon P0-13: a Task born in a DM is read by the DM's participants only
      return {
        id: card.ticketId,
        projectId: request.projectId,
        title: seen ? card.title : PRIVATE_DM_TASK_TITLE,
        stage: card.column,
        stageAction: card.chip === 'waiting' ? 'waiting' : card.stageAction,
        ...(seen ? teamwork : withoutDmWords(teamwork)), // Carbon P1-DM-2: the note and the path carry the DM's words
        ...this.engineNoteField(request.projectId, card.ticketId),
        ...(asking === undefined || where === undefined || !seen ? {} : { questionStreamId: `${where.streamKind}:${where.ownerId}`, question: shortQuestion(asking.question) }),
        ...(subjectLink === undefined || subjectLink.subjectId === ''
          ? {}
          : { topicId: subjectLink.subjectId, conversationSubjectId: subjectLink.subjectId }),
        ...(collaborators.length === 0 ? {} : { collaborators }),
        // Keel 12/11: a stopped card says WHY in one plain line, from what the host already keeps (the worker's report, the code of a failed run); never for a private DM Task.
        ...(card.column !== 'blocked' || !seen ? {} : blockedReasonField(this.orchestration.runtime(request.projectId).repo.tickets.get(card.ticketId), card.stageAction, this.events)),
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
    // "Seus números" (P1-08): the fall of a number is a NOTICE, not a decision. It is NOT here (so it is not a "decision" in Aprovações, in the rail
    // number or in the tray): the Visão geral draws it from `listIndicators` (alert, `seen` after "Já vi") inside "Precisa de você".
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
    const board = this.boards.getProjectBoard(request.projectId)
    // Carbon P0-13: a Task born in a DM shows its title only to the DM's participants.
    const seenBy = this.ticketSeenFor(request.workspaceId)
    return { ...board, cards: board.cards.map(card => (seenBy(request.projectId, card.ticketId) ? card : { ...card, title: PRIVATE_DM_TASK_TITLE })) }
  }

  /**
   * Quadros list: one mini-summary per project. DMs are never included.
   * @param request - Workspace.
   */
  @Remote
  listBoards(request: ProjectScopeRequest): BoardSummaryView[] {
    this.requireWorkspace(request)
    // Carbon P0-13: the boards of the projects the asker may read (the owner: all; a guest: none); no actor = a workspace with nobody in it, already limited to the machine owner.
    const actor = this.actorOf(request.workspaceId)
    return this.boards.listBoards(request.workspaceId).filter(row => actor === undefined || sessionCan(actor, 'read', { type: 'project', workspaceId: request.workspaceId, projectId: row.projectId }))
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
    const moved = this.boards.moveTicketWith(request.projectId, request.ticketId, request.columnId)
    // HT-3: THIS path is the person's (a persona is not an actor of a Remote). Moving a card to Fazendo only marks it as running;
    // here the persona that owns it actually starts. The personas' own tools call `boards.moveTicket` directly and never come this way.
    // The trigger is the DESTINATION column: a result still waiting for Aplicar/Descartar keeps its stage, so its card is not “doing”.
    if (this.orchestration.startOnBoardMove && moved.toCategory === 'doing') {
      this.orchestration.startFromBoard(request.projectId, request.ticketId, { deliveryPending: moved.deliveryWaiting, reopened: moved.reopened })
    }
    return moved.view
  }

  /**
   * P0-10: the Desfazer of a card move (`activity-undo.ts`) puts the card back WITHOUT starting the persona that owns it: an undo is not a
   * request for work, and `moveTicket` (the person's own move) would start a model turn when the card lands in a "Fazendo" column. Not a Remote.
   * @param request - The card and the column it goes back to.
   */
  moveTicketBack(request: MoveTicketRequest): MoveTicketView {
    this.requireWrite(request)
    return this.boards.moveTicketWith(request.projectId, request.ticketId, request.columnId).view
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    const view = this.proactivity.overviewNow(request.projectId)
    // Carbon R2-05: `currentTask` is the Task's title; for a Task born in a DM only its participants read it.
    const seenBy = this.ticketSeenFor(request.workspaceId)
    return { ...view, personas: view.personas.map(row => (row.currentTaskId !== '' && !seenBy(request.projectId, row.currentTaskId) ? { ...row, currentTask: PRIVATE_DM_TASK_TITLE } : row)) }
  }

  /**
   * ISO-2: the connectors of the person's CLI given to a persona (names and levels only; no command, URL or secret is kept).
   * @param request - Project scope and, optionally, one persona.
   */
  @Remote
  listConnectorGrants(request: ListConnectorGrantsRequest): ConnectorGrantView[] {
    this.requireProject(request)
    const grants = this.connectorGrants.list(request.workspaceId, request.personaId)
    // CONN-1: only the owner's screen holds the id of an account connector (the proxy URL, with a key in it) to take it back; any other member gets a handle.
    const owner = this.product.listMembers(request.workspaceId).length === 0 || this.actorOf(request.workspaceId)?.workspaceRole === 'owner'
    return owner ? grants : grants.map(grant => ({ ...grant, connectorId: connectorHandleOf(grant.connectorId) }))
  }

  /**
   * Item 26.4: the curated catalog of the team's business tools, with what the team already has and what is honestly connectable today.
   * @param request - Tenant.
   */
  @Remote
  getConnectorCatalog(request: ProjectScopeRequest): ConnectorCatalogView {
    this.requireProject(request)
    return connectorCatalog({
      granted: this.connectorGrants.list(request.workspaceId).map(grant => grant.name),
      account: (this.portsNow().availableConnectors?.('claude') ?? []).map(ref => ref.name), // P1-07: the live list (the bridge), not the empty `connectorPorts`
      tokens: TOKEN_PROVIDERS.filter(token => this.cofre.hasSecret(request.projectId, connectorSlot(token.provider))).map(token => token.provider),
    })
  }

  /**
   * Item 26.8: one health line per connector, in plain Portuguese, with the action that fixes it. Never the provider's raw text.
   * @param request - Tenant.
   */
  @Remote
  getConnectorHealth(request: ProjectScopeRequest): ConnectorHealthView[] {
    this.requireProject(request)
    const clis = ['claude', 'codex', 'cursor', 'opencode']
    return connectorHealth({
      grants: this.connectorGrants.list(request.workspaceId).map(grant => ({ personaId: grant.personaId, cli: grant.cli, name: grant.name })),
      available: clis.flatMap(cli => (this.portsNow().availableConnectors?.(cli) ?? []).map(ref => ({ cli, name: ref.name }))), // P1-07: the live list
      connections: this.connections.list().map(item => ({ id: item.id, available: item.available, loggedIn: item.loggedIn, phase: item.phase })),
      tokens: TOKEN_PROVIDERS.map(token => ({ ...token, hasSecret: this.cofre.hasSecret(request.projectId, connectorSlot(token.provider)) })),
      personaNameOf: personaId => this.product.getPersona(personaId)?.name,
    })
  }

  /**
   * Item 26 wave B: the OAuth connections of the project — who is connected, never a token (the tokens are host-only).
   * @param request - Tenant.
   */
  @Remote
  listOAuthCredentials(request: ProjectScopeRequest): OAuthCredentialView[] {
    this.requireProject(request)
    return this.oauthVault.list(request.projectId)
  }

  /**
   * ISO-2: give ONE persona a connector, by name. Only the workspace owner (the connector is on THIS person's CLI). Refuses with a typed
   * code, and writes nothing, what could never take effect (`not-grantable`, `isolation-partial`, `limit-reached`).
   * @param request - Persona, connector and level.
   */
  @Remote
  grantConnector(request: GrantConnectorRequest): ConnectorGrantView {
    this.requireProject(request)
    this.requireGovOwner(request.workspaceId)
    return this.connectorGrants.grant(request, this.requireActor(request.workspaceId).id)
  }

  /**
   * Item 26: give ONE persona a tool of the catalog by its NAME (contracts/connector-grant-by-name.md). The host resolves the connector on her own CLI, so its id never
   * reaches the screen. Only the workspace owner; after the resolution it is `grantConnector`: same refusals, same audit, nothing waived.
   * @param request - Persona, tool name and level (default: read).
   */
  @Remote
  grantConnectorByName(request: GrantConnectorByNameRequest): ConnectorGrantView {
    this.requireProject(request)
    this.requireGovOwner(request.workspaceId)
    return this.connectorGrants.grantByName(request, this.requireActor(request.workspaceId).id)
  }

  /**
   * ISO-2: take a connector back. Idempotent; the next call (and the next warm session) no longer carries it.
   * @param request - Persona and connector.
   * @returns Whether there was a grant to remove.
   */
  @Remote
  revokeConnector(request: RevokeConnectorRequest): boolean {
    this.requireProject(request)
    this.requireGovOwner(request.workspaceId)
    return this.connectorGrants.revoke(request, this.requireActor(request.workspaceId).id)
  }

  /**
   * ISO-2/ISO-5: what the connector would add to every call of the persona, measured by a control-only pre-flight (zero model), so the
   * person sees it BEFORE confirming. Never writes; `unknown` when nothing was measured.
   * @param request - Persona and connector.
   */
  @Remote
  async estimateConnectorGrantCost(request: EstimateConnectorGrantCostRequest): Promise<ConnectorGrantCostView> {
    this.requireProject(request)
    this.requireGovOwner(request.workspaceId)
    return this.connectorGrants.costOf(request)
  }

  /**
   * "Incluir só pelo texto" (team-real.md §12): in a round of opinion with an image, the colleagues whose engine does not read images are NOT
   * called (they show on the card as "não veem imagens neste motor"); the PERSON may include one by TEXT ONLY: one short turn with the question,
   * the draft text and the asker's description of the image, never the image, and her line comes back flagged `textOnly` (the chip "Opinou só
   * pelo texto"). It costs one turn of that colleague, from the person (it is not one of the asker's requests of the day), never reopens the round
   * and never redoes the consolidation. Idempotent: a repeat answers the line that is there.
   * @param request - The card (`requestId` of its OpinionView) and the colleague (one of its `noVision`).
   */
  @Remote
  async includeOpinionTextOnly(request: IncludeOpinionTextOnlyRequest): Promise<IncludeOpinionTextOnlyView> {
    this.requireWrite(request)
    if (!this.teamworkEnabled) throw new HostRemoteFault('invalid-payload', 'Esta equipe ainda não pede opinião.')
    if (!/^[A-Za-z0-9:_-]{1,200}$/u.test(request.requestId) || request.personaId === '') throw new HostRemoteFault('invalid-payload', 'Diga o pedido de opinião (requestId) e a pessoa (personaId).')
    const result = await this.opinions.includeTextOnly({ projectId: request.projectId, requestId: request.requestId, personaId: request.personaId })
    if (!result.ok) throw new HostRemoteFault('invalid-payload', result.message)
    return { replyId: result.replyId, mark: result.mark, ...(result.failed === true ? { failed: true as const } : {}), ...(result.already === true ? { already: true as const } : {}) }
  }

  /**
   * "Bom dia" NOW (TEAM-7, on demand): posts the day's card in #geral as the Coordenação — the same zero-model facts the morning ritual
   * uses, with no clock window and no "nothing changed" rule, because the person (or the real round) asked. Idempotent: the day's card
   * once (`already` after that); a `requestId` asks for one more card of its own. Pausing the morning routine does not stop an explicit ask.
   * @param request - Tenant and the optional key of this ask.
   */
  @Remote
  postDailyBriefNow(request: DailyBriefNowRequest): DailyBriefNowView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    if (request.requestId !== undefined && !/^[A-Za-z0-9_-]{1,64}$/u.test(request.requestId)) {
      throw new HostRemoteFault('invalid-payload', 'requestId deve ter de 1 a 64 letras, números, "-" ou "_".')
    }
    const result = this.morningBrief.postNow(request.projectId, request.requestId)
    return { outcome: result.outcome, ...(result.messageId === undefined ? {} : { messageId: result.messageId }), text: NOW_TEXT[result.outcome] }
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
    this.morningBrief.check(request.projectId, 'app-open') // TEAM-7: the first opening of the day after 6:00 brings the card
    return this.maskWhileAway(request, this.proactivity.whileAway(request.projectId)) // Carbon P1-DM-2: the window is read by the SESSION
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.proactivity.ensureAllInitiativeRoutines(request.projectId)
  }

  /**
   * Event Source: PR, recurring error, deadline. Fires initiative when policy allows.
   * @param request - Event.
   */
  @Remote
  fireProactiveEvent(request: FireProactiveEventRequest): string[] {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.proactivity.fireEvent(request.projectId, request.title, request.subjectId)
  }

  /**
   * Scheduler: claim due initiative routines and run the Vigia snapshot.
   * @param request - Tenant, lease, stall threshold.
   */
  @Remote
  tickProactivity(request: TickProactivityRequest): ProactivityTickView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.proactivity.tick(request.projectId, request.leaseUntil, request.stallAfterMs)
  }

  /**
   * Bibliotecário lote: só páginas mudadas desde o cursor.
   * @param request - Tenant.
   */
  @Remote
  tickLibrarianBatch(request: ProjectScopeRequest): LibrarianBatchView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireOwnerOrEmpty(request.workspaceId) // Carbon P0-13: the rules of the house are the owner's (a workspace with nobody in it: the machine owner already passed)
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
    this.requireGovOwner(request.workspaceId) // Carbon P0-13: who is in the team is the owner's
    if (!allowsScriptedReplies()) this.remoteTeam.requireVault()
    const remote = this.remoteTeam.state(request)
    if (remote !== undefined) {
      this.requireSurface('invite') // D-113: the REMOTE branch belongs to the invite surface (the local invite stays)
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
    this.requireGovOwner(request.workspaceId) // Carbon P0-13: who is in the team is the owner's
    if (this.remoteTeam.state(request) !== undefined) {
      this.requireSurface('invite') // D-113: the REMOTE branch belongs to the invite surface (the local list stays)
      return this.remoteTeam.invites(request)
    }
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
    const connected = await this.remoteTeam.connect(request, actor, displayName)
    // F4 law 3: connecting the team is the owner's consent: every persona the project has is signed as she is now (a later change signs itself).
    await this.personaSheets.signAll(this.product.listPersonas(request.projectId))
    return connected
  }

  /**
   * F4 law 3: does this persona's sheet carry her owner's signature? (`solo` for a project that is not a connected team.) The screen says it in words and offers the owner the
   * review.
   * @param request - Persona.
   */
  @Remote
  async getPersonaSheetStatus(request: PersonaSheetRequest): Promise<PersonaSheetStatus> {
    this.requireProject(request)
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined) throw new Error('persona-not-found')
    return this.personaSheets.verdict({ ...persona, projectId: request.projectId })
  }

  /**
   * F4 law 3: the owner reviewed what she may do and signs the sheet as it is now. Only the owner of the connected team.
   * @param request - Persona.
   */
  @Remote
  async reviewPersonaSheet(request: PersonaSheetRequest): Promise<PersonaSheetStatus> {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor?.workspaceRole !== 'owner') throw new Error('forbidden')
    const persona = this.product.getPersona(request.personaId)
    if (persona === undefined) throw new Error('persona-not-found')
    const stored = { ...persona, projectId: request.projectId }
    await this.personaSheets.sign(stored)
    return this.personaSheets.verdict(stored)
  }

  /**
   * F4: "Criar link de convite". The owner's host issues one invite (one person, 7 days, the team's name on it) and returns the link the person copies or sends.
   * @param request - The invite to issue (an empty token is generated).
   */
  @Remote
  async createInviteLink(request: IssueInviteRequest): Promise<InviteLinkView> {
    this.requireGovOwner(request.workspaceId) // Carbon P0-13: the link is the owner's (asked here, not only through `issueInvite`)
    if (this.remoteTeam.state(request) === undefined) throw new Error('remote-team-not-connected') // a link needs the hub: a local invite has nowhere to point
    const invite = await this.issueInvite(request)
    return this.remoteTeam.linkOf(request, invite)
  }

  /**
   * F4: the screen a link opens shows the team BEFORE anybody asks to join. Nothing is created and nobody is asked: the strict parser, then the hub's public answer.
   * @param request - The raw link and the hub's address (product configuration, never taken from the link).
   */
  @Remote
  async previewInvite(request: PreviewInviteRequest): Promise<InvitePreview> {
    this.requireMachineOwnerLocal() // Carbon P0-13: no tenant yet (a link opened on a fresh install), but never a guest or a stranger
    return this.remoteTeam.preview(request.link, request.edgeUrl)
  }

  /**
   * F4: the person pressed "Pedir para entrar". The link is read again, strictly, and must name THIS workspace; the request goes to the hub signed by this device and the
   * state stays "offline / PENDING_APPROVAL" until the owner lets them in. Opening a link never gets here by itself.
   * @param request - The local workspace of the team (its id is the link's team), the project, the raw link and the hub's address.
   */
  @Remote
  async joinTeamFromLink(request: JoinTeamRequest): Promise<RemoteTeamState> {
    this.requireWrite(request)
    const parsed = parseInviteLink(request.link)
    if (parsed === undefined || parsed.teamId !== request.workspaceId) throw new Error('invite-link-invalid')
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    const displayName = this.product.listMembers(request.workspaceId).find(row => row.id === actor.id)?.displayName ?? actor.id
    return this.remoteTeam.accept({ workspaceId: request.workspaceId, projectId: request.projectId, token: parsed.token, edgeUrl: request.edgeUrl }, actor, displayName)
  }

  /**
   * F4: who is here right now (the rail's presence dots): online, ausente or fora, with the machine name when the device says it.
   * @param request - A connected project.
   */
  @Remote
  async getPresence(request: ProjectScopeRequest): Promise<PresenceView[]> {
    this.requireProject(request)
    return this.remoteTeam.presence(request)
  }

  /**
   * F4: where MY request stands (the guest's screen after "Pedir para entrar"): `esperando_dono`, `aceito` (then sync: the keys arrive), `recusado`, `removido` or `sem_conexao`.
   * @param request - The guest's local project.
   */
  @Remote
  async getJoinStatus(request: ProjectScopeRequest): Promise<JoinStatus> {
    this.requireProject(request)
    return this.remoteTeam.joinStatus(request)
  }

  /**
   * F4: "Cancelar pedido": withdraws a request the owner has not decided yet.
   * @param request - The guest's local project.
   */
  @Remote
  async cancelJoinRequest(request: ProjectScopeRequest): Promise<boolean> {
    this.requireWrite(request)
    await this.remoteTeam.cancelJoinRequest(request)
    return true
  }

  /**
   * F4: the people who followed the link and wait for the owner (the cards in Aprovações). Only the owner of the connected team sees them.
   * @param request - Owner project.
   */
  @Remote
  async listJoinRequests(request: ProjectScopeRequest): Promise<JoinRequestView[]> {
    this.requireProject(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor?.workspaceRole !== 'owner') throw new Error('forbidden')
    return (await this.remoteTeam.joinRequests(request)).map(row => ({
      id: row.id, actorId: row.actorId, displayName: row.displayName ?? null, requestedAt: row.requestedAt, securityCode: row.securityCode,
    }))
  }

  /**
   * F4: the owner lets one person in (the channel keys are wrapped for them, only for them) or says no.
   * @param request - Owner project, the request and the decision.
   * @returns True after the hub took the decision.
   */
  @Remote
  async decideJoinRequest(request: DecideJoinRequest): Promise<boolean> {
    this.requireWrite(request)
    const actor = this.actorOf(request.workspaceId)
    if (actor?.workspaceRole !== 'owner') throw new Error('forbidden')
    if (request.allow) await this.remoteTeam.approveJoinRequest(request, request.requestId)
    else await this.remoteTeam.denyJoinRequest(request, request.requestId)
    return true
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

  /** COLHEITA 17: the browser profiles of this machine, who drives each one and which personas may. */
  @Remote
  browserView(request: ProjectScopeRequest): BrowserScreenView {
    this.requireMachineRead(request)
    return this.browserScreen(request.projectId)
  }

  /** P1-10: the WHOLE browser screen of a project: the profiles plus who cannot carry a browser. Every browser answer is this one, so the screen never loses the "sem navegador" mark after an action. */
  private browserScreen(projectId: string): BrowserScreenView {
    // Cursor cannot carry an MCP server: the screen says so instead of promising a browser it will never open.
    const withoutBrowser = this.product.listPersonas(projectId)
      .filter((persona) => {
        const spec = specFromConnection(persona.runner, this.orchestration.loggedCliOf?.(projectId))
        return spec.kind === 'cli' && !hasBrowserGate(spec.cli)
      })
      .map(persona => persona.id)
    return { ...this.browser.view(), withoutBrowser }
  }

  /** COLHEITA 17: create a profile; the answer is the whole screen. */
  @Remote
  createBrowserProfile(request: BrowserProfileNameRequest): BrowserScreenView {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    this.browser.create(request.name)
    return this.browserScreen(request.projectId)
  }

  /** COLHEITA 17: rename a profile. */
  @Remote
  renameBrowserProfile(request: BrowserProfileRenameRequest): BrowserScreenView {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    this.browser.rename(request.profileId, request.name)
    return this.browserScreen(request.projectId)
  }

  /** COLHEITA 17: let a persona drive a profile. */
  @Remote
  grantBrowserProfile(request: BrowserProfileGrantRequest): BrowserScreenView {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    this.browser.grant(request.personaId, request.profileId)
    return this.browserScreen(request.projectId)
  }

  /** COLHEITA 17: take a profile back from a persona. */
  @Remote
  revokeBrowserProfile(request: BrowserProfileGrantRequest): BrowserScreenView {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    this.browser.revoke(request.personaId, request.profileId)
    this.evictBrowserRunners([request.personaId]) // P0-05: her warm runner still has the Chrome attached
    return this.browserScreen(request.projectId)
  }

  /** P0-05: drop the warm runners of these personas, in every project: they were opened with a browser server that is no longer theirs (revoked, or its Chrome closed). */
  private evictBrowserRunners(personaIds: readonly string[]): void {
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        for (const personaId of personaIds) this.orchestration.evictWarmRunners(project.id, personaId)
      }
    }
  }

  /** COLHEITA 17: the person takes the window ("Assumir controle"); the persona's live run is stopped. */
  @Remote
  takeBrowserProfile(request: BrowserProfileRequest): BrowserScreenView {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    this.browser.take(request.profileId, this.actorOf(request.workspaceId)?.id ?? 'owner')
    return this.browserScreen(request.projectId)
  }

  /** COLHEITA 17: the person gives the window back ("Devolver"). */
  @Remote
  releaseBrowserProfile(request: BrowserProfileRequest): BrowserScreenView {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    this.browser.release(request.profileId, this.actorOf(request.workspaceId)?.id ?? 'owner')
    return this.browserScreen(request.projectId)
  }

  /** COLHEITA 17: stop the profile's Chrome; the profiles and grants stay. */
  @Remote
  async closeBrowserProfile(request: BrowserProfileRequest): Promise<BrowserScreenView> {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    const holders = this.browser.view().profiles.find(profile => profile.id === request.profileId)?.personas ?? []
    await this.browser.close(request.profileId)
    this.evictBrowserRunners(holders) // P0-05: the Chrome is gone; the runners opened with its server must not be reused
    return this.browserScreen(request.projectId)
  }

  /** COLHEITA 24: the dedicated station of this machine, as the screen shows it. */
  @Remote
  async stationView(request: ProjectScopeRequest): Promise<StationView> {
    this.requireMachineRead(request)
    return this.station.view()
  }

  /** COLHEITA 24: a one-time code for pairing a dedicated computer (shown once, worth ten minutes). */
  @Remote
  issueStationCode(request: ProjectScopeRequest): StationPairingCode {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    return this.station.issueCode()
  }

  /** COLHEITA 24: the code typed on the station. */
  @Remote
  pairStation(request: StationPairRequest): { readonly ok: boolean; readonly line: string } {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    const result = this.station.redeem(request.code)
    if (result === 'ok') return { ok: true, line: 'computador dedicado pareado' }
    const line = result === 'bloqueado'
      ? 'tentativas demais; espere uns minutos ou gere outro código no seu computador'
      : result === 'expirado'
        ? 'esse código venceu; gere outro no seu computador'
        : result === 'usado' ? 'esse código já foi usado; gere outro' : 'esse código não vale; confira os 8 caracteres'
    return { ok: false, line }
  }

  /** COLHEITA 24: turn the station on or off (off stops accepting turns and lets Windows sleep). */
  @Remote
  async setStationRunning(request: StationRunningRequest): Promise<StationView> {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    this.station.setRunning(request.running)
    if (request.running) this.orchestration.stationGate?.resumeNow() // P1-10: what the switch stopped runs again now
    return this.station.view()
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
    await this.connections.retry() // item 13: "Tentar de novo" forgets the checks that ran out of time, then asks once more
    this.handleReadyEngines()
    return this.engineStatus(request.projectId)
  }

  /** @param request - Project scope. @returns Item 13: who is without AI (CONFIRMED, never a doubt), how many are only being checked, and the accounts to wake them with, by room (the first is the default). */
  @Remote
  getTeamAi(request: ProjectScopeRequest): TeamAiView {
    this.requireProject(request)
    return this.teamConnect.overview(request.projectId)
  }

  /**
   * Item 13: one sign-in wakes everyone who is without AI, one at a time, on the account chosen (absent = the first by room). Workspace owner. Returns the first view at once;
   * the progress is real and is read with `getTeamConnect`.
   * @param request - Project scope and the account.
   */
  @Remote
  connectTeam(request: ConnectTeamRequest): StartResult {
    this.requireProject(request)
    this.requireGovOwner(request.workspaceId)
    return this.teamConnect.start(request.projectId, request.accountId)
  }

  /** @param request - Project scope. @returns Item 13: the progress of the last (or running) connection of the team. */
  @Remote
  getTeamConnect(request: ProjectScopeRequest): TeamConnectView {
    this.requireProject(request)
    return this.teamConnect.progress(request.projectId)
  }

  /** @param request - Project scope and the persona whose row said "Não conectou". @returns Item 13: the progress after trying her again, alone. Workspace owner. */
  @Remote
  async retryTeamPersona(request: RetryTeamPersonaRequest): Promise<TeamConnectView> {
    this.requireProject(request)
    this.requireGovOwner(request.workspaceId)
    return this.teamConnect.retry(request.projectId, request.personaId)
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
    this.requireMachineOwner(request) // Carbon P0-13: which account a stopped Task resumes on is the owner's (the accounts are the machine's)
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
    this.requireMachineOwner(request) // Carbon P0-13: which account a stopped Task resumes on is the owner's (the accounts are the machine's)
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
    this.requireMachineOwner(request) // Carbon P0-13: which account a stopped Task resumes on is the owner's (the accounts are the machine's)
    if (this.actorOf(request.workspaceId)?.kind !== 'user') throw new Error('forbidden')
    return this.accountSwap.undo(request.projectId, request.swapId)
  }

  /**
   * COLHEITA 5 — "Desfazer" of something a persona did inside the product on its own (move a card, open a sprint, create or edit a routine,
   * hire): works once, for 5 minutes after the action, by running the inverse the activity recorded. After the window the host refuses.
   * @param request - The activity (`activityId` of the thread line).
   * @returns `undone: true`, or a typed fault with the reason (window over, nothing to undo, something changed since).
   */
  @Remote
  undoPersonaAction(request: UndoPersonaActionRequest): UndoPersonaActionView {
    this.requireWrite(request)
    if (this.actorOf(request.workspaceId)?.kind !== 'user') throw new Error('forbidden')
    return this.activityUndo.undo(request)
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
      return persona?.runner.kind === 'cli' ? [persona.runner.cli] : []
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
    this.warmIsolation()
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

  /**
   * The isolation proof of the CLI (answer-only mode) is made ONCE per version and model, the moment the engine is ready — so the first
   * delivery of a fresh install does not wait for it. Zero model, never throws, never blocks: the call is not awaited. The model arguments are
   * EXACTLY the ones the runner will use for each persona (a proof is per version + model argument). Never at construction: only the real boot
   * reaches here (scripted hosts and tests return before).
   */
  private warmIsolation(): void {
    const claude = this.connections.list().find(card => card.kind === 'claude' && card.loggedIn && card.available)
    if (claude === undefined) return
    const models = new Set<string>()
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        for (const persona of this.product.listPersonas(project.id)) {
          const spec = specFromConnection(persona.runner, this.orchestration.loggedCliOf?.(project.id))
          if (spec.kind === 'cli' && spec.cli === 'claude') models.add(spec.model)
        }
      }
    }
    const key = `${claude.version ?? ''}|${[...models].sort().join(',')}`
    if (models.size === 0 || this.warmedIsolation.has(key)) return
    this.warmedIsolation.add(key)
    void this.prewarmIsolation([...models].sort()).catch((error: unknown) => { void error })
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
   * Harvest 19b: poll every project's connected sources once. The timer calls this; a manual “Verificar agora” may too.
   * @returns How many projects were polled (a paused team and an active window reserve are skipped).
   */
  pollExternalSources(): Promise<number> {
    this.externalPoller ??= new ExternalPoller({
      projects: () => this.product.listWorkspaces().flatMap(workspace =>
        this.product.listProjects(workspace.id).map(project => ({ workspaceId: workspace.id, projectId: project.id }))),
      ownerOf: workspaceId => this.product.listMembers(workspaceId).find(member => member.role === 'owner')?.id,
      paused: projectId => this.teamState.isPaused(projectId),
      reserved: projectId => this.orchestration.windowReserveOf?.(projectId) !== undefined,
      poll: (projectId, personId) => this.external.poll(projectId, personId),
      onError: (error: unknown) => { this.lastErrors.push(error instanceof Error ? error.message : String(error)) },
    })
    return this.externalPoller.run()
  }

  /** Whether the poll timer is running (the Config turned it off, or the host is disposed). */
  get externalPollArmed(): boolean {
    return this.externalPollTimer !== undefined
  }

  private armExternalPoll(): void {
    if (this.engineReadinessDisposed || this.externalPollTimer !== undefined || this.externalPollMs === 0) return
    this.externalPollTimer = setInterval(() => {
      void this.pollExternalSources().catch((error: unknown) => {
        this.lastErrors.push(error instanceof Error ? error.message : String(error))
      })
    }, this.externalPollMs)
    this.externalPollTimer.unref()
  }

  /**
   * Redeem an invite token as a new member.
   * @param request - Token and member.
   */
  @Remote
  redeemInvite(request: RedeemInviteRequest): InviteView {
    this.requireWorkspace(request)
    this.requireGovOwner(request.workspaceId) // Carbon P0-13: it creates a member with the role of the invite: the owner's
    return this.screens.redeem(request)
  }

  /**
   * Revoke an open invite.
   * @param request - Invite id.
   */
  @Remote
  revokeInvite(request: InviteIdRequest): InviteView {
    this.requireWorkspace(request)
    this.requireGovOwner(request.workspaceId) // Carbon P0-13: who is in the team is the owner's
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.screens.putRule(request)
  }

  /**
   * Delete a triage rule.
   * @param request - Rule id.
   */
  @Remote
  deleteTriageRule(request: ScreenDocRequest): boolean {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.screens.deleteRule(request.projectId, request.id)
  }

  /**
   * Triage simulation log, newest first.
   * @param request - Tenant.
   */
  @Remote
  listTriageLog(request: ProjectScopeRequest): TriageLogView[] {
    this.requireProject(request)
    // Carbon P0-13: a line of a DM the asker is not in is not theirs (the log keeps the first words of the message and the id of its stream).
    const actor = this.actorOf(request.workspaceId)
    return this.screens.listLog(request.projectId).filter((line) => {
      const dm = this.product.getDm(line.threadId)
      return dm === undefined || (actor !== undefined && sessionCan(actor, 'read', { type: 'dm', workspaceId: request.workspaceId, dmId: dm.id, memberIds: [dm.participantA, dm.participantB] }))
    })
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
    const view = this.screens.listCanvas(request.projectId)
    // Carbon R2-05: a node of a Task born in a DM carries the person's words as its label; the others read the neutral title (the rule of `listTasks`).
    const seenBy = this.ticketSeenFor(request.workspaceId)
    return { ...view, nodes: view.nodes.map(node => (node.kind === 'task' && !seenBy(request.projectId, node.id.slice('task:'.length)) ? { ...node, label: PRIVATE_DM_TASK_TITLE } : node)) }
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
    this.requireOwnerOrEmpty(request.workspaceId) // Carbon P0-13: the rules of the house are the owner's (a workspace with nobody in it: the machine owner already passed)
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
    this.requireMachineReadLocal() // Carbon P0-13: no tenant in the request, but a member asks
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.screens.putQuiet(request)
  }

  /**
   * Turn a quiet window off (the editor's "Desligar"). Putting the same window back is `putQuietWindow`, so the screen can offer "Desfazer" with the draft it kept.
   * @param request - Window id.
   * @returns Whether the window existed.
   */
  @Remote
  deleteQuietWindow(request: ScreenDocRequest): boolean {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.screens.deleteQuiet(request.projectId, request.id)
  }

  /**
   * HONEST-1: everything the host OBEYS in "Regras da casa" and "Janela de silêncio" (a closed list). The screens show only these kinds; a rule that is
   * only text is not offered. Also says what the team's quiet window holds back and that a direct request of the person is still answered.
   * @param request - Tenant.
   */
  @Remote
  getRuleKinds(request: ProjectScopeRequest): RuleKindsView {
    this.requireProject(request)
    return ruleKindsView()
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
    this.requireOwnerOrEmpty(request.workspaceId) // Carbon P0-13: the rules of the house are the owner's (a workspace with nobody in it: the machine owner already passed)
    return this.screens.setLimits(request)
  }

  /**
   * Approvals inbox (hire, vault, skill, attention).
   * @param request - Tenant.
   */
  @Remote
  listApprovals(request: ProjectScopeRequest): ApprovalView[] {
    this.requireProject(request)
    // Carbon R2-05: the card of an open question is the Task's title; for a Task born in a DM only its participants read it.
    const seenBy = this.ticketSeenFor(request.workspaceId)
    return this.screens.listApprovals(request.projectId).map((listed) => {
      const card = maskDmApprovalCard(listed, ticketId => seenBy(request.projectId, ticketId))
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.screens.proposeHire(request)
  }

  /**
   * Propose a vault body update.
   * @param request - Record and next body.
   */
  @Remote
  proposeVault(request: ProposeVaultRequest): ApprovalView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.applyRememberedApproval(request, this.screens.proposeVault(request))
  }

  /**
   * Propose enabling a skill.
   * @param request - Skill card.
   */
  @Remote
  proposeSkill(request: ProposeSkillRequest): ApprovalView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.applyRememberedApproval(request, this.screens.proposeSkill(request))
  }

  /**
   * Accept or reject an approval card.
   * @param request - Decision.
   */
  @Remote
  decideApproval(request: DecideApprovalRequest): ApprovalView {
    this.requireWrite(request)
    if (request.kind === 'connector') return this.decideConnectorAsk(request)
    if (request.kind === 'action') return this.decideAction(request)
    if (request.accept === undefined) throw new HostRemoteFault('invalid-payload', 'Diga se aceita ou recusa.')
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
   * The connector ports at this moment: what the desktop bridge installed, plus the one answer the host itself knows — Claude stops a call
   * through its PreToolUse hook (`blocked-report`), every other CLI cannot (`none`: its connectors load read-only). The bridge may override it.
   */
  private portsNow(): ConnectorPorts {
    return { permissionRequests: cli => cli === 'claude' ? 'blocked-report' : 'none', ...this.connectorBridge?.ports(), ...this.connectorPorts }
  }

  /** HT-9: the person answers the preview of an external action (`send` · `edit` · `cancel`). The workspace owner decides. */
  private decideAction(request: DecideApprovalRequest): ApprovalView {
    const choice = request.choice
    if (choice !== 'send' && choice !== 'edit' && choice !== 'cancel' && choice !== 'retry') throw new HostRemoteFault('invalid-payload', 'Escolha enviar, editar ou cancelar.')
    const card = this.listApprovals(request).find(row => row.id === request.id && row.kind === 'action')
    if (card === undefined) throw new Error('approval-not-found')
    const actor = this.actorOf(request.workspaceId)
    // Policy 12/11 (Keel): an action born in a DM is decided ONLY by who is in the DM (the one who asked; the workspace owner when she is in it). The owner outside the DM reads the neutral
    // card and cannot approve or refuse it. An action born in a channel keeps the old rule: the workspace owner.
    const ticketId = ticketOfActionCard(request.id)
    if (this.orchestration.conversationOfTicket(request.projectId, ticketId)?.streamKind === 'dm') {
      if (actor === undefined || !this.ticketSeenFor(request.workspaceId)(request.projectId, ticketId)) throw new HostRemoteFault('forbidden', 'Esta aprovação é de quem pediu na conversa.')
    } else if (actor?.workspaceRole !== 'owner') throw new Error('forbidden')
    if (actor === undefined) throw new Error('forbidden')
    const { card: decided, approved } = this.externalActions.decide({
      workspaceId: request.workspaceId, projectId: request.projectId, id: request.id, choice,
      ...(request.edited === undefined ? {} : { edited: request.edited }), ...(request.remember === undefined ? {} : { remember: request.remember }),
    }, actor.id)
    if (approved !== undefined) this.onActionApproved?.(approved)
    return decided
  }

  /** D-084/TEAM-3: the person answers "a persona needs a connector" (`once` · `always` · `not-now`). The workspace owner decides. */
  private decideConnectorAsk(request: DecideApprovalRequest): ApprovalView {
    const choice = request.choice
    if (choice !== 'once' && choice !== 'always' && choice !== 'not-now') throw new HostRemoteFault('invalid-payload', 'Escolha liberar só desta vez, sempre permitir ou agora não.')
    const card = this.listApprovals(request).find(row => row.id === request.id && row.kind === 'connector')
    if (card === undefined) throw new Error('approval-not-found')
    const actor = this.actorOf(request.workspaceId)
    if (actor?.workspaceRole !== 'owner') throw new Error('forbidden')
    const { card: decided, decision } = this.connectorAsks.decide({ workspaceId: request.workspaceId, projectId: request.projectId, id: request.id, choice }, actor.id)
    return { ...decided, connectorDecision: decision }
  }

  /**
   * Per-persona memory rows (pending + vault).
   * @param request - Tenant.
   */
  @Remote
  listMemory(request: ProjectScopeRequest): MemoryView[] {
    this.requireProject(request)
    // Item 16: the person looking at the list reads "Você disse…" on what they said themselves.
    return this.screens.listMemory(request.projectId, this.actorOf(request.workspaceId)?.id ?? '')
  }

  /**
   * Propose a memory (pending until approved).
   * @param request - Body.
   */
  @Remote
  proposeMemory(request: MemoryWriteRequest): MemoryView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.screens.proposeMemory(request)
  }

  /**
   * Approve a pending memory into the vault.
   * @param request - Memory id.
   */
  @Remote
  approveMemory(request: MemoryWriteRequest): MemoryView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    this.guardMemoryById(request)
    return this.screens.approveMemory(request)
  }

  /**
   * Edit pending or active memory.
   * @param request - New body.
   */
  @Remote
  editMemory(request: MemoryWriteRequest): MemoryView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    this.guardMemoryById(request)
    return this.screens.editMemory(request)
  }

  /**
   * Forget a memory (revoke).
   * @param request - Memory id.
   */
  @Remote
  forgetMemory(request: ScreenDocRequest): MemoryView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    this.guardMemoryById(request)
    return this.screens.forgetMemory(request.projectId, request.id)
  }

  /** R2-04: a memory is reachable BY ID only for who may read it (a private DM memory, another project's or workspace's record: answered as "not found"). */
  private guardMemoryById(request: { readonly workspaceId: string; readonly projectId: string; readonly id: string }): void {
    assertMemoryReachable({ vault: this.vault, screens: this.screens.screens }, request, this.actorOf(request.workspaceId)?.id ?? '')
  }

  /**
   * How the team works, learned quietly (tab "Como ela trabalha"): one row per kind of work a persona did and the owner applied.
   * @param request - Tenant, and one persona or all.
   */
  @Remote
  listPlaybook(request: ListPlaybookRequest): PlaybookNoteView[] {
    this.requireProject(request)
    return playbookViews(this.screens, request.projectId, request.personaId)
  }

  /**
   * Forget one note of the playbook. A skill made from it stays.
   * @param request - The note.
   */
  @Remote
  forgetPlaybook(request: ScreenDocRequest): boolean {
    this.requireWrite(request) // Carbon P0-13: forgetting is a write, not a read
    return forgetPlaybookNote(this.screens, request.projectId, request.id)
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.screens.putSkill(request)
  }

  /**
   * New skill version (candidate).
   * @param request - Body.
   */
  @Remote
  reviseSkill(request: ReviseSkillRequest): SkillView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.screens.reviseSkill(request)
  }

  /**
   * Roll back a skill to the previous body.
   * @param request - Skill id.
   */
  @Remote
  rollbackSkill(request: ScreenDocRequest): SkillView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.screens.rollbackSkill(request.projectId, request.id)
  }

  /**
   * Item 26.10: what a GitHub link would bring in (name, what it does, files, whether it carries scripts). Nothing is written.
   * @param request - Tenant and the link.
   */
  @Remote
  async previewSkillImport(request: PreviewSkillImportRequest): Promise<SkillImportPreview> {
    this.requireMachineOwner(request) // Carbon P0-03: the host opens a connection to the address the person typed: the machine's OWNER only
    try {
      return await this.skillImport.preview(request.url)
    } catch (error) {
      throw this.skillFault(error)
    }
  }

  /**
   * Item 26.10: bring the chosen skills in. The body is stored as untrusted data; a skill's scripts are never run.
   * @param request - Link, chosen names and whether the team shares them.
   */
  @Remote
  async importSkills(request: ImportSkillsRequest): Promise<SkillView[]> {
    this.requireMachineOwner(request) // Carbon P0-03: it downloads from the address the person typed, then writes
    try {
      return await this.skillImport.import(request.projectId, request.url, request.names, request.sharedWithTeam)
    } catch (error) {
      throw this.skillFault(error)
    }
  }

  /**
   * Item 26.10/26.11: ask the source for a new version. Same content changes nothing; a new one waits for approval.
   * @param request - The imported skill.
   */
  @Remote
  async refreshSkill(request: RefreshSkillRequest): Promise<SkillRefreshView> {
    this.requireMachineOwner(request) // Carbon P0-03: it downloads again from the stored address
    try {
      return await this.skillImport.refresh(request.projectId, request.id)
    } catch (error) {
      throw this.skillFault(error)
    }
  }

  /**
   * Item 26.11: apply the version that was waiting (the history keeps the previous body, so "Desfazer" still works).
   * @param request - The imported skill.
   */
  @Remote
  approveSkillUpdate(request: RefreshSkillRequest): SkillView | undefined {
    this.requireWrite(request)
    return this.skillImport.approve(request.projectId, request.id)
  }

  /**
   * @param error - A refused import.
   * @returns The typed fault the client reads (its own sentence), or the error untouched.
   */
  private skillFault(error: unknown): unknown {
    return error instanceof SkillImportError ? new HostRemoteFault('invalid-payload', error.message) : error
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireMachineOwnerLocal() // Carbon P0-13b: the machine owner mints a workspace (or the onboarding, while nobody is a member anywhere); a guest never does
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
    this.requireOwnerOrEmpty(request.workspaceId) // Carbon P0-13: the rules of the house are the owner's (a workspace with nobody in it: the machine owner already passed)
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
    // Carbon P0-13: who is in the team, and as what, is the owner's; the FIRST member of a workspace (nobody to ask yet) is the onboarding's, already limited to the machine owner by `requireProject`.
    if (this.product.listMembers(request.workspaceId).length > 0) this.requireGovOwner(request.workspaceId)
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
        // D-069: a gallery persona always has an animal of the gallery (the first free one when none was chosen).
        avatar: { kind: request.avatarKind, ref: request.avatarKind === 'gallery' ? animalFor(request.avatarRef, this.product.listPersonas(request.projectId).map(row => row.avatar.ref)) : request.avatarRef },
        runner: request.runnerKind === 'dsh'
          ? { kind: 'dsh', model: request.runnerModel }
          : {
            kind: 'cli', cli: asCli(request.runnerCli), model: request.runnerModel,
            ...(request.runnerEffort === undefined || request.runnerEffort === null ? {} : { effort: effortOf(request.runnerEffort) }),
          },
        tools: { files: 'write' }, // D-099: saves files into the draft (effective only in a project with a folder); never a shell
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    // A channel called "geral" is the automatic #geral (the migration says the same for the ones that already exist): never renamed or archived.
    const channel = this.channelRepos.create({
      id: request.id,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      name: request.name,
      topic: request.topic,
      kind: request.name === 'geral' ? 'general' : 'custom',
    })
    if (request.memberIds !== undefined && request.memberIds.length > 0) {
      const known = new Set(this.product.listPersonas(request.projectId).map(persona => persona.id))
      this.channelRepos.setMembers(channel.id, request.memberIds.filter(member => member.kind === 'human' ? this.product.getMember(member.id) !== undefined : known.has(member.id)))
    }
    return this.channelView(request.projectId, channel.id)
  }

  /**
   * Create a DM.
   * @param request - Participants.
   * @returns The DM card.
   */
  @Remote
  createDm(request: CreateDmRequest): DmView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
   * COLHEITA §14 (Quill): figurinha sozinha no composer. Mensagem da pessoa SEM turno (a persona não responde).
   * @param request - Stream + id da figurinha (catálogo do Brush).
   * @returns The stored message.
   */
  @Remote
  sendSticker(request: SendStickerRequest): MessageView {
    this.requireWrite(request)
    const actor = this.requireActor(request.workspaceId)
    return this.viewMessage(this.events.append(stickerMessageEvent({ ...request, actorId: actor.id }, this.orchestration.now())))
  }

  /**
   * Append a message to a channel or DM stream.
   * @param request - Message fields.
   * @returns The stored message.
   */
  @Remote
  postMessage(request: PostMessageRequest): MessageView {
    this.requireProject(request)
    this.requireStreamWriter(request) // Carbon P0-13: who writes, in whose name, and where
    return this.appendMessage(request)
  }

  private appendMessage(request: PostMessageRequest, firstDelivery?: { executorId: string; title: string; assignment?: string }): MessageView {
    this.requireProject(request)
    // A line to a channel nobody reads would be silence (D-079): refuse it, with the stable reason the client keys on. Reading stays allowed.
    if (request.streamKind === 'channel' && this.channelRepos.get(request.ownerId)?.archivedAt !== undefined) {
      throw new HostRemoteFault('conflict', 'Este canal está arquivado. Desarquive para escrever.', { reason: 'channel-archived' })
    }
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
      // CV-5: the same whole-name rule as the routing (an "@Anabela" does not address "Ana"; an e-mail addresses nobody).
      for (const persona of mentionsOf(this.product.listPersonas(request.projectId), request.body)) {
        this.assertCanAddress(request.workspaceId, persona.id, actor.id)
      }
    }
    // Item 18: a message of a Task's thread is only written in the stream where that Task lives.
    const threadProblem = this.taskThreads.problemWith({ projectId: request.projectId, streamKind: request.streamKind, ownerId: request.ownerId, ...(request.topicId === undefined ? {} : { topicId: request.topicId }) })
    if (threadProblem !== undefined) throw new HostRemoteFault('invalid-payload', threadProblem)
    if (request.streamKind === 'channel' && !this.channelKnown(request.projectId, request.ownerId)) throw new HostRemoteFault('not-found', 'Esse canal não existe.') // Carbon P0-13 (RED 3)
    const personOpinion = this.personOpinionOf(request) // validated BEFORE anything is written
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
    // Item 16: what the owner asks the team to remember ("Pessoal, lembrem: …") is kept now, with the exact message as its proof (the host writes it, never a model).
    captureOwnerMemory({ vault: this.vault, screens: this.screens.screens, product: this.product }, stored)
    this.media.bindToMessage(
      stored.id,
      request.attachmentIds ?? [],
      request.projectId,
      request.streamKind,
      request.ownerId,
    )
    if (personOpinion !== undefined) {
      // An answer to a round of opinion: the person's line under the request. It is not routed (no Task, nobody is woken by it).
      this.messageFlags.set(request.projectId, stored.id, { opinion: personOpinion })
      return this.viewMessage(stored)
    }
    const audience = request.fanout !== undefined && this.orchestration.fanoutEnabled && request.streamKind === 'channel' && firstDelivery === undefined
      ? this.fanoutAudience(request.workspaceId, request.projectId, request.ownerId, actor?.id)
      : []
    if (request.fanout !== undefined && audience.length > 0) {
      // CV-8: ONE message to the team becomes a block of typed lines; the single-persona route is not taken for it.
      const coordination = request.fanout === 'relevant'
        ? this.product.listPersonas(request.projectId).find(item => item.systemRoles.includes('coordination'))
        : undefined
      this.fanout.start({ event: stored, source: request.fanout, personas: audience, ...(coordination === undefined ? {} : { coordination }) })
    } else {
      this.orchestration.ingest(stored, request.streamKind, request.ownerId, request.responderId ?? '', undefined, firstDelivery)
    }
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
    // A malformed page request is a client bug, not an empty conversation: say so (it leaks nothing, it does not depend on who is asking).
    if (!Number.isInteger(request.limit) || request.limit < 1 || request.limit > MAX_PAGE_LIMIT) {
      throw new HostRemoteFault('invalid-payload', `limit deve ser um inteiro de 1 a ${String(MAX_PAGE_LIMIT)}; peça mais páginas com nextSeq.`)
    }
    if (!Number.isInteger(request.afterSeq) || request.afterSeq < 0) throw new HostRemoteFault('invalid-payload', 'afterSeq deve ser um inteiro a partir de 0.')
    try {
      this.requireProject(request)
    } catch {
      return { events: [], nextSeq: request.afterSeq }
    }
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) return { events: [], nextSeq: request.afterSeq }
    if (!this.mayReadConversation(request, actor)) return { events: [], nextSeq: request.afterSeq } // R2-01/02/03: bound to the request's project; a DM only to its participants
    this.teamCards.sync(request.projectId) // the plan and delivery cards reflect the Tasks as they are now
    const streamId = `${request.streamKind}:${request.ownerId}`
    try {
      const page = request.topicId === undefined || request.topicId === ''
        ? this.events.list(streamId, { id: actor.id }, request.afterSeq, request.limit)
        : this.events.listTopic(streamId, { id: actor.id }, request.topicId, request.afterSeq, request.limit)
      return { events: page.events.filter(event => this.shownInThread(event) && !hiddenFromList(event.topicId, request.topicId)).map(event => this.viewMessage(event)), nextSeq: page.nextSeq }
    } catch (error) {
      // Only “you may not read it” and “there is no such conversation” are an empty page (so nothing leaks); any other failure is a real one.
      if (error instanceof StoreError && (error.code === 'forbidden' || error.code === 'not-found')) return { events: [], nextSeq: request.afterSeq }
      throw error
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
    // Item 18: the thread of a Task is followed on its own (only its messages); every other follow never carries a thread's messages (they belong to the Task).
    const onlyThread = request.topicId !== undefined && request.topicId !== '' && ticketIdOfThread(request.topicId) !== undefined
    const wanted = (event: { readonly topicId?: string }): boolean => (onlyThread ? event.topicId === request.topicId : !hiddenFromList(event.topicId, request.topicId))
    const disposeAppends = this.events.subscribe((event) => {
      if (event.streamId !== streamId || !this.shownInThread(event) || !wanted(event)) return
      queue.push({ view: this.viewMessage(event), changed: false })
    })
    // A reply that is being written grows in place: its changes are re-sent as upserts of the same id.
    const disposeChanges = this.events.subscribeChanges((event) => {
      if (event.streamId !== streamId || !this.shownInThread(event) || !wanted(event)) return
      queue.push({ view: this.viewMessage(event), changed: true })
    })
    const dispose = (): void => { disposeAppends(); disposeChanges() }
    try {
      this.teamCards.sync(request.projectId)
      const actor = this.actorOf(request.workspaceId)
      if (actor !== undefined && !this.mayReadConversation(request, actor)) throw new Error('forbidden') // R2-02/03: the open, judged by the conversation itself
      const followerId = actor?.id // sec. 11 #5: THIS member is the one the stream keeps asking about, whoever the host's session is later
      const page = onlyThread
        ? this.events.listTopic(streamId, { id: actor?.id ?? '' }, request.topicId ?? '', request.afterSeq, request.limit)
        : this.events.list(streamId, { id: actor?.id ?? '' }, request.afterSeq, request.limit)
      const events = page.events.filter(event => this.shownInThread(event) && wanted(event)).map(event => this.viewMessage(event))
      const seen = new Set(events.map(item => item.id))
      yield { kind: 'baseline', events, order: events.map(item => item.id) }
      let checkedAt = Date.now()
      while (!signal.aborted) {
        const head = queue.shift()
        if (head !== undefined) {
          const next = head.view
          // Skip a stale intermediate state when a newer one of the same message is already waiting.
          if (head.changed && queue.some(item => item.changed && item.view.id === next.id)) continue
          if (!head.changed && seen.has(next.id)) continue
          seen.add(next.id)
          this.reconfirmFollower(request, followerId, request) // sec. 11 #5 + R2: access gone, or the conversation no longer his => 'forbidden', no frame
          yield { kind: 'upsert', events: [next], order: [next.id] }
          continue
        }
        if (Date.now() - checkedAt >= 1_000) { // quiet: a member cut while nothing is said is cut too
          checkedAt = Date.now()
          this.reconfirmFollower(request, followerId, request)
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
    const reader = this.actorOf(request.workspaceId)
    if (reader === undefined || !this.mayReadConversation(request, reader)) return [] // R2-01/03: a DM only to its participants, a channel only through its own project
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
    this.requireMachineOwnerLocal() // Carbon P0-13: no tenant in the request, but the owner asks
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
    this.requireMachineReadLocal() // Carbon P0-13: no tenant in the request, but a member asks
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
    this.requireMachineReadLocal() // Carbon P0-13: no tenant in the request, but a member asks
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
    this.requireMachineOwnerLocal() // Carbon P0-13: no tenant in the request, but the owner asks
    this.store.restoreBackup(request.filename)
    if (this.store.recoveryMessage !== undefined) this.lastErrors.push(this.store.recoveryMessage)
    return this.getStoreHealth()
  }

  /**
   * Item 18: where the conversation of a Task (a card of the board) is. It is a thread of the Task's own stream: list, follow and write it with `listMessages`/`followMessages`/`postMessage`
   * using the `streamKind`, `ownerId` and `topicId` returned here; the reply of the persona stays in the thread and never reaches the main timeline.
   * @param request - The Task.
   * @returns The stream, the topic, the title and who takes care of the Task.
   */
  @Remote
  openTaskConversation(request: OpenTaskConversationRequest): TaskConversationView {
    this.requireProject(request)
    const actor = this.actorOf(request.workspaceId)
    const view = this.taskThreads.open(request.projectId, request.ticketId)
    if (view === undefined) throw new HostRemoteFault('not-found', 'Tarefa não encontrada.')
    if (view.streamKind === 'dm') {
      // The same rule `listMessages` applies to a DM: whoever is not in it gets the same "not found" (the DM's id, the title and who cares are not leaked).
      const dm = this.product.getDm(view.ownerId)
      if (actor === undefined || dm === undefined || !sessionCan(actor, 'read', { type: 'dm', workspaceId: request.workspaceId, dmId: dm.id, memberIds: [dm.participantA, dm.participantB] })) {
        throw new HostRemoteFault('not-found', 'Tarefa não encontrada.')
      }
    }
    return view
  }

  /**
   * Item 18: the person read the thread of a Task up to `seq` (the card's unread count goes down).
   * @param request - The Task and the last seq read.
   * @returns true when applied.
   */
  @Remote
  markTaskThreadRead(request: MarkTaskThreadReadRequest): boolean {
    this.requireProject(request)
    const actor = this.requireActor(request.workspaceId)
    if (!Number.isInteger(request.seq) || request.seq < 0) throw new HostRemoteFault('invalid-payload', 'seq deve ser um inteiro a partir de 0.')
    if (this.orchestration.runtime(request.projectId).repo.tickets.get(request.ticketId) === undefined) throw new HostRemoteFault('not-found', 'Tarefa não encontrada.')
    this.taskThreads.markRead(request.projectId, request.ticketId, actor.id, request.seq)
    return true
  }

  /**
   * Board command: stop, retry, reevaluate, or dismiss.
   * @param request - Ticket and command.
   * @returns true when applied.
   */
  @Remote
  async runTicketCommand(request: TicketCommandRequest): Promise<boolean> {
    this.requireProject(request)
    const engine = this.orchestration.runtime(request.projectId).engine
    const ticket = this.orchestration.runtime(request.projectId).repo.tickets.get(request.ticketId)
    if (ticket === undefined) throw new Error('ticket-not-found')
    if (request.command === 'stop') {
      // Parar cancels the live turn and marks the stop, so the turn ending does not post an engine error over the owner's decision.
      await this.orchestration.stopTicketRun(request.projectId, request.ticketId, request.reason)
      // (the parts that waited for it, and a request it was asked to do for a colleague, are closed inside `stopTicketRun`: every road to a stop passes there)
    } else if (request.command === 'retry') {
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
   * On a structured question (chips, “Pergunta n de m”) the person may also choose `optionIds`; the chips are checked against the
   * OPEN question before anything is posted. In a sequence the next question opens and the worker keeps waiting.
   * @param request - Ticket, text, optional chips and optional `attachFile` ids (uploaded to the conversation the question was asked in).
   * @returns true when the Ticket no longer waits on the person (the worker wakes); false when a sequence opened its next question.
   */
  @Remote
  answerAttention(request: AttentionReplyRequest): boolean {
    this.requireWrite(request)
    const answer = checkAttentionAnswer(request.text, request.attachmentIds, request.optionIds)
    const ticket = this.orchestration.runtime(request.projectId).repo.tickets.get(request.ticketId)
    if (ticket === undefined) throw new HostRemoteFault('not-found', 'Tarefa não encontrada neste projeto.')
    const question = ticket.attention
    if (question === undefined) throw new HostRemoteFault('conflict', 'Essa pergunta já foi respondida.')
    try {
      checkAskAnswer(question, { text: answer.text, optionIds: answer.optionIds })
    } catch (error: unknown) {
      if (error instanceof AskError) throw new HostRemoteFault('invalid-payload', error.message)
      throw error
    }
    const chosen = answer.optionIds.map(id => question.ask?.options?.find(option => option.id === id)?.label ?? id).join(', ')
    const spoken = chosen === '' ? answer.text : answer.text === '' ? chosen : `${chosen} — ${answer.text}`
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
        body: spoken,
        actorId: owner.id,
        subjectId: where.subjectId,
        occurredAt: this.orchestration.now(),
        ...(where.topicId === '' ? {} : { topicId: where.topicId }),
      })
    }
    return this.orchestration.deliverAttentionAnswer(request.projectId, ticket.id, answer.text, messageId, answer.optionIds)
  }

  /**
   * The structured questions personas asked (chips, “Pergunta n de m”) with their live state: `open`, `answered` (the card is
   * read-only and shows the chosen chips) or `cancelled` (the task ended without an answer).
   * @param request - Tenant and, optionally, one Ticket.
   * @returns Questions, oldest first.
   */
  @Remote
  listPersonaAsks(request: ListPersonaAsksRequest): PersonaAskView[] {
    this.requireProject(request)
    if (request.ticketId !== undefined && typeof request.ticketId !== 'string') throw new HostRemoteFault('invalid-payload', 'Tarefa inválida.')
    // The end-of-turn cards that were answered are not tied to a Task: they come with the whole project's list only.
    return request.ticketId === undefined
      ? [...this.personaAsks.list(request.projectId), ...this.personaChoices.answered(request.projectId)]
      : this.personaAsks.list(request.projectId, request.ticketId)
  }

  /**
   * A tap on an option of an end-of-turn choice card (colheita item 11). The tap is the person's own short message in the conversation
   * of the card (`✓ B · Post para o Instagram`), addressed to the persona who offered, and it opens a new turn like any message she writes.
   * One answer per card: the first one stays (`conflict` on a second tap). Nothing waits for the card, so there is no Task to wake.
   * @param request - The persona's message that carries the card and the option (`a`..`f`).
   * @returns true when the answer was posted.
   */
  @Remote
  answerChoice(request: AnswerChoiceRequest): boolean {
    this.requireWrite(request)
    if (typeof request.messageId !== 'string' || typeof request.optionId !== 'string') throw new HostRemoteFault('invalid-payload', 'Escolha inválida.')
    const event = this.events.get(request.messageId)
    const persona = event === undefined ? undefined : this.product.getPersona(event.actorId)
    if (event === undefined || event.deleted || event.projectId !== request.projectId || persona === undefined || persona.projectId !== request.projectId) {
      throw new HostRemoteFault('not-found', 'Esse cartão não existe mais.')
    }
    const card = readChoiceMarker(event.body).card
    if (card === undefined) throw new HostRemoteFault('not-found', 'Esse cartão não existe mais.')
    const text = choiceAnswerText(card, request.optionId)
    if (text === undefined) throw new HostRemoteFault('invalid-payload', 'Essa opção não existe neste cartão.')
    if (this.personaChoices.chosen(request.projectId, event.id) !== undefined) throw new HostRemoteFault('conflict', 'Você já escolheu neste cartão.')
    const owner = this.actorOf(request.workspaceId) ?? this.product.listMembers(request.workspaceId).find(row => row.role === 'owner')
    if (owner === undefined) throw new HostRemoteFault('forbidden', 'forbidden')
    const streamKind = event.streamId.startsWith('dm:') ? 'dm' as const : 'channel' as const
    const at = this.orchestration.now()
    // The tap goes through the same door as any message of the person: it is routed to the persona who offered and opens the new turn.
    this.appendMessage({
      id: `choice-answer:${event.id}`,
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      streamKind,
      ownerId: event.streamId.slice(event.streamId.indexOf(':') + 1),
      body: text,
      actorId: owner.id,
      subjectId: event.subjectId,
      responderId: persona.id,
      replyToId: event.id,
      occurredAt: at,
      ...(event.topicId === undefined || event.topicId === '' ? {} : { topicId: event.topicId }),
    })
    this.personaChoices.record(request.projectId, event.id, card, { personaId: persona.id, personaName: persona.name, optionId: request.optionId, at })
    return true
  }

  /**
   * "Seus números" (colheita item 19a): the numbers pinned to the Visão geral, oldest first, with their live state (updating, failed, alert).
   * @param request - Tenant.
   */
  @Remote
  listIndicators(request: ProjectScopeRequest): IndicatorView[] {
    this.requireProject(request)
    return this.indicators.list(request.projectId)
  }

  /**
   * "Testar agora": run the number of a persona's message with real data (a quiet turn outside the thread) and show the result. Pinning needs it.
   * @param request - The persona's message that carries the number.
   */
  @Remote
  async testIndicator(request: TestIndicatorRequest): Promise<IndicatorTestView> {
    this.requireWrite(request)
    return this.indicatorFault(() => this.indicators.test({ projectId: request.projectId, messageId: request.messageId }))
  }

  /**
   * "Fixar": pin what a fresh test showed, with a name, when to refresh (every hour or every day at 08:00) and, for a number, the drop alert.
   * @param request - The test, the name, the schedule and the alert.
   */
  @Remote
  pinIndicator(request: PinIndicatorRequest): IndicatorView {
    this.requireWrite(request)
    try {
      return this.indicators.pin({
        projectId: request.projectId, testId: request.testId, name: request.name, schedule: request.schedule,
        ...(request.alertDropPct === undefined ? {} : { alertDropPct: request.alertDropPct }),
      })
    } catch (error: unknown) {
      throw this.indicatorRemoteFault(error)
    }
  }

  /**
   * Take a number off the Visão geral.
   * @param request - The indicator.
   * @returns true when it was pinned.
   */
  @Remote
  unpinIndicator(request: IndicatorRequest): boolean {
    this.requireWrite(request)
    return this.indicators.unpin(request.projectId, request.id)
  }

  /**
   * "Atualizar agora": refresh one number now (quiet). A failure keeps the old value and says why.
   * @param request - The indicator.
   */
  @Remote
  async refreshIndicator(request: IndicatorRequest): Promise<IndicatorView> {
    this.requireWrite(request)
    return this.indicatorFault(() => this.indicators.refresh(request.projectId, request.id))
  }

  /**
   * "Já vi": the fall notice of a number leaves "Precisa de você"; the card keeps its amber border until the next refresh. A new fall is a new notice.
   * @param request - The indicator.
   */
  @Remote
  dismissIndicatorAlert(request: IndicatorRequest): IndicatorView {
    this.requireWrite(request)
    try {
      return this.indicators.dismissAlert(request.projectId, request.id)
    } catch (error: unknown) {
      throw this.indicatorRemoteFault(error)
    }
  }

  private async indicatorFault<T>(run: () => Promise<T>): Promise<T> {
    try {
      return await run()
    } catch (error: unknown) {
      throw this.indicatorRemoteFault(error)
    }
  }

  private indicatorRemoteFault(error: unknown): unknown {
    return error instanceof IndicatorError ? new HostRemoteFault(error.code, error.message) : error
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
      ...(record.factKey === undefined ? {} : { factKey: record.factKey }),
    }))
  }

  private visibleVaultRecords(request: ProjectScopeRequest): ReturnType<VaultRepos['listRecords']> {
    const actor = this.actorOf(request.workspaceId)
    // P1-NOVO: the owner reads a FORGOTTEN record of the team, never one that was somebody else's private one: a revoked record is read only if it could be read while active.
    return actor === undefined ? [] : this.vault.listRecords(request.projectId).filter(record => canReadVault(actor, record) && (record.status !== 'revoked' || canReadVault(actor, { ...record, status: 'active' })))
  }

  /**
   * Create a vault record visible to the workspace.
   * @param request - Record fields.
   * @returns The stored card.
   */
  @Remote
  createVaultRecord(request: CreateVaultRecordRequest): VaultRecordView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    // Carbon P0-13: the house rules (constraint, decision) enter EVERY turn of the team: the owner or the Coordenação writes them, a member writes memories (the vault's own `can()`).
    const writer = this.actorOf(request.workspaceId)
    if (writer !== undefined && !sessionCan(writer, 'write', { type: 'vault', workspaceId: request.workspaceId, projectId: request.projectId, visibility: { kind: 'workspace' }, status: 'active', kind: request.kind })) throw new Error('forbidden')
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
   * Cofre v2: the Logins, Chaves and the company Ficha of the project. Never a secret — `hasSecret` says whether one is kept.
   * @param request - Tenant.
   */
  @Remote
  listCofreEntries(request: ProjectScopeRequest): CofreEntryView[] {
    this.requireProject(request)
    return [...this.cofre.entries.list(request.projectId)]
  }

  /**
   * Cofre v2: save a Login; the password goes to the sealed store (DPAPI), never to the record.
   * @param request - Site, user and password.
   */
  @Remote
  saveCofreLogin(request: SaveCofreLoginRequest): Promise<CofreEntryView> {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    return this.cofre.entries.saveLogin({
      projectId: request.projectId,
      authorId: this.actorOf(request.workspaceId)?.id ?? 'owner',
      site: request.site,
      username: request.username,
      ...(request.password === undefined ? {} : { password: request.password }),
      ...(request.title === undefined ? {} : { title: request.title }),
      ...(request.id === undefined ? {} : { id: request.id }),
    })
  }

  /**
   * Cofre v2: save a Chave; the secret goes to the sealed store.
   * @param request - Service and secret.
   */
  @Remote
  saveCofreKey(request: SaveCofreKeyRequest): Promise<CofreEntryView> {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    return this.cofre.entries.saveKey({
      projectId: request.projectId,
      authorId: this.actorOf(request.workspaceId)?.id ?? 'owner',
      service: request.service,
      ...(request.secret === undefined ? {} : { secret: request.secret }),
      ...(request.title === undefined ? {} : { title: request.title }),
      ...(request.id === undefined ? {} : { id: request.id }),
    })
  }

  /**
   * Cofre v2: save the company Ficha; it is also projected as the `brief` the team reads.
   * @param request - The company data.
   */
  @Remote
  saveCofreCompany(request: SaveCofreCompanyRequest): CofreEntryView {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    return this.cofre.entries.saveCompany({
      projectId: request.projectId,
      authorId: this.actorOf(request.workspaceId)?.id ?? 'owner',
      legalName: request.legalName,
      document: request.document,
      ...(request.email === undefined ? {} : { email: request.email }),
      ...(request.phone === undefined ? {} : { phone: request.phone }),
      ...(request.address === undefined ? {} : { address: request.address }),
      ...(request.id === undefined ? {} : { id: request.id }),
    })
  }

  /**
   * Cofre v2: remove an entry and its sealed secret (the Ficha also revokes the projected brief).
   * @param request - Entry id.
   */
  @Remote
  removeCofreEntry(request: RemoveCofreEntryRequest): Promise<void> {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    return this.cofre.entries.remove(request.projectId, request.id)
  }

  /**
   * Cofre v2: what a Chrome/Bitwarden CSV would do (what enters, duplicates, ignored). The preview never carries a password.
   * @param request - The exported file as text.
   */
  @Remote
  previewCofreImport(request: CofreImportRequest): CofreImportPreview {
    this.requireProject(request)
    return this.cofre.csv.preview(request.projectId, request.csv)
  }

  /**
   * Cofre v2: import the rows the preview listed as new; each password is sealed.
   * @param request - The same text the preview read.
   */
  @Remote
  commitCofreImport(request: CofreImportRequest): Promise<CofreImportResult> {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    return this.cofre.csv.commit(request.projectId, this.actorOf(request.workspaceId)?.id ?? 'owner', request.csv)
  }

  /**
   * Cofre v2: the six-digit requests of the project, with their state and never the digits.
   * @param request - Tenant.
   */
  @Remote
  listCofreCodes(request: ProjectScopeRequest): CofreCodeRequestView[] {
    this.requireProject(request)
    void this.cofre.codes.sweep(request.projectId).catch((error: unknown) => { void error }) // Carbon P1-04: the digits of a code nobody used in time do not stay sealed
    return [...this.cofre.codes.list(request.projectId)]
  }

  /**
   * Cofre v2: the owner fills the six digits; they are sealed and the model never sees them.
   * @param request - Request id and the six digits.
   */
  @Remote
  fillCofreCode(request: FillCofreCodeRequest): Promise<CofreCodeRequestView> {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    // Carbon P0-02: from the moment the owner types the digits they are a typed secret: masked in everything the model could read, in the shape typed and without separators.
    const typedCode = request.code.trim()
    this.browser.mask.add(typedCode, Date.now())
    const compactCode = typedCode.replace(/\D/gu, '')
    if (compactCode !== typedCode) this.browser.mask.add(compactCode, Date.now())
    return this.cofre.codes.fill(request.projectId, request.id, request.code)
  }

  /**
   * Cofre v2: the owner cancels a pending request.
   * @param request - Request id.
   */
  @Remote
  async cancelCofreCode(request: CancelCofreCodeRequest): Promise<CofreCodeRequestView | undefined> {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    await this.cofre.codes.cancel(request.projectId, request.id) // Carbon P1-04: a code the owner already filled is dropped from the sealed store
    return this.cofre.codes.get(request.projectId, request.id)
  }

  /**
   * Whether this machine can seal secrets (DPAPI available). The Cofre screen disables Logins and Chaves without it.
   * @param request - Tenant.
   */
  @Remote
  cofreStatus(request: ProjectScopeRequest): CofreStatusView {
    this.requireProject(request)
    return { sealable: this.cofreSealable }
  }

  /**
   * Seal a connector token in its own slot (`connector:<provider>`), where the readers look (harvest 19b: the mailbox form).
   * @param request - Tenant, provider and the secret.
   */
  @Remote
  async saveConnectorSecret(request: SaveConnectorSecretRequest): Promise<ConnectorSecretStateView> {
    this.requireMachineOwner(request) // Carbon P0-13: the machine and the Cofre are the OWNER's
    this.requireConnectorProvider(request.provider)
    await this.requireMailHostOfSecret(request.provider, request.secret)
    await this.cofre.putSecret(request.projectId, connectorSlot(request.provider), request.secret)
    return { hasSecret: true }
  }

  /**
   * Whether a connector slot holds a sealed token, without decrypting it.
   * @param request - Tenant and provider.
   */
  @Remote
  connectorSecretState(request: ConnectorSecretRequest): ConnectorSecretStateView {
    this.requireProject(request)
    this.requireConnectorProvider(request.provider)
    return { hasSecret: this.cofre.hasSecret(request.projectId, connectorSlot(request.provider)) }
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
    const base = estimateAskFor({
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
      // D-092: the kind of account decides whether the person sees the impact on the quota window or (API only) US$.
      conta: accountForEstimate({
        ...(spec === undefined ? {} : { specKind: spec.kind }), cli, ...(logged === undefined ? {} : { loggedCli: logged }),
        env: process.env, quotas: this.usage.listQuota(request.projectId), ...(account === undefined ? {} : { accountId: account }),
        ledger: this.ledger.list({ projectId: request.projectId, ...(windowStart === undefined ? {} : { from: windowStart }) }),
      }),
    })
    return this.withFanoutEstimate(request, base)
  }

  /**
   * CV-8 “Tentar de novo”: repeat ONE persona of a block whose line says she could not answer. Her line is replaced in place when the
   * turn ends. Only a `failed` line, only with the `fanout` flag, never for a paused persona or one at her limit, one attempt at a time.
   * @param request - The person's message that opened the block and the persona.
   * @returns Whether it started, or why not.
   */
  @Remote
  retryFanoutReply(request: RetryFanoutReplyRequest): RetryFanoutReplyView {
    this.requireWrite(request)
    if (!this.orchestration.fanoutEnabled) return { started: false, reason: 'disabled' }
    const event = this.events.get(request.messageId)
    const persona = this.product.getPersona(request.personaId)
    const line = this.messageFlags.of(request.projectId, `coord-${request.messageId}-fan-${request.personaId}`).fanout
    if (event === undefined || event.projectId !== request.projectId || persona === undefined || persona.projectId !== request.projectId || line === undefined) {
      return { started: false, reason: 'not-found' }
    }
    if (line.kind !== 'failed') return { started: false, reason: 'not-failed' }
    const actor = this.actorOf(request.workspaceId)
    if (actor !== undefined) this.assertCanAddress(request.workspaceId, persona.id, actor.id)
    const gate = this.orchestration.fanoutGateOf(request.projectId, persona)
    if (gate.paused) return { started: false, reason: 'paused' }
    if (gate.limited) return { started: false, reason: 'limit' }
    const collaborating = this.orchestration.runtime(request.projectId).repo.tickets.list().find(ticket => ticket.origin.triggerId === event.id
      && collaboratorViews(this.screens.screens, request.projectId, ticket.id, id => this.product.getPersona(id)?.name).some(item => item.personaId === persona.id))
    const lead = collaborating?.execution?.name
    const prompt = collaborating !== undefined && lead !== undefined
      ? collaboratorPrompt(collaborating.title, lead, event.body)
      : fanoutPrompt(event.body, line.total, line.source)
    return this.fanout.retry({ event, persona, line, prompt }) ? { started: true } : { started: false, reason: 'running' }
  }

  /**
   * CV-8: who a block would ask, for the channel `ownerId`: the team of the channel that this person may address (a persona the sender
   * cannot address is left out: it must not be woken by a message to "everyone").
   * @param workspaceId - Workspace.
   * @param projectId - Tenant.
   * @param channelId - The channel.
   * @param actorId - The sender, when known.
   */
  private fanoutAudience(workspaceId: string, projectId: string, channelId: string, actorId: string | undefined): StoredPersona[] {
    return this.teamOf(projectId, channelId).filter((persona) => {
      if (actorId === undefined) return true
      try {
        this.assertCanAddress(workspaceId, persona.id, actorId)
        return true
      } catch {
        return false
      }
    })
  }

  /** CV-8: the numbers of the whole block for `estimateAsk`, when the ask goes to several personas (nothing is called, nothing is written). */
  private withFanoutEstimate(request: EstimateAskRequest, base: EstimateAskView): EstimateAskView {
    if (!this.orchestration.fanoutEnabled || request.streamKind !== 'channel') return base
    const cited = mentionsOf(this.product.listPersonas(request.projectId), request.texto)
    let source: FanoutSource | undefined
    let audience: StoredPersona[] = []
    if (request.audience !== undefined) {
      source = request.audience
      audience = this.teamOf(request.projectId, request.ownerId)
    } else if (cited.length >= 2) {
      source = 'mentions'
      audience = wantsWork(request.texto) ? cited.slice(1) : cited // a Task's first named persona leads it (the normal send); the others are collaborators
    }
    if (source === undefined || audience.length === 0) return base
    const counts = countFanout(planFanout(audience, persona => this.orchestration.fanoutGateOf(request.projectId, persona)))
    return { ...base, fanout: { source, ...counts, chamadas: fanoutCalls(counts, source) } }
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
      const coordination = this.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
      // LEAK-1: the person sees ONE short human line in their own name (their own words when they wrote the request); the
      // instructions the worker runs on (answer-only, no tools, the brief as data) travel in the host-owned route, invisible.
      const assignment = firstRequest === '' ? firstDeliveryAsk({ companyBrief: brief }) : firstRequestAsk(firstRequest, brief)
      this.appendMessage({
        id: FIRST_DELIVERY_EVENT_ID,
        workspaceId: request.workspaceId,
        projectId,
        streamKind: 'channel',
        ownerId: 'geral',
        body: firstRequest === '' ? firstDeliveryVisibleLine(coordination?.name) : firstRequest,
        actorId: owner.id,
        subjectId: 'first-delivery',
        occurredAt: this.orchestration.now(),
      }, { executorId: executor.id, title: 'Primeira entrega', assignment })
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
    // DET-1: the ask is kept and waits for an engine that is still being detected. That is a wait, not a failure: stay `working`
    // (the typed `no_engine_ready` line is already on #geral); the delivery runs and is sealed when the engine is ready.
    if (force !== 'failed' && ticket === undefined && this.firstDeliveryWaitsForEngine(request.projectId)) {
      this.persistFirstDelivery(request.projectId, {
        status: 'working',
        eventId: FIRST_DELIVERY_EVENT_ID,
        ticketId: current.ticketId,
        title: current.title,
        personaId: who.id,
        personaName: who.name,
        feedEventId: current.feedEventId,
      })
      return
    }
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
   * The first-delivery ask is retained by the engine because no engine was ready when it was sent (FR-3).
   * @param projectId - Tenant.
   */
  firstDeliveryWaitsForEngine(projectId: string): boolean {
    return this.orchestration.runtime(projectId).engine.pendingEngineTriggers()
      .some(trigger => trigger.id === FIRST_DELIVERY_EVENT_ID)
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
          ...(probe?.unconfirmed === true ? { unconfirmed: true as const } : {}),
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
        ...(row.unconfirmed === true ? { unconfirmed: true as const } : {}),
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
    this.requireMachineOwner(request) // Carbon P0-13: the accounts the machine signs in with are the owner's
    const labelKey = request.label.normalize('NFD').replace(/\p{M}/gu, '').trim().toLowerCase()
      .replace(/[^a-z0-9]+/gu, '-').replace(/^-+|-+$/gu, '')
    if (labelKey === '') throw new Error('invalid-label')
    const id = `${request.provider}:${labelKey}`
    if (this.accounts.get(id) !== undefined) throw new Error('conflict')
    const home = request.homeDir ?? isolatedAccountHome(this.requireActor(request.workspaceId).id, request.provider, id)
    if (this.accounts.list(request.workspaceId).some(row => sameAccountHome(row.homeDir, home))) throw new Error('conflict') // duas contas na mesma pasta derrubariam todo turno do motor (SHARED_HOME)
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
    this.requireMachineOwner(request) // Carbon P0-13: the accounts the machine signs in with are the owner's
    if (this.accounts.get(request.accountId)?.workspaceId !== request.workspaceId) throw new Error('not-found')
    this.accounts.delete(request.accountId)
    // Varias contas: nenhum assento, hold ou limite fica apontando para a conta que saiu; a sessao quente de quem a usava e solta.
    for (const gone of releaseAccountDocs({ screens: this.screens.screens, product: this.product }, request.workspaceId, request.accountId)) this.orchestration.evictWarmRunners(gone.projectId, gone.personaId)
    return true
  }

  /**
   * @param request - Account + label.
   */
  @Remote
  updateConnectionAccount(request: UpdateConnectionAccountRequest): boolean {
    this.requireMachineOwner(request) // Carbon P0-13: the accounts the machine signs in with are the owner's
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
      title: skillTitleOf(request.skillTitle),
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
      // P1-11: a skill the Playbook offered (`learned`) goes back to candidate the same way, version moved on; any other origin keeps the engine's refusal.
      const next = stored.origin === 'learned' ? { ...stored, enabled: false, version: stored.version + 1 } : disableTaughtSkill(stored)
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
    // Gauge 15:54: who PAYS is the owner's business: a member reads the quota (windows, use, refill) but not which account it is (the label is the e-mail's local part). Fails closed: no session member in a
    // workspace that has members = not the owner.
    const actor = this.actorOf(request.workspaceId)
    const sees = actor === undefined ? this.product.listMembers(request.workspaceId).length === 0 : actor.workspaceRole === 'owner'
    if (stored.length > 0) return stored.map(row => (sees ? toOfficialView(row) : withoutAccountIdentity(toOfficialView(row))))
    const providers = request.provider === undefined ? ['claude', 'codex', 'dsh'] : [request.provider]
    return providers.map(provider => ({ provider, origin: 'unavailable' as const, windows: [] }))
  }

  /**
   * Harvest 10: the last 5% of the official window, the conversations waiting, and whether the person chose to spend it.
   * @param request - Tenant.
   * @returns The reserve view (`ok` when the whole window is free).
   */
  @Remote
  getWindowReserve(request: ProjectScopeRequest): WindowReserveView {
    this.requireProject(request)
    return this.windowReserveView(request.projectId)
  }

  /**
   * “Continuar agora”: spend the last 5% of this window cycle and resume the waiting conversations at once.
   * At 100% the vendor has no room and nothing is overridden.
   * @param request - Tenant.
   * @returns The reserve after the choice.
   */
  @Remote
  continueWindowNow(request: ProjectScopeRequest): WindowReserveView {
    // Spending the last 5% is the owner's decision: a guest with read access never does it.
    this.requireWrite(request)
    const reserve = this.rawReserveOf(request.projectId)
    if (reserve !== undefined && reserve.state === 'reserve') {
      this.screens.screens.put(request.projectId, WINDOW_OVERRIDE_KIND, 'default', {
        windowId: reserve.windowId,
        ...(reserve.resetsAt === undefined ? {} : { resetsAt: reserve.resetsAt }),
        at: this.orchestration.now(),
      } satisfies WindowReserveOverride)
      this.orchestration.releaseWindowQueue(request.projectId, { force: true })
    }
    return this.windowReserveView(request.projectId)
  }

  /** The official window that paused the team, before the person's override. */
  private rawReserveOf(projectId: string): WindowReserve | undefined {
    return reserveOf(this.usage.listQuota(projectId), Date.parse(this.orchestration.now()))
  }

  /** The person's “Continuar agora” for this exact window cycle, if any. */
  private windowOverrideOf(projectId: string, reserve: WindowReserve): WindowReserveOverride | undefined {
    const override = this.screens.screens.get<WindowReserveOverride>(projectId, WINDOW_OVERRIDE_KIND, 'default')
    if (override === undefined) return undefined
    if (override.windowId !== reserve.windowId || override.resetsAt !== reserve.resetsAt) return undefined
    return override
  }

  /**
   * What the orchestration reads: `undefined` when the whole window is free or the person chose to spend the last 5%.
   * A stale override (another window cycle) is dropped.
   */
  private reserveOf(projectId: string): WindowReserve | undefined {
    const reserve = this.rawReserveOf(projectId)
    if (reserve === undefined) {
      this.screens.screens.delete(projectId, WINDOW_OVERRIDE_KIND, 'default')
      return undefined
    }
    if (reserve.state !== 'reserve') return reserve
    return this.windowOverrideOf(projectId, reserve) === undefined ? reserve : undefined
  }

  private windowReserveView(projectId: string): WindowReserveView {
    const reserve = this.rawReserveOf(projectId)
    const queued = new WindowResumeQueue(this.screens.screens).count(projectId)
    if (reserve === undefined) return { state: 'ok', queued, overridden: false }
    return {
      state: reserve.state,
      provider: reserve.provider,
      windowId: reserve.windowId,
      usedPercent: reserve.usedPercent,
      ...(reserve.resetsAt === undefined ? {} : { resetsAt: reserve.resetsAt }),
      queued,
      overridden: reserve.state === 'reserve' && this.windowOverrideOf(projectId, reserve) !== undefined,
    }
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
    this.requireOwnerOrEmpty(request.workspaceId) // Carbon P0-13: the rules of the house are the owner's (a workspace with nobody in it: the machine owner already passed)
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    const followerId = this.actorOf(request.workspaceId)?.id // sec. 11 #5: the member who opened the stream
    const snapshot = (): AttentionEventView[] => this.collectAttention(request)
    const initial = snapshot()
    yield { kind: 'baseline', events: initial }
    let previous = new Set(initial.map(item => item.id))
    while (!signal.aborted) {
      await sleep(1_000, signal)
      this.reconfirmFollower(request, followerId) // sec. 11 #5: re-asked on every tick
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
    this.requireOwnerOrEmpty(request.workspaceId) // Carbon P0-13: the rules of the house are the owner's (a workspace with nobody in it: the machine owner already passed)
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    // Carbon P0-13: the title and the context of a Task born in a DM are for the DM's participants.
    const seen = this.ticketSeenBy(request.workspaceId, request.projectId, ticket.id)
    return {
      ticketId: ticket.id,
      triggerIds: seen ? [...new Set([ticket.origin.triggerId, ...ticket.origin.triggerIds, ...extra])] : [],
      title: seen ? ticket.title : PRIVATE_DM_TASK_TITLE,
      records: seen ? this.readableUsed(request, this.orchestration.usedContext.get(ticket.id) ?? []) : [],
    }
  }

  /** R2-04: the rows of a "contexto usado" this reader may see: the id of a record private to somebody else never travels (it is the key to the by-id paths). */
  private readableUsed<T extends { readonly id: string }>(request: { readonly workspaceId: string; readonly projectId: string }, rows: readonly T[]): T[] {
    return readableUsedRows({ vault: this.vault, screens: this.screens.screens }, request.projectId, rows, this.actorOf(request.workspaceId)?.id ?? '')
  }

  /**
   * Cofre records that entered (or were restricted from) one human message.
   * @param request - Tenant + event id.
   * @returns Contexto usado.
   */
  @Remote
  listUsedContext(request: UsedContextRequest): UsedContextView {
    this.requireProject(request)
    // R2-04 (Gauge): the rows are kept BY EVENT ID. The event must be one of THIS project's and, when it is a line of a DM, of a DM the session takes part in; an id from anywhere else gets nothing.
    let rows: readonly UsedContextRecord[] = []
    try {
      this.requireOwnableMessage(request)
      rows = this.orchestration.usedContext.get(request.eventId) ?? []
    } catch {
      rows = []
    }
    return {
      eventId: request.eventId,
      records: this.readableUsed(request, rows),
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
      .filter(event => this.shownInThread(event))
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
   * Item 26 (R1): a routine only listens to what the person has connected, so the team can read it: its credential is in the Cofre.
   * @param projectId - Tenant.
   * @param source - The connector the routine would listen to.
   */
  private requireListenable(projectId: string, source: EventSource): void {
    if (this.cofre.hasSecret(projectId, connectorSlot(SOURCE_PROVIDER[source]))) return
    throw new HostRemoteFault('invalid-payload', `A rotina só escuta o que a equipe consegue ler: conecte ${SOURCE_CONNECT_LABEL[source]} em Conexões primeiro.`)
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
    const trigger = checkRoutineTrigger(request.trigger)
    const fields = {
      name: checkRoutineName(request.name),
      // Item 26: an event has no time (the `EVENT` mark) and keeps EVERY event (`run_all`: two mails are two runs, not one).
      rrule: trigger.kind === 'event' ? EVENT_RRULE : checkRoutineRrule(request.rrule),
      timeZone: checkRoutineTimeZone(request.timeZone),
      catchUp: trigger.kind === 'event' ? 'run_all' as const : checkRoutineCatchUp(request.catchUp),
    }
    const prompt = request.prompt === undefined ? '' : checkRoutinePrompt(request.prompt)
    const ownerPersonaId = checkRoutineOwner(this.product, request.projectId, request.ownerPersonaId)
    if (trigger.kind === 'event') this.requireListenable(request.projectId, trigger.source)
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
      writeRoutineSpec(this.screens.screens, request.projectId, id, { prompt, ownerPersonaId, trigger })
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
    if (current.id.startsWith(MORNING_ROUTINE_PREFIX)) throw new HostRemoteFault('invalid-payload', 'Esta rotina é da própria equipe: dá para pausar, mas não para mudar.')
    const spec = readRoutineSpec(this.screens.screens, request.projectId, current.id)
    const trigger = request.trigger === undefined ? undefined : checkRoutineTrigger(request.trigger)
    const toEvent = trigger?.kind === 'event'
    if (trigger?.kind === 'event') this.requireListenable(request.projectId, trigger.source)
    // Item 26: an `EVENT` echoed back (an undo) is not a new schedule; leaving an event for a time needs a time.
    const echoed = request.rrule === EVENT_RRULE && current.rrule === EVENT_RRULE
    const stillEvent = trigger === undefined && current.rrule === EVENT_RRULE
    if (trigger?.kind === 'schedule' && current.rrule === EVENT_RRULE && (request.rrule === undefined || echoed)) {
      throw new HostRemoteFault('invalid-payload', 'Escolha o horário da rotina.')
    }
    const nextSpec = {
      ...(trigger === undefined ? {} : { trigger }),
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
      ...(toEvent ? { rrule: EVENT_RRULE, catchUp: 'run_all' as const } : {}),
      ...(toEvent || request.rrule === undefined || echoed ? {} : { rrule: checkRoutineRrule(request.rrule) }),
      ...(request.timeZone === undefined ? {} : { timeZone: checkRoutineTimeZone(request.timeZone) }),
      ...(toEvent || stillEvent || request.catchUp === undefined ? {} : { catchUp: checkRoutineCatchUp(request.catchUp) }),
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
    if (current.id.startsWith(INITIATIVE_ROUTINE_PREFIX) || current.id.startsWith(MORNING_ROUTINE_PREFIX)) {
      throw new HostRemoteFault('invalid-payload', 'Esta rotina é da própria equipe e não pode ser apagada. Pause-a se não quiser que rode.')
    }
    for (const run of this.routines.listRuns(current.id)) if (isEventRunId(run.id)) this.screens.screens.delete(request.projectId, EVENT_DOC_KIND, run.id) // P1-07: the text of its waiting events goes with it
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
    this.requireOwnerOrEmpty(request.workspaceId) // Carbon P0-13: the rules of the house are the owner's (a workspace with nobody in it: the machine owner already passed)
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
    this.requireOwnerOrEmpty(request.workspaceId) // Carbon P0-13: the rules of the house are the owner's (a workspace with nobody in it: the machine owner already passed)
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return this.routines.claimDue(request.projectId, request.leaseUntil).map(toRunView)
  }

  /**
   * Re-queue a failed run.
   * @param request - Run id.
   * @returns The pending run.
   */
  @Remote
  retryRoutine(request: RoutineRunRequest): RoutineRunView {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return toRunView(this.routines.retry(request.runId))
  }

  /**
   * Draft one persona from a description. Valid against Forge's schema; tools empty.
   * @param request - Tenant and text.
   * @returns An editable draft.
   */
  @Remote
  async draftPersona(request: DraftPersonaRequest): Promise<PersonaDraft> {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return draftPersonaWithDriver(request.description)
  }

  /**
   * Draft a team from a description. No coordination role is assigned.
   * @param request - Tenant and text.
   * @returns Editable drafts.
   */
  @Remote
  async draftTeam(request: DraftTeamRequest): Promise<PersonaDraft[]> {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    return draftTeamWithDriver(request.description)
  }

  /**
   * Cancel an in-flight conversation reply.
   * @param request - Human message id.
   */
  @Remote
  cancelReply(request: CancelReplyRequest): boolean {
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
    this.orchestration.cancelReply(request.eventId)
    return true
  }

  /**
   * Support dump (no secrets, no message bodies).
   * @returns JSON string.
   */
  @Remote
  exportDiagnostics(): DiagnosticsJson {
    this.requireMachineOwnerLocal() // Carbon P0-13: no tenant in the request, but the owner asks
    const json = stringifyDiagnostics(collectDiagnostics({
      protocol: PERSONA_PROTOCOL,
      product: this.product,
      store: this.store,
      lastErrors: [...this.lastErrors, ...this.orchestration.lastErrors],
      scheduler: this.scheduler,
      flags: this.hostFlags,
      menus: this.connections.menuSources(),
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
    // P0-1: a picture the persona saved in the draft is SEEN in Revisar (bounded data addresses, confined to the draft and to the folder): see review-images.ts.
    const draft = this.orchestration.runtime(request.projectId).repo.tickets.get(request.ticketId)?.execution?.directory
    const folder = this.product.getProject(request.projectId)?.rootPath ?? undefined
    return {
      ticketId: sum.ticketId,
      files: sum.files.map(file => withReviewImages(file, draft, folder)),
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
      // Item 16: an applied delivery is a quiet use of how this persona does this kind of work (the playbook), not a memory the team reads.
      learnFromAcceptedReview({ screens: this.screens, product: this.product, orchestration: this.orchestration }, request)
      return { kind: 'merged', mode: result.mode, explanation: '',
        ...(result.restorePointId === undefined ? {} : { restorePointId: result.restorePointId }) }
    }
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
    learnFromRequestedChanges({ screens: this.screens, product: this.product, orchestration: this.orchestration }, request)
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
    this.requireWrite(request) // Carbon P0-13: a write asks to WRITE
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
    this.requireGovOwner(request.workspaceId) // Carbon P0-13: the whole workspace (every project, every record, the governance audit) leaves only with its owner
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
    // Carbon P0-13: the owner takes everything; anybody else gets the project without the governance audit and only the Cofre records they may read.
    const actor = this.actorOf(request.workspaceId)
    const owner = actor?.workspaceRole === 'owner'
    return toExportView(exportMarkdown(this.product, this.events, this.vault, {
      workspaceId: request.workspaceId,
      projectId: request.projectId,
      includeDmIds: request.includeDmIds,
    }, actor?.id ?? '', this.boards.board, owner ? this.governance.gov : undefined, owner ? undefined : {
      canReadRecord: record => actor !== undefined && sessionCan(actor, 'read', {
        type: 'vault', workspaceId: request.workspaceId, projectId: request.projectId, visibility: record.visibility, status: record.status, kind: record.kind,
      }),
    }))
  }

  /**
   * On-demand `VACUUM INTO` copy of `persona.db`. Local only.
   * @returns Filename, path, and mtime.
   */
  @Remote
  backupNow(): BackupView {
    this.requireMachineOwnerLocal() // Carbon P0-13: no tenant in the request, but the owner asks
    const path = this.store.backupNow()
    return backupViewOf(path)
  }

  /**
   * Manual and pre-migration copies, newest first.
   */
  @Remote
  listBackups(): BackupView[] {
    this.requireMachineReadLocal() // Carbon P0-13: no tenant in the request, but a member asks
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
    if (this.product.listMembers(request.workspaceId).length === 0) {
      this.requireMachineOwnerLocal() // Carbon P0-13b: nobody to ask in this workspace, but only the machine owner (or a fresh install) goes through
      return
    }
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    if (!sessionCan(actor, 'read', { type: 'workspace', workspaceId: request.workspaceId })) {
      throw new Error('forbidden')
    }
  }

  /**
   * Carbon section 11 #5: a stream checks access when it opens and then lives as long as the tab does, so it asks again — before every frame it pushes and about once a second while it is
   * quiet — for the SAME member who opened it (never for whoever the host's session is at that instant). A member who was demoted, revoked or removed stops receiving: the stream ends
   * with `forbidden`.
   * @param request - The stream's scope.
   * @param memberId - The member the stream was opened for (`undefined`: nobody to ask in a fresh workspace, as when it opened).
   * @throws Error `forbidden` when that member may no longer read the project.
   */
  private reconfirmFollower(request: { workspaceId: string; projectId: string }, memberId: string | undefined, conversation?: ListMessagesRequest): void {
    if (memberId === undefined) return
    const actor = resolveSessionActor(this.product, request.workspaceId, memberId)
    if (actor === undefined || !sessionCan(actor, 'read', { type: 'project', workspaceId: request.workspaceId, projectId: request.projectId })) throw new Error('forbidden')
    if (conversation !== undefined && !this.mayReadConversation(conversation, actor)) throw new Error('forbidden') // R2-02/03: the conversation too (a DM opens only to its participants)
  }

  /**
   * R2-01/02/03: whether `actor` may read the conversation a request names. It is judged by the conversation itself and BOUND to the project of the request (`EventRepos` lets any
   * workspace member read any channel stream, so a request for project A that names the channel of project B is a bypass), and a DM opens only to its two participants — also while it is
   * still empty (no stream row yet means no ACL below). A conversation that does not exist yet is allowed: nothing to read, and a stream that waits for it asks again before every frame.
   * @param request - The conversation (stream kind and owner) and the project it is asked through.
   * @param actor - Who asks.
   */
  private mayReadConversation(request: ListMessagesRequest, actor: NonNullable<ReturnType<typeof resolveSessionActor>>): boolean {
    if (request.streamKind === 'dm') {
      const dm = this.product.getDm(request.ownerId)
      if (dm === undefined) return false
      return dm.projectId === request.projectId && sessionCan(actor, 'read', { type: 'dm', workspaceId: request.workspaceId, dmId: dm.id, memberIds: [dm.participantA, dm.participantB] })
    }
    const projectOfStream = this.events.streamProjectOf(`channel:${request.ownerId}`) ?? this.product.getChannel(request.ownerId)?.projectId
    return projectOfStream === undefined || projectOfStream === request.projectId
  }

  private requireProject(request: { workspaceId: string; projectId: string }): void {
    const firstCall = this.bootMarks.firstCallLine()
    if (firstCall !== undefined && process.env.VITEST !== 'true') process.stderr.write(`${firstCall}\n`) // the first screen call: how long the person waited for the host
    this.requireWorkspace(request)
    const project = this.product.getProject(request.projectId)
    if (project === undefined || project.workspaceId !== request.workspaceId) {
      throw new Error('project-not-found')
    }
    if (this.product.listMembers(request.workspaceId).length === 0) {
      this.requireMachineOwnerLocal() // Carbon P0-13b: nobody to ask in this workspace, but only the machine owner (or a fresh install) goes through
      return
    }
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined) throw new Error('forbidden')
    if (!sessionCan(actor, 'read', { type: 'project', workspaceId: request.workspaceId, projectId: request.projectId })) {
      throw new Error('forbidden')
    }
  }

  private requireWrite(request: { workspaceId: string; projectId: string }): void {
    this.requireProject(request)
    if (this.product.listMembers(request.workspaceId).length === 0) {
      this.requireMachineOwnerLocal() // Carbon P0-13b: nobody to ask in this workspace, but only the machine owner (or a fresh install) goes through
      return
    }
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

  /**
   * Carbon P0-13: a thing of the MACHINE (the browser profiles, the dedicated station) or of the Cofre is the OWNER's, and a workspace with nobody in it opens none of it: `requireWrite` lets
   * a workspace without members through (there is nobody to ask), `requireGovOwner` does not (no member = no owner).
   * @param request - Tenant.
   */
  private requireMachineOwner(request: { workspaceId: string; projectId: string }): void {
    this.requireWrite(request)
    this.requireGovOwner(request.workspaceId)
  }

  /**
   * Carbon P0-13: what the machine shows (browser, station) is read by a real member of the workspace: the "no members" early return of `requireProject` does not reach it.
   * @param request - Tenant.
   */
  private requireMachineRead(request: { workspaceId: string; projectId: string }): void {
    this.requireProject(request)
    if (this.actorOf(request.workspaceId) === undefined) throw new Error('forbidden')
  }

  /**
   * Carbon P0-13 (Keel, 05:08): a Remote with NO tenant in the request (the local backup, the diagnostics, the store health, the CLI skills scan) still asks WHO is asking. The machine is
   * changed by the owner of a workspace; a host where nobody is a member anywhere yet (a fresh install, before the onboarding) has nobody to protect and no peer.
   */
  private requireMachineOwnerLocal(): void {
    this.requireMachineLocal(['owner'])
  }

  /** Carbon P0-13: what the machine reports about itself is read by a member (owner or member), never by a guest or a stranger. */
  private requireMachineReadLocal(): void {
    this.requireMachineLocal(['owner', 'member'])
  }

  private requireMachineLocal(roles: readonly string[]): void {
    const workspaces = this.product.listWorkspaces()
    if (!workspaces.some(workspace => this.product.listMembers(workspace.id).length > 0)) return
    const allowed = workspaces.some((workspace) => {
      const role = this.actorOf(workspace.id)?.workspaceRole
      return role !== undefined && roles.includes(role)
    })
    if (!allowed) throw new Error('forbidden')
  }

  /**
   * D-113: the code path of a surface under construction asks first; an OFF surface refuses with the stable reason `feature-off` (the funnel refuses the whole Remote; this is for a BRANCH inside one).
   * @param name - Which surface.
   */
  private requireSurface(name: Surface): void {
    if (!this.surfaces[name]) throw new HostRemoteFault('forbidden', FEATURE_OFF_TEXT, { reason: FEATURE_OFF_REASON })
  }

  /**
   * Carbon P2-03b: a connector secret has a sealed slot only for a KNOWN provider (`SECRET_FACT_KEYS`): a made-up name, a slot prefix or a code id is not a provider.
   * @param provider - The provider named by the request.
   */
  private requireConnectorProvider(provider: string): void {
    if (!SECRET_FACT_KEYS.includes(provider)) throw new HostRemoteFault('invalid-payload', 'invalid-provider')
  }

  /**
   * Carbon P0-13: the org chart of the workspace carries the personas of EVERY project; whoever is not the owner reads only the ones of the projects they may read.
   * @param workspaceId - Tenant.
   * @param view - The chart as the governance host built it.
   */
  private maskOrgChart(workspaceId: string, view: OrgChartView): OrgChartView {
    const actor = this.actorOf(workspaceId)
    if (actor === undefined || actor.workspaceRole === 'owner') return view
    const mine = (personaId: string): boolean => {
      const projectId = this.product.getPersona(personaId)?.projectId
      return projectId !== undefined && sessionCan(actor, 'read', { type: 'project', workspaceId, projectId })
    }
    const groups = view.groups.map(group => ({ ...group, members: group.members.filter(member => mine(member.id)) })).filter(group => group.members.length > 0 || group.kind === 'person')
    const { rightHand, rightHandCaption, ...rest } = view
    const showHand = rightHand !== undefined && mine(rightHand.id)
    return {
      ...rest,
      ...(showHand ? { rightHand, ...(rightHandCaption === undefined ? {} : { rightHandCaption }) } : {}),
      groups,
      personaCount: groups.reduce((sum, group) => sum + group.members.length, 0),
    }
  }

  /**
   * Carbon P0-13: an admin operation is the owner's; a workspace with NOBODY in it (a fresh install, before the onboarding) has no owner to ask, and the machine owner it already passed through
   * `requireProject` goes on.
   * @param workspaceId - Tenant.
   */
  private requireOwnerOrEmpty(workspaceId: string): void {
    if (this.product.listMembers(workspaceId).length === 0) return
    this.requireGovOwner(workspaceId)
  }

  /**
   * Carbon MH-1: a mail credential (`imap`, `smtp`) names a host the machine will connect to: it is sealed only when the policy vets that host (the same as "Testar conexão").
   * @param provider - The connector provider.
   * @param secret - The JSON credential about to be sealed.
   */
  private async requireMailHostOfSecret(provider: string, secret: string): Promise<void> {
    if (provider !== 'imap' && provider !== 'smtp') return
    let host: unknown
    try {
      host = (JSON.parse(secret) as { host?: unknown }).host
    } catch {
      return // not a JSON credential: nothing names a host
    }
    if (typeof host === 'string' && host !== '' && (await this.mailTarget(host)) === undefined) throw new HostRemoteFault('invalid-payload', 'mail-host-refused')
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

  /**
   * Boot diet (lever 2): start the background work after `delayMs`, once. The installed app calls it at the end of the constructor; a host that closes before the delay never starts it.
   * @param delayMs - Wait before the start.
   */
  scheduleBackground(delayMs: number): void {
    if (this.backgroundTimer !== undefined || this.backgroundStarted) return
    this.backgroundTimer = setTimeout(() => { this.backgroundTimer = undefined; this.startBackground() }, Math.max(0, delayMs))
    this.backgroundTimer.unref()
  }

  /**
   * Boot diet (lever 2): what is NOT the first screen. The CLI and connector warmups, the prewarm of the runners, the proactivity scheduler, the `gh` probe and the per-project runtime + reports curation.
   * Idempotent: the second call (or a timer that fires after a start) changes nothing.
   */
  startBackground(): void {
    if (this.backgroundStarted) return
    this.backgroundStarted = true
    if (this.backgroundTimer !== undefined) { clearTimeout(this.backgroundTimer); this.backgroundTimer = undefined }
    this.connections.warm()
    void this.connectorBridge?.refresh() // background, control requests only: the account's connectors become available when it answers
    this.orchestration.prewarmAll()
    this.proactivityScheduler.start()
    void this.github.cli.available // the one synchronous spawn of `gh --version`, off the first screen and remembered
    if (allowsScriptedReplies()) return
    for (const workspace of this.product.listWorkspaces()) {
      for (const project of this.product.listProjects(workspace.id)) {
        try {
          this.orchestration.runtime(project.id)
          this.curateProjectReports(project.id)
        } catch (error: unknown) {
          this.orchestration.softFailure('boot-project', error) // fail-soft per project, as the boot loop always was
        }
      }
    }
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
    // "Seus números": a fall is a notice drawn by the Visão geral from `listIndicators`, never an attention event (it is not a decision to approve).
    const acked = new Set(this.screens.screens.get<string[]>(request.projectId, 'attention_ack', 'ids') ?? [])
    return events.filter(item => !acked.has(item.id))
  }

  private coordinationAuthor(projectId: string): { actorId: string } | Record<string, never> {
    const coordination = this.product.listPersonas(projectId).find(persona => persona.systemRoles.includes('coordination'))
    return coordination === undefined ? {} : { actorId: coordination.id }
  }

  /** Colheita item 11: a persona's message that ends offering paths shows its words without the marker, plus the card (read, never stored). */
  private choiceView(event: { readonly id: string; readonly body: string; readonly actorId: string }): Partial<Pick<MessageView, 'body' | 'personaAsk'>> {
    if (!/\[\[escolha:/iu.test(event.body)) return {}
    const persona = this.product.getPersona(event.actorId)
    if (persona === undefined) return {}
    const shown = choiceMessageOf({ messageId: event.id, body: event.body, personaId: persona.id, personaName: persona.name })
    return shown === undefined ? {} : { body: shown.body, ...(shown.personaAsk === undefined ? {} : { personaAsk: shown.personaAsk }) }
  }

  /** The markers a persona writes in her words (the choice card of item 11, the number of item 19a): read, never stored; the words lose them. */
  private markerViews(event: { readonly id: string; readonly body: string; readonly actorId: string }): Partial<Pick<MessageView, 'body' | 'personaAsk' | 'indicatorOffer'>> {
    const choice = this.choiceView(event)
    const body = choice.body ?? event.body
    if (!/\[\[indicador:/iu.test(body)) return choice
    if (this.product.getPersona(event.actorId) === undefined) return choice
    const shown = this.indicators.offerOf(event.id, body)
    return shown === undefined ? choice : { ...choice, body: shown.body, ...(shown.offer === undefined ? {} : { indicatorOffer: shown.offer }) }
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
      ...(event.id.startsWith('connector-grant:') ? { id: eventIdForReader(event.id) } : {}), // CONN-3: a grant line written before the handle existed carries the proxy URL (key included) in its id
      ...this.markerViews(event),
      // An older base holds lines written with no speaker (the literal "coordination"): the thread shows the Coordination persona, never an id nobody can name.
      ...(event.actorId !== 'coordination' || event.projectId === undefined ? {} : this.coordinationAuthor(event.projectId)),
      ...(flags.steeredPersonaId === undefined ? {} : { steeredPersonaId: flags.steeredPersonaId }),
      ...(flags.stopped === true ? { stopped: true as const } : {}),
      ...(flags.stoppedTicketId === undefined ? {} : { stoppedTicketId: flags.stoppedTicketId }),
      ...(flags.taskWith === undefined ? {} : { taskWith: flags.taskWith }),
      ...(event.projectId === undefined ? {} : this.briefOf(event.projectId, event.id)),
      ...(event.projectId === undefined ? {} : this.cardsOf(event.projectId, event.id)),
      ...(flags.harness === undefined ? {} : { harness: flags.harness }),
      ...(flags.fanout === undefined ? {} : { fanout: flags.fanout }),
      ...(flags.opinion === undefined || !this.teamworkEnabled ? {} : { opinion: flags.opinion }),
      ...(flags.stateLine === undefined || !this.teamworkEnabled ? {} : { stateLine: flags.stateLine }),
      ...(flags.filesSaved === undefined || !this.teamworkEnabled ? {} : { filesSaved: flags.filesSaved }),
      ...(flags.channelNotice === undefined ? {} : { channelNotice: flags.channelNotice }),
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
    const bound = this.screens.screens.get<{ accountId: string }>(projectId, 'active_account', persona.id)
    // Varias contas / D-116: um assento que ESTA maquina nao tem (a persona veio de outro computador, ou a conta foi removida) nao e assento: cai no que ha aqui (o doc e regravado abaixo).
    const last = bound !== undefined && seats.some(row => row.id === bound.accountId) ? bound : undefined
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
    // R2-04: a line of a DM is for the DM's participants BY ID as it is in the list (react, pin, edit, delete and the audit all come through here): anybody else is answered "not found".
    if (event.streamId.startsWith('dm:')) {
      const actor = this.actorOf(request.workspaceId)
      const dm = this.product.getDm(event.streamId.slice(3))
      if (actor === undefined || dm === undefined || !sessionCan(actor, 'read', {
        type: 'dm', workspaceId: request.workspaceId, dmId: dm.id, memberIds: [dm.participantA, dm.participantB],
      })) throw new Error('not-found')
    }
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
      ?? existing.find(channel => this.channelRepos.get(channel.id)?.kind === 'general')
      ?? existing[0]
    if (preferred !== undefined) {
      return { projectId, channelId: preferred.id, name: preferred.name }
    }
    const created = this.channelRepos.create({
      id: `geral:${projectId}`,
      workspaceId,
      projectId,
      name: 'geral',
      topic: '',
      kind: 'general', // CV-6: the automatic #geral is never archived or renamed
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

  /**
   * Carbon P0-13 (RED 1-2): who may write on the wire, for a BOUND session (a peer, or a session switched by `sessionMemberId`). The AUTHOR is the session: what the request says it is, is a
   * claim, and a different `actorId` is refused (nobody speaks in the name of the owner); a DM is written by its participants only (reading it was already so). The implicit local session
   * (nobody bound: the owner at the keyboard) keeps trusting the interface, as the local app always did.
   * @param request - The message.
   */
  private requireStreamWriter(request: PostMessageRequest): void {
    if (this.sessionMemberId === undefined) return
    const actor = this.actorOf(request.workspaceId)
    if (actor === undefined || request.actorId !== actor.id) throw new HostRemoteFault('forbidden', 'forbidden')
    this.assertStreamWrite(request)
  }

  /**
   * Carbon P0-13 (RED 3): a channel that does not exist is not created by writing to it. The automatic `#geral` (`geral` or `geral:<project>`) is created on demand and counts.
   * @param projectId - Project.
   * @param channelId - The channel the line is for.
   */
  private channelKnown(projectId: string, channelId: string): boolean {
    return channelId === 'geral' || channelId === `geral:${projectId}` || this.product.listChannels(projectId).some(channel => channel.id === channelId)
  }

  /**
   * Carbon P0-13: whether the session may see inside a Task (a Task born in a DM is its participants').
   * @param workspaceId - Tenant.
   * @param projectId - Project.
   * @param ticketId - The Task.
   */
  private ticketSeenBy(workspaceId: string, projectId: string, ticketId: string): boolean {
    return this.ticketSeenFor(workspaceId)(projectId, ticketId)
  }

  /**
   * The same rule as {@link ticketSeenBy} for a LOOP over many Tasks: the session's actor is resolved once (`actorOf` re-reads the workspace's members every time), then each Task is only a conversation
   * and a DM lookup. Same actor, same rule: only computed once.
   * @param workspaceId - Tenant.
   * @returns Whether the session may see inside a Task of a project of that workspace.
   */
  private ticketSeenFor(workspaceId: string): (projectId: string, ticketId: string) => boolean {
    const actor = this.actorOf(workspaceId)
    const deps = {
      conversationOf: (project: string, ticket: string) => this.orchestration.conversationOfTicket(project, ticket),
      dmOf: (dmId: string) => this.product.getDm(dmId),
    }
    return (projectId, ticketId) => ticketSeenByActor(deps, actor, { workspaceId, projectId, ticketId })
  }

  /**
   * Carbon P1-DM-2 (Probe 08:20): "Enquanto você estava fora" is read by the session, so what it says of a Task born in a private DM (the delivery, the question that waits, the initiative, the
   * watchdog's alert) reaches those outside the DM by the neutral title only. The owner of the DM reads the same window whole.
   * @param scope - Tenant.
   * @param view - The window as the proactivity host built it (for the person who owns the DM).
   */
  private maskWhileAway(scope: ProjectScopeRequest, view: WhileAwayView): WhileAwayView {
    const seenBy = this.ticketSeenFor(scope.workspaceId)
    const hidden = (taskId: string): boolean => taskId !== '' && !seenBy(scope.projectId, taskId)
    return {
      ...view,
      events: view.events.map(event => (hidden(event.taskId) ? { ...event, body: PRIVATE_DM_TASK_TITLE, taskTitle: PRIVATE_DM_TASK_TITLE } : event)),
      ...(view.waiting === undefined ? {} : { waiting: view.waiting.map(item => (hidden(item.taskId) ? { ...item, title: PRIVATE_DM_TASK_TITLE } : item)) }),
      ...(view.byPersona === undefined ? {} : {
        byPersona: view.byPersona.map(row => ({ ...row, tasks: row.tasks.map(task => (hidden(task.taskId) ? { ...task, taskTitle: PRIVATE_DM_TASK_TITLE } : task)) })),
      }),
    }
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

  /**
   * H15c: the shared secret of the GitHub webhook — the environment (tests) first, then the sealed slot, then the legacy record body
   * that older builds wrote in plaintext. Async because the vault is; the handler awaits it before checking the HMAC.
   * @param projectId - Tenant.
   * @returns The secret, or an empty string (which refuses every delivery).
   */
  async githubWebhookSecret(projectId: string): Promise<string> {
    const env = process.env.PERSONA_GITHUB_WEBHOOK_SECRET
    if (env !== undefined && env !== '') return env
    const sealed = await this.cofre.secretOf(projectId, connectorSlot(GITHUB_WEBHOOK_FACT))
    if (sealed !== undefined && sealed !== '') return sealed
    return this.vault.findActiveFact(projectId, GITHUB_WEBHOOK_FACT)?.body ?? ''
  }

  private mountGithubWebhook(ctx: Context): void {
    const server = webserverOf(ctx)
    if (server === undefined) return
    const handler = githubWebhookHandler({
      secretOf: (projectId: string) => this.githubWebhookSecret(projectId),
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
      // D-100: the model the call really ran on (`haiku`, `opus`…); the engine only stands in for a row that never recorded one.
      model: stored.model ?? stored.engine,
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

/** The quota a MEMBER reads: the same windows, with no account id, no account label and no vendor detail. */
function withoutAccountIdentity(view: OfficialQuotaView): OfficialQuotaView {
  const { accountId, accountLabel, detail, ...rest } = view
  void accountId
  void accountLabel
  void detail
  return rest
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

function runnersOf(ctx: Context): PersonaRunnersSlice | undefined {
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

/** A question in one line of at most 120 characters, cut at a word (never in the middle of one). */
function shortQuestion(question: string): string {
  const flat = question.replace(/\s+/gu, ' ').trim()
  if (flat.length <= 120) return flat
  const cut = flat.slice(0, 119)
  const space = cut.lastIndexOf(' ')
  return `${(space > 0 ? cut.slice(0, space) : cut).replace(/[\s,;:.–—-]+$/u, '')}…`
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
  const personaAsk = personaAskFromBody(event.body)
  const handoff = type === 'handoff' ? handoffFromBody(event.body) : undefined
  const review = type === 'review' ? reviewFromBody(event.body) : undefined
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
    ...(personaAsk === undefined ? {} : { personaAsk }),
    ...(handoff === undefined ? {} : { handoff }),
    ...(review === undefined ? {} : { review }),
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

/** W2-10: the name the person chose for a taught skill (1–80 letters, trimmed, one line); without one, the default of today. */
function skillTitleOf(value: string | undefined): string {
  const title = (value ?? '').replace(/\p{Cc}/gu, ' ').replace(/\s+/gu, ' ').trim()
  if (title === '') return 'Skill ensinada'
  if (Array.from(title).length > 80) throw new HostRemoteFault('invalid-payload', 'O nome da habilidade pode ter até 80 letras.')
  return title
}

/** EFF-1: a level typed by a client must be one the host stores. */
function effortOf(value: string): 'low' | 'medium' | 'high' | 'xhigh' | 'max' | 'ultra' {
  if (isEffortLevel(value)) return value
  throw new HostRemoteFault('invalid-payload', 'Escolha um dos níveis de esforço que o motor oferece.')
}

function asCli(value: string): 'claude' | 'codex' | 'cursor' | 'opencode' {
  if (value === 'claude' || value === 'codex' || value === 'cursor' || value === 'opencode') return value
  throw new Error('invalid-cli')
}

/** Harvest 19b: the failure of a mailbox login, in the categories the screen explains. */
function emailFailureOf(error: unknown): 'login' | 'network' | 'tls' | 'unknown' {
  const code = error instanceof Error && 'code' in error && typeof error.code === 'string' ? error.code : ''
  const text = error instanceof Error ? `${error.message} ${code}` : String(error)
  if (/NO\b|AUTHENTICATIONFAILED|LOGIN failed|invalid credentials/iu.test(text)) return 'login'
  if (/CERT|certificate|SSL|TLS/iu.test(text)) return 'tls'
  if (/timeout|ECONNREFUSED|ECONNRESET|ENOTFOUND|EAI_AGAIN|ETIMEDOUT|EHOSTUNREACH/iu.test(text)) return 'network'
  return 'unknown'
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
