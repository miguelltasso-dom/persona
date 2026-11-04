/**
 * Internal Source scopes: channel, dm, persona, routine (P12).
 * GitHub / Telegram / e-mail: `externalSourceScope` + `receiveExternal` (X-3).
 * Feishu is out of v1.
 */

import type { ScopeResult, SourceScope } from './core/ports.ts'

export type InternalSourceKind = 'channel' | 'dm' | 'persona' | 'routine'

/**
 * Listening scope for one internal source kind.
 * Routine is never observed (only its scheduled fire). Channel may observe.
 * @param kind - Internal source kind.
 */
export function internalSourceScope(kind: InternalSourceKind): SourceScope {
  return {
    scope(input): ScopeResult {
      if (input.source !== kind) return { listened: false, reason: 'sourceMismatch' }
      const row = rowOf(kind, input.meta)
      if (row === undefined) return { listened: false, reason: 'missingScope' }
      return { listened: true, observed: kind === 'channel', row }
    },
  }
}

function rowOf(kind: InternalSourceKind, meta: Record<string, unknown>): string | undefined {
  const value = meta[`${kind}Id`]
  return typeof value === 'string' && value.length > 0 ? value : undefined
}
