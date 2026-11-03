/** OAR Claude Code runner (D1a). Permission mode is always required. */

import type { AvailableInstallation, Runtime } from '@botiverse/oar'
import { createOarRunner, type OarRunnerOptions } from './adapter.ts'
import { nativeSessionEnv } from './native-cli-env.ts'
import type { Runner, RunnerCapabilities } from '../contract.ts'

export const CLAUDE_CAPABILITIES: RunnerCapabilities = {
  kind: 'cli',
  cli: 'claude',
  stream: true,
  cancel: true,
  resume: true,
  usage: true,
  mcpTools: 'available',
  permission: 'explicit',
}

export interface ClaudeRunnerOptions {
  runtime: Runtime
  /** Isolated Claude config directory (`CLAUDE_CONFIG_DIR`). Omitted uses native login. */
  configDir?: string
  installation?: AvailableInstallation
  /** Ephemeral extras (vault). Never log. */
  env?: Readonly<Record<string, string | null>>
}

/**
 * Claude runner over an OAR runtime (real CLI or `scriptedRuntime`).
 * @param options - runtime and optional isolated config dir.
 */
export function createClaudeRunner(options: ClaudeRunnerOptions): Runner {
  const isolation = options.configDir === undefined ? undefined : { CLAUDE_CONFIG_DIR: options.configDir }
  const oar: OarRunnerOptions = {
    runtime: options.runtime,
    capabilities: CLAUDE_CAPABILITIES,
    env: nativeSessionEnv({ ...(isolation ?? {}), ...(options.env ?? {}) }),
    ...(options.installation === undefined ? {} : { installation: options.installation }),
  }
  return createOarRunner(oar)
}
