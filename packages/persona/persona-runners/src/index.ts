/** Persona runners: engine Runner port adapters, DSH, OAR CLIs, coordination, MCP. */

export { default } from './plugin.ts'
export { default as PersonaRunners } from './plugin.ts'
export type { Config as PersonaRunnersConfig } from './plugin.ts'

export const PACKAGE_RUNNERS = 'persona-runners'

export {
  eventTime,
  RECOVERY_NOTE,
  toWorkerReport,
  type CliKind,
  type InfraFailureKind,
  type HistoryTurn,
  type NormalizedReport,
  type ReportState,
  type RunEvent,
  type RunHandle,
  type Runner as TurnRunner,
  type RunnerAuth,
  type RunnerCapabilities as TurnCapabilities,
  type RunnerHealth,
  type RunnerKind,
  type RunnerUsage,
  type StartTurnInput,
} from './contract.ts'

export { createScriptedRunner, scriptedHistory } from './scripted.ts'

export { createDshRunner, unboundDshHealth, type DshAgentEvent, type DshAgentPort, type DshRunnerOptions } from './dsh/runner.ts'

export {
  ROUTER_FORBIDDEN_TOOLS,
  ticketOfSession,
  toolsForRole,
  workerSessionId,
  type DeliverMode,
  type Runner,
  type RunnerBackground,
  type RunnerCapabilities,
  type RunnerEvent,
  type RunnerEventType,
  type RunnerRole,
  type RunnerStatus,
} from './port.ts'

export { createFakeRunner, type FakeDelivery, type FakeRunner, type FakeRunnerOptions, type FakeSessionSnapshot } from './fake.ts'
export { createDefaultHostRunner, createOpencodeHostRunner } from './host-runner.ts'

export {
  createDshSessionRunner,
  type DshBoundSession,
  type DshSessionPort,
  type DshSessionRunner,
  type DshSessionRunnerOptions,
} from './dsh/session-runner.ts'

export {
  createExecutorAdapter,
  type EngineExecutor,
  type ExecutorAdapterOptions,
  type ExecutorAssignment,
  type ExecutorTicket,
} from './executor-adapter.ts'

export {
  COORDINATION_SESSION_ID,
  coordinationPrompt,
  createCoordinationDriver,
  wordCount,
  type CoordinationDriver,
  type CoordinationDriverOptions,
  type CoordinationPersona,
} from './coordination/driver.ts'

export {
  personaMcpTools,
  servePersonaMcpTools,
  type PersonaMcpTool,
  type PersonaRunIdentity,
  type PersonaToolCall,
  type PersonaToolHooks,
  type ServeMcpToolsFn,
} from './mcp/persona-tools.ts'

export {
  createWatchdogDriver,
  WATCHDOG_SESSION_ID,
  type ClaimDue,
  type WatchdogAuditEntry,
  type WatchdogDriver,
  type WatchdogDriverOptions,
  type WatchdogPersona,
} from './watchdog/driver.ts'
export { withObserveGate, type ObserveGate, type ObserveGateOptions } from './proactivity/observe.ts'
export {
  WrongMachineError,
  assertLocalPersonaMachine,
  isLocalPersonaMachine,
} from './invite/local-machine.ts'

export {
  INFRA_BACKOFF_MS,
  INFRA_MAX_ATTEMPTS,
  buildHandoffPrompt,
  classifyInfraFailure,
  withInfraRecovery,
  type HandoffInput,
  type InfraRecoveryOptions,
} from './proactivity/recovery.ts'
export {
  GOAL_ROUND_DRIVER_NAME,
  GOAL_ROUND_DRIVER_PACKAGE,
  continueDshGoal,
  createGoalContinueDriver,
  renderPersonaGoalRound,
  type GoalBudget,
  type GoalContinueDriver,
  type GoalContinueOptions,
} from './proactivity/goal-continue.ts'
export {
  OWNER_NORMS,
  executorPrompt,
  prefixOwnerNorms,
  type ExecutorPersona,
} from './proactivity/owner-prompt.ts'
export {
  gradeLaziness,
  runLazinessSuite,
  scoreLazinessScenario,
  type LazinessGrade,
  type LazinessScenarioId,
  type LazinessScenarioResult,
  type LazinessSuiteOptions,
  type RunnerLazinessHint,
} from './proactivity/laziness.ts'
export {
  DRAFT_PERSONA_PROMPT,
  createDraftDriver,
  fallbackDraft,
  type DraftDriver,
  type DraftDriverOptions,
  type PersonaDraft,
} from './draft/driver.ts'
export {
  AI_MEMORY_FLAG,
  aiMemoryEnabled,
  createAiMemory,
  createDisabledAiMemory,
  createFakeAiMemory,
  type AiMemoryCapture,
  type AiMemoryClient,
  type AiMemoryHandoff,
} from './memory/ai-memory.ts'
export { createOarRunner, requireExplicitPermission, type OarRunnerOptions } from './oar/adapter.ts'
export { createOarSessionRunner, type OarSessionOptions } from './oar/session.ts'
export { CLAUDE_CAPABILITIES, createClaudeRunner, type ClaudeRunnerOptions } from './oar/claude.ts'
export { CODEX_CAPABILITIES, createCodexRunner, type CodexRunnerOptions } from './oar/codex.ts'
export { CLI_ISOLATION_VARS, nativeSessionEnv, restoreNativeCliLogin } from './oar/native-cli-env.ts'
export { createOpencodeRunner, OPENCODE_CAPABILITIES } from './oar/opencode.ts'
export { createCursorRunner, CURSOR_CAPABILITIES } from './oar/cursor.ts'
