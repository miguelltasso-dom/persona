# Gauge — relatórios (QA nº 2; mais recente no topo)

## 2026-11-04 12:50 — BYC-6 host 12 ✔ + 5 bugs; GOV-10 host 16 ✔ + 2 bugs (camada app na fila da trava build)

### Specs novos (packages/persona/persona-e2e)
| Spec | Resultado | Como rodar |
|------|-----------|------------|
| `tests/mandatory-bring-your-context-host.spec.ts` (BYC §Aceite 1–3, host real em memória, 0 IA) | **12 pass + 5 expected-fail** (bugs abaixo) | `node scripts/persona/with-lock.mjs "Gauge byc" --lock check -- pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-bring-your-context-host.spec.ts` |
| `tests/mandatory-governance-host.spec.ts` (GOVERNANCE §4, host real) | **16 pass + 2 expected-fail** | idem, arquivo `mandatory-governance-host.spec.ts` |
| `src/bring-context-fixtures.ts` + `fixtures/bring-your-context/paste-{chatgpt,claude}.md` | vault com .obsidian/.trash/png/pdf é criado em pasta temporária (sem binário no git); token sintético montado em runtime | — |
`check-pkg persona-e2e`: OK. Convenção: bug de produto = `it.fails` com nome `[BUG→dono] …` (assertiva descreve o comportamento EXIGIDO; quando o dono corrige o teste fica vermelho e eu tiro o marcador).

### BUGS devolvidos (maestri ask enviado a cada dono)
| # | Dono | Gravidade | Resumo / passo exato |
|---|------|-----------|----------------------|
| 1 | Anvil | **alta (privacidade)** | `listVaultRecords` (persona-host/src/index.ts:3301) devolve itens "só para mim" de outro membro: Ana aplica `private`, Bia (member, projeto shared) lista o Cofre e vê o texto da Ana. Teste: `[BUG→Anvil] [BYC-4b] "só para mim"…` |
| 2 | Anvil | **alta (privacidade)** | `previewBringContextPaste`/`…VaultFolder` (index.ts:3570/3583) passam TODOS os registros ao detector: a Bia vê `conflictQuestion` citando a decisão privada da Ana. Teste `[BYC-4b] a prévia de outro membro…` |
| 3 | Anvil+Forge | média | o que o BYC grava leva sufixo "(colado do …)" no body, então a mesma frase vinda de outra IA depois NÃO é 'duplicate' (Jaccard<0,8) e grava de novo. Teste `[BYC-4c] a mesma frase…` |
| 4 | Anvil+Forge | média | reimportar vault com nota ALTERADA: `prior` nunca é passado (bring-context-walk.ts) e o id (path+índice) já existe ⇒ `applyContextProposals` descarta a versão nova em silêncio. Teste `[BYC-3b] reimportar reprocessa…` |
| 5 | Forge | baixa/média | `decideBringApply` faz `if (blocked) continue` antes do corpo editado: editar a linha para remover o CPF não a libera. Teste `[BYC-2b] editar a linha…` (se a regra do produto for "bloqueado nunca grava", me diga e eu inverto o teste) |
| 6 | Anvil | média | auditoria de governança: id `${action}:${now}:${actor}` colide em duas escritas no mesmo ms ⇒ `StoreError conflict` DEPOIS de gravar (loop do Gestor/applyStructure). Teste `[GOV-5] dois setSector no mesmo milissegundo…` |
| 7 | Forge+Anvil | **aceite GOV-4 não atendido** | `routeApproval` só é chamado pelo próprio teste (zero chamadas no host): marcar a Ana "fora" não muda para quem vai nenhuma aprovação real; `ApprovalView` não tem campo de roteamento/aviso. Hoje só o Teste dos 2 dias simula a cadeia. Proposta de contrato enviada (routedToId/onBehalfOfId/waitNotice). |

### Achados de infra
- Web host sem `PERSONA_VAULT_TEST_CIPHER=1` não sobe (`connection` plugin: VaultUnavailableError) — já corrigido no `web-host.ts` pelo Probe; meus scripts passam por `startWebHost`.
- Fila `build` longa (8 tickets): enfileirei 1 host persistente (`.maestri/tmp/gauge/host-up.mts`, libera a trava ao ficar pronto) para iterar a camada app sem pagar boot por rodada. Encerro com `.maestri/tmp/gauge/host.stop`.

### Próximo
GOV-10/PB-9 camada app (capturas claro/escuro, axe, loading preso) no host persistente; depois BYC UI, GES-6, SB-7, W2-11, B8, C9, E10, F5.

## 2026-11-04 — início (entrada na equipe)
Fila: BYC-6, GES-6, SB-7, PB-9+GOV-10, W2-11, E10+B8, F5 (axe/teclado), C9 (galeria real vs dirD).
Pacote: `packages/persona/persona-e2e` (só testes/fixtures). Não rodo CLI real. Uma trava `build` por vez.
