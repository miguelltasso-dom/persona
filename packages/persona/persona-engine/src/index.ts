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
export { kanbanColumn, projectKanban, reviewThread } from './kanban.ts'
export type { KanbanColumn, KanbanProjection } from './kanban.ts'
export { internalSourceScope } from './sources.ts'
export type { InternalSourceKind } from './sources.ts'
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
export { formatRouterBenchReport, runRouterExperiment } from './bench/router.ts'
export type { RouterBenchCounts, RouterBenchResult } from './bench/router.ts'
export { formatEngineBenchReport, runEngineBench } from './bench/engine.ts'
export type { EngineBenchPhase, EngineBenchResult, EngineBenchSizes } from './bench/engine.ts'
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
  runCoordEval,
} from './bench/coord-eval.ts'
export type {
  CoordClass,
  CoordDecision,
  CoordEvalCell,
  CoordEvalReport,
  CoordPromptRound,
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
export { MemoryPromptStore, publishPrompt } from './prompts/store.ts'
export type { PromptSnapshot, PromptStore } from './prompts/store.ts'
export { watchdogSignals, watchdogWarnings, vigiaTick } from './watchdog.ts'
export type {
  WatchdogSignal, WatchdogSignalKind, WatchdogSnapshot, WatchdogWarning,
  VigiaAction, VigiaActionKind, VigiaAudit, VigiaPersonaState, VigiaRules, VigiaSnapshot,
} from './watchdog.ts'
export { applyProactivity, applyAutonomy, autonomyMode } from './proactivity.ts'
export { applyAttentionAnswer, citedCardTicketId } from './attention.ts'
export { approvalCard, milestoneSummary } from './approvals.ts'
export type { ApprovalCard } from './approvals.ts'
export {
  isOnShift, isOnShiftInZone, shouldRunDaily, shouldRunDailyInZone, shouldRunOnEvent, zonedParts,
} from './initiative.ts'
export type { InitiativeClock, InitiativeEvent, Shift, ZonedParts } from './initiative.ts'
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
export { verifyReady, continuationAfterReady } from './continue.ts'
export type { Continuation, FollowupProposal, ReadyCheck } from './continue.ts'
export {
  inSilence, mayPropose, nextProposalIntervalHours, spend, recordProposalOutcome, proposalDigest,
} from './budget.ts'
export type { AttentionBudget } from './budget.ts'
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
export {
  ASSIGNMENTS, INPUTS, TICKET_STATES, triggerCard, ticketCard, inputLine, assignmentLine,
  newestPage, ticketDetails, threadCard, decisionCard, decisionDetails, textPage,
} from './cards.ts'
export type { TicketCardState, TicketThread } from './cards.ts'
export {
  RESOURCES, resourceGrammar, resourceSpillPointer, resourceSpillId, readable, personaRead, personaRecall,
} from './resources.ts'
export type { SpillNode, RecallHop, ResourceHost } from './resources.ts'
