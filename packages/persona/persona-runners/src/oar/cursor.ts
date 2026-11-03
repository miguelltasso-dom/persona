/** OAR Cursor runner (D2). MCP / Persona tools are unavailable and advertised. */

import type { AvailableInstallation, Runtime } from '@botiverse/oar'
import { createOarRunner } from './adapter.ts'
import type { Runner, RunnerCapabilities } from '../contract.ts'

export const CURSOR_CAPABILITIES: RunnerCapabilities = {
  kind: 'cli',
  cli: 'cursor',
  stream: true,
  cancel: true,
  resume: true,
  usage: true,
  mcpTools: 'unavailable',
  permission: 'explicit',
}

/**
 * Cursor runner. Persona MCP tools stay unavailable (OAR refuses `mcpServers`).
 * @param options - runtime built with `@cursor/sdk` or a scripted stand-in.
 */
export function createCursorRunner(options: { runtime: Runtime; installation?: AvailableInstallation }): Runner {
  const extra = options.installation === undefined ? {} : { installation: options.installation }
  return createOarRunner({ runtime: options.runtime, capabilities: CURSOR_CAPABILITIES, ...extra })
}
