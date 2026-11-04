/**
 * V1-P0-1 first delivery — layer 1 (engine + client step 5 + v1-close slice).
 * Real CLI: `mandatory-first-delivery-real.spec.ts` (`PERSONA_REAL_CLI=1`).
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

describe('First delivery — engine (V1-P0-1)', () => {
  it('firstDeliveryAsk + measureFirstDeliveryAcceptance 4/4', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/first-delivery.spec.ts')
  }, 120_000)
})

describe('First delivery — client step 5 (Prism)', () => {
  it('Pedir agora + harness gate on step 3', () => {
    runVitestSubprocess('packages/persona/client-ui-persona/tests/onboarding-first-delivery.client.spec.tsx')
  }, 120_000)

  it('deriveFirstDeliveryMilestone from kanban done', () => {
    runVitestSubprocess('packages/persona/client-ui-persona/tests/derive-first-delivery.client.spec.tsx')
  }, 120_000)
})

describe('First delivery — host (V1-P0-2)', () => {
  it('fake runner: Ticket → first_delivery ready + milestone', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/first-delivery.host.spec.ts')
  }, 120_000)
})

describe('First delivery — v1-close fold', () => {
  it('measureV1Close includes firstDelivery acceptance', () => {
    runVitestSubprocess('packages/persona/persona-engine/tests/v1-close.spec.ts', [
      '-t',
      'measureV1Close',
    ])
  }, 120_000)
})
