/**
 * Default session Runner for the host loop (interim until `resolveRunner`): fake/scripted, or OpenCode when
 * `PERSONA_REAL_CLI=1` and `@botiverse/oar` can open the runtime. Lives here so only this package imports OAR.
 */

import { createFakeRunner } from './fake.ts'
import { createOarSessionRunner } from './oar/session.ts'
import { createOpencodeRunner } from './oar/opencode.ts'
import type { Runner } from './port.ts'

/**
 * Real OpenCode session runner, or `undefined` when OAR / the runtime is unavailable.
 */
export async function createOpencodeHostRunner(): Promise<Runner | undefined> {
  try {
    const oar = await import('@botiverse/oar')
    const runtime = oar.defaultRuntimes.get('opencode')
    if (runtime === undefined) return undefined
    const turn = createOpencodeRunner({ runtime })
    return createOarSessionRunner({ turn, personaId: 'worker', model: 'opencode/beam-free', permissionMode: 'allow-once' })
  } catch {
    return undefined
  }
}

/**
 * Fake runner unless `PERSONA_REAL_CLI=1` and OpenCode is available.
 */
export async function createDefaultHostRunner(): Promise<Runner> {
  if (process.env.PERSONA_REAL_CLI === '1') {
    const real = await createOpencodeHostRunner()
    if (real !== undefined) return real
  }
  return createFakeRunner()
}
