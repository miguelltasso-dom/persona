/**
 * Runner for the host loop. Scripted/fake by default; real OpenCode when PERSONA_REAL_CLI=1 and the runtime opens.
 * The OAR import lives in persona-runners (only that package depends on it).
 */

import type { Runner } from '@deepseek-ai/dsh-persona-engine'
import { createDefaultHostRunner } from '@deepseek-ai/dsh-persona-runners'

/** Factory the orchestration uses per project runtime. */
export type HostRunnerFactory = () => Promise<Runner>

/**
 * Default factory: fake/scripted unless PERSONA_REAL_CLI=1.
 */
export const createHostRunner: HostRunnerFactory = createDefaultHostRunner
