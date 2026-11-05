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
  createHttpDshAgent,
  PROVIDER_BASE,
  vendorUsageOf,
  type DshProvider,
  type HttpDshAgentOptions,
} from './dsh/http-agent.ts'
export {
  LOCAL_BASE,
  LOCAL_LABEL,
  detectLocalProviders,
  isLocalProvider,
  probeLocalModels,
  type LocalModelCard,
} from './dsh/local.ts'

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
  classifySensitive,
  createMcpGateway,
  escapesWorktree,
  type McpCallResult,
  type McpGateway,
  type McpTurnLease,
  type PendingApproval,
  type SensitiveKind,
} from './mcp/gateway.ts'
export {
  ACTING_TOOLS,
  actingMcpTools,
  actingPortsFromComputerUse,
  gateComputerActing,
  type ActingPorts,
} from './mcp/acting-tools.ts'
export {
  BRAIN_TOOLS,
  brainMcpTools,
  type BrainPorts,
} from './mcp/brain-tools.ts'
export {
  GESTOR_TOOLS,
  gestorMcpTools,
  type GestorPorts,
} from './mcp/gestor-tools.ts'
export {
  EMAIL_SOURCE,
  emailMessageToTrigger,
  pollEmail,
  replyEmail,
  type EmailMessage,
} from './sources/email.ts'
export {
  TELEGRAM_SOURCE,
  pollTelegram,
  replyTelegram,
  telegramUpdateToTrigger,
  type TelegramUpdate,
} from './sources/telegram.ts'
export {
  outboundMcpTools,
  type OutboundPorts,
} from './sources/outbound-tools.ts'
export {
  VAULT_CALDAV,
  VAULT_DISCORD,
  VAULT_IMAP,
  VAULT_SLACK,
  VAULT_SMTP,
  VAULT_TELEGRAM,
} from './sources/vault-keys.ts'
export {
  SLACK_SOURCE,
  pollSlack,
  replySlack,
  slackEventToTrigger,
  type SlackEvent,
} from './sources/slack.ts'
export {
  DISCORD_SOURCE,
  discordMessageToTrigger,
  pollDiscord,
  replyDiscord,
  type DiscordMessage,
} from './sources/discord.ts'
export {
  CALENDAR_SOURCE,
  calendarEventToTrigger,
  parseIcsEvents,
  pollCalDav,
  type CalendarEvent,
} from './sources/calendar.ts'

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
  runMinimalLaziness,
  scoreLazinessScenario,
  type LazinessGrade,
  type LazinessScenarioId,
  type LazinessScenarioResult,
  type LazinessSuiteOptions,
  type RunnerLazinessHint,
} from './proactivity/laziness.ts'
export {
  DRAFT_PERSONA_PROMPT,
  STRUCTURE_PROMPT,
  createDraftDriver,
  fallbackDraft,
  type DraftDriver,
  type DraftDriverOptions,
  type PersonaDraft,
} from './draft/driver.ts'
export {
  AI_MEMORY_FLAG,
  aiMemoryEnabled,
  memoryNamespace,
  shouldCaptureAiMemory,
  createAiMemory,
  createDisabledAiMemory,
  createFakeAiMemory,
  type AiMemorySource,
  type AiMemoryCapture,
  type AiMemoryClient,
  type AiMemoryHandoff,
} from './memory/ai-memory.ts'
export { createOarRunner, requireExplicitPermission, type OarRunnerOptions } from './oar/adapter.ts'
export { createOarSessionRunner, type OarSessionOptions } from './oar/session.ts'
export { resolveGitExecutable, GitUnavailableError, type GitResolution, type GitResolutionOptions, type GitVersionProbe } from './resolve/git.ts'
export { createWindowsHistoryFileOps, WindowsHistoryFileError, type WindowsHistoryIo, type WindowsHistoryFileOptions, type WindowsFileFailure } from './workspace/windows-files.ts'
export { CLAUDE_CAPABILITIES, createClaudeRunner, type ClaudeRunnerOptions } from './oar/claude.ts'
export { CODEX_CAPABILITIES, createCodexRunner, type CodexRunnerOptions } from './oar/codex.ts'
export { CLI_ISOLATION_VARS, nativeSessionEnv, restoreNativeCliLogin } from './oar/native-cli-env.ts'
export {
  ACCOUNT_ISOLATION_VARS,
  ACCOUNT_AUTH_MARKERS,
  accountHomeDir,
  accountLoginStatus,
  accountIsolationEnv,
  accountsShareHome,
  prepareAccountHome,
  type AccountEngine,
} from './oar/account-home.ts'
export {
  accountAskNotice,
  formatAccountSwitch,
  pickProviderAccount,
  type AccountPick,
  type AccountPolicy,
  type AccountPolicyKind,
  type AccountPolicyScope,
  type AccountQuota,
  type ProviderAccount,
} from './resolve/accounts.ts'
export { checkRuntimeImports, type RuntimeImportCheck, type RuntimeImportName } from './resolve/runtime-imports.ts'
export {
  LOGIN_REQUIRED_PHRASES,
  classifyLoginOutput,
  mayBecomeLogin,
  type LoginRequiredMatch,
} from './oar/login-output.ts'
export {
  prepareIsolatedHome,
  type IsolatedHomeIo,
  type IsolatedHomePlan,
} from './oar/isolated-home.ts'
export { createOpencodeRunner, OPENCODE_CAPABILITIES } from './oar/opencode.ts'
export { createCursorRunner, CURSOR_CAPABILITIES } from './oar/cursor.ts'
export {
  RunnerResolveError,
  isRunnerResolveError,
  loginHintFor,
  loginCommandFor,
  providerLabel,
  resolveCaughtError,
  type RunnerResolveErrorCode,
  type RunErrorFields,
} from './resolve/errors.ts'
export {
  defaultRunnerPool,
  disposeRunnerSessions,
  modelForPurpose,
  modelForWork,
  prewarmCoordination,
  resolveRunner,
  type PersonaRunnerSpec,
  type ResolveRunnerOptions,
  type VaultSecretReader,
} from './resolve/resolve-runner.ts'
export {
  CHEAP_WORK,
  createSessionPool,
  idleTeamMayCallModel,
  isCheapWork,
  poolPurposeFor,
  sessionPoolKey,
  SESSION_LEASE_MS,
  SESSION_POOL_CAP,
  TRIAGE_CALL_CAP,
  triageCallsAllowed,
  type CheapWork,
  type RunnerPurpose,
  type SessionPool,
  type SessionPoolKey,
} from './resolve/session-pool.ts'
export {
  TRIAGE_MODELS,
  modelIsUnpinned,
  pickFastestModel,
} from './resolve/fastest-model.ts'
export {
  PROBE_CACHE_MS,
  cachedAuth,
  cachedModels,
  rememberAuth,
  rememberModels,
  resetProbeCache,
} from './resolve/probe-cache.ts'
export {
  detectConnections,
  pickConnectedCli,
  resetConnectionCache,
  toUiConnection,
  type ConnectionKind,
  type ConnectionSnapshot,
  type ConnectionUiRow,
  type DetectConnectionsOptions,
} from './resolve/connections.ts'
export {
  officialQuotaPuts,
  persistOfficialQuotaPuts,
} from '@deepseek-ai/dsh-persona-usage'
export {
  meterCacheOf,
  meterTurnKind,
  withUsageMeter,
  usageStoreSink,
  type MeasuredUsage,
  type MeterTurnKind,
  type UsageMeterOptions,
  type UsageMeterSink,
  type UsageStorePort,
} from './resolve/usage-meter.ts'
export {
  allowsTool,
  classifyToolAccess,
  effectiveToolLevel,
  toolNameFromEvent,
  withToolLevel,
  type ToolLevel,
} from './resolve/tool-level.ts'
export {
  PRECISA_DE_VOCE,
  assertCliNeverPrompt,
  cliPermissionOf,
  cliPolicyOf,
  grantsOf,
  isPermissionAsk,
  type CliPermissionMode,
  type CliSessionPolicy,
  type ToolGrants,
} from './resolve/cli-policy.ts'
export {
  RESOLVER_SMOKE_MAX_EXEC,
  RESOLVER_SMOKE_PROMPT,
  runResolverSmoke,
  runWarmPairSmoke,
  type ResolverSmokeOptions,
  type ResolverSmokeRow,
  type WarmPairRow,
  type WarmPairTiming,
} from './resolve/smoke.ts'
export { probeCliBinary, quotaExhausted, PROBE_TIMEOUT_MS } from './resolve/probe.ts'
export {
  RESOURCE_CHILD_CAP,
  RESOURCE_CONNECTION_CAP,
  RESOURCE_TURN_CAP,
  SOURCE_REQUEST_CAP,
  createProcessBudget,
  measureResourceBudget,
  wouldExceedTurnBudget,
  withSourceRequest,
  type ProcessBudget,
  type ResourceSnapshot,
} from './resolve/resource-budget.ts'
export {
  evaluateSpend,
  withSpendBudget,
  type SpendBudgetOptions,
  type SpendDecision,
  type SpendKind,
  type SpendLedger,
  type SpendLimits,
} from './resolve/spend-budget.ts'
export {
  REAL_TURN_CAP_ENV,
  REAL_TURN_LEDGER_ENV,
  RealTurnCapError,
  isRealTurnCapError,
  realTurnCapFromEnv,
  reserveRealTurn,
  withRealTurnCap,
  type RealTurnCapOptions,
  type RealTurnCapReason,
} from './resolve/real-turn-cap.ts'
export {
  quotaVerdict,
  withQuotaRecheck,
  type QuotaRecheckOptions,
  type QuotaVerdict,
} from './resolve/quota-recheck.ts'
