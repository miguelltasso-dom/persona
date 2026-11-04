# Gauge — relatórios (QA nº 2; mais recente no topo)

## 2026-11-04 13:20 — suítes de host fechadas: BYC/GOV/PB/GES/SB/W2 (93 pass, 12 bugs rastreados); app real no ar; achados de F5/fidelidade

### Placar (camada HOST real em memória, 0 IA; `vitest run packages/persona/persona-e2e/tests/mandatory-*-host.spec.ts`)
| Suíte | Arquivo | Resultado | Bugs rastreados (`it.fails`) |
|-------|---------|-----------|------------------------------|
| BYC-6 (§Aceite 1–3) | `mandatory-bring-your-context-host.spec.ts` | 15 pass | BYC-3b (reimportar nota ALTERADA é descartada), BYC-4c (dedup não reconhece o que o BYC gravou) |
| GOV-10 (§4, 5 cenários) | `mandatory-governance-host.spec.ts` | 17 pass | GOV-4 (routeApproval sem chamador no host) |
| PB-9 (§3 adversarial) | `mandatory-project-boards-host.spec.ts` | 14 pass | PB-9.3 (remover coluna com destino deixa cartão sem coluna) |
| GES-6 (§Aceite) | `mandatory-team-manager-host.spec.ts` | 15 pass | GES-1b (aprovar "assemble" não monta nada) |
| SB-7 (§6) | `mandatory-second-brain-host.spec.ts` | 20 pass | SB-1a (curadoria não ligada), SB-4b (two-way ignora edição da pasta) |
| W2-11 (§Aceite) | `mandatory-wave2-host.spec.ts` | 14 pass | resposta sem topicId, resposta duplicada, cor repetida renomeia, rótulo ../, rótulo duplicado |

**CORRIGIDOS pelos donos DURANTE a rodada** (o teste `it.fails` virou verde → removi o marcador e agora é teste normal): vazamento de item "só para mim" em `listVaultRecords` e na prévia (Anvil); editar linha com CPF (Forge); colisão da auditoria no mesmo ms; "Comece aqui" e export do Segundo cérebro respeitam ACL; permissão expirada fora das ativas; grant de escopo vazio; objetivo vazio no Gestor; aprovar plano do Gestor só dono; escrita cruzada de assuntos entre DMs; Ensinar entre projetos. Obrigado Anvil/Forge.

### Achados do APP REAL (host persistente; home limpo + onboarding "Em branco")
1. **Fidelidade (ALTA, Lumen)**: Saúde da equipe mostra "Atividade do Gestor de equipe — Atlas mudou 1 arquivo(s) e contratou 1 · 1 falhou" numa instalação limpa sem Gestor: `ConnectedTeamHealthPanel` cai em `MOCK_GESTOR_AUDIT_ACTIVITY` (gestor-audit-mock.ts) quando o host não tem auditoria. Atividade FABRICADA com nome de persona que não existe. Captura: `.maestri/tmp/gauge/explore-app/team-health.png`.
2. **F5 vazio (ALTA, Keel/Probe)**: `@axe-core/playwright` NÃO está instalado → `scanAccessibility` devolve `skipped:true` e `real-surface-a11y.spec.ts` só asserta `if (!axe.skipped)`: o "axe 0 em todas as telas" está VAZIO. Preciso do Keel para instalar `@axe-core/playwright` (devDependency de persona-e2e); sem isso não fecho F5.
3. Copy (baixa, Lumen): "1 personas" (plural fixo) em Quem cuida de quem; Saúde diz "A equipe se sustenta · 100" enquanto o Teste dos 2 dias mostra a única persona esperando aprovação ("ninguém substitui você").

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
