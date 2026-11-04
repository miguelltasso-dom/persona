/**
 * Cheap D8 check: the packed/prepared dsh tree must carry the Persona profile
 * bundle and the client-ui-persona client entry. Empty #root is not this miss.
 */

import { existsSync } from 'node:fs'
import { join } from 'node:path'

export const PERSONA_RUNTIME_PACKAGES = [
  '@deepseek-ai/dsh-persona-app',
  '@deepseek-ai/dsh-client-ui-persona',
] as const

export interface PersonaRuntimeAssert {
  readonly ok: boolean
  readonly root: string
  readonly missing: readonly string[]
}

/**
 * Confirm persona-app + client.js exist under a prepared or installed dsh root.
 * @param dshRoot - `.../dsh` directory (prepared runtime or asar extract).
 */
export function assertPackedPersonaRuntime(dshRoot: string): PersonaRuntimeAssert {
  const modules = join(dshRoot, 'node_modules', '@deepseek-ai')
  const required = [
    join(modules, 'dsh-persona-app', 'package.json'),
    join(modules, 'dsh-persona-app', 'cordis.patch.yml'),
    join(modules, 'dsh-client-ui-persona', 'package.json'),
    join(modules, 'dsh-client-ui-persona', 'lib', 'client.js'),
  ]
  const missing = required.filter(path => !existsSync(path))
  return { ok: missing.length === 0, root: dshRoot, missing }
}
