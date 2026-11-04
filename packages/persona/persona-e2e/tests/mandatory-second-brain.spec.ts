/**
 * Acceptance from persona-spec/SECOND-BRAIN.md §6 (BRIEFING item 19, Atlas 03/11/2026).
 * Queue: after WAVE3 / BRING-YOUR-CONTEXT land; start as `it.todo`.
 * Promote as Forge (brain tools, curadoria, permission gate, compileContext),
 * Anvil (store/pages/versions/ACL), Lumen (Empresa › Segundo cérebro UI),
 * Prism (shell nav under Empresa), Muse (grafo/a11y).
 * Prefer fake clock + disposable PERSONA_HOME — no real AI spend.
 */
import { describe, it } from 'vitest'
import { runVitestSubprocess } from '../src/run-vitest-subprocess.ts'

const runApp = process.env.PERSONA_E2E === '1'

describe.skipIf(!runApp)('SB layer 2 partial (Segundo cérebro gallery)', () => {
  it('[SB-5 partial · Lumen] Empresa › Segundo cérebro panel smoke', () => {
    runVitestSubprocess('packages/persona/persona-e2e/tests/real-gallery-second-brain.spec.ts', [], {
      inheritPersonaE2e: true,
    })
  }, 420_000)
})

describe('mandatory second brain — curadoria (§6 bullet 1)', () => {
  it.todo(
    '[SB-1a · Forge+Anvil] concluir tarefa com fato novo → página tipada atualizada/criada com fonte (tarefa/conversa) e backlink',
  )

  it.todo(
    '[SB-1b · Forge] fato contraditório ao corpo existente → contradição sinalizada na página/início; corpo anterior preservado (versão/histórico, não overwrite)',
  )

  it.todo(
    '[SB-1c · Forge] regra/decisão obrigatória nova exige aceite humano; demais entra conforme política auto|propor (sem virar regra de turno sozinha)',
  )
})

describe('mandatory second brain — ACL e DM (§6 bullet 2)', () => {
  it.todo(
    '[SB-2a · Forge+Anvil] conteúdo originado em DM vira página privada dos participantes; nunca visível em página/listagem do canal #geral',
  )

  it.todo(
    '[SB-2b · Forge+Anvil] brain_search de persona B não retorna página ACL-restrita a persona A (audiência DM ou visibilidade explícita)',
  )

  it.todo(
    '[SB-2c · Lumen+Probe] UI Segundo cérebro: membro sem ACL não vê título/snippet da página na busca nem no índice por tipo',
  )
})

describe('mandatory second brain — permissão lembrada (§6 bullet 3; adversariais)', () => {
  it.todo(
    '[SB-3a · Forge+Anvil] mesma persona + mesma ação + mesmo escopo/limites dentro da validade → gate não pergunta; trilha audita ("não perguntei porque você permitiu em …")',
  )

  it.todo(
    '[SB-3b · adversarial · Forge] ação **maior** que a lembrada (ex.: enviar vs rascunhar) → **pergunta de novo**; permissão não expande',
  )

  it.todo(
    '[SB-3c · adversarial · Forge] **outro alvo** (outro cliente/canal/arquivo) dentro do mesmo verbo → **pergunta de novo**',
  )

  it.todo(
    '[SB-3d · adversarial · Forge] mesma ação/escopo mas **outra persona** → **pergunta de novo**; permissão não transfere',
  )

  it.todo(
    '[SB-3e · adversarial · Forge+Probe] validade **expirada** (ex.: 7 dias, relógio falso) → **pergunta de novo**',
  )

  it.todo(
    '[SB-3f · adversarial · Lumen+Forge] **Revogar** na UI → efeito imediato; próxima ação idêntica **pergunta de novo**',
  )

  it.todo(
    '[SB-3g · adversarial · Forge] escopo ambíguo ou limites omitidos na página Permissão concedida → trata como **não coberto** (pergunta, não dispensa)',
  )

  it.todo(
    '[SB-3h · Lumen+Prism] fluxo "Lembrar esta permissão" após aprovação grava escopo explícito (persona, ação, alvo, limites, validade: uma vez|7d|até revogar)',
  )
})

describe('mandatory second brain — export vault (§6 bullet 4)', () => {
  it.todo(
    '[SB-4a · Forge+Rivet] exportar para pasta → .md legível, links [[…]] preservados, metadados/propriedades no frontmatter ou bloco tipado',
  )

  it.todo(
    '[SB-4b · Forge] reimportar mesma pasta → path+hash; sem duplicar páginas/versões',
  )
})

describe('mandatory second brain — UI Empresa (§5)', () => {
  it.todo(
    '[SB-5a · Lumen+Prism] nav Empresa › Segundo cérebro (não rail principal): início com o que mudou hoje, contradições, permissões ativas',
  )

  it.todo(
    '[SB-5b · Lumen] página: propriedades, backlinks, histórico de versões, editor markdown manual; lista Permissões com revogar',
  )
})

/** Contracts: {@link ./mandatory-second-brain-contract.spec.ts}. Depends on BYC import path when curating from vault. */
