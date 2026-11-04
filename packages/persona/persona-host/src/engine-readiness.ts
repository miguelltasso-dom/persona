/** Pure cached readiness projection; never probes, resolves a runner or spends a model call. */
import type { ConnectionView, EngineStatusView } from './types.ts'

/**
 * Project completed connection observations without treating an unfinished probe as logged out.
 * @param cards - Cached host cards; a single confirmed usable engine is sufficient.
 * @returns Readiness and a reason only when unavailability is definitive.
 */
export function cachedEngineReadiness(cards: readonly ConnectionView[]): Pick<EngineStatusView, 'state' | 'reason'> {
  if (cards.some(card => card.phase === 'ready' && card.available && card.loggedIn && card.error === undefined)) {
    return { state: 'ready', reason: null }
  }
  if (cards.some(card => card.phase === 'checking')) return { state: 'checking', reason: null }
  if (cards.some(card => card.error?.code === 'quota_exhausted')) {
    return { state: 'unavailable', reason: 'quota_exhausted' }
  }
  if (cards.some(card => card.available)) return { state: 'unavailable', reason: 'login_required' }
  return { state: 'unavailable', reason: 'none_connected' }
}
