/**
 * S7 / SCOPE.md layer 1 — host journeys + e2e-flows (no browser).
 * UI layer 2: {@link ./mandatory-scope.spec.ts} + {@link ./mandatory-onboarding-from-zero.spec.ts}.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('SCOPE — host contracts (journeys J1–J5 + propose flow)', () => {
  it('J1 onboarding: empty team until user hires; first message gets a reply', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys/j01-onboarding.spec.ts')
  }, 120_000)

  it('J3 hire / persona_propose: chain hire cards without escalating access before approval', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys/j03-hire.spec.ts')
    runVitestSubprocess('packages/persona/persona-host/tests/e2e-flows.spec.ts', ['-t', 'persona_propose'])
  }, 180_000)

  it('J4 coordination handoff: history and tasks survive Coordination reassignment', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys/j04-coordination.spec.ts')
  }, 120_000)

  it('J5 vault in context: approved Cofre fact surfaces in Contexto usado; DM isolation', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys/j05-cofre.spec.ts')
  }, 120_000)
})
