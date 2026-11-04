/**
 * Acceptance from persona-spec/GOVERNANCE.md §4 (BRIEFING item 16, Atlas 03/11/2026).
 * Visual reference: persona-spec/design/ref-quem-cuida-de-quem.jpg
 * Start as `it.todo`; promote as Anvil (store/Remote), Forge (escalation, 2-day sim, assistant logic),
 * Lumen (organogram + Saúde + Teste dos 2 dias UI), Prism (shell/nav/onboarding hooks), Muse (visual/a11y) land.
 * Prefer fake clock + disposable PERSONA_HOME — no real AI spend.
 */
import { describe, it } from 'vitest'

describe('mandatory governance — GOVERNANCE.md §4 (5 core)', () => {
  it.todo(
    '[GOV-1 · Anvil+Lumen+Prism] organogram "Quem cuida de quem": Por pessoa | Por setor matches store; change responsável or setor updates live in UI',
  )

  it.todo(
    '[GOV-2 · Forge+Lumen] Saúde da equipe flags: persona sem responsável, setor sem cobertura, rotina sem dono, ponto único de falha (actionable, pt-BR)',
  )

  it.todo(
    '[GOV-3 · Forge+Anvil+Probe] Teste dos 2 dias (fake clock): with substituto/autonomia configured routines keep running; without, panel lists exactly what stops',
  )

  it.todo(
    '[GOV-4 · Anvil+Forge] human marked "fora": approvals route to substituto; without substituto items wait with clear notice (no silent stall)',
  )

  it.todo(
    '[GOV-5 · Forge+Prism+Muse] structure assistant: coherent organogram for 3 company-type snapshots; respects "uma persona por função contínua, não por tarefa"',
  )
})

/** GOV+ gallery: {@link ./real-gallery-governance.spec.ts} + {@link ./mandatory-governance-contract.spec.ts} when PERSONA_E2E=1. */
