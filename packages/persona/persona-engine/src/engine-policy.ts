/**
 * Which engine class a turn may use (TOKEN-OPTIMIZATION §2.5 / OPT-5).
 * Session reuse is Rivet; this file only names the policy.
 */

import type { TurnKind } from '@deepseek-ai/dsh-persona-core'

/** Cheap support engine vs the persona's own engine (OPT-5). */
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

/** Keep the warmed prefix (`reuse`) or start a new session (`new`). */
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

/** OPT-5 domain score: cheap-support, persona-heavy, session-reuse. */
export interface Opt5Acceptance {
  readonly passed: number
  readonly total: 3
  readonly failed: readonly string[]
}

/**
 * OPT-5 policy score (cheap vs persona + reuse). Rivet owns the session pool.
 * @returns Passed count and failed ids. Empty `failed` is the domain gate.
 */
export function measureOpt5Acceptance(): Opt5Acceptance {
  const failed: string[] = []
  if (engineClassForTurn('triage') !== 'cheap' || engineClassForTurn('librarian') !== 'cheap'
    || engineClassForTurn('watchdog') !== 'cheap' || engineClassForTurn('initiative') !== 'cheap') {
    failed.push('cheap-support')
  }
  if (engineClassForTurn('execution') !== 'persona' || engineClassForTurn('reply') !== 'persona') {
    failed.push('persona-heavy')
  }
  const reuse = sessionReuseForTurn({ kind: 'reply', samePersona: true, prefixUnchanged: true })
  const fresh = sessionReuseForTurn({ kind: 'reply', samePersona: false, prefixUnchanged: true })
  if (reuse !== 'reuse' || fresh !== 'new') failed.push('session-reuse')
  return { passed: 3 - failed.length, total: 3, failed }
}
