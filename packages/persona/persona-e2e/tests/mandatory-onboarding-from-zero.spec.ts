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

describe.skipIf(!runApp)('mandatory onboarding — from zero (UI, S7)', () => {
  it('[Probe · S7] clean PERSONA_HOME: five-step overlay → ask → delivery in #geral → accept (fake CLI, < 2 min), and the no-AI path', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-first-delivery-fake.spec.ts', [
      '--testTimeout', '600000', '--hookTimeout', '400000',
    ], { inheritPersonaE2e: true })
  }, 1_200_000)

  it('[Probe · S7] keyboard-only path through onboarding steps 1–5 without focus trap violations', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-onboarding-keyboard.spec.ts', [
      '--testTimeout', '400000', '--hookTimeout', '400000',
    ], { inheritPersonaE2e: true })
  }, 600_000)
})

describe('mandatory onboarding — from zero (UI, S7) — still open', () => {
  it.todo(
    '[Gauge · C9] clean PERSONA_HOME onboarding steps: captures light/dark vs dirD-tela.png (no fixed Atlas in the roster)',
  )
})
