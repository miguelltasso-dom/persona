/**
 * Resolve a persona runner spec to a live TurnRunner (Anvil: ctx.personaRunners.resolveRunner).
 */

import type { AvailableInstallation, Runtime } from '@botiverse/oar'
import type { AutonomyLevel } from '@deepseek-ai/dsh-persona-engine'
import type { CliKind, Runner, StartTurnInput } from '../contract.ts'
import { createDshRunner, type DshAgentPort } from '../dsh/runner.ts'
import { createClaudeRunner } from '../oar/claude.ts'
import { createCodexRunner } from '../oar/codex.ts'
import { createCursorRunner } from '../oar/cursor.ts'
import { createOpencodeRunner } from '../oar/opencode.ts'
import { withInfraRecovery, type InfraRecoveryOptions } from '../proactivity/recovery.ts'
import { withObserveGate } from '../proactivity/observe.ts'
import { RunnerResolveError } from './errors.ts'
import { asProbe, PROBE_TIMEOUT_MS, quotaExhausted, withTimeout } from './probe.ts'
import { withUsageMeter, type UsageMeterSink } from './usage-meter.ts'

export type PersonaRunnerSpec =
  | { kind: 'dsh'; model: string }
  | { kind: 'cli'; cli: CliKind; model: string }

export interface VaultSecretReader {
  get(personId: string, provider: string): Promise<string | undefined>
}

export interface ResolveRunnerOptions {
  spec: PersonaRunnerSpec
  permissionMode: NonNullable<StartTurnInput['permissionMode']>
  autonomy?: AutonomyLevel
  home?: string
  vault?: VaultSecretReader
  personId?: string
  agent?: DshAgentPort
  runtime?: Runtime
  usage?: UsageMeterSink
  infra?: InfraRecoveryOptions
  cwd?: string
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

async function assertReady(runtime: Runtime, spec: PersonaRunnerSpec, cwd: string): Promise<AvailableInstallation | undefined> {
  const probe = asProbe(runtime)
  const snap = probe.installation === undefined
    ? { kind: 'available' }
    : await withTimeout(PROBE_TIMEOUT_MS, probe.installation())
  if (snap.kind !== 'available') throw new RunnerResolveError('cli_not_found', providerOf(spec))
  const installation = snap as AvailableInstallation
  if (probe.authStatus !== undefined) {
    const auth = await withTimeout(PROBE_TIMEOUT_MS, probe.authStatus(installation, { timeoutMs: PROBE_TIMEOUT_MS }))
    if (auth.kind === 'logged_out' || auth.kind === 'unauthenticated') {
      throw new RunnerResolveError('not_logged_in', providerOf(spec))
    }
  }
  if (spec.kind === 'cli' && probe.listModels !== undefined) {
    const listed = await withTimeout(
      PROBE_TIMEOUT_MS,
      probe.listModels(installation, { cwd, timeoutMs: PROBE_TIMEOUT_MS }),
    )
    const ids = (listed.models ?? []).map(item => item.id).filter((id): id is string => typeof id === 'string')
    if (ids.length > 0 && spec.model !== 'default' && !ids.includes(spec.model)) {
      throw new RunnerResolveError('model_unavailable', spec.model)
    }
  }
  if (probe.accountUsage !== undefined) {
    const usage = await withTimeout(PROBE_TIMEOUT_MS, probe.accountUsage(installation))
    if (quotaExhausted(usage)) throw new RunnerResolveError('quota_exhausted', providerOf(spec))
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
  }
}

function wrap(
  inner: Runner,
  options: ResolveRunnerOptions,
  provider: string,
): Runner {
  let runner = withDefaultPermission(inner, options.permissionMode)
  runner = withInfraRecovery(runner, options.infra ?? { wait: async () => undefined })
  if (options.usage !== undefined) runner = withUsageMeter(runner, options.usage, provider)
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
): Promise<Runner> {
  const extra = installation === undefined ? {} : { installation }
  const env = vaultEnv === undefined ? {} : { env: vaultEnv }
  if (spec.cli === 'claude') {
    return createClaudeRunner({
      runtime, ...extra, ...env, ...(home === undefined ? {} : { configDir: home }),
    })
  }
  if (spec.cli === 'codex') {
    return createCodexRunner({
      runtime, ...extra, ...env, ...(home === undefined ? {} : { homeDir: home }),
    })
  }
  if (spec.cli === 'opencode') return createOpencodeRunner({ runtime, ...extra, ...env })
  return createCursorRunner({ runtime, ...extra })
}

/**
 * Build the runner Anvil starts for one persona.
 * Vault secrets go only into ephemeral session env — never into logs or errors.
 * @param options - Spec, explicit permission, optional autonomy/home/vault.
 */
export async function resolveRunner(options: ResolveRunnerOptions): Promise<Runner> {
  const provider = providerOf(options.spec)
  const cwd = options.cwd ?? process.cwd()
  const vaultEnv = await readVaultEnv(options.vault, options.personId, provider)
  if (options.spec.kind === 'dsh') {
    if (options.agent === undefined) throw new RunnerResolveError('cli_not_found', 'dsh')
    return wrap(
      createDshRunner(options.infra === undefined ? { agent: options.agent } : { agent: options.agent, infra: options.infra }),
      options,
      'dsh',
    )
  }
  const runtime = await loadRuntime(options.spec.cli, options.runtime)
  const installation = await assertReady(runtime, options.spec, cwd)
  const inner = await createCliRunner(options.spec, runtime, installation, options.home, vaultEnv)
  return wrap(inner, options, options.spec.cli)
}
