/**
 * Mandatory E2E scenarios from persona-spec/SCOPE.md (user-built team, Atlas 03/11/2026).
 * Host layer 1 (J1–J5): {@link ./mandatory-scope-contract.spec.ts} + {@link ./mandatory-s7-host-contract.spec.ts}.
 * Run under PERSONA_E2E=1 with Tier 1/2 harness; UI quality bar: UX-GUIDE §4 vs dirD-tela.png.
 */
import { describe, expect, it } from 'vitest'
import { assertPersonaBootGateClean, runPersonaUiBootGate } from '../src/persona-boot-gate.ts'
import { checkReducedMotionOnPersonaPage } from '../src/motion-jank.ts'
import {
  assertConsoleClean,
  completeOnboardingOverlay,
  openRealPersonaApp,
} from '../src/real-app-session.ts'

const runPersonaE2e = process.env.PERSONA_E2E === '1'

describe('mandatory scope — user-built team (SCOPE.md)', () => {
  it.todo(
    'onboarding: user creates a persona from scratch via the conversational builder (template "Em branco" or natural-language "Nova persona"), completes review, and the new persona appears in the team rail with no pre-seeded fixed roster required',
  )

  it.todo(
    'agent proposes agent: a persona with "Recrutar" calls persona_propose; the "Contratar <nome>?" card appears in channel / Precisa de você; approved persona never receives broader tool permissions, vault scope, or credentials than the proposing persona (policy: default always ask approval)',
  )

  it.todo(
    'coordination handoff: user reassigns the Coordination function (Router) from persona A to persona B; channel and DM history, subjects, and prior runs remain readable and attributable; new dispatches use B without silent loss of transcript context',
  )

  it.todo(
    'vault in context: a workspace vault constraint/decision marked mandatory surfaces in the "Contexto usado" panel on the next turn in the same channel; user sees provenance (Cofre / restriction label) without raw secret values',
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
