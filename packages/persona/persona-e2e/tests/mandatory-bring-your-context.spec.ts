/**
 * Acceptance from persona-spec/BRING-YOUR-CONTEXT.md (BRIEFING item 18, Atlas 03/11/2026).
 * Start as `it.todo`; promote as Forge (parse/proposals/dedup), Rivet (folder picker + Electron),
 * Lumen (Importar/revisão/Cofre), Prism (onboarding passo 2), Muse (a11y/copy tabs).
 * Prefer fixtures under persona-e2e/fixtures/bring-your-context/ + disposable PERSONA_HOME — no real AI spend.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const runApp = process.env.PERSONA_E2E === '1'

describe('mandatory BYC — surfaces (BRING-YOUR-CONTEXT §Onde aparece)', () => {
  describe.skipIf(!runApp)('BYC layer 2 partial (Importadores)', () => {
    it('[BYC-1b partial · Lumen] Importadores BYC block gallery smoke', () => {
      runVitestSubprocess('packages/persona/persona-e2e/tests/real-gallery-byc-import.spec.ts', [], {
        inheritPersonaE2e: true,
      })
    }, 420_000)
  })

  it.todo(
    '[BYC-1a · Prism] onboarding passo 2 (Sobre a empresa): bloco BYC abaixo da descrição (onboarding E2E still todo)',
  )

  it.todo(
    '[BYC-1b · Lumen] Importar + Importadores full §Onde aparece beyond gallery smoke',
  )

  it.todo(
    '[BYC-1c · Prism+Muse] abas opcionais ChatGPT/Claude/Gemini/Outra só mudam dica de colagem; texto do prompt único (locale pt/en)',
  )
})

describe('mandatory BYC — colar resposta (§Aceite 1)', () => {
  it.todo(
    '[BYC-2a · Forge+Probe] fixture paste com seções ## do prompt → propostas tipadas brief/constraint/decision/memory com proveniência ("colado do …")',
  )

  it.todo(
    '[BYC-2b · Forge+Lumen] linhas com (incerto) destacadas na revisão; CPF/cartão/token detectados → bloqueados por padrão (não graváveis)',
  )

  it.todo(
    '[BYC-2c · Forge] múltiplas colagens sequenciais (uma por IA) acumulam propostas sem perder proveniência por colagem',
  )
})

describe('mandatory BYC — pasta vault (§Aceite 2)', () => {
  it.todo(
    '[BYC-3a · Forge+Rivet] fixture vault (.md + frontmatter + [[links]] + .obsidian/ + .trash/ + binário) → só .md importados; ignorados listados ao usuário',
  )

  it.todo(
    '[BYC-3b · Forge] reimportar mesma pasta: path+hash — só arquivos alterados reprocessados; sem duplicar chunks no Cofre',
  )

  it.todo(
    '[BYC-3c · Rivet] Electron: Escolher pasta abre seletor nativo; web dev usa fallback documentado (sem quebrar Organizar)',
  )
})

describe('mandatory BYC — revisão e Cofre (§Aceite 3 + §Organização)', () => {
  it.todo(
    '[BYC-4a · Lumen+Anvil] revisão: aceitar grava item no Cofre; descartar não persiste; editar grava texto editado',
  )

  it.todo(
    '[BYC-4b · Lumen+Anvil] "só para mim (privado)" não aparece para outro membro do workspace (fixture dois usuários ou ACL fake)',
  )

  it.todo(
    '[BYC-4c · Forge] deduplica contra Cofre existente; conflito com decisão fixada vira pergunta na revisão (não overwrite silencioso)',
  )

  it.todo(
    '[BYC-4d · Forge] nada vira regra obrigatória sem aceite explícito; pipeline permanece local (sem upload)',
  )
})

/** BYC contracts: {@link ./mandatory-bring-your-context-contract.spec.ts}. Gallery Importadores: {@link ./real-gallery-blank-panel.spec.ts} slug `importar`. */
