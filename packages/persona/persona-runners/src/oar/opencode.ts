/** OAR OpenCode runner (D2). Resume is only valid in the same cwd. */

import type { AvailableInstallation, Runtime } from '@botiverse/oar'
import { createOarRunner } from './adapter.ts'
import { nativeSessionEnv } from './native-cli-env.ts'
import type { Runner, RunnerCapabilities, StartTurnInput } from '../contract.ts'

export const OPENCODE_CAPABILITIES: RunnerCapabilities = {
  kind: 'cli',
  cli: 'opencode',
  stream: true,
  cancel: true,
  resume: true,
  usage: true,
  mcpTools: 'available',
  permission: 'explicit',
}

/**
 * OpenCode runner. Resume with a different cwd is refused (OAR matrix).
 * @param options - runtime (real CLI or `scriptedRuntime`).
 */
export function createOpencodeRunner(options: { runtime: Runtime; installation?: AvailableInstallation }): Runner {
  const extra = options.installation === undefined ? {} : { installation: options.installation }
  const inner = createOarRunner({
    runtime: options.runtime,
    capabilities: OPENCODE_CAPABILITIES,
    env: nativeSessionEnv(),
    ...extra,
  })
  const cwdBySession = new Map<string, string>()
  return {
    ...inner,
    start: async (input) => {
      const handle = await inner.start(input)
      cwdBySession.set(handle.sessionId, handle.cwd)
      return handle
    },
    startTurn: async (input) => {
      const handle = await inner.startTurn(input)
      cwdBySession.set(handle.sessionId, handle.cwd)
      return handle
    },
    resume: async (input: StartTurnInput) => {
      const previous = input.resumeSessionId === undefined ? undefined : cwdBySession.get(input.resumeSessionId)
      if (previous !== undefined && previous !== input.cwd) {
        throw new Error('opencode resume requires the same cwd')
      }
      const handle = await inner.resume(input)
      cwdBySession.set(handle.sessionId, handle.cwd)
      return handle
    },
  }
}
