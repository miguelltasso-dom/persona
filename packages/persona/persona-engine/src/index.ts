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
export { watchdogSignals, watchdogWarnings } from './watchdog.ts'
export type { WatchdogSignal, WatchdogSignalKind, WatchdogSnapshot, WatchdogWarning } from './watchdog.ts'
export { applyProactivity } from './proactivity.ts'
export type { ObservedAction, ProactivityMode, ProactivityRule } from './proactivity.ts'
