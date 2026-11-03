/**
 * Mandatory E2E scenarios from persona-spec/SCOPE.md (user-built team, Atlas 03/11/2026).
 * Implement when onboarding, vault, coordination, and Persona UI land (Probe + marco B+).
 * Run under PERSONA_E2E=1 with Tier 1/2 harness; UI quality bar: UX-GUIDE §4 vs dirD-tela.png.
 */
import { describe, it } from 'vitest'

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

  it.todo(
    'reduced motion: with prefers-reduced-motion: reduce (Playwright emulated media), onboarding and shell transitions do not run long-running motion; essential state changes remain visible (skeleton/spinner ok per UX-GUIDE)',
  )

  it.todo(
    'UI quality bar: Tier 1 capture (light + dark) structurally matches persona-assets/references/dirD-tela.png — sidebar density, primary action prominence, empty/loading states — via pixel or perceptual diff threshold documented in persona-e2e README (not Harness-default chrome alone)',
  )
})
