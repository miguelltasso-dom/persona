import { expect, it } from 'vitest'
import { cachedEngineReadiness } from '../src/engine-readiness.ts'
import type { ConnectionView } from '../src/types.ts'

function card(change: Partial<ConnectionView> = {}): ConnectionView {
  return { id: 'claude', kind: 'claude', available: false, loggedIn: false, phase: 'ready', loginHint: '', ...change }
}

it('reports no installed engine and an empty confirmed cache as none_connected', () => {
  expect(cachedEngineReadiness([])).toEqual({ state: 'unavailable', reason: 'none_connected' })
  expect(cachedEngineReadiness([card()])).toEqual({ state: 'unavailable', reason: 'none_connected' })
})

it('does not turn a checking card into login_required', () => {
  expect(cachedEngineReadiness([card({ phase: 'checking', available: true })]))
    .toEqual({ state: 'checking', reason: null })
})

it('separates login and quota failures using machine codes', () => {
  expect(cachedEngineReadiness([card({ available: true })]))
    .toEqual({ state: 'unavailable', reason: 'login_required' })
  expect(cachedEngineReadiness([card({ available: true, error: { code: 'quota_exhausted', message: 'Limite.' } })]))
    .toEqual({ state: 'unavailable', reason: 'quota_exhausted' })
})

it('a confirmed usable engine wins over other checking, logged out or exhausted engines', () => {
  expect(cachedEngineReadiness([
    card({ phase: 'checking' }),
    card({ kind: 'codex', id: 'codex', available: true, loggedIn: true }),
    card({ available: true, error: { code: 'quota_exhausted', message: 'Limite.' } }),
  ])).toEqual({ state: 'ready', reason: null })
})
