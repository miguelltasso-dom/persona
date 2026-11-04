/**
 * Acceptance from persona-spec/PROJECT-BOARDS.md §3 (BRIEFING item 15, Atlas 03/11/2026).
 * Start as `it.todo`; promote to green tests as Forge (engine/workflow), Anvil (store/host),
 * Lumen (quadro/sprints UI), and Prism (Projetos · Quadros nav) land surfaces.
 * Prefer fake runners + disposable PERSONA_HOME — no real AI spend.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const runApp = process.env.PERSONA_E2E === '1'

/** PLAN PB-9: 5/5 §3 verdes + galeria/axe/loading quando PB-5..PB-7 existirem. */
describe('mandatory project boards — PB-9 / PROJECT-BOARDS.md §3 (5 core)', () => {
  describe.skipIf(!runApp)('PB layer 2 partial (Quadros hub)', () => {
    it('[PB-9+ partial · Lumen] Quadros hub smoke (isolated columns full §3 still below)', () => {
      runVitestSubprocess('packages/persona/persona-e2e/tests/real-gallery-project-boards.spec.ts', [], {
        inheritPersonaE2e: true,
      })
    }, 420_000)
  })

  it('[PB-9.1 · Anvil+Lumen · PB-5] create project "Contratação" and "Site": each board shows only its workflow columns; tasks never cross projects', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys/j12-two-boards.spec.ts')
  }, 120_000)

  it('[PB-9.2 · Forge+Anvil · PB-2] review complete → first column category done; Attention → first needs_you (Vigia + pull unchanged)', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys/j13-stage-columns.spec.ts')
  }, 120_000)

  it('[PB-9.3 · Forge+Lumen · PB-6] edit workflow (add/rename/reorder/remove with destination) without losing tasks; Vigia and pull still active', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys/j14-edit-flow.spec.ts')
  }, 120_000)

  it('[PB-9.4 · Anvil+Forge+Lumen · PB-7] sprint create/plan/end with rollover + milestone message in project channel', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys/j15-sprint.spec.ts')
  }, 120_000)

  it('[PB-9.5 · Forge+Prism · PB-3] Coordination proposes workflow from description; user accepts or edits before use', () => {
    runVitestSubprocess('packages/persona/persona-host/tests/journeys/j16-propose-flow.spec.ts')
  }, 120_000)
})

/** PB-9+ gallery hub: {@link ./real-gallery-project-boards.spec.ts}; full §3 UI still PB-9.1–9.5 below. */

/** PB-9 (Gauge): host real em memória (0 IA) + app real (Chrome, CLI fake). Bugs de produto ficam como `it.fails` "[BUG→dono]". */
describe('PB-9 — suítes reais do Gauge', () => {
  it('[PB-9 host] cenários do aceite no host real (adversarial)', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-project-boards-host.spec.ts', [])
  }, 300_000)

  it.skipIf(!runApp)('[PB-9 app] cenários no app real com capturas claro/escuro, axe e gate de painel', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/real-pb-app.spec.ts', [], { inheritPersonaE2e: true })
  }, 1_200_000)
})
