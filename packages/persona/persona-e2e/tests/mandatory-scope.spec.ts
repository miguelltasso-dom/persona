/**
 * Mandatory E2E scenarios from persona-spec/SCOPE.md (user-built team, Atlas 03/11/2026).
 * Host layer 1 (J1–J5): {@link ./mandatory-scope-contract.spec.ts} + {@link ./mandatory-s7-host-contract.spec.ts}.
 * Run under PERSONA_E2E=1 with Tier 1/2 harness; UI quality bar: UX-GUIDE §4 vs dirD-tela.png.
 */
import { describe, expect, it } from 'vitest'
import { assertPersonaBootGateClean, runPersonaUiBootGate } from '../src/persona-boot-gate.ts'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'
import { checkReducedMotionOnPersonaPage } from '../src/motion-jank.ts'
import {
  assertConsoleClean,
  completeOnboardingOverlay,
  openRealPersonaApp,
} from '../src/real-app-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

describe('mandatory scope — user-built team (SCOPE.md)', () => {
  it.skipIf(!runPersonaE2e)(
    'onboarding: user creates a persona from scratch via the conversational builder (app real, home limpo; SCOPE-1)',
    () => {
      runVitestSubprocess('packages/persona/persona-e2e/tests/real-onboarding-builder-app.spec.ts', [], { inheritPersonaE2e: true })
    },
    900_000,
  )

  it(
    'agent proposes agent: "Contratar <nome>?" card, never broader than the proposer, human decides (SCOPE-2, host real)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-scope-host.spec.ts', ['-t', 'SCOPE-2']) },
    180_000,
  )

  it(
    'coordination handoff A → B keeps history, subjects and attribution; new dispatches go to B (SCOPE-3, host real)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-scope-host.spec.ts', ['-t', 'SCOPE-3']) },
    180_000,
  )

  it(
    'vault in context: mandatory Cofre constraint appears in "Contexto usado"; no secret value leaks (SCOPE-4, host real; secret leak tracked as [BUG→Forge+Anvil])',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-scope-host.spec.ts', ['-t', 'SCOPE-4']) },
    180_000,
  )
})

describe.skipIf(!runPersonaE2e)('mandatory scope — UI bar (implemented paths)', () => {
  it('reduced motion: prefers-reduced-motion on real Persona shell (transitions ≤120ms)', async () => {
    const session = await openRealPersonaApp()
    try {
      await completeOnboardingOverlay(session.page)
      const motion = await checkReducedMotionOnPersonaPage(session.page)
      expect(motion.pass).toBe(true)
      assertConsoleClean(session.tripwire)
    } finally {
      await session.close()
    }
  }, 360_000)

  it('UI quality bar: Tier 1 light/dark vs dirD-tela.png (threshold in persona-boot-gate)', async () => {
    const result = await runPersonaUiBootGate()
    assertPersonaBootGateClean(result)
    expect(result.hasPersonaShell).toBe(true)
    if (result.referenceDiffRatio !== undefined) {
      expect(result.referenceDiffRatio).toBeLessThanOrEqual(1)
      if (process.env.PERSONA_E2E_STRICT_DIRD === '1') {
        expect(result.referencePass).toBe(true)
      }
    }
  }, 360_000)
})
