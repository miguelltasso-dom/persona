/**
 * Acceptance from persona-spec/MAESTRO.md — função **Gestor de equipe** (BRIEFING 20).
 * UI/selo: "Gestor de equipe" / "Gestor" — never "Maestro" (Miguel 04/11).
 * Start as `it.todo`; promote as Forge, Anvil, Prism, Lumen, Muse.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const runApp = process.env.PERSONA_E2E === '1'

describe.skipIf(!runApp)('GES layer 2 partial (contracts replay)', () => {
  it('[GES-6 partial · Forge] layer-1 Gestor contracts (UI plan card still todo)', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-team-manager-contract.spec.ts')
  }, 180_000)
})

describe('mandatory Gestor de equipe — montar equipe (§ Aceite 1)', () => {
  it(
    '[GES-1a · Prism+Forge] chat pedido natural ("monte um time para o Site") → cartão de plano (contratar N, projeto, fluxo Site, sprint 1) com Aprovar / Ajustar',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-team-manager-host.spec.ts', ['-t', 'GES-1a']) },
    300_000,
  )

  it(
    '[GES-1b · Forge+Anvil] após Aprovar: personas criadas com ferramentas/motor/orçamento ≤ Gestor; alocadas no projeto Site; quadro fluxo Site + sprint 1 planejado',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'assembles a team, board and sprint 1',
      ])
    },
    120_000,
  )

  it.skipIf(process.env.PERSONA_E2E !== '1')(
    '[GES-1c · Prism+Muse] pós-aprovação: personas entram animadas na faixa da equipe e no rail (locale pt-BR; reduced-motion)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/real-sb-ges-app.spec.ts', ['-t', 'GES-1c'], { inheritPersonaE2e: true }) },
    900_000,
  )
})

describe('mandatory Gestor de equipe — limites e aprovação (§ Aceite 2)', () => {
  it(
    '[GES-2a · Forge] modo "sempre perguntar": nenhuma contratação/alocação/reorganização executa sem aprovação humana explícita',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'always_ask never applies a hire',
      ])
    },
    120_000,
  )

  it(
    '[GES-2b · adversarial · Forge] Gestor **sem** "pode conceder Gestor" tenta atribuir função Gestor de equipe → **recusado**',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'never grants Gestor de equipe without the explicit permit',
      ])
    },
    120_000,
  )

  it(
    '[GES-2c · adversarial · Forge] persona proposta com **mais ferramentas/motor** que o teto do Gestor → **recusado**',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'never creates a hire with more access than the Gestor',
      ])
    },
    120_000,
  )

  it(
    '[GES-2d · adversarial · Forge] contratar acima do **máximo de personas** do Gestor → **recusado**; sem persona parcial',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'respects max personas and budget',
      ])
    },
    120_000,
  )

  it(
    '[GES-2e · adversarial · Forge] plano acima do **orçamento total** → **recusado** ou exige aprovação (nunca silent over-budget)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/mandatory-team-manager-host.spec.ts', ['-t', 'GES-2e']) },
    300_000,
  )

  it(
    '[GES-2f · adversarial · Forge] alocar/contratar fora dos **setores/projetos** permitidos → **recusado**',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'allocates a persona inside the mandate and refuses a project outside scope',
      ])
    },
    120_000,
  )

  it(
    '[GES-2g · Forge] "auto dentro de limites" executa; "auto e avisar" executa + auditoria',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'reorganizes work, pauses idle with notice',
      ])
    },
    120_000,
  )
})

describe('mandatory Gestor de equipe — vários Gestores (§ Aceite 3)', () => {
  it(
    '[GES-3a · Forge] dois Gestores com escopos distintos: ações de A não alteram projeto/setor fora do escopo de A',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'keeps two Gestores on different scopes from colliding',
      ])
    },
    120_000,
  )

  it(
    '[GES-3b · adversarial · Forge] conflito (dois Gestores, mesmo papel): primeiro propõe; segundo comenta; empate → Precisa de você',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'second Gestor comments; human tie picks the winner',
      ])
    },
    120_000,
  )

  it(
    '[GES-3c · Lumen+Anvil] auditoria com **motivo** visível no perfil do Gestor e Saúde da equipe',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'hires within Gestor access and writes the audit reason',
      ])
    },
    120_000,
  )
})

describe('mandatory Gestor de equipe — UI editor (§ UI)', () => {
  it.skipIf(process.env.PERSONA_E2E !== '1')(
    '[GES-4a · Prism] editor: interruptor **Gestor de equipe** + limites; selo **Gestor** no cartão (sem string "Maestro" na UI)',
    () => { runVitestSubprocess('packages/persona/persona-e2e/tests/real-sb-ges-app.spec.ts', ['-t', 'GES-4a'], { inheritPersonaE2e: true }) },
    900_000,
  )

  it(
    '[GES-4b · Lumen] organograma/rail: selo "Gestor" coerente com store; Coordenação template default também Gestor',
    () => {
      runVitestSubprocess('packages/persona/persona-core/tests/gestor.spec.ts', [
        '-t',
        'makes coordination also Gestor de equipe on the suggested template',
      ])
    },
    120_000,
  )
})

/** Contracts: {@link ./mandatory-team-manager-contract.spec.ts}. */
