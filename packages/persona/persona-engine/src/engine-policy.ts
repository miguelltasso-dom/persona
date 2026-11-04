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

export type SessionReuse = 'reuse' | 'new'

/**
 * Reuse the warmed session when the persona and the cached prefix did not
 * change. A new persona or a volatile prefix starts a new session (OPT-5).
 * @param input - Turn, whether the seat is the same, whether the prefix matches.
 * @returns `reuse` (do not resend the prefix) or `new`.
 */
export function sessionReuseForTurn(input: {
  readonly kind: TurnKind
  readonly samePersona: boolean
  readonly prefixUnchanged: boolean
}): SessionReuse {
  if (!input.samePersona || !input.prefixUnchanged) return 'new'
  return 'reuse'
}
