/** Persona runners: engine Runner port adapters, DSH, OAR CLIs, coordination, MCP. */

export const PACKAGE_RUNNERS = 'persona-runners'

export {
  eventTime,
  RECOVERY_NOTE,
  toWorkerReport,
  type CliKind,
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

export { createOarRunner, requireExplicitPermission, type OarRunnerOptions } from './oar/adapter.ts'
export { createOarSessionRunner, type OarSessionOptions } from './oar/session.ts'
export { CLAUDE_CAPABILITIES, createClaudeRunner, type ClaudeRunnerOptions } from './oar/claude.ts'
export { CODEX_CAPABILITIES, createCodexRunner } from './oar/codex.ts'
export { createOpencodeRunner, OPENCODE_CAPABILITIES } from './oar/opencode.ts'
export { createCursorRunner, CURSOR_CAPABILITIES } from './oar/cursor.ts'
