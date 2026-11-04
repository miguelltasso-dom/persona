/**
 * T3 §9 grouped activity — layer 1 (no browser).
 * UI: Muse ActivityGroup + Prism on the thread.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('T3 §9 — fold de atividade (Forge)', () => {
  it('groupTurnActivity: mutations first, fail ≠ done, waiting ≠ finished', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/activity.spec.ts')
  }, 120_000)

  it('activityFromReport + foldTurnActivity + batchRouterBurst', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/activity.spec.ts')
  }, 120_000)
})
