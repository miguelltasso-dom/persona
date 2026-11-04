/** Persona Super-agent engine. */

/** Package identity marker used by the skeleton smoke test. */
export const PACKAGE_ENGINE = 'persona-engine'

export * from './core/index.ts'
export {
  EffectQueue,
  Later,
  MemoryEffectPersistence,
} from './effects.ts'
export type {
  EffectHandler,
  EffectKind,
  EffectPayloads,
  EffectPersistence,
  EffectRecord,
} from './effects.ts'
export { MemoryOutbox } from './outbox.ts'
export type { OutboxPass } from './outbox.ts'
export {
  kanbanColumn,
  legacyColumnLabelToCategory,
  legacyKanbanToCategory,
  projectKanban,
  reviewThread,
} from './kanban.ts'
export type { KanbanColumn, KanbanProjection } from './kanban.ts'
export {
  WorkflowError,
  applyCategoryToTicket,
  moveToColumn,
  projectBoardCard,
  resolveColumn,
  stageBlocked,
  stageCategory,
  syncPlacementFromStage,
} from './workflow.ts'
export type { TicketPlacement, WorkflowFail } from './workflow.ts'
export {
  WORKFLOW_TEMPLATES,
  MemoryPlacementStore,
  MemoryWorkflowStore,
  applyWorkflowEdit,
  assertWorkflow,
  boardCounts,
  columnOccupancy,
  firstColumnOf,
  parseWorkflowProposal,
  proposeWorkflow,
  workflowFromTemplate,
  workflowTemplateById,
  wipWarning,
} from '@deepseek-ai/dsh-persona-core'
export type {
  BoardCounts,
  PlacementStore,
  ProjectWorkflow,
  StageCategory,
  TicketBoardSeat,
  WorkflowColumn,
  WorkflowField,
  WorkflowFieldKind,
  WorkflowProposal,
  WorkflowStore,
  WorkflowTemplate,
  WorkflowTemplateId,
} from '@deepseek-ai/dsh-persona-core'
export {
  COMPANY_MODELS,
  applyGovernanceFix,
  assessTeamHealth,
  assignPersonaCharge,
  confirmPersonaCharge,
  defaultSectorPolicy,
  escalationChain,
  inheritPersonaCharge,
  orgChart,
  parseStructureAsk,
  recommendStructure,
  resolveApproval,
  runTwoDayTest,
} from '@deepseek-ai/dsh-persona-core'
export type {
  ApprovalAudit,
  ApprovalRoute,
  GovernanceAutonomy,
  GovernanceFix,
  GovernanceSnapshot,
  HealthReport,
  PersonaCharge,
  Sector,
  StructureRecommendation,
  TwoDayResult,
} from '@deepseek-ai/dsh-persona-core'
export {
  bindSprintGoal,
  closeSprint,
  openSprint,
  planSprint,
  sprintDaysLeft,
  sprintGoal,
  sprintMilestone,
  unfinishedInSprint,
  MemorySprintBoard,
} from './sprint.ts'
export type { CloseSprintResult, Sprint, SprintBoard, SprintRollover, SprintStatus } from './sprint.ts'
export { internalSourceScope } from './sources.ts'
export type { InternalSourceKind } from './sources.ts'
export {
  CALENDAR_SOURCE,
  DISCORD_SOURCE,
  EMAIL_SOURCE,
  SLACK_SOURCE,
  TELEGRAM_SOURCE,
  allExternalSourceScope,
  composeSourceScope,
  externalSourceScope,
  originReply,
  receiveExternal,
  receiveExternalBatch,
} from './sources/external.ts'
export type { ExternalChannelSource, OriginReply } from './sources/external.ts'
export {
  GITHUB_SOURCE,
  commentTrigger,
  githubAddress,
  githubChannel,
  githubWebhookToIntake,
  isHumanLogin,
  issueTrigger,
  pullTrigger,
  pullsOf,
} from './sources/github/index.ts'
export type {
  GithubComment,
  GithubIntake,
  GithubIssue,
  GithubUser,
  GithubWebhook,
  GithubWebhookName,
  PullRef,
} from './sources/github/index.ts'
export { formatRouterBenchReport, formatRouterScaleReport, runRouterExperiment, runRouterScaleBench } from './bench/router.ts'
export type { RouterBenchCounts, RouterBenchResult, RouterScaleResult } from './bench/router.ts'
export { formatEngineBenchReport, runEngineBench } from './bench/engine.ts'
export type { EngineBenchPhase, EngineBenchResult, EngineBenchSizes } from './bench/engine.ts'
export {
  DEFAULT_PRE_ROUTE,
  MemoryPreRouteLog,
  nearRatio,
  normalizeRouteText,
  preRoute,
  preRouteToCoord,
  routeHash,
} from './preroute/rules.ts'
export type {
  PreRouteAction, PreRouteInput, PreRouteResult, PreRouteRule, PreRouteRules, PreRouteTrail, RouteWindowEntry,
} from './preroute/rules.ts'
export {
  COORD_PROMPT_BEFORE,
  COORD_REAL_IDS,
  COORD_REAL_SCENARIOS,
  COORD_SCENARIOS,
  collectTurnText,
  coordDecisionPrompt,
  decideFake,
  decideFromModelText,
  formatCoordEvalReport,
  formatRealCoordEval,
  coordPreInput,
  measurePreRoute,
  overlayPreRoute,
  runCoordEval,
} from './bench/coord-eval.ts'
export type {
  CoordClass,
  CoordDecision,
  CoordEvalCell,
  CoordEvalReport,
  CoordPromptRound,
  PreRouteEvalReport,
  CoordScenario,
  RealCoordCell,
  RealCoordRound,
  TurnDelta,
} from './bench/coord-eval.ts'
export {
  GitReviewDelivery,
  REVIEW_BRANCH_PREFIX,
  REVIEW_PATCH_LIMIT_BYTES,
  confineWorktreeWrite,
  parseNumstat,
  looksLikeCredential as reviewLooksLikeCredential,
  redactSecrets,
  testsClaimedOf,
} from './review/index.ts'
export type {
  GitReviewOptions,
  MergeMode,
  ReviewAcceptResult,
  ReviewDelivery,
  ReviewFileChange,
  ReviewSummary,
  ReviewWorktree,
} from './review/index.ts'
export {
  DAY_MS,
  DEFAULT_RETENTION,
  MemoryRetention,
  RETENTION_KINDS,
  applyRetention,
  windowOf,
} from './retention.ts'
export type {
  RetentionApplyResult,
  RetentionKind,
  RetentionPolicy,
  RetentionRecord,
  RetentionStore,
  RetentionWindow,
} from './retention.ts'
export {
  ROUTER_FORBIDDEN_TOOLS,
  ticketOfSession,
  toolsForRole,
  workerSessionId,
} from './ports/runner.ts'
export type {
  DeliverMode,
  Runner,
  RunnerBackground,
  RunnerCapabilities,
  RunnerEvent,
  RunnerEventType,
  RunnerRole,
  RunnerStatus,
} from './ports/runner.ts'
export { WorkerSlots } from './executor/slots.ts'
export type { SlotKind } from './executor/slots.ts'
export {
  PrepareFailed,
  TRANSIENT_BACKOFF_MS,
  TRANSIENT_TRIES,
  nextTransientBackoff,
  transient,
} from './executor/errors.ts'
export { FakeClock, FakeRunner } from './executor/fake.ts'
export type { FakeScript } from './executor/fake.ts'
export { bindExecutorEffects, redeliverUnread } from './executor/handlers.ts'
export type { ExecutorHost } from './executor/handlers.ts'
export { BACKGROUND_LIMIT_MS, idleOutcome, resumeExecutor } from './executor/resume.ts'
export { addWorktree, worktreeArgv, worktreePath } from './executor/worktree.ts'
export { PathEscapeError, confineAbsolute, confinePath, confineSegment } from './executor/confine.ts'
export {
  NoticeLog,
  PERSONA_ROUTE_LIMIT,
  bindRunIdentity,
  personaAck,
  personaAckFromRun,
  personaHandback,
  personaReport,
  personaReportFromRun,
  personaProposeFromModel,
  personaReportFromModel,
  personaRoute,
  personaRouteFromModel,
  personaThreadFollow,
} from './router/handlers.ts'
export type { ModelApplyResult, Notice, RouteDecision, RouteItemResult } from './router/handlers.ts'
export {
  MODEL_DEGRADE,
  MODEL_JSON_LIMIT,
  MODEL_REPAIR_LIMIT,
  dirtyMulberry32,
  dirtySample,
  extractJsonText,
  normalizeModelText,
  parseCoordDecision,
  parseProposalPayload,
  parseReportPayload,
  parseRoutePayload,
} from './parse/model-output.ts'
export type {
  ModelDegrade,
  ModelParseKind,
  ModelParseResult,
  ParseStatus,
  ParsedCoordDecision,
  ParsedRouteDecision,
} from './parse/model-output.ts'
export { MasterAssessor } from './router/assessor.ts'
export type { ThreadContext } from './router/assessor.ts'
export {
  PROMPT_PLACEHOLDERS,
  PROMPT_TEMPLATES,
  composePrompt,
  missingPlaceholders,
} from './prompts/templates.ts'
export type { ComposePromptInput, PromptIdentity, PromptPart } from './prompts/templates.ts'
export {
  TALK_CONTEXT_LIMIT,
  capTalkContext,
  composeTalkPrompt,
  talkPolicy,
  wrapAsData,
} from './prompts/talk.ts'
export { composeHostTalk, composePersonaStable, composeTalkStable, finalizeTalkReply, finishHostTalk, foldHostTalkUsed, measureLeanVsNaive } from './prompts/talk-output.ts'
export type { HostTalkCompose, HostTalkInput, HostTalkUsedFold, HostTalkUsedRow, LeanVsNaiveReport } from './prompts/talk-output.ts'
export type { TalkColleague, TalkPromptInput } from './prompts/talk.ts'
export {
  ENGINE_COPY,
  composePersonaPrompt,
  composeVoicePolicy,
  engineCopyOf,
  resolveEngineLocale,
  voiceFingerprint,
  voiceSurfaceHint,
} from './prompts/voice.ts'
export type { ComposePersonaPromptInput, EngineCopy, EngineLocale, PersonaVoiceFields, VoiceSurface } from './prompts/voice.ts'
export {
  PREFIX_LAYER_ORDER,
  VARIABLE_LAYER_BUDGET,
  assertPrefixStable,
  clipTextToTokens,
  composeStablePrefix,
  composeTurnPrompt,
  measureOpt3Acceptance,
  measureOpt4Acceptance,
  prefixCacheHitRate,
  prefixLooksVolatile,
  toolsForTurn,
  trimVariableAlreadyInPrefix,
} from './prompts/stable-prefix.ts'
export type { Opt3Acceptance, Opt4Acceptance, StablePrefix, StablePrefixInput } from './prompts/stable-prefix.ts'
export {
  CHANNEL_WORD_LIMIT,
  INITIATIVE_DAILY_TOKEN_BUDGET,
  batchInitiative,
  capChannelReply,
  leanChannelReply,
  formatLeanStructuredReport,
  countWords,
  initiativeCadenceDays,
  measureOpt6Acceptance,
  trimInitiativeToBudget,
} from './lean-output.ts'
export type { InitiativeBatch, InitiativeDraft, LeanStructuredReport, Opt6Acceptance } from './lean-output.ts'
export { engineClassForTurn, measureOpt5Acceptance, sessionReuseForTurn } from './engine-policy.ts'
export type { EngineClass, Opt5Acceptance, SessionReuse } from './engine-policy.ts'
export { MemoryPromptStore, publishPrompt } from './prompts/store.ts'
export type { PromptSnapshot, PromptStore } from './prompts/store.ts'
export { watchdogSignals, watchdogWarnings, vigiaTick } from './watchdog.ts'
export type {
  WatchdogSignal, WatchdogSignalKind, WatchdogSnapshot, WatchdogWarning,
  VigiaAction, VigiaActionKind, VigiaAudit, VigiaPersonaState, VigiaRules, VigiaSnapshot,
} from './watchdog.ts'
export { applyProactivity, applyAutonomy, autonomyMode } from './proactivity.ts'
export { computeActivationFunnel, computePersonaImpact, listPersonaImpact } from './insights.ts'
export type { ActivationFunnel, FunnelStage, InsightEvent, InsightEventKind, PersonaImpact } from './insights.ts'
export { routeApproval } from './governance.ts'
export type { ApprovalDelivery } from './governance.ts'
export { applyAttentionAnswer, citedCardTicketId } from './attention.ts'
export { approvalCard, milestoneSummary } from './approvals.ts'
export type { ApprovalCard } from './approvals.ts'
export {
  isOnShift, isOnShiftInZone, shouldRunDaily, shouldRunDailyInZone, shouldRunOnEvent, zonedParts,
} from './initiative.ts'
export type { InitiativeClock, InitiativeEvent, Shift, ZonedParts } from './initiative.ts'
export { initiativeSetClean, proposalReasonOf, proposalTitleOf, scoreInitiative } from './initiative-quality.ts'
export type {
  ExistingWorkItem, InitiativeQualityInput, InitiativeQualityResult, InitiativeReject, InitiativeRejectWhy,
  ProjectFact, ScoredProposal,
} from './initiative-quality.ts'
export { adjustBudgetFromFeedback, learnFromFeedback, memoryFromFeedback, skillCandidateFromFeedback } from './feedback-learn.ts'
export {
  TEACH_CONSENT_VERSION,
  TEACH_RETENTION_DAYS,
  acceptTaughtCandidate,
  activateTaughtSkill,
  assertTeachConsent,
  draftTaughtSkill,
  editTaughtSteps,
  fakeVisionPort,
  omitBlurredTeachFrames,
  publishTaughtSkill,
  redactTeachNarration,
  rollbackTaughtSkill,
  sampleKeyFrames,
  teachRetentionExpiresAt,
  teachShouldPurge,
  listTeachArtifactsToPurge,
} from './teach.ts'
export { deliverWorkingSend, flushWorkingQueue } from './working-deliver.ts'
export type {
  TeachArtifactStamp, TeachFrame, TeachStepDraft, TeachTranscriptSlice, TaughtSkillDraft, TaughtStepEdit, VisionDescribe, VisionPort,
} from './teach.ts'
export {
  DEFAULT_COMPUTER_USE_LIMITS,
  YOU_TOOK_OVER,
  assertComputerUsePlan,
  classifyComputerAction,
  createMemorySharedControl,
  fakeActPort,
  fakeObservePort,
  fakePermissionPort,
  noteHumanInput,
  projectReplayForUi,
  resumeSharedControl,
  runComputerUse,
  runningControl,
  treeNames,
  verifyExpectation,
  walkA11y,
} from './computer-use.ts'
export type {
  A11yBounds,
  A11yNode,
  ActResult,
  ComputerAction,
  ComputerSensitiveKind,
  ComputerUseLimits,
  ComputerUsePlan,
  ComputerUseReport,
  ComputerUseStatus,
  ComputerUseStep,
  ControlOwner,
  ControlReason,
  DesktopActPort,
  DesktopObservePort,
  PermissionDecision,
  ReplayEntry,
  ReplayResult,
  ReplaySaw,
  ScreenObservation,
  SharedControl,
  SharedControlPort,
  StepExpectation,
  StepPermissionPort,
} from './computer-use.ts'
export { DEFAULT_GESTOR_LIMITS } from '@deepseek-ai/dsh-persona-core'
export {
  runAssembleTeam,
  runGestorAssemble,
  runGestorAllocate,
  runGestorComment,
  runGestorHire,
  runGestorReorganize,
  runGestorTie,
  proposeGestorChannelBody,
  emitGestorPropose,
  gestorInitiative,
} from './gestor.ts'
export { measureGestorAcceptance, measureGestorToolsAcceptance, measureGestorV1 } from './gestor-accept.ts'
export type { GestorAcceptance, GestorToolsAcceptance } from './gestor-accept.ts'
export {
  activityFromDomainEvent,
  activityFromReport,
  recordTurnActivity,
  withTurnActivityEmit,
  activityKindOfTool,
  activityStatusOfReport,
  batchRouterBurst,
  foldTurnActivity,
  foldTurnActivityBook,
} from './activity.ts'
export type { GestorAssemble, GestorDecision, GestorInitiative } from './gestor.ts'
export type { TurnActivityBook } from './activity.ts'
export {
  PAIR_REAL_LIMIT,
  PAIR_REAL_TURN_MS,
  PAIR_TASKS,
  PAIR_TASK_IDS,
  TOKEN_REGRESSION_RATIO,
  TOKEN_SCENARIO_BASELINES,
  TOKEN_SCENARIO_IDS,
  assertPairAcceptable,
  assertScenarioRegression,
  collectPairUsage,
  comparePair,
  compareScenariosToBaseline,
  formatOpt8AcceptanceMarkdown,
  formatTokenMeasureReport,
  formatTokensBaselineMarkdown,
  ledgerFromTurnLayers,
  measureEngineLevers,
  measureOpt8Acceptance,
  measureOpt8View,
  pairVerdict,
  recordOverhead,
  runPairArm,
  runPairedSuite,
  runPairedTask,
  runTokenScenario,
  scorePairQuality,
} from './token-measure.ts'
export type {
  EngineLeverReport,
  Opt8Acceptance,
  Opt8MeasureView,
  PairArm,
  PairEngine,
  PairPath,
  PairResult,
  PairRunInput,
  PairRunner,
  PairTask,
  PairTaskId,
  PairUsageEvent,
  PairVerdict,
  ScenarioBaselineRow,
  TokenScenarioId,
  TokenScenarioReport,
} from './token-measure.ts'
export {
  acceptLibrarianProposal,
  curateAfterWork,
  gateRememberedPermission,
  gateRememberedPermissionPages,
  rememberApprovalPermission,
  revokeRememberedPermission,
  runBrainHygiene,
  spendRememberedPermission,
} from './second-brain.ts'
export type {
  LibrarianAction,
  LibrarianFact,
  LibrarianPolicy,
  PermissionConsult,
  PermissionGrant,
} from './second-brain.ts'
export { bindTicketToSubject, subjectThreadRef, threadKeyForSubject, ticketSubjectChip } from './subject-thread.ts'
export type { TicketSubjectLink } from './subject-thread.ts'
export type {
  FeedbackEvent, FeedbackKind, FeedbackLearnResult, LearnedMemory, LearnedSkillCandidate,
} from './feedback-learn.ts'
export {
  TALK_EVAL_SCENARIOS, TALK_REAL_LIMIT, decideTalkFake, runTalkEval, scoreTalkReply, talkDecisionFromModel, talkEvalPrompt,
} from './bench/talk-eval.ts'
export type { TalkEvalCell, TalkEvalClass, TalkEvalReport, TalkEvalScenario, TalkReplyScore } from './bench/talk-eval.ts'
export { lazinessHint, scoreLaziness } from './laziness.ts'
export type { LazinessRun, LazinessScenario, LazinessScore } from './laziness.ts'
export {
  channelMessageToTrigger, dmMessageToTrigger, internalMessageToTrigger, routineFireToTrigger,
} from './sources/internal.ts'
export type { InternalMessage } from './sources/internal.ts'
export type { AutonomyDecision, AutonomyLevel, ObservedAction, ProactivityMode, ProactivityRule } from './proactivity.ts'
export {
  isEligible, nextEligible, wakeDependents, afterAssignmentSettled,
} from './pull.ts'
export type { EligibleTicket, PullContext, SettledReport } from './pull.ts'
export {
  emptyQueueDecision, spendsModel, ticketGoal, MemoryGoalBoard,
} from './goals.ts'
export type { GoalActivation, GoalBoard, GoalPhase, PersonaGoal, QueueDecision } from './goals.ts'
export { verifyReady, continuationAfterReady, looksLikeHesitantOffer, refuseHesitantOffer } from './continue.ts'
export { scoreProactivityAcceptance } from './proactivity-accept.ts'
export type { ProactivityAcceptance, ProactivityAcceptanceInput } from './proactivity-accept.ts'
export { measureProactivityAcceptance, measureProactivityV1 } from './proactivity-measure.ts'
export { assertV1Close, formatV1CloseMarkdown, measureV1Close, measureV1CloseView } from './v1-close.ts'
export type { V1CloseMeasure, V1CloseMeasureView } from './v1-close.ts'
export type { ProactivityMeasure } from './proactivity-measure.ts'
export type { Continuation, FollowupProposal, ReadyCheck } from './continue.ts'
export {
  inSilence, leftoverOnProject, mayPropose, maySpendOnProject, nextProposalIntervalHours,
  proposalDigest, recordProposalOutcome, spend, spendOnProject,
} from './budget.ts'
export type { AttentionBudget, ProjectSpend } from './budget.ts'
export {
  overview, needsYou, ticketList, ticketRow, ticketSummary, ticketDetail, basisFacts,
  threadList, threadDetail, encodeCursor, decodeCursor, decisionList, decisionRow, search,
  page, newestFirst, stamp, listDecisions, knownTriggers, turnsFromRepo, preview, capped,
  honestState, nowOverview, whileAway,
} from './views/index.ts'
export type {
  OverviewView, TicketRowView, TicketDetailView, BasisFact, ThreadRowView, TimelineTurn,
  DecisionRowView, SearchHit, ViewHost, ExecutorLoad,
  HonestState, NowOverview, PersonaLoad, PersonaNow, WhileAway,
} from './views/index.ts'
export {
  HOUR_MS,
  SOAK_DAYS,
  SOAK_PERSONAS,
  SOAK_PROJECTS,
  SOAK_SEED,
  formatSoakReport,
  openMemorySoak,
  runSoak,
} from './soak/sim.ts'
export type {
  SoakOpen, SoakOutbox, SoakPersistence, SoakReport, SoakSize,
} from './soak/sim.ts'
export { CrashError, FaultyRepositories } from './crash/faulty.ts'
export { CRASH_STEPS, formatCrashReport, openCrashWorld, runCrashSweep } from './crash/sweep.ts'
export type { CrashOpen, CrashReport, CrashStep, CrashStepResult } from './crash/sweep.ts'
export {
  ASSIGNMENTS, INPUTS, TICKET_STATES, triggerCard, ticketCard, inputLine, assignmentLine,
  newestPage, ticketDetails, threadCard, decisionCard, decisionDetails, textPage,
} from './cards.ts'
export type { TicketCardState, TicketThread } from './cards.ts'
export {
  RESOURCES, resourceGrammar, resourceSpillPointer, resourceSpillId, readable, personaRead, personaRecall,
} from './resources.ts'
export type { SpillNode, RecallHop, ResourceHost } from './resources.ts'
