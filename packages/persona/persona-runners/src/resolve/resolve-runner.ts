/**
 * Resolve a persona runner spec to a live TurnRunner (Anvil: ctx.personaRunners.resolveRunner).
 */

import { mkdirSync } from 'node:fs'
import type { AvailableInstallation, Runtime } from '@botiverse/oar'
import type { AutonomyLevel } from '@deepseek-ai/dsh-persona-engine'
import type { CliKind, Runner, StartTurnInput } from '../contract.ts'
import { createHttpDshAgent, type DshProvider } from '../dsh/http-agent.ts'
import { createDshRunner, type DshAgentPort } from '../dsh/runner.ts'
import { createClaudeRunner } from '../oar/claude.ts'
import { createCodexRunner } from '../oar/codex.ts'
import { createCursorRunner } from '../oar/cursor.ts'
import { createOpencodeRunner } from '../oar/opencode.ts'
import { createScriptedRunner } from '../scripted.ts'
import { withInfraRecovery, type InfraRecoveryOptions } from '../proactivity/recovery.ts'
import { withObserveGate } from '../proactivity/observe.ts'
import {
  accountIsolationEnv,
  prepareAccountHome,
  type AccountEngine,
} from '../oar/account-home.ts'
import { nativeSessionEnv } from '../oar/native-cli-env.ts'
import { withEnvMode } from '../oar/env-mode.ts'
import { withChoiceReport } from '../oar/choice-report.ts'
import { mergeFlagSettings, settingsArgs } from '../oar/flag-settings.ts'
import { syncSkillsRoot } from '../oar/personal-skills.ts'
import { CLI_ENV_SWITCH, cliEnvMode, isolationPlan, type CallKind } from '../oar/isolation.ts'
import { connectorFallback, type ConnectorFallback } from '../oar/connector-reach.ts'
import type { ConnectorUnreached } from '../contract.ts'
import { defaultIsolationRuntime, type IsolationDecision, type IsolationRuntime } from '../oar/isolation-gate.ts'
import { withPermissionReport, type PermissionGate } from './permission-gate.ts'
import { prepareIsolatedHome, type IsolatedHomeIo } from '../oar/isolated-home.ts'
import { pickProviderAccount, type AccountPolicy, type AccountQuota, type ProviderAccount } from './accounts.ts'
import { RunnerResolveError, resolveCaughtError } from './errors.ts'
import { asProbe, PROBE_TIMEOUT_MS, withTimeout } from './probe.ts'
import { quotaVerdict, withQuotaRecheck } from './quota-recheck.ts'
import { assertCliNeverPrompt, cliPolicyOf } from './cli-policy.ts'
import { pickFastestModel } from './fastest-model.ts'
import { cachedAuth, cachedModels, rememberAuth, rememberModels } from './probe-cache.ts'
import {
  createSessionPool,
  poolPurposeFor,
  sessionPoolKey,
  triageCallsAllowed,
  type RunnerPurpose,
  type SessionPool,
} from './session-pool.ts'
import { effectiveToolLevel, withToolLevel, type ToolLevel } from './tool-level.ts'
import {
  meterTurnKind,
  usageStoreSink,
  withUsageMeter,
  type MeterTurnKind,
  type UsageMeterSink,
  type UsageStorePort,
} from './usage-meter.ts'
import { isLocalProvider } from '../dsh/local.ts'
import { realTurnCapFromEnv, withRealTurnCap } from './real-turn-cap.ts'
import { withSpendBudget, type SpendBudgetOptions } from './spend-budget.ts'

export type PersonaRunnerSpec =
  | { kind: 'dsh'; model: string; talkModel?: string; provider?: DshProvider; baseUrl?: string }
  | { kind: 'cli'; cli: CliKind; model: string; talkModel?: string; effort?: string }

export interface VaultSecretReader {
  get(personId: string, provider: string): Promise<string | undefined>
}

export interface ResolveRunnerOptions {
  spec: PersonaRunnerSpec
  permissionMode: NonNullable<StartTurnInput['permissionMode']>
  /** Persona grant. Default `write` (current runners). Overrides `tools`. */
  toolLevel?: ToolLevel
  /** Per-tool grants from the persona spec; reduced via `effectiveToolLevel`. */
  tools?: Readonly<Record<string, ToolLevel>>
  autonomy?: AutonomyLevel
  home?: string
  /** WAVE2 isolated account dir. Never copies native credentials. */
  accountHome?: string
  /** WAVE2 account id (pool key + quota). */
  accountId?: string
  /** WAVE2 accounts + policy. When set, Rivet picks at the limit before opening a session. */
  accounts?: readonly ProviderAccount[]
  accountPolicy?: AccountPolicy
  accountQuotas?: readonly AccountQuota[]
  personaName?: string
  /** Injectable fs for isolated-home tests. Production omits this. */
  homeIo?: IsolatedHomeIo
  vault?: VaultSecretReader
  personId?: string
  agent?: DshAgentPort
  runtime?: Runtime
  usage?: UsageMeterSink
  usageStore?: UsageStorePort
  usageScope?: { personaId: string; projectId: string }
  /** OPT-1 ledger kind. Talk defaults to triage; leftover `exec`/`eval` go through `usagePortKind`. */
  turnKind?: MeterTurnKind | 'exec' | 'eval' | 'talk' | 'task'
  /** OPT-5: cheap triage calls already spent on this message. */
  triageCallsAlready?: number
  infra?: InfraRecoveryOptions
  cwd?: string
  /** talk = cheap model + warm session; task = persona model. */
  purpose?: RunnerPurpose
  projectId?: string
  pool?: SessionPool<Runner>
  /** Injected fetch for HTTP DSH tests. */
  fetch?: typeof fetch
  /** Environment read for the real-turn cap (`PERSONA_REAL_TURN_CAP`) and the environment mode (`PERSONA_CLI_ENV`). Defaults to `process.env`. */
  env?: NodeJS.ProcessEnv
  /** D-085: proves an environment mode per CLI version before it is applied (a real `claude` gets the process-wide one; tests inject). */
  isolation?: IsolationRuntime
  /**
   * HT-8/9: the host's permission gate for MCP tools. Claude only. The CLI is started with its PreToolUse HTTP hook pointing at it, and a
   * turn that asked for something not allowed ends `blocked`. The host `arm`s it before a turn and reads `takeRequests()` after.
   */
  permissionGate?: PermissionGate
  /**
   * ISO-5: proxy URLs of the account connectors THIS call needs (the router's choice, HT-10; the person's explicit request authorises them
   * for this request). Claude, calls with tools, mode `needed`. Each is proven usable for the CLI version first (pre-flight, zero model);
   * one that is not (needs authentication, gone, unproven) is dropped and the call runs with the rest, the usage saying how many.
   */
  accountConnectors?: readonly string[]
  /**
   * HT-11: the person's own Claude skills (Settings: "usar minhas skills do Claude", OFF by default). Claude, calls with tools, mode `needed`
   * only (in the other modes the CLI runs native and already has them). Brought in through a product folder of pointers and `--add-dir`, never
   * through the user setting source; proven for the CLI version first, otherwise dropped and the usage says so.
   */
  personalSkills?: boolean | { readonly source?: string; readonly root?: string }
  /** Persona + project spend caps. Hard stop; never another paid connection. */
  spend?: Omit<SpendBudgetOptions, 'personaId' | 'projectId'> & {
    personaId?: string
    projectId?: string
  }
}

/** D-097 interim: the CLI's tool-search mode that keeps OUR small tool set inline when the session carries no connector (see `createCliRunner`). */
export const TOOL_SEARCH_OURS_INLINE = 'auto:5'

type CliSpec = Extract<PersonaRunnerSpec, { kind: 'cli' }>

function providerOf(spec: PersonaRunnerSpec): string {
  return spec.kind === 'dsh' ? 'dsh' : spec.cli
}

function applyAccountPolicy(
  options: ResolveRunnerOptions,
  provider: string,
): { accountId?: string; accountHome?: string } {
  if (options.accounts === undefined || options.accountPolicy === undefined) {
    return {
      ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
      ...(options.accountHome === undefined ? {} : { accountHome: options.accountHome }),
    }
  }
  const pick = pickProviderAccount({
    accounts: options.accounts,
    policy: options.accountPolicy,
    quotas: options.accountQuotas ?? [],
    ...(options.accountId === undefined ? {} : { currentId: options.accountId }),
    ...(options.personaName === undefined ? {} : { personaName: options.personaName }),
  })
  if (pick.action === 'ask') {
    const resetAt = options.accountQuotas?.find(row => row.accountId === pick.accountId)?.resetsAt
    throw new RunnerResolveError('quota_exhausted', `${provider}:${pick.accountId}:ask`,
      resetAt === undefined ? {} : { resetAt })
  }
  if (pick.action === 'stop') {
    const resetAt = options.accountQuotas?.find(row => row.accountId === pick.accountId)?.resetsAt
    throw new RunnerResolveError('quota_exhausted', `${provider}:${pick.accountId}`,
      resetAt === undefined ? {} : { resetAt })
  }
  const accountId = pick.action === 'switch' ? pick.to : pick.accountId
  const account = options.accounts.find(row => row.id === accountId)
  return {
    ...(accountId === undefined ? {} : { accountId }),
    ...(account === undefined ? {} : { accountHome: account.configDir }),
  }
}

async function loadRuntime(cli: CliKind, injected?: Runtime): Promise<Runtime> {
  if (injected !== undefined) return injected
  const oar = await import('@botiverse/oar')
  if (cli === 'cursor') {
    const registry = oar.createRuntimeRegistry([
      ...oar.defaultRuntimes.list(),
      oar.createCursorRuntime({ sdk: () => import('@cursor/sdk') }),
    ])
    return registry.require('cursor')
  }
  const runtime = oar.defaultRuntimes.get(cli)
  if (runtime === undefined) throw new RunnerResolveError('cli_not_found', cli)
  return runtime
}

async function readVaultEnv(
  vault: VaultSecretReader | undefined,
  personId: string | undefined,
  provider: string,
): Promise<Readonly<Record<string, string | null>> | undefined> {
  if (vault === undefined || personId === undefined) return undefined
  const secret = await vault.get(personId, provider)
  if (secret === undefined || secret.length === 0) return undefined
  return { DEEPSEEK_API_KEY: secret }
}

/**
 * Model for this resolve. Talk uses `talkModel` or the cheap CLI default; task keeps the persona model.
 * @param spec - Runner spec.
 * @param purpose - talk (triage) or task.
 */
export function modelForPurpose(spec: PersonaRunnerSpec, purpose: RunnerPurpose): string {
  if (purpose === 'talk') return spec.talkModel ?? pickFastestModel({ ...spec, model: spec.talkModel ?? '' })
  return spec.model
}

/**
 * Cheap work (triage/librarian/watchdog/initiative) uses the talk model.
 * @param spec - Runner spec.
 * @param work - Host purpose or cheap kind.
 */
export function modelForWork(spec: PersonaRunnerSpec, work: string): string {
  return modelForPurpose(spec, poolPurposeFor(work))
}

function specForPurpose(spec: PersonaRunnerSpec, purpose: RunnerPurpose): PersonaRunnerSpec {
  const model = modelForPurpose(spec, purpose)
  if (spec.kind === 'dsh') {
    const next: Extract<PersonaRunnerSpec, { kind: 'dsh' }> = { kind: 'dsh', model }
    if (spec.talkModel !== undefined) next.talkModel = spec.talkModel
    if (spec.provider !== undefined) next.provider = spec.provider
    if (spec.baseUrl !== undefined) next.baseUrl = spec.baseUrl
    return next
  }
  // EFF-1: the persona's effort belongs to its own model (a task); the cheap talk model keeps the engine's default.
  const effort = purpose === 'talk' || spec.effort === undefined ? {} : { effort: spec.effort }
  return spec.talkModel === undefined
    ? { kind: 'cli', cli: spec.cli, model, ...effort }
    : { kind: 'cli', cli: spec.cli, model, talkModel: spec.talkModel, ...effort }
}

async function assertReady(runtime: Runtime, spec: PersonaRunnerSpec, cwd: string): Promise<AvailableInstallation | undefined> {
  const provider = providerOf(spec)
  const probe = asProbe(runtime)
  const snap = probe.installation === undefined
    ? { kind: 'available' }
    : await withTimeout(PROBE_TIMEOUT_MS, probe.installation())
  if (snap.kind !== 'available') throw new RunnerResolveError('cli_not_found', provider)
  const installation = snap as AvailableInstallation
  const authHit = cachedAuth(provider)
  if (probe.authStatus !== undefined) {
    if (authHit !== undefined) {
      if (authHit.kind === 'logged_out' || authHit.kind === 'unauthenticated') {
        throw new RunnerResolveError('not_logged_in', provider)
      }
    } else {
      const auth = await withTimeout(PROBE_TIMEOUT_MS, probe.authStatus(installation, { timeoutMs: PROBE_TIMEOUT_MS }))
      rememberAuth(provider, auth.kind)
      if (auth.kind === 'logged_out' || auth.kind === 'unauthenticated') {
        throw new RunnerResolveError('not_logged_in', provider)
      }
    }
  }
  if (spec.kind === 'cli' && probe.listModels !== undefined) {
    const modelHit = cachedModels(spec.cli, cwd)
    const ids = modelHit !== undefined
      ? [...modelHit.ids]
      : (await withTimeout(
        PROBE_TIMEOUT_MS,
        probe.listModels(installation, { cwd, timeoutMs: PROBE_TIMEOUT_MS }),
      )).models?.map(item => item.id).filter((id): id is string => typeof id === 'string') ?? []
    if (modelHit === undefined) rememberModels(spec.cli, cwd, ids)
    if (ids.length > 0 && spec.model !== 'default' && !ids.includes(spec.model)) {
      throw new RunnerResolveError('model_unavailable', provider, { model: spec.model })
    }
  }
  if (probe.accountUsage !== undefined && authHit === undefined) {
    const usage = await withTimeout(PROBE_TIMEOUT_MS, probe.accountUsage(installation))
    const verdict = quotaVerdict(provider, usage)
    if (verdict.exhausted) {
      throw new RunnerResolveError('quota_exhausted', provider, verdict.resetAt === undefined ? {} : { resetAt: verdict.resetAt })
    }
  }
  return probe.installation === undefined ? undefined : installation
}

function withDefaultPermission(inner: Runner, permissionMode: NonNullable<StartTurnInput['permissionMode']>): Runner {
  const fill = (input: StartTurnInput): StartTurnInput => (
    input.permissionMode === undefined ? { ...input, permissionMode } : input
  )
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: input => inner.start(fill(input)),
    startTurn: input => inner.startTurn(fill(input)),
    stream: handle => inner.stream(handle),
    events: handle => inner.events(handle),
    cancel: handle => inner.cancel(handle),
    resume: input => inner.resume(fill(input)),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(fill(input)) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

function withPinnedModel(inner: Runner, model: string): Runner {
  const fill = (input: StartTurnInput): StartTurnInput => (
    input.model === model ? input : { ...input, model }
  )
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: input => inner.start(fill(input)),
    startTurn: input => inner.startTurn(fill(input)),
    stream: handle => inner.stream(handle),
    events: handle => inner.events(handle),
    cancel: handle => inner.cancel(handle),
    resume: input => inner.resume(fill(input)),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(fill(input)) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

function withoutEffort(args: readonly string[]): string[] {
  const out: string[] = []
  for (let index = 0; index < args.length; index += 1) {
    if (args[index] === '--effort') { index += 1; continue }
    out.push(args[index] ?? '')
  }
  return out
}

/** EFF-1: fill the persona's effort into every turn that does not carry one. */
function withPersonaEffort(inner: Runner, effort: string): Runner {
  const fill = (input: StartTurnInput): StartTurnInput => (input.effort === undefined ? { ...input, effort } : input)
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: input => inner.start(fill(input)),
    startTurn: input => inner.startTurn(fill(input)),
    stream: handle => inner.stream(handle),
    events: handle => inner.events(handle),
    cancel: handle => inner.cancel(handle),
    resume: input => inner.resume(fill(input)),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(fill(input)) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

/** EFF-1: the chosen model is not offered by the engine: every turn of this runner runs on the engine's default (the turn input carries the persona's model, so it is replaced here). */
function withDefaultModel(inner: Runner): Runner {
  const fill = (input: StartTurnInput): StartTurnInput => (input.model === 'default' ? input : { ...input, model: 'default' })
  return {
    capabilities: () => inner.capabilities(),
    health: () => inner.health(),
    authenticate: () => inner.authenticate(),
    start: input => inner.start(fill(input)),
    startTurn: input => inner.startTurn(fill(input)),
    stream: handle => inner.stream(handle),
    events: handle => inner.events(handle),
    cancel: handle => inner.cancel(handle),
    resume: input => inner.resume(fill(input)),
    usage: handle => inner.usage(handle),
    ...(inner.prime === undefined ? {} : { prime: (input: StartTurnInput) => inner.prime!(fill(input)) }),
    ...(inner.dispose === undefined ? {} : { dispose: () => inner.dispose!() }),
  }
}

function wrap(
  inner: Runner,
  options: ResolveRunnerOptions,
  provider: string,
  model: string,
  purpose: RunnerPurpose,
): Runner {
  let runner = withDefaultPermission(inner, options.permissionMode)
  if (purpose === 'talk') runner = withPinnedModel(runner, model)
  else if (options.spec.kind === 'cli' && options.spec.effort !== undefined) runner = withPersonaEffort(runner, options.spec.effort)
  const level = options.toolLevel ?? (
    options.spec.kind === 'cli'
      ? cliPolicyOf(options.spec.cli, options.tools ?? {}, options.permissionMode).toolLevel
      : options.tools === undefined ? 'write' : effectiveToolLevel(options.tools)
  )
  runner = withToolLevel(runner, level)
  if (options.permissionGate !== undefined && options.spec.kind === 'cli' && options.spec.cli === 'claude') runner = withPermissionReport(runner, options.permissionGate)
  runner = withInfraRecovery(runner, options.infra ?? { wait: async () => undefined })
  const meter = options.usage ?? (
    options.usageStore !== undefined && options.usageScope !== undefined
      ? usageStoreSink(options.usageStore, options.usageScope)
      : undefined
  )
  if (meter !== undefined) {
    runner = withUsageMeter(runner, meter, provider, {
      kind: meterTurnKind(options.turnKind ?? purpose),
      ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
    })
  }
  if (options.spend !== undefined) {
    const personaId = options.spend.personaId ?? options.personId ?? options.usageScope?.personaId ?? ''
    const projectId = options.spend.projectId ?? options.projectId ?? options.usageScope?.projectId ?? ''
    runner = withSpendBudget(runner, {
      personaId,
      projectId,
      persona: options.spend.persona,
      project: options.spend.project,
      ledger: options.spend.ledger,
      ...(options.spend.now === undefined ? {} : { now: options.spend.now }),
    })
  }
  if (options.autonomy === 'propose') {
    runner = withObserveGate(runner, {
      rule: { id: `autonomy:${provider}`, enabled: true, mode: 'observe' },
      autonomy: 'propose',
    }).runner
  }
  return runner
}

async function createCliRunner(
  spec: Extract<PersonaRunnerSpec, { kind: 'cli' }>,
  runtime: Runtime,
  installation: AvailableInstallation | undefined,
  home: string | undefined,
  accountHome: string | undefined,
  vaultEnv: Readonly<Record<string, string | null>> | undefined,
  homeIo: IsolatedHomeIo | undefined,
  permissionMode: NonNullable<StartTurnInput['permissionMode']>,
  tools: Readonly<Record<string, ToolLevel>> | undefined,
  cliEnv: NodeJS.ProcessEnv | undefined,
  gate: IsolationRuntime | undefined,
  permissionGate: PermissionGate | undefined,
  connectors: { readonly usable: readonly string[]; readonly requested: number; readonly unreached?: readonly ConnectorUnreached[]; readonly fallback?: ConnectorFallback; readonly skillsRoot?: string; readonly skillsWanted?: boolean },
): Promise<Runner> {
  const extra = installation === undefined ? {} : { installation }
  // ISO-1 (D-081): the CLI runs in an environment the product controls, not the person's personal one. The vendor policy
  // (permissions, tools) is untouched; the isolation arguments and env are appended after it.
  // A call without tools (deny: talk, triage, first delivery) can never use a connector, so it is the first to load none.
  // The FIRST call of an unproven CLI version waits (bounded) for the proof instead of running native: on a fresh install that is the onboarding delivery.
  if (spec.cli === 'claude' && installation?.via === 'executable') {
    await (gate ?? defaultIsolationRuntime(installation.command)).settle({ cli: spec.cli, call: permissionMode === 'deny' ? 'answer' : 'task', modelArg: spec.model, version: installation.version, env: cliEnv ?? process.env })
  }
  const call: CallKind = permissionMode === 'deny' ? 'answer' : 'task'
  let decision = decideIsolation(spec, installation, call, cliEnv ?? process.env, gate, connectors.usable, connectors.skillsRoot)
  // D-096, the second fallback: a GRANTED connector the isolated launch could not reach and the native launch may still find: THIS call runs native (decided per call, never remembered).
  // The mandate of the permission gate (armed by the host with the granted servers) is what keeps a native task inside what the person granted.
  const forcedNative = connectors.fallback === 'native-once' && decision.effectiveMode === 'needed'
  if (forcedNative) {
    const native = decideIsolation(spec, installation, call, { ...(cliEnv ?? process.env), [CLI_ENV_SWITCH]: 'native' }, gate, [], undefined)
    decision = { ...native, requestedMode: decision.requestedMode, effectiveMode: 'native', reason: 'connector-unreached' }
  }
  const plan = decision.plan
  if (plan.ensureDir !== undefined) (homeIo?.mkdir ?? ((dir: string) => { mkdirSync(dir, { recursive: true }) }))(plan.ensureDir)
  const vendorPolicy = cliPolicyOf(spec.cli, tools ?? {}, permissionMode)
  // EFF-1: when the persona chose an effort, the effort the isolation would restore is NOT passed (the persona's wins).
  const parityArgs = spec.effort === undefined ? decision.extraArgs : withoutEffort(decision.extraArgs)
  // HT-8/9: the hook goes in as flag settings (they apply under any --setting-sources). No tool it guards is ever put in an allow rule.
  // ISO-5: the CLI takes ONE --settings; the connector allow-list and the gate's hook are merged into it.
  const gateSettings = permissionGate === undefined || spec.cli !== 'claude' ? undefined : permissionGate.settings()
  const extraLaunch = [...plan.launchArgs, ...parityArgs, ...settingsArgs(mergeFlagSettings([plan.settings, gateSettings]))]
  const policy = extraLaunch.length === 0 ? vendorPolicy : { ...vendorPolicy, launchArgs: [...vendorPolicy.launchArgs, ...extraLaunch] }
  const isolation = sessionIsolation(spec.cli, home, accountHome, vaultEnv, homeIo)
  // D-097 interim (Keel 06:22): with built-in tools present the CLI DEFERS MCP tool definitions (the model needs a ToolSearch request before using one). When the session carries NO connector
  // server, only our small persona tool set, `auto:5` keeps it inline (proved on the real CLI against a fake endpoint: reports/team-offer-dry.json); with any connector granted nothing changes.
  const inlineOurTools = spec.cli === 'claude' && decision.effectiveMode === 'needed' && connectors.requested === 0 ? { ENABLE_TOOL_SEARCH: TOOL_SEARCH_OURS_INLINE } : {}
  const env = { env: { ...isolation.env, ...plan.env, ...inlineOurTools } }
  const loaded = plan.accountConnectors ?? 0
  const modes = {
    requested: decision.requestedMode, effective: decision.effectiveMode, reason: decision.reason,
    ...(connectors.skillsWanted === true && decision.effectiveMode === 'needed' ? { personalSkills: plan.personalSkills === true ? 'loaded' as const : 'dropped' as const } : {}),
    ...(connectors.requested === 0 || forcedNative ? {} : { connectors: { loaded, dropped: Math.max(0, connectors.requested - loaded) } }),
    // D-096: said only when the launch really was the isolated one that missed a connector (`floor`) or the call fell back to native because of it (`native-once`).
    ...((forcedNative || decision.effectiveMode === 'needed') && connectors.fallback !== undefined && (connectors.unreached?.length ?? 0) > 0 ? { unreached: connectors.unreached ?? [], fallback: connectors.fallback } : {}),
  }
  if (spec.cli === 'claude') {
    return withEnvMode(createClaudeRunner({
      runtime, ...extra, ...env, policy, ...(isolation.configDir === undefined ? {} : { configDir: isolation.configDir }),
    }), modes)
  }
  if (spec.cli === 'codex') {
    return withEnvMode(createCodexRunner({
      runtime, ...extra, ...env, policy, ...(isolation.homeDir === undefined ? {} : { homeDir: isolation.homeDir }),
    }), modes)
  }
  if (spec.cli === 'opencode') return withEnvMode(createOpencodeRunner({ runtime, ...extra, ...env, policy }), modes)
  return withEnvMode(createCursorRunner({ runtime, ...extra, ...env, policy }), modes)
}

/**
 * D-085: which environment mode THIS call runs with. A real `claude` executable goes through the gate (a mode is applied only
 * when proven for its version, otherwise `native`, fail-safe); a bundled/scripted runtime (tests, fakes) is ungated.
 */
function decideIsolation(
  spec: Extract<PersonaRunnerSpec, { kind: 'cli' }>,
  installation: AvailableInstallation | undefined,
  call: CallKind,
  env: NodeJS.ProcessEnv,
  injected: IsolationRuntime | undefined,
  accountConnectors: readonly string[],
  personalSkills: string | undefined,
): IsolationDecision {
  if (installation?.via === 'executable') {
    const gate = injected ?? defaultIsolationRuntime(installation.command)
    return gate.decide({ cli: spec.cli, call, modelArg: spec.model, version: installation.version, env, accountConnectors, ...(personalSkills === undefined ? {} : { personalSkills }) })
  }
  const plan = isolationPlan(spec.cli, { call, env, accountConnectors, ...(personalSkills === undefined ? {} : { personalSkills }) })
  const changes = plan.launchArgs.length > 0 || Object.keys(plan.env).length > 0
  const requested = cliEnvMode(env)
  return { requestedMode: requested, effectiveMode: changes ? requested : 'native', plan, extraArgs: [], reason: 'ungated' }
}

function sessionIsolation(
  cli: CliKind,
  home: string | undefined,
  accountHome: string | undefined,
  vaultEnv: Readonly<Record<string, string | null>> | undefined,
  homeIo: IsolatedHomeIo | undefined,
): {
  env: Record<string, string | null>
  configDir?: string
  homeDir?: string
} {
  const extra = vaultEnv ?? {}
  if (accountHome !== undefined && accountHome.trim() !== '') {
    const prepared = prepareAccountHome(accountHome, cli as AccountEngine, {
      ...(homeIo?.mkdir === undefined ? {} : { mkdir: homeIo.mkdir }),
    })
    const env = nativeSessionEnv({ ...prepared.env, ...extra })
    return cli === 'claude'
      ? { env, configDir: prepared.dir }
      : cli === 'codex' ? { env, homeDir: prepared.dir } : { env }
  }
  const plan = prepareIsolatedHome(cli, home, homeIo ?? {})
  const isolated = plan.kind === 'isolated' ? accountIsolationEnv(cli as AccountEngine, plan.dir) : {}
  const env = nativeSessionEnv({ ...isolated, ...extra })
  if (plan.kind !== 'isolated') return { env }
  return cli === 'claude'
    ? { env, configDir: plan.dir }
    : cli === 'codex' ? { env, homeDir: plan.dir } : { env }
}

/** Process-wide warm pool. Anvil passes this (or its own) on every resolve. */
export const defaultRunnerPool: SessionPool<Runner> = createSessionPool({
  dispose: async (runner) => {
    if (runner.dispose !== undefined) await runner.dispose()
  },
})

/**
 * Drop every warm CLI session (quit / pauseTeam / model change).
 */
export async function disposeRunnerSessions(): Promise<void> {
  await defaultRunnerPool.disposeAll()
}

function poolKeyOf(options: ResolveRunnerOptions, spec: PersonaRunnerSpec, purpose: RunnerPurpose): string {
  return sessionPoolKey({
    personaId: options.personId ?? options.usageScope?.personaId ?? '',
    projectId: options.projectId ?? options.usageScope?.projectId ?? '',
    purpose,
    provider: providerOf(spec),
    model: spec.model,
    ...(spec.kind === 'cli' && spec.effort !== undefined ? { effort: spec.effort } : {}),
    ...(spec.kind === 'cli' && options.personalSkills !== undefined && options.personalSkills !== false ? { skills: true } : {}),
    ...(spec.kind === 'cli' && (options.accountConnectors?.length ?? 0) > 0 ? { connectors: [...new Set(options.accountConnectors)].sort().join(',') } : {}),
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    permissionMode: options.permissionMode,
    toolLevel: options.toolLevel ?? '',
    ...(options.accountId === undefined ? {} : { accountId: options.accountId }),
  })
}

async function resolveDshAgent(
  options: ResolveRunnerOptions,
  spec: Extract<PersonaRunnerSpec, { kind: 'dsh' }>,
): Promise<DshAgentPort> {
  if (options.agent !== undefined) return options.agent
  const provider = spec.provider ?? 'deepseek'
  if (isLocalProvider(provider)) {
    return createHttpDshAgent({
      provider,
      apiKey: 'local',
      baseUrl: spec.baseUrl ?? (provider === 'ollama' ? 'http://127.0.0.1:11434/v1' : 'http://127.0.0.1:1234/v1'),
      ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
    })
  }
  const personId = options.personId
  const vault = options.vault
  let key: string | undefined
  if (vault !== undefined && personId !== undefined) {
    key = await vault.get(personId, provider)
    if (key === undefined || key.length === 0) key = await vault.get(personId, 'dsh')
  }
  if (key === undefined || key.length === 0) {
    if (vault !== undefined && personId !== undefined) throw new RunnerResolveError('not_logged_in', 'dsh')
    throw new RunnerResolveError('cli_not_found', 'dsh')
  }
  return createHttpDshAgent({
    provider,
    apiKey: key,
    ...(spec.baseUrl === undefined ? {} : { baseUrl: spec.baseUrl }),
    ...(options.fetch === undefined ? {} : { fetch: options.fetch }),
  })
}

/**
 * Build the runner Anvil starts for one persona.
 * Vault secrets go only into ephemeral session env — never into logs or errors.
 * @param options - Spec, explicit permission, optional autonomy/home/vault.
 */
export async function resolveRunner(options: ResolveRunnerOptions): Promise<Runner> {
  const purpose = options.purpose ?? 'task'
  const spec = specForPurpose(options.spec, purpose)
  const provider = providerOf(spec)
  const ledgerKind = meterTurnKind(options.turnKind ?? purpose)
  if (ledgerKind === 'triage' && !triageCallsAllowed(options.triageCallsAlready ?? 0)) {
    return wrap(
      createScriptedRunner({
        turns: [{ events: [], usage: { inputTokens: 0, outputTokens: 0 } }],
      }),
      options,
      provider,
      spec.model,
      purpose,
    )
  }
  const chosen = applyAccountPolicy(options, provider)
  const cwd = options.cwd ?? process.cwd()
  const pool = options.pool
  const accountId = chosen.accountId ?? options.accountId
  const key = poolKeyOf(
    accountId === undefined ? options : { ...options, accountId },
    spec,
    purpose,
  )
  if (pool !== undefined) {
    const hit = pool.get(key)
    if (hit !== undefined) {
      pool.touch(key)
      return hit
    }
  }
  const vaultEnv = await readVaultEnv(options.vault, options.personId, provider)
  let resolved: Runner
  let fellBackOnce = false
  /** EFF-1: the chosen model the engine does not offer (the call ran on the default). */
  let modelDropped: string | undefined
  if (spec.kind === 'dsh') {
    const agent = await resolveDshAgent(options, spec)
    resolved = wrap(
      createDshRunner(options.infra === undefined
        ? { agent }
        : { agent, infra: options.infra }),
      accountId === undefined ? { ...options, spec } : { ...options, spec, accountId },
      'dsh',
      spec.model,
      purpose,
    )
  } else {
    assertCliNeverPrompt(options.permissionMode)
    const runtime = await loadRuntime(spec.cli, options.runtime)
    // EFF-1: the model the person chose is one the engine does not offer (renamed, retired, not on this account): the Task is NOT lost for it. It runs on the engine's default and the usage
    // says which model was dropped (the host writes it in the ledger and the Task detail).
    let cliSpec: CliSpec = spec
    const ready = (target: CliSpec): Promise<AvailableInstallation | undefined> => assertReady(runtime, target, cwd).catch((error: unknown) => {
      const failure = resolveCaughtError(error, target.cli)
      throw failure.code === 'provider_unreachable' ? failure : error
    })
    let installation: AvailableInstallation | undefined
    try {
      installation = await ready(spec)
    } catch (error) {
      if (!(error instanceof RunnerResolveError) || error.code !== 'model_unavailable' || spec.model === 'default') throw error
      modelDropped = spec.model
      cliSpec = { ...spec, model: 'default' }
      installation = await ready(cliSpec)
    }
    // ISO-5: prove the connectors this call asked for, once per CLI version (a real `claude` only; fakes and scripted runtimes pass through).
    const asked = spec.cli === 'claude' && options.permissionMode !== 'deny' ? [...new Set(options.accountConnectors ?? [])] : []
    let usable: readonly string[] = asked
    let unreached: readonly ConnectorUnreached[] = []
    if (asked.length > 0 && installation?.via === 'executable' && cliEnvMode(options.env ?? process.env) === 'needed') {
      const proof = options.isolation ?? defaultIsolationRuntime(installation.command)
      const reach = await proof.connectorsReach({ version: installation.version, urls: asked })
      usable = reach.usable
      // D-096: by position in `asked` (deduplicated, first occurrence): no URL goes into the signal.
      unreached = reach.unreached.map(row => ({ ordinal: asked.indexOf(row.url), reason: row.reason }))
    }
    const fallback = connectorFallback(unreached)
    fellBackOnce = fallback === 'native-once'
    // HT-11: the person's skills, only when they asked for them. The folder of pointers is built here; a real CLI proves it per version.
    const skillsWanted = spec.cli === 'claude' && options.permissionMode !== 'deny' && options.personalSkills !== undefined && options.personalSkills !== false
    let skillsRoot: string | undefined
    if (skillsWanted && cliEnvMode(options.env ?? process.env) === 'needed') {
      const own = typeof options.personalSkills === 'object' ? options.personalSkills : {}
      const folder = syncSkillsRoot(own)
      if (folder !== undefined) {
        if (installation?.via === 'executable') {
          const proof = options.isolation ?? defaultIsolationRuntime(installation.command)
          skillsRoot = (await proof.skillsReady({ version: installation.version, root: folder.root }))?.ok === true ? folder.root : undefined
        } else {
          skillsRoot = folder.root
        }
      }
    }
    const inner = await createCliRunner(
      cliSpec, runtime, installation, options.home, chosen.accountHome ?? options.accountHome, vaultEnv, options.homeIo,
      options.permissionMode, options.tools, options.env, options.isolation, options.permissionGate,
      { usable, requested: asked.length, skillsWanted, ...(unreached.length === 0 || fallback === undefined ? {} : { unreached, fallback }), ...(skillsRoot === undefined ? {} : { skillsRoot }) },
    )
    // Innermost, so infra-recovery retries and warm-session turns are counted and refused before the CLI runs.
    // Only real CLI runners: fake/scripted/dsh never reach this branch. Unset env = no effect.
    const turnCap = realTurnCapFromEnv(options.env ?? process.env)
    // EFF-1: what the person chose, said next to the tokens (only when there is a choice or when the chosen model was dropped).
    const reported = withChoiceReport(modelDropped === undefined ? inner : withDefaultModel(inner), {
      ...(spec.model === 'default' ? {} : { modelRequested: spec.model }),
      ...(spec.effort === undefined || spec.effort === '' || spec.effort === 'default' ? {} : { effortRequested: spec.effort }),
      ...(modelDropped === undefined ? {} : { modelDropped }),
    })
    resolved = wrap(
      turnCap === undefined ? reported : withRealTurnCap(reported, turnCap),
      accountId === undefined ? { ...options, spec: cliSpec } : { ...options, spec: cliSpec, accountId },
      cliSpec.cli,
      cliSpec.model,
      purpose,
    )
    // Outermost, so the pooled (warm) instance remembers a quota block and refuses the next turn before the CLI starts.
    // Only CLIs that can report their account usage (Claude, Codex); Cursor/OpenCode have nothing to re-read.
    const usageProbe = asProbe(runtime)
    if (usageProbe.accountUsage !== undefined && installation !== undefined) {
      const readUsage = usageProbe.accountUsage
      resolved = withQuotaRecheck(resolved, {
        provider: spec.cli,
        reread: () => withTimeout(PROBE_TIMEOUT_MS, readUsage(installation)),
      })
    }
  }
  // D-096: a runner that fell back to native for one task is that task's alone: it never enters the pool, so the next task is decided again.
  if (!fellBackOnce && modelDropped === undefined) pool?.set(key, resolved)
  return resolved
}

/**
 * Host boot: open one Coordination CLI session with no model turn.
 * @param options - Same resolve fields; purpose is forced to talk.
 */
export async function prewarmCoordination(options: ResolveRunnerOptions & {
  personaId: string
  projectId: string
  cwd: string
}): Promise<Runner> {
  const purpose: RunnerPurpose = 'talk'
  const runner = await resolveRunner({
    ...options,
    purpose,
    pool: options.pool ?? defaultRunnerPool,
  })
  if (runner.prime !== undefined) {
    await runner.prime({
      ticketId: 'prewarm',
      assignmentId: 'prewarm',
      personaId: options.personaId,
      cwd: options.cwd,
      prompt: '',
      model: modelForPurpose(options.spec, purpose),
      permissionMode: options.permissionMode,
    })
  }
  return runner
}
