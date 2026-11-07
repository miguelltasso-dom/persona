/** OAR Codex runner (D1b). Permission mode is always required. */

import type { AvailableInstallation, Runtime } from '@botiverse/oar'
import { createOarRunner, type OarRunnerOptions } from './adapter.ts'
import { nativeSessionEnv } from './native-cli-env.ts'
import type { Runner, RunnerCapabilities } from '../contract.ts'

export const CODEX_CAPABILITIES: RunnerCapabilities = {
  kind: 'cli',
  cli: 'codex',
  stream: true,
  cancel: true,
  resume: true,
  usage: true,
  mcpTools: 'available',
  permission: 'explicit',
}

export interface CodexRunnerOptions {
  runtime: Runtime
  /** Isolated Codex home (`CODEX_HOME`). Omitted uses the native login. */
  homeDir?: string
  installation?: AvailableInstallation
  /** Ephemeral extras (vault). Never log. */
  env?: Readonly<Record<string, string | null>>
  policy?: import('../resolve/cli-policy.ts').CliSessionPolicy
  warmTtlMs?: number
  warmCap?: number
}

/**
 * Codex runner over an OAR runtime.
 * @param options - runtime (real CLI or `scriptedRuntime`).
 */
export function createCodexRunner(options: CodexRunnerOptions): Runner {
  const isolation = options.homeDir === undefined ? undefined : { CODEX_HOME: options.homeDir }
  const oar: OarRunnerOptions = {
    runtime: options.runtime,
    capabilities: CODEX_CAPABILITIES,
    env: nativeSessionEnv({ ...(isolation ?? {}), ...(options.env ?? {}) }),
    ...(options.installation === undefined ? {} : { installation: options.installation }),
    ...(options.policy === undefined ? {} : { policy: options.policy }),
    ...(options.warmTtlMs === undefined ? {} : { warmTtlMs: options.warmTtlMs }),
    ...(options.warmCap === undefined ? {} : { warmCap: options.warmCap }),
    // HT-0: the isolated home is the only one whose config.toml the product writes (to pre-approve its own tools server).
    ...(options.homeDir === undefined ? {} : { codexHome: options.homeDir }),
  }
  return createOarRunner(oar)
}
