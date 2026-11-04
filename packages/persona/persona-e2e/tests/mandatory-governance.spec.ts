/**
 * Acceptance from persona-spec/GOVERNANCE.md §4 (BRIEFING item 16, Atlas 03/11/2026).
 * Visual reference: persona-spec/design/ref-quem-cuida-de-quem.jpg
 * Start as `it.todo`; promote as Anvil (store/Remote), Forge (escalation, 2-day sim, assistant logic),
 * Lumen (organogram + Saúde + Teste dos 2 dias UI), Prism (shell/nav/onboarding hooks), Muse (visual/a11y) land.
 * Prefer fake clock + disposable PERSONA_HOME — no real AI spend.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const runApp = process.env.PERSONA_E2E === '1'

describe('mandatory governance — GOVERNANCE.md §4 (5 core)', () => {
  describe.skipIf(!runApp)('GOV layer 2 partial (gallery smoke)', () => {
    it('[GOV-1 partial · Lumen] organogram: Por pessoa | Por setor mounts (store match still Anvil)', () => {
      runVitestSubprocess('packages/persona/persona-e2e/tests/real-gallery-governance.spec.ts', [], {
        inheritPersonaE2e: true,
      })
    }, 420_000)

    it('[GOV-2 partial · Lumen] Saúde da equipe panel mounts with actionable copy', () => {
      runVitestSubprocess('packages/persona/persona-e2e/tests/real-gallery-governance.spec.ts', [], {
        inheritPersonaE2e: true,
      })
    }, 420_000)

    it('[GOV-3 partial · Lumen] Teste dos 2 dias timeline ≥2 rows (fake clock full path still Forge)', () => {
      runVitestSubprocess('packages/persona/persona-e2e/tests/real-gallery-two-day-health.spec.ts', [], {
        inheritPersonaE2e: true,
      })
    }, 420_000)
  })

  it('[GOV-1 · Anvil+Lumen+Prism] organogram matches store on edit responsável/setor (beyond gallery smoke)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/governance.spec.ts', ['-t', 'organogram by person and by sector'])
  }, 120_000)

  it('[GOV-2 · Forge+Lumen] Saúde flags all four problem types with 1-click fix verified', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/governance.spec.ts', ['-t', 'health flags'])
  }, 120_000)

  it('[GOV-3 · Forge+Anvil] Teste dos 2 dias fake clock: substituto vs stop list exact', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/governance.spec.ts', ['-t', '2-day test'])
  }, 120_000)

  it('[GOV-4 · Anvil+Forge] human marked "fora": approvals route to substituto; without substituto items wait with clear notice (no silent stall)', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/governance.spec.ts', ['-t', 'routes approval to the substituto'])
  }, 120_000)

  it('[GOV-5 · Forge+Prism+Muse] structure assistant: coherent organogram for 3 company-type snapshots; respects "uma persona por função contínua, não por tarefa"', () => {
    runVitestSubprocess('packages/persona/persona-core/tests/governance.spec.ts', ['-t', 'recommender'])
  }, 120_000)
})

/** GOV+ gallery: {@link ./real-gallery-governance.spec.ts} + {@link ./mandatory-governance-contract.spec.ts} when PERSONA_E2E=1. */
