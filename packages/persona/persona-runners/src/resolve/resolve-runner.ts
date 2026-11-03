/**
 * Resolve a persona runner spec to a live TurnRunner (Anvil: ctx.personaRunners.resolveRunner).
 */

import type { AvailableInstallation, Runtime } from '@botiverse/oar'
import type { AutonomyLevel } from '@deepseek-ai/dsh-persona-engine'
import type { CliKind, Runner, StartTurnInput } from '../contract.ts'
import { createHttpDshAgent, type DshProvider } from '../dsh/http-agent.ts'
import { createDshRunner, type DshAgentPort } from '../dsh/runner.ts'
import { createClaudeRunner } from '../oar/claude.ts'
import { createCodexRunner } from '../oar/codex.ts'
import { createCursorRunner } from '../oar/cursor.ts'
import { createOpencodeRunner } from '../oar/opencode.ts'
import { withInfraRecovery, type InfraRecoveryOptions } from '../proactivity/recovery.ts'
import { withObserveGate } from '../proactivity/observe.ts'
import { prepareIsolatedHome, type IsolatedHomeIo } from '../oar/isolated-home.ts'
import { RunnerResolveError } from './errors.ts'
import { asProbe, PROBE_TIMEOUT_MS, quotaExhausted, withTimeout } from './probe.ts'
import { assertCliNeverPrompt, cliPolicyOf } from './cli-policy.ts'
import { pickFastestModel } from './fastest-model.ts'
import { cachedAuth, cachedModels, rememberAuth, rememberModels } from './probe-cache.ts'
import {
  createSessionPool,
  sessionPoolKey,
  type RunnerPurpose,
  type SessionPool,
} from './session-pool.ts'
import { effectiveToolLevel, withToolLevel, type ToolLevel } from './tool-level.ts'
import { usageStoreSink, withUsageMeter, type UsageMeterSink, type UsageStorePort } from './usage-meter.ts'

export type PersonaRunnerSpec =
  | { kind: 'dsh'; model: string; talkModel?: string; provider?: DshProvider; baseUrl?: string }
  | { kind: 'cli'; cli: CliKind; model: string; talkModel?: string }

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
  /** Injectable fs for isolated-home tests. Production omits this. */
  homeIo?: IsolatedHomeIo
  vault?: VaultSecretReader
  personId?: string
  agent?: DshAgentPort
  runtime?: Runtime
  usage?: UsageMeterSink
  usageStore?: UsageStorePort
  usageScope?: { personaId: string; projectId: string }
  infra?: InfraRecoveryOptions
  cwd?: string
  /** talk = cheap model + warm session; task = persona model. */
  purpose?: RunnerPurpose
  projectId?: string
  pool?: SessionPool<Runner>
  /** Injected fetch for HTTP DSH tests. */
  fetch?: typeof fetch
}

function providerOf(spec: PersonaRunnerSpec): string {
  return spec.kind === 'dsh' ? 'dsh' : spec.cli
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

function specForPurpose(spec: PersonaRunnerSpec, purpose: RunnerPurpose): PersonaRunnerSpec {
  const model = modelForPurpose(spec, purpose)
  if (spec.kind === 'dsh') {
    const next: Extract<PersonaRunnerSpec, { kind: 'dsh' }> = { kind: 'dsh', model }
    if (spec.talkModel !== undefined) next.talkModel = spec.talkModel
    if (spec.provider !== undefined) next.provider = spec.provider
    if (spec.baseUrl !== undefined) next.baseUrl = spec.baseUrl
    return next
  }
  return spec.talkModel === undefined
    ? { kind: 'cli', cli: spec.cli, model }
    : { kind: 'cli', cli: spec.cli, model, talkModel: spec.talkModel }
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
      throw new RunnerResolveError('model_unavailable', spec.model)
    }
  }
  if (probe.accountUsage !== undefined && authHit === undefined) {
    const usage = await withTimeout(PROBE_TIMEOUT_MS, probe.accountUsage(installation))
    if (quotaExhausted(usage)) throw new RunnerResolveError('quota_exhausted', provider)
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

function wrap(
  inner: Runner,
  options: ResolveRunnerOptions,
  provider: string,
  model: string,
  purpose: RunnerPurpose,
): Runner {
  let runner = withDefaultPermission(inner, options.permissionMode)
  if (purpose === 'talk') runner = withPinnedModel(runner, model)
  const level = options.toolLevel ?? (
    options.spec.kind === 'cli'
      ? cliPolicyOf(options.spec.cli, options.tools ?? {}, options.permissionMode).toolLevel
      : options.tools === undefined ? 'write' : effectiveToolLevel(options.tools)
  )
  runner = withToolLevel(runner, level)
  runner = withInfraRecovery(runner, options.infra ?? { wait: async () => undefined })
  const meter = options.usage ?? (
    options.usageStore !== undefined && options.usageScope !== undefined
      ? usageStoreSink(options.usageStore, options.usageScope)
      : undefined
  )
  if (meter !== undefined) runner = withUsageMeter(runner, meter, provider)
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
  vaultEnv: Readonly<Record<string, string | null>> | undefined,
  homeIo: IsolatedHomeIo | undefined,
  permissionMode: NonNullable<StartTurnInput['permissionMode']>,
  tools: Readonly<Record<string, ToolLevel>> | undefined,
): Promise<Runner> {
  const extra = installation === undefined ? {} : { installation }
  const env = vaultEnv === undefined ? {} : { env: vaultEnv }
  const plan = prepareIsolatedHome(spec.cli, home, homeIo ?? {})
  const policy = cliPolicyOf(spec.cli, tools ?? {}, permissionMode)
  if (spec.cli === 'claude') {
    return createClaudeRunner({
      runtime, ...extra, ...env, policy, ...(plan.kind === 'isolated' ? { configDir: plan.dir } : {}),
    })
  }
  if (spec.cli === 'codex') {
    return createCodexRunner({
      runtime, ...extra, ...env, policy, ...(plan.kind === 'isolated' ? { homeDir: plan.dir } : {}),
    })
  }
  if (spec.cli === 'opencode') return createOpencodeRunner({ runtime, ...extra, ...env, policy })
  return createCursorRunner({ runtime, ...extra, policy })
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
    ...(options.cwd === undefined ? {} : { cwd: options.cwd }),
    permissionMode: options.permissionMode,
    toolLevel: options.toolLevel ?? '',
  })
}

async function resolveDshAgent(
  options: ResolveRunnerOptions,
  spec: Extract<PersonaRunnerSpec, { kind: 'dsh' }>,
): Promise<DshAgentPort> {
  if (options.agent !== undefined) return options.agent
  const provider = spec.provider ?? 'deepseek'
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
  const cwd = options.cwd ?? process.cwd()
  const pool = options.pool
  const key = poolKeyOf(options, spec, purpose)
  if (pool !== undefined) {
    const hit = pool.get(key)
    if (hit !== undefined) {
      pool.touch(key)
      return hit
    }
  }
  const vaultEnv = await readVaultEnv(options.vault, options.personId, provider)
  let resolved: Runner
  if (spec.kind === 'dsh') {
    const agent = await resolveDshAgent(options, spec)
    resolved = wrap(
      createDshRunner(options.infra === undefined
        ? { agent }
        : { agent, infra: options.infra }),
      { ...options, spec },
      'dsh',
      spec.model,
      purpose,
    )
  } else {
    assertCliNeverPrompt(options.permissionMode)
    const runtime = await loadRuntime(spec.cli, options.runtime)
    const installation = await assertReady(runtime, spec, cwd)
    const inner = await createCliRunner(
      spec, runtime, installation, options.home, vaultEnv, options.homeIo,
      options.permissionMode, options.tools,
    )
    resolved = wrap(inner, { ...options, spec }, spec.cli, spec.model, purpose)
  }
  pool?.set(key, resolved)
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
