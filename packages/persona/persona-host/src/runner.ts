/**
 * Rivet Runner for the host loop. Scripted/fake by default; real OpenCode when
 * PERSONA_REAL_CLI=1 and @botiverse/oar can open the runtime.
 */

import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { createFakeRunner, createOarSessionRunner, createOpencodeRunner } from '@deepseek-ai/dsh-persona-runners'

/** Factory the orchestration uses per project runtime. */
export type HostRunnerFactory = () => Promise<Runner>

/**
 * Default factory: fake/scripted unless PERSONA_REAL_CLI=1.
 */
export const createHostRunner: HostRunnerFactory = async () => {
  if (process.env.PERSONA_REAL_CLI === '1') {
    const real = await tryOpencode()
    if (real !== undefined) return real
  }
  return createFakeRunner()
}

async function tryOpencode(): Promise<Runner | undefined> {
  try {
    const oar = await import('@botiverse/oar')
    const registry = oar.createRuntimeRegistry(oar.defaultRuntimes())
    const runtime = registry.get('opencode')
    if (runtime === undefined) return undefined
    const turn = createOpencodeRunner({ runtime })
    return createOarSessionRunner({
      turn,
      personaId: 'worker',
      model: 'opencode/beam-free',
      permissionMode: 'allow-once',
    })
  } catch {
    return undefined
  }
}
