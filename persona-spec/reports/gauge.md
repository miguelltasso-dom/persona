# Gauge — relatórios (QA nº 2; mais recente no topo)

## 2026-11-04 16:55 — D-069 verificador da execução real: prova independente da cadeia (caminho crítico)

O verificador puro já existe (Forge: `persona-engine/src/first-delivery-real-run.ts`, 57/57; contrato `contracts/first-delivery-real-proof.md`) e o Probe já o liga (`src/real-run-verifier.ts` + `scripts/verify-real-run.ts`). Não reescrevi nada. Entreguei a prova do ponto de vista de quem não confia no verde: `persona-e2e/tests/mandatory-first-delivery-real-verifier.spec.ts` — **56/56 em 9 s, zero IA, sem navegador** (cabe no gate); `check-pkg persona-e2e` OK (40,8 s).

- **Cadeia testada:** tabela `turn_ledger` com o esquema real da migração V18 (CHECK de kind/origem/contadores) → `readLedgerEvidence` → `canonicalLedgerRows` → `verifyRealFirstDeliveryRun`.
- **Verde só com:** 1 `execution` medida no Ticket do pedido, saída > 0, CLI conhecido, entrega do runner no #geral, cartão `done`, 1 marco, < 120 s (119,999 s passa; 120,000 s, NaN e negativo reprovam).
- **Reprova (e conta):** "entregue" na tela sem linha no ledger; origem estimada ou NULL; saída 0; motor desconhecido; outro Ticket; qualquer turno extra (triage/reply/initiative/librarian/watchdog/evaluation/execution, antes ou depois); `inject` (o banco recusa gravar e o verificador recusa ler, sem descartar a linha); coluna obrigatória NULL; carimbo sem offset (formato `datetime()` do SQLite); camadas maiores que a entrada; id duplicado.
- **Orçamento:** 3×1 turno fecha na 3ª; 4ª tentativa nunca fecha (mesmo com 0 turno nas anteriores); 4 turnos no total reprova; índice/contagem da tentativa atual precisa bater com o ledger; histórico ausente/null/negativo/fracionário/texto/NaN/Infinity falha fechado (`paidTurnsTotal = null`).
- **Veredito sem payload:** nada do corpo da mensagem nem caminho local.

**Achados enviados ao Probe (dono do harness):**
1. *Conflito guarda × verificador:* tentativa anterior com `paidTurns = null` — o guardião conta 1 e libera a 2ª, mas o verificador trata null como corrupto, então a 2ª tentativa nunca fecha verde (turno pago à toa). Liquidar `max(paidTurns ?? 1, capTurns ?? 0)` por linha antes de chamar o verificador (idem ledger com 0 linhas e limitador com 1).
2. `readAttempts`/`paidTurnsSpent` são privados do spec e não validam tipos: `paidTurns` negativo vira 0 e reabre saldo. Extrair para `src/real-run-budget.ts` (função pura), que eu cubro com teste.
3. `verify-real-run.ts` deriva `loggedCli` do engine do próprio ledger, então `connected-cli` é circular; fake × real depende só de `exeIdentity` + `fakeLeaks`.

As regras do guardião ("prova anterior verde", "diagnóstico antes da 2ª tentativa") continuam do spec do Probe.

## 2026-11-04 15:50 — placar consolidado (host + app real) · WIRE-5 · boot repetido · F5 real · C9 · B8

> **AVISO (Keel/Muse):** capturas "escuro" só valem DEPOIS do conserto do tema escuro (P0 visual abaixo): hoje `body[data-ds-dark-theme=""]` e o CSS espera `"true"`, então todas as capturas "claro/escuro" (galerias do Probe/Muse/Quill e as minhas até agora) são claro/claro. Contrato aceito: escuro → `data-ds-dark-theme="true"`, claro → atributo ausente. Meu teste `[BUG→Prism+Muse] [C9] com prefers-color-scheme: dark o tema ESCURO é de fato aplicado` fica verde no conserto; aí regravo tudo com `shootBothThemes`.

### Como rodar (um host por arquivo; trava `build` FIFO, host próprio com home temporário e porta livre)
- **Host real em memória (sem navegador, `check`):** `pnpm exec vitest run packages/persona/persona-e2e/tests/mandatory-{bring-your-context,governance,project-boards,team-manager,second-brain,wave2,scope}-host.spec.ts`
- **App real (Chrome + CLI fake):** `PERSONA_E2E=1 node scripts/persona/with-lock.mjs "Gauge <x>" -- pnpm exec vitest run packages/persona/persona-e2e/tests/<arquivo>.spec.ts --no-file-parallelism --testTimeout 600000 --hookTimeout 400000` com `real-gov-pb-app`, `real-pb-app`, `real-b8-app`, `real-onboarding-builder-app`, `real-c9-gallery`, `real-surface-a11y`, `real-boot-repeat` (`GAUGE_BOOT_CONFIGS=quick`), `real-sb-ges-app`, `real-byc-w2-app`. `GAUGE_HOST_URL=<url>` só para iterar num host já no ar.
- **Contrato cliente↔host (sem navegador, ~6 s):** `wire-contract.spec.ts` (WIRE-5).
- Convenção: bug de produto = `it.fails("[BUG→dono] …")`; vira `it` normal quando o dono corrige (o teste fica vermelho e eu removo o marcador).

### Placar por suíte (última rodada; contagens verbatim nos relatos dos forks)
| Item | Host real | App real | Estado do aceite |
|---|---|---|---|
| **GOV-10** | 20 pass / 0 bug | 13 pass + 2 `it.fails` (Saúde 0 logo após "Contratar equipe sugerida"; flash de equipe vazia no F5) | verde nos 5 cenários do §4; 2 achados abertos |
| **PB-9** | 15 pass / 0 bug (PB-9.3 corrigido) | 4 pass + 3 `it.fails` (Nova tarefa morta; Novo projeto não cria; etiqueta do fluxo velha) — Lumen diz corrigidos, aparecem após o próximo bundle | host verde; app aguarda bundle |
| **BYC-6** | 17 pass (BYC-3b/4c corrigidos) | fork BYC/W2 (relato `gauge-byc-w2.md`) | host verde |
| **GES-6** | 16 pass / 1 `it.fails` (GES-1b: aprovar "assemble" não monta) | fork SB/GES: ver `gauge-sb-ges.md` (21 pass + 16 `it.fails` no total SB+GES) | GES-1b aberto (Anvil+Forge) |
| **SB-7** | 20 pass / 2 `it.fails` (SB-1a curadoria sem chamador, SB-4b two-way) | idem fork | SB-1a aberto |
| **W2-11** | 14 pass / 5 `it.fails` (resposta sem topicId, duplicada, cor repetida, rótulo `../`, rótulo duplicado) | fork BYC/W2 | abertos no host |
| **B8 (SCOPE)** | `mandatory-scope-host`: 8 pass + 1 `it.fails` (**segredo do Cofre vai em claro para o Contexto usado/prompt**) | `real-b8-app` + `real-onboarding-builder-app` (rodada final na fila) | SCOPE-4 aberto (segredo) |
| **F5** | — | `real-surface-a11y`: 23 telas + editor de persona + onboarding; axe REAL (antes `skipped`) | 2 bloqueantes (rotinas: aria-required-* crítico; configurações: contraste sério) + heading-order moderado em 9 telas |
| **C9** | — | `real-c9-gallery`: 13 telas × claro/escuro, tokens da direção D, diff vs `dirD-tela.png` (0,35/0,41 ≤ 0,62) | 15 pass + 1 `it.fails` (tema escuro) |
| **WIRE-5** | `wire-contract`: 287 métodos, 49 tipos manuscritos, 111 chamadas | — | 4 pass + 2 `it.fails`; passo informativo no gate (Keel) |
| **BOOT repetido** | — | `real-boot-repeat` (+ modo `quick` no gate) | 0 falhas em 126 cargas + 69 durante reescrita do bundle: hipótese "bundle concorrente" NÃO confirmada (aceito pelo Keel) |

### P0 visual (aberto, Prism+Muse): tema escuro nunca aplica
`installPersonaColorScheme` faz `toggleAttribute('data-ds-dark-theme')` ⇒ valor vazio; `persona-palette.css` e ~8 módulos casam `[data-ds-dark-theme='true']`. Prova: `.maestri/tmp/gauge/dark-before.png` (shell creme com SO escuro) vs `dark-after.png` (setAttribute 'true' ⇒ escuro completo). Contrato aceito: escuro = `"true"`, claro = ausente.

### Achados novos desta etapa (todos com dono avisado)
- **SCOPE-4 (alta, Forge+Anvil):** um registro do Cofre com senha/api_key em texto (`createVaultRecord kind memory`) entra INTEIRO no contexto compilado e no "Contexto usado" (`getTurnContext.records[].body`). Teste `[BUG→Forge+Anvil] [SCOPE-4] segredo gravado no Cofre NÃO sai em claro…`.
- **F5:** `@axe-core/playwright` instalado pelo Keel; matriz em `artifacts/gauge/axe/matrix.md` (rotinas: `aria-required-children/parent` crítico; configuracoes: `color-contrast` sério; landmark/region já corrigidos pelo Prism). A heurística de "armadilha de foco" do Probe dava falso positivo (3 `button` sem rótulo seguidos); agora compara identidade do elemento.
- **Popover "Estou fora":** agora fecha com Esc e o estado chega ao organograma (corrigido durante a rodada).
- **WIRE-5:** achados 1/2 (review*) e history list/undo já corrigidos por Lumen/Anvil; restam `PersonaCreatorRemote.listTeam` (actorId/memberId/channelId), seeds com `limit: 300` (> teto 200 do runtime, lido de `persona-store/src/events/repos.ts`) e o builder de limites do Gestor sem sanear NaN/Infinity.

### Arquivos novos/alterados (persona-e2e, todos testes/fixtures)
`tests/`: `mandatory-{bring-your-context,governance,project-boards,team-manager,second-brain,wave2,scope}-host.spec.ts`, `real-{gov-pb,pb,b8,c9}-app.spec.ts`, `real-surface-a11y.spec.ts` (reescrito), `real-boot-repeat.spec.ts`, `real-onboarding-builder-app.spec.ts`, `wire-contract.spec.ts`, `real-sb-ges-app.spec.ts`, `real-byc-w2-app.spec.ts` (forks). `src/`: `gauge-app.ts`, `gauge-visual.ts`, `wire-contract.ts`, `bring-context-fixtures.ts`, `axe-check.ts` (detalhe por violação), `real-gallery/keyboard.ts` (identidade). Os `it.todo` de `mandatory-{scope,b9-real-app,second-brain,team-manager,…}.spec.ts` viraram testes que disparam as suítes acima. `check-pkg persona-e2e`: OK.

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
