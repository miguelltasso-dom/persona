/** OAR Codex runner (D1b). Permission mode is always required. */

import type { Runtime } from '@botiverse/oar'
import { createOarRunner } from './adapter.ts'
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

/**
 * Codex runner over an OAR runtime.
 * @param options - runtime (real CLI or `scriptedRuntime`).
 */
export function createCodexRunner(options: { runtime: Runtime }): Runner {
  return createOarRunner({ runtime: options.runtime, capabilities: CODEX_CAPABILITIES })
}
