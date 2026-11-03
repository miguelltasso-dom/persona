/** Cordis plugin: `ctx.personaRunners` (D-025). */

import { Context, Service } from '@deepseek-ai/cordis'
import z from '@deepseek-ai/schemastery'
import { createCoordinationDriver, type CoordinationDriver, type CoordinationDriverOptions } from './coordination/driver.ts'
import { createExecutorAdapter, type EngineExecutor, type ExecutorAdapterOptions } from './executor-adapter.ts'
import { createFakeRunner, type FakeRunner, type FakeRunnerOptions } from './fake.ts'
import { createWatchdogDriver, type WatchdogDriver, type WatchdogDriverOptions } from './watchdog/driver.ts'
import { createClaudeRunner, type ClaudeRunnerOptions } from './oar/claude.ts'
import { createCodexRunner, type CodexRunnerOptions } from './oar/codex.ts'
import { createOpencodeRunner } from './oar/opencode.ts'
import { createCursorRunner } from './oar/cursor.ts'
import { restoreNativeCliLogin } from './oar/native-cli-env.ts'
import { createGoalContinueDriver, type GoalContinueDriver, type GoalContinueOptions } from './proactivity/goal-continue.ts'
import { executorPrompt, type ExecutorPersona } from './proactivity/owner-prompt.ts'
import { runLazinessSuite, type LazinessSuiteOptions, type RunnerLazinessHint } from './proactivity/laziness.ts'
import { withInfraRecovery, type InfraRecoveryOptions } from './proactivity/recovery.ts'
import { withObserveGate, type ObserveGate, type ObserveGateOptions } from './proactivity/observe.ts'
import { createDraftDriver, type DraftDriver, type DraftDriverOptions } from './draft/driver.ts'
import { createAiMemory, type AiMemoryClient } from './memory/ai-memory.ts'
import { resolveRunner, type ResolveRunnerOptions } from './resolve/resolve-runner.ts'
import { detectConnections, type ConnectionSnapshot, type DetectConnectionsOptions } from './resolve/connections.ts'
import type { AvailableInstallation, Runtime } from '@botiverse/oar'
import type { Runner } from './contract.ts'

type OarFactoryOptions = { runtime: Runtime; installation?: AvailableInstallation }

export interface Config {
  /** Optional isolated home for CLI config dirs. Empty uses the process home. */
  home: string
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Runner factories for Anvil orchestration. */
    personaRunners: PersonaRunners
  }
}

/**
 * Host-side runner factories. Anvil reads `ctx.personaRunners`.
 */
export default class PersonaRunners extends Service {
  static inject: string[] = []
  static Config: z<Config> = z.object({
    home: z.string().default(''),
  })

  readonly config: Config
  readonly createFakeRunner: (options?: FakeRunnerOptions) => FakeRunner
  readonly createCoordinationDriver: (options: CoordinationDriverOptions) => CoordinationDriver
  readonly createExecutorAdapter: (options: ExecutorAdapterOptions) => EngineExecutor
  readonly createWatchdogDriver: (options: WatchdogDriverOptions) => WatchdogDriver
  readonly createClaudeRunner: (options: ClaudeRunnerOptions) => Runner
  readonly createCodexRunner: (options: CodexRunnerOptions) => Runner
  readonly createOpencodeRunner: (options: OarFactoryOptions) => Runner
  readonly createCursorRunner: (options: OarFactoryOptions) => Runner
  readonly createGoalContinueDriver: (options: GoalContinueOptions) => GoalContinueDriver
  readonly withInfraRecovery: (inner: Runner, options?: InfraRecoveryOptions) => Runner
  readonly withObserveGate: (inner: Runner, options: ObserveGateOptions) => ObserveGate
  readonly executorPrompt: (persona: ExecutorPersona) => string
  readonly runLazinessSuite: (options?: LazinessSuiteOptions) => Promise<RunnerLazinessHint>
  readonly createDraftDriver: (options: DraftDriverOptions) => DraftDriver
  readonly createAiMemory: (options?: { enabled?: boolean; client?: AiMemoryClient }) => AiMemoryClient
  readonly resolveRunner: (options: ResolveRunnerOptions) => Promise<Runner>
  readonly detectConnections: (options?: DetectConnectionsOptions) => Promise<ConnectionSnapshot[]>

  /**
   * @param ctx - Host context.
   * @param config - Optional isolated home.
   */
  constructor(ctx: Context, config: Config = { home: '' }) {
    super(ctx, 'personaRunners')
    restoreNativeCliLogin()
    this.config = config
    this.createFakeRunner = createFakeRunner
    this.createCoordinationDriver = createCoordinationDriver
    this.createExecutorAdapter = createExecutorAdapter
    this.createWatchdogDriver = createWatchdogDriver
    this.createClaudeRunner = createClaudeRunner
    this.createCodexRunner = createCodexRunner
    this.createOpencodeRunner = createOpencodeRunner
    this.createCursorRunner = createCursorRunner
    this.createGoalContinueDriver = createGoalContinueDriver
    this.withInfraRecovery = withInfraRecovery
    this.withObserveGate = withObserveGate
    this.executorPrompt = executorPrompt
    this.runLazinessSuite = runLazinessSuite
    this.createDraftDriver = createDraftDriver
    this.createAiMemory = createAiMemory
    this.resolveRunner = (options: ResolveRunnerOptions) => {
      const home = options.home ?? (this.config.home === '' ? undefined : this.config.home)
      return home === undefined ? resolveRunner(options) : resolveRunner({ ...options, home })
    }
    this.detectConnections = (options?: DetectConnectionsOptions) => (
      options === undefined ? detectConnections() : detectConnections(options)
    )
  }
}
