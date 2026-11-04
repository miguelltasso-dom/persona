/**
 * Acceptance from persona-spec/PROJECT-BOARDS.md §3 (BRIEFING item 15, Atlas 03/11/2026).
 * Start as `it.todo`; promote to green tests as Forge (engine/workflow), Anvil (store/host),
 * Lumen (quadro/sprints UI), and Prism (Projetos · Quadros nav) land surfaces.
 * Prefer fake runners + disposable PERSONA_HOME — no real AI spend.
 */
import { describe, it } from 'vitest'

/** PLAN PB-9: 5/5 §3 verdes + galeria/axe/loading quando PB-5..PB-7 existirem. */
describe('mandatory project boards — PB-9 / PROJECT-BOARDS.md §3 (5 core)', () => {
  it.todo(
    '[PB-9.1 · Anvil+Lumen · PB-5] create project "Contratação" and "Site": each board shows only its workflow columns; tasks never cross projects (host: Forge J12 verde — journeys.md; UI E2E pending Lumen PB-5)',
  )

  it.todo(
    '[PB-9.2 · Forge+Anvil · PB-2] review complete → first column category `done`; Attention → first `needs_you` (Vigia + pull unchanged)',
  )

  it.todo(
    '[PB-9.3 · Forge+Lumen · PB-6] edit workflow (add/rename/reorder/remove with destination) without losing tasks; Vigia and pull still active',
  )

  it.todo(
    '[PB-9.4 · Anvil+Forge+Lumen · PB-7] sprint create/plan/end with rollover + milestone message in project channel',
  )

  it.todo(
    '[PB-9.5 · Forge+Prism · PB-3] Coordination proposes workflow from description; user accepts or edits before use',
  )
})

/** PB-9+ gallery hub: {@link ./real-gallery-project-boards.spec.ts}; full §3 UI still PB-9.1–9.5 below. */
