/**
 * S7 / C8 — onboarding do zero na UI (PLAN: host J1 verde em persona-spec/reports/journeys.md).
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const runApp = process.env.PERSONA_E2E === '1'

describe.skipIf(!runApp)('S7 partial — boot gate (dev seed path)', () => {
  it('[S7 partial · Probe] mandatory-boot-bootstrap: seeded team + nine panels (clean HOME still todo)', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-boot-bootstrap.spec.ts', [], {
      inheritPersonaE2e: true,
    })
  }, 420_000)

  it('[S7 partial · Probe] onboarding Playwright contract (step selectors vs locale)', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/playwright-onboarding-contract.spec.ts')
  }, 120_000)
})

describe('mandatory onboarding — from zero (UI, S7)', () => {
  it.todo(
    '[Prism+Anvil · J1 UI] clean PERSONA_HOME: five-step overlay → #geral with user roster (no fixed Atlas); first useful reply within 60s (fake runner); captures light/dark vs dirD-tela.png',
  )

  it.todo(
    '[Probe · S7] keyboard-only path through onboarding steps 1–5 without focus trap violations',
  )
})
