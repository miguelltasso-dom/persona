/**
 * Which engine class a turn may use (TOKEN-OPTIMIZATION §2.5 / OPT-5).
 * Session reuse is Rivet; this file only names the policy.
 */

import type { TurnKind } from '@deepseek-ai/dsh-persona-core'

export type EngineClass = 'cheap' | 'persona'

/**
 * Triage / librarian / watchdog / initiative / evaluation stay on the cheap
 * engine. Execution and channel reply use the persona's own engine.
 * @param kind - Turn kind from the ledger.
 * @returns `cheap` or `persona`.
 */
export function engineClassForTurn(kind: TurnKind): EngineClass {
  if (kind === 'execution' || kind === 'reply') return 'persona'
  return 'cheap'
}
