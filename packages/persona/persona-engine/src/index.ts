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
export {
  NoticeLog,
  PERSONA_ROUTE_LIMIT,
  personaAck,
  personaHandback,
  personaReport,
  personaRoute,
  personaThreadFollow,
} from './router/handlers.ts'
export type { Notice, RouteDecision, RouteItemResult } from './router/handlers.ts'
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
} from './views/index.ts'
export type {
  OverviewView, TicketRowView, TicketDetailView, BasisFact, ThreadRowView, TimelineTurn,
  DecisionRowView, SearchHit, ViewHost, ExecutorLoad,
} from './views/index.ts'
export {
  ASSIGNMENTS, INPUTS, TICKET_STATES, triggerCard, ticketCard, inputLine, assignmentLine,
  newestPage, ticketDetails, threadCard, decisionCard, decisionDetails, textPage,
} from './cards.ts'
export type { TicketCardState, TicketThread } from './cards.ts'
export {
  RESOURCES, resourceGrammar, resourceSpillPointer, resourceSpillId, readable, personaRead, personaRecall,
} from './resources.ts'
export type { SpillNode, RecallHop, ResourceHost } from './resources.ts'
