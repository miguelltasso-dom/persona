# Lumen — relatos de implementação UI

## 07/11 15:05 — 6b NO TREE (OK do Keel 14:51): o "SR" do cartão vira ícone da equipe + guarda do USD-2; notas da versão; rodada limpa do Revisar na fila

- **Achado (captura real no lib 6):** o host não manda o responsável do cartão (`BoardCardView` só tem `collaborators`; `data/adapters/board.ts` não mapeia nenhum). Uma tarefa REAL da Nina criada pelo #geral aparece "Trabalhando" mas o rodapé mostra "SR" (iniciais de "Sem responsável"); o "N" que a Muse viu era do dev-seed do Ember (responsável injetado). Evidência: `.maestri/tmp/shots/lumen-viewport/bundle6-faces-evidence/` (os chips Pedido por/Esperando/Revisando já mostram o rosto). Registrado como v1.1.x do Anvil: `BoardCardView.leadPersonaId` (aí o rosto de verdade).
- **6b (Keel 14:51, A + B):** (A) `kanban/KanbanCard.tsx`: sem responsável = ícone da equipe (`BrandIcon equipe` no `Avatar icon`, o mesmo do ator de sistema da Caixa de Aprovações; `aria-label` "Sem responsável" mantido), nunca "SR"; testes em `board-card-faces.client.spec.tsx` (ícone presente sem responsável, ausente com responsável). (B) `tests/usd-money-surfaces.client.spec.tsx` (7: Uso e limites em inglês, pool de chave de API sem janela, o adaptador não carrega dólar que o host mande por engano, cartão da persona de assinatura pt/en e de chave de API) → USD-2 (D-092) fechado em código e testes; falta só a captura de Uso e limites.
- **Provas:** `check-pkg client-ui-persona` OK 15:00; `find-bad-css` `[]`; vitest 9 arquivos / 55 testes verdes (board-card-faces, usd-money-surfaces, usd-no-dollar, usd-uso-limites, kanban-*, card-collaborators, teamwork-board); suíte inteira do cliente do Ember no lib 6: 373 arquivos / 2819 verdes (14:05–14:26).
- **Notas da versão** (`persona-spec/RELEASE-NOTES-v1.1.md`): linhas de Revisar, Quadros e Uso e limites e os limites (Cota em conta nova, Gasto em dólar, Revisar a 200%, responsável no cartão) em português claro.
- **REVISAR ACEITO pela Muse (15:08, lib 6 7bd08b15):** captura limpa `.maestri/tmp/shots/lumen-viewport/bundle6/` (revisar-lista/conflito/sucesso × claro/escuro × 1440/960/200 %), pré-aceite 18/18 (conferido também pelo Ember, de forma independente), axe 0, console 0. Ela aprovou o toast só depois que a folha fecha e manteve o "Recomendado" em "Manter os dois".
- **Cartão sem responsável — as 4 condições da Muse (15:00):** (a) mesma caixa de 24 px dos rostos; (b) disco NEUTRO: `Kanban.module.css` `.cardFooter .unassignedAvatar[data-icon]` = fundo `--persona-paper-sunken`, glifo `--persona-ink-soft`, borda `1px solid --persona-outline-soft` (nunca o lilás/destaque; vence o wash do `Avatar` por especificidade); (c) `aria-label` "Sem responsável" mantido, cópia intocada; (d) nenhuma letra. Teste: `board-card-faces` (guarda de CSS + DOM; 9 no arquivo). `check-pkg` OK 15:08; vitest 5 arquivos / 32 verdes.
- **Falta (depende do Quill):** lib 6b → captura do quadro REAL (cena `board`, claro/escuro × 1440 e 200 %, manifesto `.maestri/tmp/lumen/manifests/lumen-6b-board.json`) com o pré-aceite → Muse aceita "no lote". USD-2: código e guardas fechados; captura de Uso e limites só se a Muse pedir.
- **Capturas:** a rodada com a cena do rosto contaminou o Revisar (a cena criou tarefas reais no host, que persiste entre as combinações; o pré-aceite acusou "artigo" no texto do quadro atrás da folha). Lição: cena que CRIA dado roda sozinha, nunca na mesma rodada das outras. Rodada limpa só do Revisar (régua `.maestri/tmp/lumen/ruler/`, com o erro do 1º documento fora da conta) na fila FIFO; depois, no 6b: Revisar + cartão do quadro (sem "SR") com o pré-aceite do Ember → Muse.

## 07/11 14:35 — RETOMADA: bundle 5 (aceito), Revisar a 200% + rostos no LIB 6 (candidato 7bd08b15), capturas do lote na fila

**Estado:** meus itens do lib 6 estão NO LIB (conferi no `client.js`). Nada mais em client src (congelamento do candidato 14:35). `check-pkg client-ui-persona` OK 14:20; `find-bad-css` `[]`.

### Bundle 5 (d8109efa) — capturas 12:37–12:42, pré-aceite do Ember
- Saúde (`saude-1o-dia`) e enfeites (`enfeites-visao-geral`, `enfeites-aprovacoes`): 6/6 modos, axe 0, console 0 → **ACEITOS pela Muse 13:01** (o ✕ do "Resumo da manhã" sumiu: host do Anvil).
- Revisar (lista/conflito/sucesso): reprovado pela checagem `dialogo` do Ember (a caixa passava da janela) → **BLOQUEADOR do corte** (Muse 13:01, sem exceção).

### Revisar: causa MEDIDA e conserto (prova em browser real)
- **Causa** (log `LUMEN_GEOM=1` no app real, bundle 5): o fundo `position: fixed` da folha NÃO é a janela; o `main` da página fica com `transform` identidade depois da animação de entrada e vira o bloco de contenção (58 px mais baixo que a janela). A `.sheet` era `content-box` com `max-height: min(92vh, 56rem)`: 828 + 38 (padding + borda) = **866 px numa área de 842** (base +12 px a 1440; +22 px a 960×640); abaixo de 48rem o `flex-end` empurrava o topo a **−25 px** (200 %), cortando o título e o "Voltar ao quadro".
- **Conserto:** `review/KanbanReviewSheet.module.css` (`border-box`; `max-height: 100%` do PRÓPRIO fundo, nunca `vh`; cabeçalho fixo + `.sheetBody` único rolável; `@media (max-height: 36rem)` tira cromo) e `.tsx` (corpo rolável); `review/simple/DraftReview.module.css` (sucesso: botões `sticky` + arte 88 px em janela baixa; saia opaca sob a barra fixa, sem texto aparecendo embaixo); `DraftReviewPanel.tsx` (sem retrato = ícone do rascunho, nunca inicial); `remote/ConnectedProjectFlowBoard.tsx` (o toast "Aplicado na pasta · Desfazer" só aparece quando a folha fecha: a 200 % ele cobria o "Voltar ao quadro"; some se a pessoa desfez ali).
- **Prova:** `scripts/persona/lumen-sheet-fit.mjs` (galeria isolada com Vite, NÃO toca o lib; moldura com `main` transformado; roda a medição do próprio pré-aceite). **Controle negativo** com o CSS antigo reproduz o app EXATAMENTE (866 px/base +12; 627/+22; 369/topo −25); com o CSS novo: **18/18 passos** (lista/conflito/sucesso × claro/escuro × 1440/960/200 %), sem corte, título dentro, "Aplicar na pasta"/"Voltar ao quadro" dentro da janela e alcançáveis (nada por cima), axe 0. Imagens em `.maestri/tmp/shots/lumen-sheet-fit/{control-old-css,after}`.
- **Testes novos:** `tests/review-sheet-fit.client.spec.tsx` (10: sem `vh`, border-box, `max-height:100%`, corpo único rolável, cabeçalho fixo, saia, sucesso sticky/compacto + estrutura lista→conflito→sucesso dentro do corpo, título e Fechar fora) e +1 em `review-survives-reload` (o toast espera a folha fechar).

### Rostos (D-069): o "N" da Nina e o "T" do Téo
- `kanban/KanbanCard.tsx` (rodapé ×2 e a animação de carregar usam `resolvePersonaFace`; o `Avatar` do rodapé não recebia `src`), `kanban/StartedNowNote.tsx`, `boards/derive-board-summaries.ts` (`avatarSrc` dos "trabalhando agora"), `remote/ConnectedProjectFlowBoard.tsx` (personas do trabalho em equipe: `personaPortrait ?? personaFaceSrc(avatarRef, id)` — some o "T" nos chips Pedido por/Esperando/Revisando e no Caminho do trabalho). Teste: `tests/board-card-faces.client.spec.tsx` (6).
- Não são meus (Quill/Ember): `CanvasView`, `ConnectionsView`, `PersonasSettingsPanel`, `TeachPersonaSession`, `AwayWhileOutPanel`; `ReviewedBySeal` (Ember). Os cartões REAIS do quadro semeado não têm responsável (mostram "SR" de "Sem responsável"): por isso a captura do rosto usa uma tarefa real da Nina criada pelo #geral.

### USD-2 (D-092): código e guardas já estavam feitos desde 05/11 01:32
- `usd-no-dollar.client.spec.ts` (10) + `usd-uso-limites.client.spec.tsx` (1): assinatura nunca mostra "US$"/"$"/"custo"; US$ só com chave de API ("≈ US$", rotulado estimado); troca de conta troca a forma; locales varridos (`proactive.costLabel` = Uso estimado, `inbox.section.cost` = Impacto e uso, `limits.subtitle`). Falta só a captura de Uso e limites (depois do lib 6) e, no cartão da persona, um guarda de DOM (a fazer só se o Keel autorizar; hoje nenhuma tela de Uso/cartão desenha dinheiro: o host não manda).

### Capturas (FIFO na build; sem `--priority`)
- Lote do lib 6: Revisar ×3 (`LUMEN_SCENARIOS=review`, pasta `.maestri/tmp/shots/lumen-viewport/bundle6`, manifesto `scripts/persona/preaccept-manifests/lumen-b6.json`) + cartão do quadro com rosto (régua em `.maestri/tmp/lumen/ruler/`, fora de `scripts/**`). Depois: pré-aceite do Ember → Muse.
- Limitações: o toast mudou de momento (agora depois de fechar a folha); o selo "SR" do cartão sem responsável segue (placeholder "Sem responsável"; troca por ícone neutro só com OK do Keel).

## ⏸ (SUPERADA em 07/11) PAUSA TOTAL (Atlas/Miguel, cota semanal do Claude em 85%) — estado exato em 05/11 06:31

**Nada pela metade.** Nenhuma edição em andamento, nenhum job meu rodando, nenhum teste rodando. Monitor da caixa de entrada parado. Última verificação verde: `check-pkg client-ui-persona` OK 06:04 (depois do último save em `src`), vitest 64/64 nos 6 specs da área, `find-bad-css` `[]`. Não lancei nada depois da pausa.

**FEITO**
- Bundle 3: captura final feita (`.maestri/tmp/shots/lumen-viewport/bundle3`; imagens erradas da 1ª rodada em `.maestri/tmp/shots/lumen/descartadas-bundle3-seletor-errado`).
- Bundle 4: captura final feita e **ACEITA pela Muse** (`.maestri/tmp/shots/lumen-viewport/bundle4`, pré-aceite 24/24 PASSOU): Revisão lista/conflito/sucesso + barra de abas da Saúde (58 px nas 6 janelas).
- Bundle 5, meu item **NO TREE (06:04)**: textos "sem nome" da Revisão aprovados pela Muse 05:51 — cabeçalho "Mudanças prontas para revisar", subtítulo "Isto está num rascunho…", ícone `revisao` no avatar (nunca iniciais), descarte e Histórico ("1 mudança aplicada · hora"); `persona.fallback` removida; gen-locales rodado. Arquivos: `review/simple/{DraftReviewPanel.tsx,conflict-text.ts,DraftReview.module.css,ProjectHistoryView.tsx}`, `data/history-remote.ts`, `remote/ConnectedProjectHistory.tsx`, `locale-sources/review.{pt,en}.json` (+ locales gerados), specs `draft-review-panel`, `project-history`, `lumen-surfaces`.
- Correções do bundle 4 (já no tree, no lib do bundle 4): quadro mantém o board no reload (`remote/ConnectedProjectFlowBoard.tsx`, `tests/review-survives-reload`), trava HT-9 de ação externa (`approvals/action-approval.ts#genericDecisionRoute`, `remote/ConnectedApprovalsPanel.tsx`, `decisions/derive-decisions.ts#riskOf`), texto da Revisão com/sem nome (`ConflictChoices`, `conflict-text.ts`), barra de abas `div.bar` (`shell/PlaceTabsBar.module.css`, `tests/place-tabs-bar-css.client.spec.ts`).
- Revisão do Ctrl K sobreposto do Prism (staging `.maestri/tmp/prism/staging-cmdk`): aprovada, 4 ajustes feitos por ele, 63/63. Spec: `persona-spec/design/CMDK-OVERLAY-SPEC.md`.
- Régua `scripts/persona/lumen-viewport-shots.mjs` (nav falha alto sem aba, sonda do pré-aceite em `shoot()`, cena `connector` pela lista do V2, log `geom` da Saúde); manifestos `scripts/persona/preaccept-manifests/{lumen.json,lumen-b5.json}`.

**PELA METADE:** nada. (O staging `.maestri/staging/lumen-b5` já foi aplicado com `apply.sh`; não resta nada a aplicar.)

**PRÓXIMOS PASSOS (só quando o Atlas chamar; nada disso foi iniciado)**
1. Depois do GO do bundle 5 (Keel previa ~07:20, agora fora de data pela pausa): recapturar **Saúde + Revisão** no lib novo: `LUMEN_SCENARIOS=health,review LUMEN_SKIP_PANELS=1 LUMEN_1440=1 LUMEN_TIMEOUT_MS=4200000 LUMEN_AXE=C:/Users/migue/dev/persona/node_modules/.pnpm/axe-core@4.13.0/node_modules/axe-core/axe.min.js node scripts/persona/with-lock.mjs "Lumen captura FINAL bundle 5" --lock build --priority --wait-max 3600000 -- node scripts/persona/lumen-viewport-shots.mjs bundle5`; depois `node scripts/persona/preaccept.mjs --manifest scripts/persona/preaccept-manifests/lumen-b5.json`; avisar o próximo na ordem, o Keel e a Muse (só a lista "Pronto para a Muse"). Confirma o que o Anvil corrigiu (Resumo da manhã fora da Saúde) e o rótulo novo da Revisão; a checagem `dialogo` (sonda v2) pode apontar a folha de Revisão a 200% — se reprovar, corrigir `review/KanbanReviewSheet.module.css`.
2. Ctrl K sobreposto (v1.2): o Prism aplica depois do corte da v1.1; eu só reviso o diff.
3. De outros: `personaId` no `ReviewSummaryView` (Anvil) para usar o nome real; ícone `arquivo` aguarda o verbo `file` da ação externa; host gravar a cópia `(rascunho)` já feito (Forge).
- Nota: nenhum job real/IA foi rodado por mim; as capturas usam o app com o fake.

## 2026-11-04 22:55 — D-089 + CV-8 + D-090: Aprovações, P1-10, enfeites, Saúde, fan-out, equipe real (verde; capturas após o bundle 2)

**Estado:** `check-pkg client-ui-persona` OK nos meus arquivos (o único erro do pacote às 22:50 era `approvals/InboxDetail.tsx`, edição do Ember). Suíte do pacote inteira: **324 arquivos / 2027 testes verdes**. Tudo novo atrás de flag, exceto Aprovações (título/verbo) e P1-10, que valem para todos.

### O que mudou
- **Aprovações (D-089 a):** `approvals-ui-helpers.ts` (`reactiveApprovalContext`: pergunta em palavras quando o host só repete o nome), `ReactiveApprovalsList.tsx` (`cardTitle` = `approvalTitle`, a mesma fonte do V2), `approvals.{pt,en}.json` (`action.primary.attention` = Revisar/Review, `attention.question`). O V2 herda sem edição. Teste: `approvals-attention-title` (5).
- **P1-10:** `kanban/move-undo.ts` (regra: só A fazer/Fazendo/Em revisão → Fazendo/Em revisão), `ConnectedProjectFlowBoard.tsx` (aviso de 6 s; o Desfazer move o cartão de volta; um novo movimento fecha o aviso velho; falha do host vira frase honesta). `move-undo` (7).
- **Enfeites (D-089 b, `persona.flag.houseDecor`):** `decor/{house-decor-flag.ts, HouseDecor.tsx, HouseDecor.module.css}` (lugar único, a Muse confirmou). Vazios -noite (Aprovações V2 e antiga, #geral, DMs), ramo (`corner-leaf-tl`) no cartão "Precisa de você" e no 1º de Aprovações, rabiscos do cabeçalho (> 960 px), ícone-cena no canal de equipe, carimbos sorteados por hash do id (`ApprovedStamp seed`), confete da Sprint concluída (`ConfettiMoment`), brilho do selo não lido (`body[data-house-decor]` + `--persona-night-active-glow` a 50 % em RailTeam, ConversationsRail e DMs). `house-decor` (22).
- **Saúde (D-089 d):** o medidor empilha a ≤ 520 px (`Governance.module.css`). `health-gauge-narrow` (2).
- **CV-8 UI:** `chat/fanout/{FanoutBlock, FanoutChip, fanout-rules, fanout-block-model, Fanout.module.css}`, `mapFanoutLine` em `remote/map-host-ui.ts`, o bloco desenhado em `MessageList` (um cartão por `fanout.id`, sem janela virtual quando há bloco), `persona-live-store.postChannelMessage(…, { fanout })` (+ retry com a mesma audiência), `remote/use-connected-fanout.ts` (a UI PERGUNTA ao host por `estimateAsk({ audience: 'everyone' })`; sem `fanout` na resposta o composer é o de sempre), chaves `composer.fanout.*`/`fanout.*` em `chat.{pt,en}.json` com fallback de texto. O composer (popover, chip montado, confirmação > 5) é do Flint. `fanout-ui` (18), `use-connected-fanout` (3).
- **D-090 (`persona.flag.teamwork`):** `teamwork/{teamwork-flag, teamwork-wire, teamwork-context, HandoffChip, WorkPathSheet, Teamwork.module.css}`. Chips no cartão do quadro (rosto 16; "Esperando" com anel parado), link "Caminho do trabalho" → linha do tempo com rostos 24 (passo atual com anel, anteriores com ✓) e o "Bilhete de {A}" recolhido (pronto/falta/decisões/arquivos, sempre TEXTO). Lido SEM confiar no tipo (campos ainda fora de `host/types`): `BoardCardView.handoff` e `TaskView.note/path` (por id, via `listTasks`). Sem nome da persona, sem chip (nunca um id). `teamwork-board` (12).

### Adendo 23:10 (Muse 22:44/22:45)
- **Chip "Revisando: {R}"** a partir de `reviewing?: { personaId, round }` (BoardCardView e TaskView, nomes finais do Anvil): rosto 16, anel PARADO como o "Esperando"; sem o campo, sem chip.
- **Quadro de exemplo para a captura** (`teamwork/teamwork-dev-sample.ts`): só com as DUAS chaves de dev (`persona.devSeed.v1` + `persona.devSeed.teamwork`) e a flag `persona.flag.teamwork`. Três cartões com o selo "Exemplo" (Pedido por Nina com caminho de 3 passos e bilhete; Esperando Bento; Revisando: Atlas); nunca chamam o host (mover um deles não faz nada). Receita: `localStorage` com `persona.flag.teamwork`, `persona.flag.houseDecor`, `persona.devSeed.v1`, `persona.devSeed.teamwork` = '1'.
- Galeria interna: `LUMEN_TEAMWORK=1 node scripts/persona/lumen-review-gallery.mjs teamwork-board` (não é aceite; a captura de aceite é no shell real).

### Adendo 23:40
- **CV-5 "com {nome}"** no cartão do quadro a partir de `BoardCardView.collaborators` (chip neutro; "com Bento", "com Bento, Luna e Sol"; sem colaboradores, sem chip). `card-collaborators` (2).
- **FLOW-1 pelo dado do host:** `BoardCardView.deliveryPending` decide se um cartão pode ir a Concluído (`true` = segura, em qualquer coluna; `false` = solta, ex. tarefa sem pasta; ausente = o palpite antigo pela coluna). +2 testes em `flow-delivery-pending`.
- **Roteiro da captura final pronto** (`scripts/persona/lumen-viewport-shots.mjs`): cenários novos `approvals`, `decor` (liga `persona.flag.houseDecor`) e `teamwork` (liga a flag + as 2 chaves de dev do quadro de exemplo). Comando: `LUMEN_SCENARIOS=approvals,decor,teamwork LUMEN_SKIP_PANELS=1 LUMEN_1440=1 LUMEN_AXE=<axe.min.js> node scripts/persona/with-lock.mjs "<label>" --lock build -- node scripts/persona/lumen-viewport-shots.mjs real` (só depois do bundle 2).
- **Galeria interna com axe** (não é aceite) nos estados novos (bloco/chip do fan-out, quadro com os chips + caminho + bilhete, enfeites, vazios noturnos): 54 capturas (claro/escuro × 1280/960/200 %), **axe 0, 0 estouro, 0 erro de console**.

### Adendo 00:10 — o cartão "Precisa de você / Liberar para {B}" (Anvil, team-real.md §9; Keel: é meu)
- **Um só tipo** `ApprovalView.kind: 'connector'` para "a Bia pediu ao Téo e ele não pode usar o Gmail" (reason `colleague`) e "a Nina quer usar o Drive" (reason `initiative`). `approvals/connector-ask.ts` lê `ApprovalView.connector` COMO DADO (nada estranho vira cartão de conector: degrada para um cartão de atenção com o título/pergunta do host, que continua sendo uma decisão pendente) e escreve as palavras a partir dos campos (título "Liberar o {conector} para {B}", pergunta do colega/da iniciativa).
- **As escolhas** (`approvals/ConnectorActions.tsx`): exatamente as que o host aceita em `options`, na ordem "Liberar só desta vez" · "Sempre permitir para {B}" · "Agora não" ("Agora não" sempre existe); a consequência do "sempre" (só LEITURA; escrever e apagar continuam perguntando) fica escrita embaixo dos botões; as outras duas vão por `aria-describedby`. Sem handler ligado os botões ficam desabilitados.
- **Caminho até o host:** `ApprovalsInbox/ReactiveApprovalsList.onDecideConnector` → `ConnectedApprovalsPanel` → `live.decide(id, accept, choice)` → `decideApproval({ kind: 'connector', choice, accept })`. O Aceitar/Dispensar genérico (a V2 do Ember só tem esses dois) vale "só desta vez"/"Agora não".
- **Desfazer de verdade:** o `connectorDecision.grant` que o host devolve com "sempre" fica guardado; ele marca a decisão como reversível (o toast "Desfazer" só existe aí) e o Desfazer chama `revokeConnector({ personaId, cli, connectorId })` — exatamente aquela concessão. "Só desta vez" não tem o que desfazer.
- **Sem flag:** o cartão aparece sempre que o host o manda (ele só manda com `Config.teamwork`/concessões ligadas); esconder uma decisão pendente por flag da UI violaria a regra 4 das DECISIONS.
- **Testes:** `approvals-connector` (9). Galeria interna com axe: `approvals-connector` 6 capturas, axe 0. Suíte do pacote: 334 de 335 arquivos / 2214 de 2215 testes; o único vermelho é `css-tokens-defined` por `next-step/NextStepBar.module.css` (3 tokens que não existem: `persona-font-body`, `persona-text-s`, `persona-leading-s`), de OUTRO dono.
- **Dependência registrada:** os textos novos (`approvals.{pt,en}.json`: `connector.*`, `type.connector`, `action.primary.connector`) têm fallback no cartão da lista antiga; na V2 do Ember (`t(item.primaryKey)`) o botão só lê certo depois do gen de locales.

### Adendo 00:35 — Muse aprovou o cartão "Liberar para {B}"
- Retoques: sem artigo antes do nome da persona (já era assim); o Toast do "Sempre permitir" diz "Agora {B} pode ler o {conector} sem perguntar · Desfazer" (só com o grant do host; chave `decision.undoToast.connector`, com fallback).
- Exemplo para a captura do bundle 3: `persona.devSeed.v1` + `persona.devSeed.connector` (2 cartões "Exemplo", nunca chamam o host; testado). Cenário `connector` no roteiro de captura.

### Limitações conhecidas / abertos
- "Revisando {R}" (chip) não tem dado no contrato; o selo "Revisado por" é do Ember; "Responder a uma resposta" do bloco (Ajuste 3) depende do IV-10; o "Tentar de novo" da linha `failed` não existe (o host não tem retry).
- Rabiscos do cabeçalho só acima de 960 px (a 960 o cabeçalho empilha); a Muse aprovou.
- Locales: as chaves novas estão só em `locale-sources`; todo texto tem fallback no componente, então nada depende do gen.
- Capturas no shell real: depois do bundle 2 (00:30) e da vez na fila build; só as flags ligadas.

## 2026-11-04 16:00 — Lote Muse/Gauge/Keel: SW-8, PB-5, SB-5/SB-7, BYC-4, Revisar (WIRE), honestidade da tela, botões mortos (verde no check-pkg; capturas depois da janela)

**Estado:** `check-pkg client-ui-persona` OK (~15:55). Testes dos 14 arquivos que toquei: 82/82. Suíte do pacote na última rodada: 3 falhas, 2 minhas já corrigidas (`boards-home`, BYC-4d) e 1 do rail do Prism (`rail-ai-status`). `wire-contract` do Gauge: **0 desvios do meu lado** (111 chamadas, 49 tipos). Sem commit. Locales gerados em janela exclusiva (D-067). Capturas, galeria e axe: depois da janela de estabilidade do Keel (bundle `--exclusive`).

### Decisões (DECISIONS-SPEC) — regra 4 corrigida pela Muse
- `derive-decisions.ts`: **um cartão pendente nunca some por falta de dado.** Saiu o filtro "contratação sem motivo não aparece" (2 pontos); sem `reason` o cartão aparece sem a linha "Por quê" (só com o `reason` explícito do host). Testes `decisions-unified` e `decisions-cycle` agora afirmam isso.
- `approval-brain-scope.ts` (Anvil): lembrar permissão usa **`permissionAction`/`permissionTarget` do host** (recurso estável `vault:<recordId>`); sem eles não se oferece "lembrar" (nunca um alvo inventado de `kind:id`). Teste novo `approval-brain-scope`.
- **Em aberto:** na rodada claro 960 do app real a contagem voltou a "4 pendentes" depois de aprovar uma skill (a rodada seguinte, zoom 200, passou). Instrumentei o cenário (títulos antes/depois, releitura tardia, log do seed) em `lumen-viewport-shots.mjs`; falta rodar com o bundle novo. Hipótese: a primeira página da rodada ainda era servida durante o seed/boot do host.

### SW-8 / Revisar (WIRE-2/3 do Keel e do Gauge)
- `data/persona-review-remote.ts`: os tipos do wire **são os do host** (`TicketCommandRequest`, `AcceptReviewRequest`, `RequestChangesRequest`) — o `tsc` agora enxerga `command`/`reason`, `mode: 'ff'|'squash'` e `conflicts[]`.
- `KanbanReviewSheet`: `reviewSummary` manda `command:'reevaluate'` + `reason`; `discardReview` manda `command:'dismiss'` + `reason`. O conflito de pasta é **ida e volta com o host**: Aplicar → `blocked` com `conflicts[{path,user,persona}]` → a tela mostra a escolha só desses arquivos → a resposta volta como `conflicts[{…versões mostradas, choice: keep_mine|keep_persona|keep_both}]` (nunca mais `choices`, que o host descartava em silêncio). Se a pessoa já respondeu todos, reenvia direto. Testes: `kanban-review-sheet` (contrato: command+reason, 2 chamadas, sem `"choices"`, mapeamento mine/theirs/both).
- Arte da Muse (SW-7): `conflito-mesmo-arquivo` no conflito, `empty-historico` (240) no Histórico vazio, `rascunho-trabalhando` (240) em "Preparando as mudanças…".
- `history-remote.ts`: o handle da tela virou `ProjectHistoryClient` (não é wire; o comparador do Gauge lia `list/undo` como Remote).

### PB-5 Quadros
- `ProjectBoardCard`: texto visível **"X de Y prontas"** + `CategoryBar` com `progress` (role progressbar, `aria-valuenow/max/text`), legenda por categoria, sprint, **"N trabalham agora"** com retratos; projeto **vazio** = "Nada no quadro ainda" + **"Criar a primeira tarefa"** (abre a conversa com a equipe; o clique não abre o quadro). `primitives/Board.tsx`: `CategoryBar` ganhou a prop opcional `progress` (aditiva). Teste `boards-project-card` (6) e `boards-home` atualizado.
- **Novo projeto (Gauge PB-9 #2/#3):** o modal pede o **nome** e chama `createProject({id,name,template})` (antes trocava o fluxo do projeto "Pessoal"); a lista relê os projetos e **o cartão lê o modelo real de cada projeto** (`getProjectBoard.workflow.template`), então a etiqueta não fica velha. **"Nova tarefa"** do quadro (bug do Prism/Gauge) abre a conversa com a equipe e o botão só existe com ação (`onNewTask`).

### SB-5 / SB-7 Segundo cérebro
- Ids para gente: `person:owner` → "Você"/nome, `grant:owner` some das fontes, página de permissão vira "Responder no WhatsApp: clientes aprovados", ação/alvo em palavras também em Permissões; "índice automático" → "atualizado sozinho"; **"Comece aqui"** mostra as 2 primeiras linhas da página + **Abrir** (não repete o título); alvo de toque ≥ 24 px (`.brainPageLink`).
- **Citada em** com a direção certa (páginas que citam esta); **Restaurar** versão (só nas antigas) e o histórico atualiza ao salvar; histórico com nomes; **Nova página** sempre visível (diálogo com título e tipo; sem `window.prompt`); o **bibliotecário** é a persona com a função (`librarian`), sem Atlas fixo. Testes: `second-brain-shell` (3), `second-brain-home`, `brain-ui-adapters`.
- **Não feito:** SB-4 (exportar/importar a pasta: nenhum componente chama `exportBrainVault`/`importBrainVault`) — depois da janela.

### BYC-4 / Importadores
- **Laço de "Escolher pasta"** (Gauge, ALTA): o efeito dependia de `t` (função nova a cada render) e de `scope`; agora `t` é estável, deps primitivas e guarda contra resposta tardia. Teste: a pasta é lida **1×** mesmo com re-render (`bring-context-import-page`).
- **Depois de gravar:** "N itens no Cofre ✓" + "Ver no Cofre" (antes voltava ao início em silêncio).
- **BYC-4d (decisão da Muse):** **regras chegam NÃO aceitas** (`defaultChoice` pendente só p/ `constraint`); "Aceitar todas as regras (n)" no cabeçalho do grupo; "Falta/Faltam n regra(s) para você escolher"; "Regras sem escolha não entram"; o apply manda `discard` explícito. "Aceitar os limpos" nunca aceita regra. `ProposalDecision` ganhou `'pending'` (primitivo da Muse, aditivo).
- Galeria (`lumen-review-gallery`) ganhou os estados `byc-review` (aceitar, editar, descartar, privado, duplicado, conflito com decisão fixada, incerto, sensível), `boards`, `boards-empty-only`, `second-brain`, `review-loading`.

### Honestidade e fidelidade
- `initiative:<id>` (nome interno da rotina de iniciativa) → "Iniciativa de {persona}" em Saúde, Teste dos 2 dias e Rotinas (`humanize-ids.ts`; só texto de tela, ids de chamada intactos). Uso › Por persona usa o nome. Plural real em `preset.estimate` + **guarda** (`locale-plural-guard`: nenhum "(s)/(ns)/(ões)" em `locale-sources`).
- **Botões que não faziam nada** (varredura da Quill): Memória (aprovar/editar/esquecer com confirmação, ligados a `approveMemory/editMemory/forgetMemory`), Rotinas ("Adicionar janela" com formulário → `putQuietWindow`), Conhecimento (editar/aprovar/dispensar) e Arquivos (abrir/baixar): **só aparecem com ação**; sem host, somem.
- Rail: busca com tokens sólidos (`--persona-rail-field/-hover/-kbd`) e item ativo com o creme no próprio botão (axe do rail 0, confirmado pela Muse nos itens anteriores).
- Scripts de captura (Keel, D-067 add.): esperam `[data-persona-shell]` (15 s), print < 10 KB é **falha**, sem `PERSONA_VAULT_TEST_CIPHER`, relatório com horário e console, boot falho vira falha do passe (não derruba a rodada).

### Limitações / pedidos
1. **Anvil:** `BoardSummaryView` sem `template` (a tela faz N chamadas `getProjectBoard`); `undoApproval` ainda não existe (o Desfazer de decisões só aparece com ele); Forge/Anvil: id de proposta do BYC colide em itens que começam igual (Gauge).
2. **Prism:** `SprintPlanningView` com `Avatar size={20}` (mínimo 24); testes `close-sprint-pb7`; A-1 (abas): preciso da API do anfitrião de abas.
3. Arquivos e conexões do host que não existem hoje (abrir/baixar arquivo) ficam sem botão em vez de botão morto.

## 2026-11-04 15:40 — DECISIONS-SPEC (fonte única, mesmo ciclo) + UX-PHASE #3 Conexões + varredura 960×640/200% (capturas do "depois" pendentes na trava)

**DECISIONS-SPEC (UX-PHASE item 4, com a Muse):**
- **Fonte única:** `decisions/` (novo) — `deriveDecisions` junta `listApprovals` + `getOverview.needsYou` + `listDailySummaries` num só `Decision[]`; mesmo `id` aparece 1×, a attention vence a proposta; só cartão `pending` do host vira decisão (histórico não); hire sem motivo some (UX-02); campos do host `blocking/risk/reversible/createdAt/reason` opcionais com padrão seguro (vault/skill = baixo risco, nunca "Desfazer" falso). `attentionTitles` agora deriva do mesmo array (só o que bloqueia; antes misturava "em andamento").
- **Mesmo ciclo nas duas telas:** `live.decide(id, accept)` → `deciding` (otimista) → host → `accepted` (carimbo 750 ms) / `declined` (400 ms) / `failed` (volta com "Tentar de novo"); clique duplo ignorado; depois do carimbo o cartão sai de todas as listas e `refresh()`. `live.undoDecision` só liga se o host tiver `undoApproval`.
- **Aprovações** (`remote/ConnectedApprovalsPanel`, registrada no lugar do `RemoteApprovalsPanel`): lê `live.decisions` via `decisionsToInbox` (reativo = `blocking`, resumo diário = o resto); `ApprovalsInbox/ReactiveApprovalsList/ProactiveDailySummaries` ganharam o modo "controlado" (`decisionState`) sem quebrar o ciclo local antigo (mocks/testes).
- **Visão geral** (bloco "Precisa de você", combinado com o Prism, avisado): linha com retrato + tipo · quem pede + título; **Aprovar** direto p/ risco baixo, **Revisar** → `approvals?focus=id` p/ risco normal, "Ver todas (n)" > 3; chip "n pendentes" = `openBlockingCount`.
- **Contadores juntos:** chip da Visão geral, selo do rail ("Aprovações" + número; a contagem é `aria-describedby`, **não** entra no nome do botão — o boot gate e a galeria clicam por `name: 'Aprovações'` exato; achei isso rodando minha própria captura) e bandeja (`bindTrayNeedsYou` → `personaAlwaysOn.needsYouCount(n)`, **SET, nunca soma**; no-op fora do desktop).
- **Feedback compartilhado:** `DecisionFeedback` (aria-live "Aprovado: …"/"Deixado de lado: …" 1× por decisão; toast "Desfazer" 6 s só se `reversible` + handler); `useDecisionListMotion` (FLIP 220 ms dos irmãos; foco vai ao próximo cartão ou ao título da seção); reduced-motion = fade 120 ms, sem FLIP/patinhas.
- **UX-02:** cartão de contratação mostra "Por quê: …" só com o `reason` explícito do host (nunca a pergunta passando por motivo).

**UX-PHASE #3 (Conexões):** botões que eram `onClick` vazio agora funcionam (Instalar/Conectar → guia `conexoes` na Ajuda; Ver uso e cotas → Uso); bloco "Já fiz login" por ferramenta deslogada que re-sonda **no lugar** (sem tela de carregando), com resultado falado ("Claude está pronta." / "Ainda não vejo o login…" / 8 s sem resposta → "ainda não"). Canvas: rótulo longo truncado com `…` (+ `<title>` só quando cortou); antes sobrepunha o nome vizinho e passava da borda.

**Sonda 960×640 / zoom 200%:** `scripts/persona/lumen-viewport-shots.mjs` (host web real + semente dev, claro/escuro × 960×640 e 640×360@2×, 16 telas, mede elemento fora da tela/cortado por `overflow:hidden`). Linha de base ("antes", 64 capturas em `.maestri/tmp/shots/lumen-viewport/before/`): limpas todas exceto **Canvas** (rótulo cortado — corrigido), **Saúde a 200%** (24 elementos fora da tela; causa a confirmar com o rótulo novo da sonda) e **Aprovações** (a navegação quebrava por causa do meu selo — corrigido).

**Provas:** vitest 32/32 nos 5 arquivos novos (`decisions-cycle` 16, `decisions-unified` 7, `connections-next-step` 5, `canvas-labels` 2, `rail-approvals-badge` 2); suíte inteira do pacote 546/551 — as 5 falhas: 1 era minha (`trim` em cartão sem `question`, corrigido; `remote-unwrap` voltou a passar) e **4 fora do meu diff, já falhavam**: `message-list-scale` (10k, orçamento jsdom), `remote-usage-panel` (fica em "Carregando uso…"), `second-brain-permissions-scale` (virtualização jsdom) e `ux-backlog-muse` UX-05 (o rótulo "Tokens / mês por persona" não existe nem no HEAD). `check-pkg client-ui-persona` OK; oxlint limpo nos arquivos novos.

**Pedidos / limitações:** (1) **Anvil**: `ApprovalView` + `blocking/risk/reversible/createdAt/reason`, mesmo id na proposta e na attention, `undoApproval` (enviado; sem eles degrada como descrito). (2) **Rivet** (não está conectado a mim): IPC `needsYouCount` no main (`always-on-ipc.ts`/`preload-app.ts`/`main.ts`) — hoje `trayNeedsYou += 1` só soma e nunca desce; o cliente já chama `personaAlwaysOn.needsYouCount(n)`. (3) Aprovações usa o dicionário `pt` (como o painel antigo); troca de idioma pela tela fica p/ quando houver `t` do namespace. (4) `PERSONA_VAULT_TEST_CIPHER=1` é necessário para subir o host web com o Cofre novo (o gallery/design-shots do repo também vão precisar). (5) Capturas "depois" + axe + reduced-motion rodam na próxima janela da trava (diag e varredura completa já enfileiradas).

## 2026-11-04 10:10 — W2-3 ponta a ponta + GES-5 auditoria host + adaptação 960×640 / 200% zoom

**W2-3 (Bolinha do assunto no cartão do quadro):** `toFlowCard` agora suporta tanto `card.conversationSubjectId` quanto `card.topicId` (unificado com Anvil `BoardCardView`); teste em `connected-project-flow-board.client.spec.tsx` verificando que cartões com `topicId` renderizam o ponto colorido (`SubjectDot`) e o rótulo de leitor de tela `card.subjectLabel` ("Assunto {name}").

**GES-5 (Auditoria de Gestor de equipe):** Anvil expôs `getTeamHealth.gestorAudit` e `PersonaCardView.gestorAuditReason`; integrados em `ConnectedTeamHealthPanel` (mapeando `GestorAuditView` para `ActivityItem[]` com fallback suave); adicionado `gestorAuditReason` em `PersonaCardInfo`, mapeado em `map-persona-card-view.ts` e exibido nos fatos do `PersonaInfoCard` com locale `card.gestorAudit` gerado pt/en; testes unitários em `map-persona-card-view.client.spec.ts` e `lumen-queue2.client.spec.tsx` (12/12 passed).

**960×640 e zoom 200%:** ajustados `Files.module.css` (tabela de arquivos com `overflow-x: auto` e `min-width: 480px` a 960px), `Routines.module.css` (`weekGrid` com `overflow-x: auto` preservando 7 dias sem quebrar o layout), `Usage.module.css` (`meterValue` responsivo e `transition: none` sob reduced-motion), `Connections.module.css` (`providerHead` wrap ajustado).

**Comandos:** `vitest` `connected-project-flow-board` (10 passed) + `map-persona-card-view` (3 passed) + `lumen-queue2` (9 passed) → **22 passed** · `node scripts/persona/check-pkg.mjs client-ui-persona` OK (52.7s) · `pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle` OK (57.8s) · `node scripts/persona/reap-orphans.mjs` OK.

**Fila:** Esgotada para Lumen no PLAN.md / briefings (restante em aberto depende de outros builders: Probe E2E / medição de abertura < 300 ms no app real, Rivet no empacotamento / instalador D8, Prism no chat 10k e Muse na revisão das capturas).

## 2026-11-04 09:30 — PRO-5 agrupamento + W2-10 ensinar no cartão + DESEMPENHO drag 1k

**PRO-5 (proativas agrupadas se inbox > N):** `ProactiveDailySummaries` cap de propostas em 3 por persona (`PROACTIVE_PROPOSALS_PREVIEW_LIMIT = 3`); botão de alternância acessível com `aria-expanded` e contador dinâmico (“Ver mais {count} propostas” / “Mostrar menos”); classes `.expandRow` no CSS; locales `proactive.showMore`/`showLess` gerados pt/en; teste de regressão em `lumen-proactivity.client.spec.tsx` (4/4 passed).

**W2-10 (Ensinar no cartão):** `KanbanCardMenu` agora expõe ação “Ensinar” com ícone de marca (`BrandIcon name="ensinar"`); acionado via `onTeach` em `KanbanCard`, `FlowKanbanBoard` e `KanbanBoard` (ligado a `personaCard.teachPersona`); locales `action.teach` em pt/en; suíte unitária nova em `kanban-card-teach.client.spec.tsx` (3/3 passed).

**DESEMPENHO (arraste 1k cards):** teste de integração em `kanban-board-virtual.client.spec.tsx` provando `dragStart` e `drop` entre colunas (`onMoveCard`) sobre o quadro virtualizado com 1.000 cartões (2/2 passed).

**Comandos:** `vitest` `lumen-proactivity` + `kanban-card-teach` + `kanban-board-virtual` → **9 passed** · `check-pkg client-ui-persona` OK (24.3s) · `pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle` OK.

**Fila:** Probe medir 16 ms/<300 ms abertura no app real; chat 10k (Prism); capturas Muse 960×640+200%.

## 2026-11-04 08:05 — DESEMPENHO fase 2 (kanban 1k, aprovações, contexto)

**Seed gallery:** `persona.kanbanScaleSeed` = `200`|`1000` + `mockLargeKanbanCards`; `applyDevSeedLargeTeam(150, 1000)` opcional; `ConnectedGlobalKanban` + `RemoteKanbanPanel` usam seed acima do host.

**Virtualização:** `KanbanBoard` (5 colunas global) + constantes em `kanban-virtual.ts`; `ReactiveApprovalsList` (≥12); `TurnContextDrawer` registros (≥32); mantidos flow/SB/OrgMap.

**Comandos:** vitest `mock-large-kanban` + `kanban-board-virtual` + `approvals-virtual` + `flow-kanban-virtual` + `fixed-row-virtual` + `board-adapters` + `lumen-queue2` + `dev-seed-large-team` → **pass** (batch DESEMPENHO). `check-pkg client-ui-persona` vermelho por `OnboardingWizard.tsx` (Prism, fora do escopo Lumen).

**Fila:** Probe medir 16 ms/<300 ms abertura; chat 10k (Prism); capturas Muse 960×640+200%; proativas agrupadas se inbox > N; drag 1k no app real.

## 2026-11-04 07:52 — W2-3 cartão + DESEMPENHO (fase 1) + viewport 960

**W2-3 (Anvil `BoardCardView.topicId`):** `projectBoardToFlow` + `conversationSubjectChipForId` (`map-host-ui.ts`); `PersonaLiveSnapshot.channelSubjects` persistido no refresh; `ConnectedProjectFlowBoard` recebe assuntos do live → bolinha no `KanbanCard` (quadro por projeto). Global lanes já vinham de `enrichKanbanCardsFromHost`.

**DESEMPENHO (fase 1):** primitivo `FixedRowVirtualScroller`; colunas do `FlowKanbanBoard` virtualizam ≥28 cartões (140 px); FLIP desliga acima de 120 nós visíveis; lista por tipo do Segundo cérebro virtualiza ≥40 linhas. Organograma lista já tinha janela (OrgMap).

**960×640 / zoom:** `@media (max-width: 960px)` em `Screen.module.css` (header/actions wrap, padding); colunas do board `min(260px, 88vw)`.

**Comandos:** vitest `board-adapters` + `enrich-kanban-subject` + `flow-kanban-virtual` + `fixed-row-virtual` + `connected-project-flow-board` → **19 passed** · `check-pkg client-ui-persona` OK (~24s).

**Fila DESEMPENHO (fase 2):** seed 150/10k/1k + medir abertura <300 ms e frame 16 ms (Probe); virtualizar aprovações + atividade/T3; chat 10k (coord Prism); capturas Muse 960×640 e 200% zoom por painel.

## 2026-11-04 07:43 — Remote panels restantes + PB-6 updateWorkflow

**Painéis Remote:** `remote-kanban-panel` (`listTasks`), `remote-knowledge-panel` (Cofre), `remote-canvas-panel` (`listCanvas`).

**PB-6:** `ConnectedProjectFlowBoard` — **Editar fluxo** → salvar chama `updateWorkflow`.

**Harness:** `rail-team.client.spec.tsx` — matcher `Sobre` sem overload inválido.

**Comandos:** vitest kanban/knowledge/canvas/flow (12) + batch anterior · `check-pkg client-ui-persona` OK (~25s).

**Fila Lumen (implementável):** esgotada — restante é Probe E2E (PRO-6, PB-9, GOV-10, BYC-6), Rivet (W2-7/BYC-5), Forge (PB-10 docs), Prism (PB-5 abas, GOV-8, W2-3 DM), opcional `topicId` no cartão do quadro por projeto (W2-3).

## 2026-11-04 07:30 — Revisar wire + SB/OPT remote + PRO resumo diário

**Revisar:** `kanban-review-sheet.client.spec.tsx`; fluxo do projeto abre sheet pelo menu “Abrir” e `acceptReview`.

**SB-5:** `remote-second-brain-panel.client.spec.tsx` — bundle `getBrainHome` + `changedToday`.

**OPT-7:** `remote-usage-panel.client.spec.tsx`; `RemoteUsagePanel` não trata painel OPT-7 como empty quando só há `getUsagePanel`.

**PRO-5:** resumo proativo (`listDailySummaries`) em `remote-approvals-panel`.

**Harness:** `persona-about-settings.client.spec.tsx` — prop `close` explícita (check-pkg).

**Comandos:** vitest review + flow + SB + usage + approvals → **14 passed** · `check-pkg client-ui-persona` OK (~33s).

**Fila:** Probe PRO-6/PB-9/BYC-6/GOV-10 E2E; Rivet W2-7/BYC-5; Forge PB-10 docs.

## 2026-11-04 07:22 — PB-3/6 proposta + PB-7 closeSprint + PRO decideApproval

**PB-3/6:** `ConnectedProjectFlowBoard` — botão “Sugestão da Coordenação” → `proposeWorkflow`; aceitar (`acceptWorkflowProposal`) e dispensar (`rejectWorkflowProposal`).

**PB-7:** modal encerrar sprint → `closeSprint` + toast com resumo.

**PRO-5:** `RemoteApprovalsPanel` — “Dispensar” chama `decideApproval` e recarrega inbox.

**Comandos:** vitest `connected-project-flow-board` (7) + `remote-approvals-panel` (2) → **9 passed** · `check-pkg client-ui-persona` OK.

**Fila:** Probe PRO-6/PB-9/BYC-6/GOV-10 E2E; Rivet W2-7/BYC-5; Forge PB-10 docs; `KanbanReviewSheet` wire jsdom (opcional).

## 2026-11-04 07:12 — PB-5 listBoards + PB-6 moveTicket + remote panels

**PB-5/10:** `connected-global-kanban-boards` — hub chama `listBoards` e exibe `currentSprintName` no tile.

**PB-6:** `boards-remote.client.spec.ts` (propose/accept fallback/reject no-op); `ConnectedProjectFlowBoard` menu “Mover para Live” → `moveTicket`.

**PRO-5:** `remote-approvals-panel` + `remote-rules-panel` ready (RPC bundles); `remote-members-panel` (`listTeam`).

**Harness:** `message-view-fixture` aceita `runError` (teste Muse/Prism map-message).

**Comandos:** vitest boards-remote + connected-global-kanban-boards + connected-project-flow-board + remote-approvals + remote-rules + remote-members → **12 passed** · `check-pkg client-ui-persona` OK (26s).

**Fila:** Probe PB-9/BYC-6/GOV-10; Rivet W2-7/BYC-5; Forge PB-10 docs; PB-6 proposta de fluxo na UI conectada (opcional).

## 2026-11-04 06:48 — C7a/b + BYC import wire + GOV-7 fix RPC

**C7a/b:** testes `RemoteFilesPanel` (`listFiles`) e `RemoteRoutinesPanel` (`listRoutineSchedule`).

**W2-7:** `connections-remote.client.spec.ts` — `loadConnectionsAccountsUi`.

**BYC-1:** `remote-import-panel` com mock de `BringContextImportPage` (evita hang jsdom; aceite app **Probe BYC-6**).

**GOV-7:** `ConnectedTeamHealthPanel` chama `applyGovernanceFix` no clique de correção.

**SB-5:** fixture `BrainHomeView.leftover` nos testes home (tipo host).

**Comandos:** vitest 6 specs acima → **6 passed** · `check-pkg client-ui-persona` OK (31s).

**Fila:** Probe PB-9/BYC-6/GOV-10; Rivet login/BYC-5; PB-10 docs Forge; OPT-7 live.

## 2026-11-04 06:40 — GOV-6 connected + SB-5 grafo + PB-7 plan

**GOV-6:** `connected-org-chart-ready` — `getOrgChart` + roster (Milo) na UI conectada.

**PB-7:** `ConnectedProjectFlowBoard` aba `sprints` → `SprintPlanningView`; `inferFlowModel` testado.

**SB-5:** `second-brain-graph.client.spec.tsx` — grafo opcional abre página.

**Comandos:** vitest derive-board-summaries + connected-org-chart + second-brain-graph + connected-project-flow-board → **8 passed** · `check-pkg client-ui-persona` OK.

**Fila:** Probe PB-9/BYC-6/GOV-10; BYC Import jsdom; Rivet; PB-10 docs Forge.

## 2026-11-04 06:35 — PB-7 sprint + GOV-7 + W2-7 remote

**PB-7:** `ConnectedProjectFlowBoard` teste faixa sprint (`currentSprint` host).

**PB-10:** adapter `em_branco` preservado em `projectBoardToFlow`.

**GOV-7:** `connected-team-health-ready` — `getTeamHealth` + achados na UI conectada.

**W2-7:** `remote-connections-panel` — `listConnectionAccounts` → assentos na tela.

**Comandos:** vitest board-adapters + connected-project-flow-board + remote-connections + connected-team-health-ready → **10 passed** · `check-pkg client-ui-persona` OK (27s).

**Fila:** Probe PB-9/BYC-6/GOV-10; BYC Import jsdom; Rivet login nativo; PB-10 docs Forge.

## 2026-11-04 06:30 — Hub live + W2-7 + PB-6 wire

**PB-5:** `deriveBoardSummaries` sobrepõe contagens dos cartões live quando o hub usa mocks Muse (<2 projetos).

**PB-6/10:** teste `ConnectedProjectFlowBoard` com `getProjectBoard` mock → colunas + cartão.

**W2-7:** teste Conexões com `accountsUi` multi-assento + botão adicionar (login nativo = Rivet).

**BYC-1:** `RemoteKnowledgePanel` → `selectMainPanel('importers')` no clique Importar (`remote-load-storm`).

**Comandos:** vitest acima + remote-load-storm BYC → **12 passed** · `check-pkg client-ui-persona` OK (28s).

**Fila:** Probe PB-9/BYC-6/GOV-10; BYC Import jsdom; W2-7 E2E login Rivet; PB-10 docs Forge.

## 2026-11-04 06:22 — PB-5 previews com hub fallback

**PB-5:** `GlobalCategoryLanes` mostra coluna quando há títulos live em `previewCards` mesmo com contagem zero no resumo (hub mock); teste unitário.

**Post-it:** Keel — só `note edit`; **não** fui eu no `note write` de hoje.

**Comandos:** vitest global-category-lanes + live-tenant-bridge → **8 passed** · check-pkg já OK.

## 2026-11-04 05:53 — PB-10 adapter + bug visão global (hooks)

**PB-10:** testes `projectBoardToFlow` (colunas host, `columnId`, chip waiting, categoria review → `in_review`).

**PB-5:** correção **Rules of Hooks** em `ConnectedGlobalKanban` (`projectHint` + `handleProjectWorkspaceTab` antes dos early returns); teste integração troca grid → global; stub `kanbanFocusTicketId` em `register-lumen-ui`.

**BYC-4 / S6:** teste discard em `ProposalReview`; Cofre empty → descrever empresa + Importar.

**Comandos:** vitest board-adapters + bring-context-review + knowledge-vault-visibility + live-tenant-bridge → **16 passed** · `check-pkg client-ui-persona` OK (54s).

**Fila:** Probe PB-9/BYC-6/GOV-10; BYC Importar app (jsdom hang); W2-7 Rivet; PB-10 docs Forge; OPT-7 live RPC.

## 2026-11-04 05:43 — Contratos + regressão W2/PB

**PB-5/10:** teste `hostBoardSummariesToHub` (`listBoards` → hub); `boards-home` botão visão global.

**W2-7:** teste Conexões exibe `wave2.termsNotice` (microcópia Atlas).

**Comandos:** vitest board-adapters + connections-wave2 + boards-home → **6 passed** · `check-pkg client-ui-persona` OK (41s).

**Fila:** PB-6/7 Probe PB-9; BYC Probe BYC-6; GOV Probe GOV-10; W2-7 login nativo multi-conta (Rivet/host).

## 2026-11-04 05:32 — PB-5 visão global + OPT-7 wire

**PB-5:** `GlobalCategoryLanes` — ícone Brush por categoria + até 3 títulos de cartão (`previewCards` de `live.kanbanCards`); helper `global-lane-previews.ts` + testes.

**OPT-7:** `persona-screens-remote` expõe `getUsagePanel` quando o host tem; `loadUsagePanelRemote` usa facade + fallback legacy; teste `usage-panel-remote.client.spec.ts`.

**Testes:** harness `dispose` nos connected/live stubs; `persona-about-settings` `close`.

**Comandos:** vitest global-lane* + usage-panel-remote → **4 passed** · `check-pkg client-ui-persona` OK (38s).

**Fila:** PB-6/7 Probe PB-9; BYC Probe BYC-6; GOV Probe; W2-7 contas UI.

## 2026-11-04 05:24 — Muse microcópia (Atlas) + fila

**Muse/Atlas:** passada em `locale-sources` (connections, usage, governance, kanban, review, hire, approvals, rules, memory, skills) — glossário `persona-spec/design/MICROCOPY.md`. Lumen: `git pull` já up-to-date; `gen-client-ui-persona-locales.mjs`; **não** reeditar JSON sem puxar antes.

**Verificação:** vitest usage/governance/workflow/sprint/lumen-rpc → **23 passed**; assert `token.cacheHit` (reaproveitado…) em `usage-token-panel`; `check-pkg client-ui-persona` OK (31s).

**Fila:** PB-6/7 aceite Probe; BYC app (Probe BYC-6); OPT-7 RPC Anvil `getUsagePanel` (UI + mock dev seed prontos).

## 2026-11-04 05:00 — PB-5 ícones coluna + filtros Quadros

**PB-5 (pós PB-8 Muse):** `ColumnCategoryIcon` + Brush `COLUMN_ICONS` nos cabeçalhos `BoardColumn`; pipeline `build-assets.mjs` passa a copiar `icons/columns/` (budget total ainda >10 MiB — não rodar rebuild completo local; ícones já em `assets/icons/columns/` + `generated-imports`). Teste filtro “Precisa de você” em `boards-home`.

**BYC-4:** tentativa jsdom `BringContextImportPage` continua travando transform — aceite app **Probe BYC-6**; review coberto por `bring-context-review`.

**Comandos:** vitest boards-home + board-primitives → **6 passed** · `check-pkg client-ui-persona` OK (24s). TS aux: `listConversationSubjects` narrow, `conversation-subjects-storm` tipos.

**Fila:** PB-6/7, Probe PB-9/GOV, BYC app, OPT-7 Anvil RPC.

## 2026-11-04 05:06 — Muse a11y Quadros + carry Kanban

**A11y (axe):** `ProjectBoardCard` — `role="group"` + `aria-label` com `boards.workingNow` + nomes (+N); `+N` visual `aria-hidden`. **Muse:** pode recapturar `panel-quadros-light.png` / `-dark.png`.

**Motion (UX-GUIDE §3):** wire `useKanbanCarry` em `KanbanBoard` + `FlowKanbanBoard` (`markLocalMove` drag/menu); `KanbanCard` `data-persona-kanban-carry`; `Kanban.module.css` — `top: calc(-1 * var(--persona-space-2))`, keyframe hop-off (avatar viaja com FLIP do cartão).

**Testes:** `boards-home` (group a11y) · `use-kanban-carry` (`detectPersonaMoves`) → **4 passed**. Fix typecheck pré-existente em `general-channel-turn-context` + `map-turn-activity-folds`.

**Comandos:** vitest acima · `check-pkg client-ui-persona` OK (39.7s).

**Fila:** PB-5 polish Muse PB-8; Probe GOV/BYC; BYC import jsdom; OPT-7 Anvil.

## 2026-11-04 04:56 — SB-5 página + BYC-4 nota

**SB-5:** `SecondBrainPageView` — fontes em `Card` + eyebrow; teste página assert eyebrow.

**BYC-4:** tentativa `bring-context-import.client.spec.tsx` — **vitest trava no import** de `BringContextImportPage` (pool não conclui transform); cobertura BYC permanece `bring-context-review` + `bring-context-ui` + aceite **Probe BYC-6**.

**Comandos:** vitest second-brain-page → **1 passed** · `check-pkg client-ui-persona` OK.

**Fila:** PB-5 (Muse PB-8); Probe GOV/BYC app; BYC import jsdom (investigar hang); OPT-7 Anvil.

## 2026-11-04 04:38 — SB-5 lista por tipo + grafo

**SB-5:** `SecondBrainKindListView` — Card + eyebrow; títulos `brainPageLink`; editor via `feedEditorDisplay` (Atlas, não `person:system`); empty `kindList.empty`; `personaNames` no shell. Teste `second-brain-kind-list.client.spec.tsx`.

**PB-5:** hub `BoardsHome`/`ConnectedGlobalKanban` já no repo — polish visual ainda depende **Muse PB-8**.

**Comandos:** gen-locales · vitest second-brain-kind-list → **2 passed** · `check-pkg client-ui-persona` OK.

**Fila:** PB-5 polish Muse; Probe GOV/BYC app; BYC-4 app; OPT-7 Anvil RPC.

## 2026-11-04 04:32 — GOV-7 + SB-5 permissões/página

**GOV-7:** `governance-health.client.spec.tsx` — cliques de correção 1-clique (achado + Teste 2 dias).

**SB-5:** `SecondBrainPermissionsView` — lista em `Card` + eyebrow por filtro + empty; testes `second-brain-permissions` + `second-brain-page` (fontes localizadas).

**Comandos:** vitest governance-health + second-brain-permissions + second-brain-page → **4 passed** · `check-pkg client-ui-persona` OK.

**Fila:** PB-5/6/7 (Muse PB-8); GOV-6/7 (app Probe); BYC-4 (app); SB-5 grafo/kind list polish; OPT-7 live RPC (Anvil `getUsagePanel`).

## 2026-11-04 04:18 — Fila: BYC-4 + SB-5 (pós-revisão1)

**BYC-4:** `bring-context-review.client.spec.tsx` — ProposalReview conflito, privado, editar; `bring-context-ui` — dedupe `duplicateOf` → chip conflito.

**SB-5:** `brainSourceLabel` exportado; `SecondBrainPageView` localiza `derived-index` nas fontes.

**Comandos:** vitest bring-context-review + bring-context-ui + brain-ui-adapters → **16 passed** · `check-pkg client-ui-persona` OK.

**Fila aberta:** PB-5/6/7 (Muse PB-8 specs); GOV-6/7 aceite Probe; BYC-4 (app) restante; SB-5 página/grafos; OPT-7 RPC Anvil.

## 2026-11-04 03:52 — Muse revisão1: Importar + Segundo cérebro

**Importar/BYC:** `BringContextImportPage` — “Abrir importador avançado” já em `Button variant="secondary"`.

**Segundo cérebro:** `SecondBrainHome` — seções em `Card` com eyebrow (O que mudou hoje / Precisa de você / Permissões / Mais usadas / Por tipo); estado sparse (`ready` + ≤3 páginas) com `ILLUSTRATIONS.bibliotecario` 200px + copy §1 + BYC primário; “Comece aqui” em `brainPageLink` (lilás sublinhado, AA). `brain-ui-adapters`: `person:system` → bibliotecário Atlas + avatar; `derived-index` → índice automático. Locales `home.startHereLabel`, `feed.*`.

**Recaptura:** Muse pode refazer `panel-importadores-*` e `panel-segundo-ce-rebro-*`.

**Comandos:** `gen-client-ui-persona-locales.mjs` · vitest brain-ui-adapters + second-brain-home → **10 passed** · `check-pkg client-ui-persona` OK.

## 2026-11-04 02:40 — Muse pós-CSS: 2 dias, Gestor, seed 150

**Contexto [Muse]:** `Governance.module.css` duplicado → **`GovernanceScreens.module.css`** (twoDayArt 120px etc.); guard `css-module-names.client.spec.ts`.

**Pronto:** (1) **Teste 2 dias** — dedupe só stub host×derivado (`shouldMergeTwoDayRows`: mesma identidade + um all-runs); roster scale mantém 1 linha/persona; `deriveTwoDayFromLive` sem `seenIdentities`, skip só id equivalente (`p-luna`/`luna`). (2) **Gestor** — `MOCK_GESTOR_AUDIT_PERSONA.avatarSrc` = `AVATAR_96.atlas`. (3) **Seed 150** — `Ouriço`/`Lobo-guará`; `orgScaleDisplayName` desambigua ondas (`Atlas (Amara)`…); `normalizeCharacterId` preserva `lobo-guara`/`lontra`.

**Comandos:** vitest two-day-dedupe + derive-two-day + mock-large-org + map-governance-ui + governance-health → **14 passed** · `check-pkg client-ui-persona` OK.

## 2026-11-04 02:32 — GOV-6 / BYC-4 / SB-5 testes (fila pós-janela)

**Pronto:** **GOV-6** — `governance-org-chart.client.spec.tsx`: modo lista (botão Nina a11y) + OrgMap 60 personas (combobox busca). **BYC-4** — `choicesToApplyItems` private/discard. **SB-5** — `second-brain-home.client.spec.tsx`: seções home, revogar grant, busca de páginas.

**Comandos:** `vitest` governance-org-chart + bring-context-ui + second-brain-home → **10 passed** · `check-pkg client-ui-persona` OK.

**Fila (ainda aberta):** PB-5/6/7 · GOV-10/W2-11 Probe · BYC-4 UI Importar E2E · SB-5 polish/grafos · OPT-7 RPC Anvil.

## 2026-11-04 02:42 — Keel: JANELA ENCERRADA (snapshot 4884366950)

**Protocolo:** Corte em worktree do Keel; **Lumen pode editar de novo** `client-ui-persona` e coordenar com Anvil/Forge em host/store conforme PLAN. Manter **`node scripts/persona/check-pkg.mjs client-ui-persona` + bundle** verdes ao fechar cada edição.

**Estado ao ack:** `check-pkg client-ui-persona` OK (02:42).

**Fila inalterada:** PB-5/6/7 · GOV-6/7 aceite Probe · W2-7 · BYC-4 · SB-5 · OPT-7 RPC.

## 2026-11-04 02:12 — Fila: testes Muse integ + aceite GOV/Uso

**Pronto:** Cobertura regressão pós-polish — `MOCK_USAGE_PROVIDER_POOL_NO_LIMITS` + teste linha sem limites / **Conta principal**; `mockLargeOrgChart` assert sem `Persona 1` + Luna; `deriveTwoDayFromLive` assert 1× Vigia (Luna) com roster `p-luna`; fix import duplicado `PooledAccount`; dedupe chaves `usage.en.json`.

**Comandos:** `vitest` mock-large-org + derive-two-day + two-day-dedupe + usage-provider-pool → **9 passed** · `check-pkg client-ui-persona` OK · `bundle` OK.

**Fila Lumen (PLAN, não vazia):** PB-5/6/7 (depende PB-8 Muse/Brush); GOV-6/7 aceite Probe (GOV-10); W2-7 aceite Probe; BYC-4 Importar revisão (parcial Cofre ✔); SB-5 Segundo cérebro UI; OPT-7 wire RPC Anvil. **Próximo encadeável:** testes Saúde/Org com scale seed + a11y lista organograma.

## 2026-11-04 02:05 — Muse integ pós-seed (4 itens Lumen)

**Pronto:** (1) **Org 60/150:** `mock-large-org-roster.ts` — 17 ids Brush, cargos/setores reais, 8 responsáveis humanos; `mockLargeOrgChart` usa `orgScalePersonaAt` + `ORG_SCALE_HUMAN_LEADS`. (2) **Teste 2 dias:** `two-day-dedupe.ts` + dedupe em `preferDerivedTwoDay` e `derive-two-day-from-live` (persona+papel). (3) **Uso pool:** `UsageProviderPoolCard` — `Conta principal`, linha `pool.providerNoLimits` sem barras vazias, `EngineBrandIcon` no cabeçalho; locales `pool.*`. (4) **Conexões:** Card política sem título/hint duplicados; selo via `EngineBrandIcon` (já nas linhas).

**Comandos:** `vitest` two-day-dedupe + usage-provider-pool → **4 passed** · `node scripts/persona/check-pkg.mjs client-ui-persona` OK · `pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle` OK.

**Fora (Muse):** ChoiceCards 2×2 + “Simular de novo” ao lado do título. **Limitação:** fixtures live ainda genéricos fora do seed `mockLargeOrgChart` até Forge roster JSON.

## 2026-11-04 01:50 — JANELA D-060: client-ui-persona VERDE

**Pronto:** Gate **check-pkg + bundle** `@deepseek-ai/dsh-client-ui-persona` verde (BYC `await unwrapRemote`, `UsageMeter` dedupe, `GestorWire`, `cardSystemRoles`, locale `persona.secondBrain`, mount BYC tipado, testes gestor snapshot). **Não** editar pacotes fechados até Keel “JANELA ENCERRADA”.

**Comandos:** `node scripts/persona/check-pkg.mjs client-ui-persona` OK · `pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle` OK.

**Fila (docs/testes folha):** PB-9 Probe · relatório PLAN · persona-host (Anvil `usagePortKind`).

## 2026-11-04 01:45 — OPT-7 + GES-5 perfil + BYC-4 Cofre (fila Atlas)

**Pronto:** **OPT-7:** `usage-panel.ts` / `UsageTokenPanel` / `loadUsagePanelRemote`; `RemoteUsagePanel` + mock dev-seed (`readClientDevSeedEnabled` → `MOCK_USAGE_TOKEN_PANEL` quando host sem `getUsagePanel`). Locales `section.tokens` / `token.*`. **GES-5:** auditoria Gestor no **Perfil** (`gestorAuditItems` + `ActivityGroup`); wire `RemoteProfilePanel` com mock; teste `lumen-queue2` gestor. **BYC-4:** chip/lista **privado** no Cofre (`VisibilityChip`, `visibility.privateAria`, CSS cadeado); teste `knowledge-vault-visibility`.

**Dependência [Lumen→Anvil]:** `getUsagePanel` RPC real · audit trail Gestor no host (mock em dev-seed/Saúde/Perfil). **[Lumen→Forge]:** `TaskView.topicId` p/ assunto no cartão live.

**Gates:** gen-locales (usage, knowledge) · vitest usage-panel + usage-token-panel + lumen-queue2 (gestor) + boards-home + derive-board-summaries + knowledge-vault-visibility → **12+ passed** (batch 01:45).

**Fila:** PB-5/6/7 aceite Probe (PB-9); W2-7 (Muse Conexões); GOV-6/7 marcar após capturas; SB-5 polish; PRO-6 Probe; GES-4 selo Prism.

## 2026-11-04 01:35 — GES-5 + W2-3 (fila Atlas)

**Pronto:** **GES-5 (parcial):** `TeamHealthView` + `ActivityGroup` + locales `activity.*` / `health.gestorAudit*`; mock `gestor-audit-mock.ts` wired em `ConnectedTeamHealthPanel` até RPC Anvil. **W2-3 (Lumen):** `KanbanCardModel.conversationSubject` + `SubjectDot` no cartão; mock `k2` · teste `kanban-subject-dot`.

**Dependência [Lumen→Anvil]:** audit trail real do Gestor no wire de Saúde/Perfil. **[Lumen→Forge]:** `TaskView.topicId` / subject link p/ cartão live (mock/UI prontos).

**BYC-4:** teste conflito decisão fixada → `contextProposalsFromPreview` (`bring-context-ui.client.spec.ts` 4/4).

**Gates:** gen-locales (governance, kanban) · vitest activity-group + governance-health + kanban-subject + bring-context-ui → **7 passed**.

**Fila:** PB-5/6/7 · BYC-4 polish · W2-7 (Muse integra Conexões) · OPT-7 · SB-5 grafo · PRO-6 Probe.

## 2026-11-04 01:15 — Atlas fila: GOV seed + gates (pós-turno)

**Pronto:** **`data/dev-seed-large-team.ts`** (`applyDevSeedLargeTeam(60|150)` = `persona.devSeed.v1` + `persona.orgChartScaleSeed`). Teste **`governance-fetch-scale`** (scale vence `getOrgChart`). **`TwoDayTimeline`** `data-two-day-row` p/ E2E. **`real-gallery-two-day-health.spec.ts`** (≥2 linhas). **`connection-swap-policy-map`** switches exaustivos (TS2366). **`UsageProviderPoolCard`** fix `bindLocale` params.

**Coordenação Muse:** Atlas integra Conexões/Uso/Saúde/Org — evitar `lumen-remote-panels.tsx`, `usage-pooled.ts`, `UsageProviderPoolCard.tsx`; ok `ConnectionsView`, `UsageLimits`, `TeamHealthView`, `OrgChartView`, `dev-seed-large-team.ts`.

**Gates:** `pnpm exec vitest run …/dev-seed-large-team.client.spec.ts …/governance-fetch-scale.client.spec.ts …/connection-swap-policy-map.client.spec.ts …/usage-provider-pool.client.spec.tsx …/governance-health.client.spec.tsx` → **5 files, 5 passed**.

**Fila Lumen (PLAN):** GOV-6/7 marcar done após capturas Muse; W2-7 polish; PB-5/6/7; PRO-6 (Probe); BYC-4; GES-4/5 auditoria ActivityGroup opcional.

## 2026-11-04 00:30 — Atlas: Gestor (rename) + organograma 60/150

**Pronto:** UI/código Lumen sem string **Maestro** (comentários → `GESTOR-SPEC`). **Quem cuida de quem:** `OrgMap` já ativo >24 personas (zoom/pan, minimap, busca+foco, grupos recolhíveis, lista virtualizada); labels via `org.map.*`; selo **Gestor** no chart (`team_manager` live + braço `Gestor de equipe` no mock grande). **Seed:** `mockLargeOrgChart(60|150)`; `localStorage persona.orgChartScaleSeed = '60'|'150'` **vence** RPC (captura no app). E2E: `real-gallery-org-chart-scale.spec.ts` (`openRealPersonaApp({ orgChartScaleSeed: 150 })`). `OrgChartView` passa `scaleLabels` via `org.map.*`.

**T3 colheita §7/§12:** `UsageLimits` + `UsageProviderPoolCard` (`PooledQuotaBar` 5h/semana, `AccountRow`); `officialQuotasToProviderPools`; composer `onSwapAccount` + link locale `composer.swapAccount`. Mock: `MOCK_USAGE_PROVIDER_POOLS`.

**Gates:** gen-locales · vitest org-map + org-chart-scale + mock-large-org-chart + gestor + map-governance-ui.

## 2026-11-04 00:20 — Muse gallery: Conexões dark + Teste dos 2 dias

**Pronto:** **Conexões (WAVE2 §c):** `ConnectionsView` usa `Card` + `AccountPolicyPicker` (4 cartões-rádio) + `Tabs` Toda a equipe / Uma persona; `Notice` info (termos); por provedor `EngineBrandIcon` (`ENGINE_ICONS`) + `runnerLabel()`; `AccountList`/`AccountRow`; “Como funciona” ghost no cabeçalho; botão secundário `+ Adicionar outra conta {Provider}` + hint isolamento; menu renomear/remover. **`connection-swap-policy-map`**. **Saúde:** `deriveTwoDayFromLive` expande roster + fila “Aprovações (você)” com `waits`/`stops`; `preferDerivedTwoDay` substitui stub host só-verde (ex. Vigia).

**Dependência [Lumen→Forge]:** `runTwoDayTest` idealmente devolve linhas por persona/rotina/aprovação; até lá o merge live cobre stub degenerado.

**Gates:** gen-locales · vitest `derive-two-day-from-live`, `connection-swap-policy-map`, `wave2-primitives` (11 passed).

**Recaptura:** Muse/Atlas podem refazer `21-panel-conexoes-dark` e `13-panel-sau-de-*`.

## 2026-11-04 00:25 — BRIEFING 19 Segundo cérebro (spec Muse)

**Pronto:** Início 2 col (`ChangeFeed`, `ContradictionCard`, `PermissionRow`, busca, tipos com `BrandIcon`); vazio `bibliotecario`; lista por tipo com `Tabs` (Tudo/privada/contradição) + **Lista|Grafo** (grafo estático + “Ver como lista”); página com `PageMeta`, confirmação 90d, salvar corpo via `putBrainPage`; **Aprovações:** `RememberPermission` (default Só desta vez) + carimbo “Lembrado · Ver em Permissões” + locales `remember.*`; rail `secondBrain` → ícone `conhecimento-memoria`.

**Pendente:** grafo canvas com física (SB-10); export/import pasta vault UI; Forge expor `existing`/`incoming` de contradição no wire (UI infere de corpo/fontes hoje).

**Gates:** gen-locales · vitest brain-ui-adapters + brain-primitives + derive-two-day + governance-health (13 passed).

**Recaptura Muse:** início, página, lista por tipo, grafo, permissões (revogar aberto), aprovações com Lembrar aberto — claro/escuro.

## 2026-11-04 00:16 — BRIEFING 19 Segundo cérebro + Permissões

**Pronto:** Namespace **`persona.secondBrain`** (locale-sources + gen). **`SecondBrainShell`**: início 2 colunas (ChangeFeed, contradições, permissões compactas, mais usadas, por tipo), lista por tipo, **página** (`PageMeta` + corpo markdown), **Permissões** (filtros Ativas/Vencidas/Revogadas + `PermissionRow`). **`RemoteSecondBrainPanel`**: `getBrainHome`, `listBrainPages`, `listBrainPermissions`, revoke; slot **`secondBrain`** em `register-prism-screens`. **`brain-remote`**: list/get/put page + list permissions. Rail **`sidebar.secondBrain`**.

**Pendente (fila):** grafo/canvas (SB-10), export vault folder UI, `ContradictionCard` completo, ícones Brush por tipo, busca no header, RememberPermission no cartão Aprovações (Lumen/Aprovações), salvar edição de página via `putBrainPage`.

**Gates:** gen-locales · vitest `brain-ui-adapters` + BYC (7 passed).

## 2026-11-04 00:12 — BRIEFING 18 BYC (Importar + revisão)

**Pronto:** **`BringContextImportPage`** (Muse § Importar): 2 colunas ≥1100px (`CopyPrompt`/`PasteBox` | `FolderDrop` + cartão exportação avançada); **`ProposalReview`** tela cheia; **`RemoteImportPanel`** wired. **RPC:** `previewBringContextPasteRemote`, `previewBringVaultFolderRemote`, **`applyBringContextRemote`** (`applyContextProposals` quando existir, senão `createVaultRecord` + `decideBringApply`). **Cofre:** botão **Importar** → painel `importers`. Locales importers/knowledge pt/en.

**Dependência [Lumen→Forge]:** Remote `applyContextProposals` (tipos prontos; fallback Lumen grava via `createVaultRecord`). **Dedup Cofre:** host ainda passa `existing: []` no paste RPC — conflitos completos quando Forge enriquecer.

**Gates:** gen-locales · vitest `bring-context-ui.client.spec.ts` (3 passed).

**Fila:** W2-7 primitivos Conexões; BYC-4 polish privado/cadeado no Cofre quando host expuser visibilidade.

## 2026-11-04 00:00 — Muse UX-18 + callbacks Cofre/Rotinas + Forge contas (painéis)

**Pronto:** **`lumen-remote-panels.tsx`**: `KnowledgeVault.onDescribeCompany` → `createVaultRecord` (`kind: brief`, id `company-brief`); `RoutinesView.onAskSuggestions` → `sendToPersona` (coordenação, prompt 3 rotinas); **UX-18** CTAs vivos — Uso → `connections`, Arquivos/Rotinas/Regras → DM coordenação, Canvas → `projects`, Membros → `issueInvite`, Conexões empty → retry, Perfil empty → `orgChart`. **Conexões:** add/rename/remove via RPC (`prompt`/`confirm` + locales `account.removeConfirm`). **Perfil:** `listConnectionAccounts.swapPolicy` → `accountPolicyText` no cartão. **`register-prism-screens`**: injeta `sendToPersona` + `selectMainPanel` nos painéis Remote.

**Dependência [Lumen→Muse]:** W2-7 §(c) — trocar layout custom de Conexões por `AccountList`/`AccountRow`/`AccountPolicyPicker`/`Notice` (handlers já no painel). **Bundle:** falha pré-existente (`dsh-persona-core` purity em outro diff).

**Gates:** gen-locales · vitest lumen-rpc-adapters + connections-remote + map-persona-card (17 passed).

**Fila:** W2-7 primitivos Conexões; PB-5 Conversa (Prism); PB-9/GOV-10 (Probe).

## 2026-11-03 23:05 — WAVE2 §3 Conexões multi-conta + Uso/cartão

**Pronto:** Contrato **`persona-spec/contracts/connections-accounts.md`**. Host types: `ConnectionAccountView`, `RunnerSwapPolicy`, `OfficialQuotaView.accountLabel`, `PersonaCardView.activeAccount`. UI: **`ConnectionsView`** agrupa por provedor, aviso de termos, seletores de política/escopo; **`loadConnectionsAccountsUi`** (`listConnectionAccounts` ou fallback `listConnections`); **`setRunnerSwapPolicy`** quando exposto. **Uso:** `usageBookToMeters` rotula cotas por conta. **Cartão:** “Conta em uso” em `PersonaCardFacts`. Locales connections/profile pt/en.

**Dependência [Lumen→Anvil]:** implementar Remote `listConnectionAccounts`, `setRunnerSwapPolicy`, cotas por `accountId`, `getPersonaCard.activeAccount`.

**Gates:** gen-locales · vitest lumen-rpc-adapters + map-persona-card-view (17 passed) · bundle OK · persona-host check-pkg OK (client-ui-persona check-pkg ainda falha por erros TS pré-existentes em chat/teach/register-lumen-ui, fora deste diff).

**Fila:** PB-5 Conversa (**Prism**); PB-9/GOV-10 (**Probe**); microcópia/a11y restante.

## 2026-11-03 22:32 — PB-3 aceite/rejeição RPC + docs insights

**Pronto:** **`boards-remote.ts`**: `buildAcceptWorkflowRequest` (incl. `template`), `proposeWorkflowRemote`, **`acceptWorkflowProposalRemote`** (fallback `updateWorkflow`), **`rejectWorkflowProposalRemote`** no dismiss do cartão. **`ConnectedProjectFlowBoard`** usa o helper (Anvil RPC já no host). Teste **`accept-workflow-proposal.client.spec.ts`** (+1). **A11y:** editor de fluxo → região `a11y.editorPreview`. **PB-10/docs:** § insights locais em `docs/persona/guia.md`.

**Dependência [Lumen→Prism] PB-5 Conversa:** aba já troca painel + `projectWorkspaceProjectId`; falta **`getProjectConversation`** → focar `#geral` do projeto em `ConnectedGeneralChannelView` (RPC Anvil pronto).

**Gates:** check-pkg OK · vitest accept-workflow + lumen-a11y · bundle OK.

**Microcópia:** `org.previewNote` pt/en (menos jargão “host”). **Fila:** Prism Conversa (`getProjectConversation`); Probe PB-9/GOV-10.

## 2026-11-03 22:18 — Insights locais (Uso) + a11y Quadros/Saúde

**Pronto:** **`LocalInsights`** + adapters **`insights.ts`**: `RemoteUsagePanel` chama `getActivationFunnel` / `listPersonaImpact` / `listPersonas` quando o host expõe (owner-only; falha silenciosa). Funil + impacto por persona em **Uso e limites** (pt/en, rótulo `estimativa`). **A11y:** `a11y.boardsGrid` na grade **Quadros**; `a11y.healthFindings` em Saúde; testes lumen-a11y (+2).

**Gates:** gen-locales · check-pkg OK · vitest adapters+a11y+storm (32 passed) · bundle OK.

**Fila:** PB-5 aba Conversa (**Prism**); `acceptWorkflowProposal` (**Anvil**); PB-9/GOV-10 (**Probe**); microcópia restante; PB-10 docs já em `docs/persona/quadros.md`.

## 2026-11-03 22:50 — Sessão retomada (pós-reboot Maestri): hireAvatarRef + gates

**Contexto:** Maestri reiniciou; fila Atlas: Quadros/GOV/Aprovações storm → a11y/locale depois.

**Pronto:** **`ApprovalView.hireAvatarRef`** (host `hireCard` a partir de `spec.avatar` gallery) + **`approvalsToInbox`** usa ref antes do título (retrato certo em contratações). Teste adapter hire `sol-default` → `sol`.

**Gates:** check-pkg client-ui-persona + persona-host OK · vitest lumen-rpc-adapters + remote-storm + governance-health (18 passed) · bundle OK.

**Fila:** PB-5 aba Conversa (Prism); PB-6/7 polish; `acceptWorkflowProposal` Anvil; GOV-10 Probe; insights UI quando RPC Forge/Anvil; passe a11y/microcópia nas telas Lumen.

## 2026-11-03 22:45 — Gates + PB-5 escopo Arquivos/Rotinas + conexões kind

**Pronto:** **`derive-two-day-from-live`**: shadowing corrigido (check-pkg verde). **Conexões:** dedupe também por **`kind`** (fim do DSH triplicado). **PB-5:** chip `scope.project` em Arquivos/Rotinas quando `projectWorkspaceProjectId` vem do quadro (`ProjectWorkspaceScopeChip`).

**Gates:** gen-locales · vitest adapters + use-remote-project-scope (12 passed) · check-pkg OK.

**Fila Lumen:** PB-5 aba **Conversa** (Prism: canal por projeto + chip); PB-6 editor de fluxo; PB-7 sprints UI; PB-10 docs; PB-9/GOV-10 (Probe). **Anvil:** `acceptWorkflowProposal` estável no Remote tipado.

## 2026-11-03 22:35 — Muse panel review: Regras, Conexões, Uso, Arquivos, Membros

**Pronto:** **Regras:** locale (sem PROACTIVITY §6; “Quando pedir sua aprovação”; “Modo só registrar (você liga)”; log `formatTriageLogAt` → “hoje, 21:22”). **Conexões:** dedupe por `id`; `runnerLabel()`; selo `BrandIcon skills` no cartão. **Uso:** labels via `runnerLabel()`; projeto ocioso → origem `notYet` (“Sem medição ainda”, sem 0% Medido). **Arquivos:** `needRoot` usa `empty-inbox`. **Membros:** “Revogar acesso” oculto quando `isSelf` (`actorId` do tenant).

**Gates:** gen-locales · vitest `lumen-rpc-adapters` + `format-triage-log-at` (11 passed). **check-pkg:** 5 erros pré-existentes fora deste diff (approvals, derive-two-day, PersonaCardPopoverHost, ConnectedProjectFlowBoard).

**Limitação:** ícone do cartão de conexão ainda é selo `skills` genérico até Brush marcar por runner; dedupe é por `id` (se host repetir `kind` com ids distintos, avisar).

## 2026-11-03 22:26 — Muse recapture #2: TWO_DAY art, live 2-day, aprovações

**Pronto:** **Saúde:** `TWO_DAY_ART` na `legendRow` (120px, direita da legenda, oculta &lt;1200px); `HealthScore` com arte padrão 132px; `fetchTwoDayTest` sem mock Iara/Rio — `deriveTwoDayFromLive` (nowRows + kanban `needs_you`/`blocked`). **Aprovações:** hire com `approvalHireVisual` (retrato do draft ou `BrandIcon convidar`); Avatar portrait `object-fit: contain`; linha “Resumo” só se `impactDetail` ≠ título/pergunta. **PB-5 (parcial):** `projectWorkspaceProjectId` + `useRemoteProjectScope` para Arquivos/Rotinas ao sair do quadro.

**Gates:** vitest approvals/governance-health/shell/remote-storm (18 passed) · check-pkg · bundle (pendente neste commit).

**Dependência Anvil:** `acceptWorkflowProposal` RPC (fallback `updateWorkflow`); `ApprovalView.hireAvatarRef` para retrato sem mock.

## 2026-11-03 22:10 — Muse recapture: org card + saúde ordem + engineLabel

**Pronto:** **Organograma:** `sector` no map (`Cargo · Setor`); `SectorIcon` size 20 por setor; `usePersonaCardController` + `PersonaCardPopover`/`PersonaInfoCard` (`cardInfo` bridge via `mount` → `LumenPersonaCardBridge`); fallback `orgPersonaToCardInfo`. **Saúde:** ordem `HealthScore` (gauge `score` + `health.scoreLabel`) → card Teste 2 dias (timeline + fixes) → arte `TWO_DAY_ART` ≤120px pós-legenda, oculta &lt;1200px → achados por último; `HealthScore` `illustration={null}`. **Motor:** `engineLabel()` em `map-persona-card-from-host` e `map-persona-card-view`.

**Gates:** gen-locales · vitest map-governance / enrich-org / engine-label / map-persona-card* (9+) · governance client specs · check-pkg · bundle OK.

**Limitações:** clique no nó do organograma abre card (trigger); perfil/DM só pelo card — `onSelectPersona` no primitivo fica atrás do `cardTrigger.onClick`.

## 2026-11-03 21:55 — Muse: ApprovedStamp + HealthScore/TWO_DAY_ART

**Pronto:** `ApprovedStamp` + `usePawCelebration` em **Aprovações** (saída do cartão com stamp animado) e no **quadro** após `acceptReview` (`KanbanCard`, `ConnectedProjectFlowBoard`). Stamp estático (`animate={false}`) em cartões já em `done` ao carregar. **Saúde:** `HealthScore` sem prop `illustration` (arte por nível no primitivo); **Teste dos 2 dias** em `Card` com `TWO_DAY_ART` 140px no cabeçalho. Locales `stamp.approved`. Teste `kanban-approved-stamp.client.spec.tsx`.

**Gates:** gen-locales · vitest celebration/governance-health/kanban-stamp (5 passed) · check-pkg · bundle OK.

## 2026-11-03 21:48 — PB-7 pico-fim: resumo ao encerrar sprint

**Pronto:** `ConnectedProjectFlowBoard` lê `CloseSprintView.summary` do RPC e mostra `Toast` `celebrate` (locales `closeSprint.toastTitle` / `toastDismiss`, `a11y.toastRegion`). `applyGovernanceFix` tipado para retornar `TeamHealthView | null` (host pós-fix).

**Gates:** gen-locales · vitest close-sprint + governance-health + connected-kanban (4 passed) · check-pkg · bundle OK.

**Fila:** PB-5 (contexto projeto nas abas Conversa/Arquivos — Prism shell), PB-6 aceite `acceptWorkflowProposal` (Anvil), PB-9/GOV-10 (Probe), D5b polish Uso.

## 2026-11-03 22:32 — Muse GOV-6/7 revisão captura (10 itens)

**Pronto:** `governance-ui-helpers.ts` (characterId, sector, slot labels, fix labels, illustration, plural humanos). `map-governance-ui` filtra braço direito dos members; `twoDayToUi` com labels Dia 1/2. `derive-org-from-live` normaliza avatar. `OrgChartView` subtitle plural + `SectorIcon`. `TeamHealthView` header `equipe`, `HealthScore` illustration prop, ações por `fixKind`, empty two-day, `twoDayPending`. `governance-remote` fallback mock se RPC `rows` vazio. Mock veredito curto + «depende de você». Locales pt/en (`org.subtitleHumans*`, `health.fix.*`, `twoDay.empty*`). Testes `map-governance-ui.spec.ts` + governance vitest.

**Gates:** gen-locales · vitest governance (6 passed) · check-pkg client-ui-persona · bundle OK.

**Limitações:** ilustrações `equipe-saudavel` / `ponto-unico-falha` só aparecem quando Brush entregar no manifest; ícone header Saúde permanece `equipe` até asset `saude`.

## 2026-11-03 21:48 — SNAPSHOT: typert GOV-5 (Anvil) + fila Atlas

**Fix pós-Anvil:** `governance-remote` usa RPC tipado (`getOrgChart`/`applyGovernanceFix` com `GovernanceFixKind`); `ConnectedOrgChartPanel` sem cast quebrado. **VERDE:** check-pkg client-ui-persona 21.8s + bundle OK.

**Congelado (Keel, sem SNAPSHOT CORTADO):** PB-6 polish; **Muse→Lumen** perfil (`onMessage`/`onEdit`/nomes projeto) — próximo após corte. **Prism→Lumen** PB-5 abas workspace.

**Fila Lumen (não vazia):** PB-5/6/7/10, GOV RPC real, Probe E2E, D5b, design-shots.

## 2026-11-03 20:42 — SNAPSHOT Keel (VERDE)

**Gates:** `node scripts/persona/gen-client-ui-persona-locales.mjs` · `node scripts/persona/check-pkg.mjs client-ui-persona` (38.7s OK) · `pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle` OK · `check-pkg.mjs persona-e2e` (4.5s OK).

**Em curso (congelado até SNAPSHOT CORTADO):** PB-6 editor — arrastar colunas + CRUD campos extras no modal (código landed; relatório 20:08 cartão proposta).

**Dependências outros donos:** Anvil `acceptWorkflowProposal`; Prism abas workspace PB-5; Forge ARCHITECTURE PB-10.

## 2026-11-03 20:08 — PB-6 cartão «Usar este fluxo?» + aceite provisório

**Pronto:** **`WorkflowProposalCard`** (`data-persona-surface="workflow-proposal"`) com pergunta/impacto/prévia de colunas e degrade. **`ConnectedProjectFlowBoard`**: botão **Sugestão da Coordenação** → `proposeWorkflow` (quando Remote expõe); aceite via **`updateWorkflow`** + **`destByRemovedForProposal`**; recusar fecha o cartão. Contrato **`project-boards-remote.md`** atualizado (aceite provisório até `acceptWorkflowProposal` Anvil). **`projectHint`** do live (`nome + kind`).

**Dependência Anvil:** RPC dedicado de aceite/recusa; hoje aceite = `updateWorkflow` (não `createWorkflowFromTemplate`).

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run …/accept-workflow-proposal …/workflow-proposal-card …/workflow-editor-draft …/connected-kanban → 6 passed
```

**Fila:** PB-6 campos extras editáveis + drag colunas no editor; PB-5 abas projeto (Prism); PB-10 ARCHITECTURE (Forge); GOV-5 RPC.

## 2026-11-03 20:00 — GOV derive ao vivo + PB-6 cores + galeria Probe

**Pronto:** **`deriveOrgChartFromLive`** + **`ConnectedOrgChartPanel`**: RPC → derive do live → mock, banner `org.previewNote`. Contrato **`persona-spec/contracts/governance-remote.md`**. Teste **`derive-org-from-live.spec.ts`**. **Probe:** `REAL_GALLERY_PANELS` entradas Quem cuida / Saúde; Quadros `readySelector` → `[data-persona-surface="boards"]`. **PB-6:** paleta de **cores de coluna** no editor (`EDITOR_COLUMN_COLOR_PRESETS`, persiste em `updateWorkflow`). A11y org lista no `lumen-a11y`.

**Dependências:** Anvil GOV-5 (RPC real); cartão proposta Coordenação (`proposeWorkflow`) ainda sem UI Lumen; campos extras editáveis = fase 2; PB-5 abas Conversa/Arquivos/Rotinas no workspace = Prism `navigateProjectTab`.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run …/derive-org-from-live …/governance-* …/workflow-editor-* …/lumen-a11y → 14+ passed
```

## 2026-11-03 19:50 — GOV-6/GOV-7 governança (Quem cuida de quem + Saúde + Teste 2 dias)

**Pronto:** Painéis **`orgChart`** e **`teamHealth`** com primitivos Muse (`OrgChart`, `HealthScore`, `HealthItem`, `TwoDayTimeline`). **`OrgChartView`**: Por pessoa / Por setor + organograma/lista; clique abre perfil da persona. **`TeamHealthView`**: nota + achados acionáveis + timeline do **Teste dos 2 dias** (4 meias-jornadas). **`governance-remote.ts`**: chama `getOrgChart` / `getTeamHealth` / `runTwoDayTest` / `applyGovernanceFix` quando Anvil expuser; **fallback mock** alinhado à ref visual até GOV-5. **Nav (com Prism):** grupo rail **Equipe** → Equipe · Quem cuida de quem · Saúde (`MainPanelId` `orgChart` | `teamHealth`). Locale `persona.governance`.

**Dependência Anvil (GOV-5):** Remote real + Typert; hoje mocks e `applyFix` no-op sem RPC. **Muse GOV-9:** specs/arte saúde pendente (Brush). **Prism GOV-8:** assistente de estrutura.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run …/governance-org-chart.client.spec.tsx …/governance-health.client.spec.tsx → 2 passed
```

## 2026-11-03 19:42 — PB-6 editor de fluxo + `updateWorkflow` (BOARDS-SPEC §5)

**Pronto:** **`WorkflowEditorModal`** em dois painéis — editar colunas (nome, categoria segmentada, WIP, reordenar ↑↓, remover), **`RemoveWorkflowColumnModal`** com `destByRemoved`, validação todo+done, **prévia ao vivo** com `BoardColumns`/`BoardColumn`. **`workflow-editor-draft.ts`** (pure). **`ConnectedProjectFlowBoard`** persiste via `persona.updateWorkflow`. Campos extras só leitura (host já tem `fields`; UI de chips = fase 2). Arrastar colunas e paleta de cor = fase 2 (teclado coberto por reordenar).

**Testes:** `workflow-editor-draft.spec.ts`, `workflow-editor-modal.client.spec.tsx` (4 passed).

**Fila:** PB-6 campos extras + drag; PB-5 polish Prism; PB-10 ARCHITECTURE (Forge); bundle purity (Prism).

## 2026-11-03 19:35 — PB-7 planejamento de sprint (BOARDS-SPEC §3)

**Pronto:** **`SprintPlanningView`** (backlog ↔ sprint, teclado via cartão selecionável + botões adicionar/remover; campos nome/objetivo/datas; primário **Iniciar sprint** desabilitado sem objetivo/tarefas). **`useSprintPlanningState`** + **`ConnectedProjectFlowBoard`**: RPC `createSprint` / `updateSprint` → `planSprint` → `startSprint`. Aba **Sprints** e **Planejar** na faixa (`SprintBand`) ficam no quadro do projeto (`ConnectedGlobalKanban` mantém `board`/`sprints` local; Conversa/Arquivos/Rotinas ainda navegam para outros painéis). **`ProjectFlowBoard`**: abas refletem `workspaceTab`.

**Limitações:** medidor de capacidade por persona ainda só conta tarefas (host não expõe assignee no `BoardCardView`); iniciar nova sprint com sprint **ativa** no host não encerra a anterior (Anvil pode reforçar regra); arrastar backlog↔sprint = fase 2 (botões cobrem a11y). **Bundle client:** ainda bloqueado por import `@deepseek-ai/dsh-persona-host/src/draft.ts` (fora do escopo Lumen).

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run …/sprint-planning.client.spec.tsx …/close-sprint-modal.client.spec.tsx …/lumen-a11y.client.spec.tsx
→ sprint 2 + close 2 + a11y 11 passed
```

**Fila Lumen:** PB-6 editor completo + `updateWorkflow`; PB-5 sidebar Prism; PB-10 docs/migração (Forge); PB-7 modal encerrar “quem fez o quê” se host expuser; design-shots Quadros.

## 2026-11-03 19:25 — PB-8 primitivos Muse (BoardColumn/CategoryBar/SprintStrip/FlowIcon)

**Pronto:** Quadros usam **`CategoryBar` + `FlowIcon` (40px)** via `board-locale.ts` (labels traduzidos). **`FlowKanbanBoard`** → `BoardColumns`/`BoardColumn` com `empty.column.*`, `dropTarget`, `empty.addTask` na 1ª coluna todo. **`SprintBand`** → `SprintStrip`. **`CloseSprintModal`** + `ILLUSTRATIONS['sprint-concluida']` + `persona.closeSprint`. Removidos `boards/CategoryBar.tsx` e `FlowModelIcon.tsx` (duplicatas).

**Testes:** `boards-home`, `flow-kanban`, `close-sprint-modal`, `board-primitives` + bundle OK.

## 2026-11-03 19:10 — P0 tempestade + PB §2 fluxo (Anvil PB-4) + cartão Muse

**P0 (Carregando… / ERR_INSUFFICIENT_RESOURCES):** confirmado `usePersonaRemoteLoad` com `loadRef` (identidade de `load` não re-dispara fetch). Testes **`remote-load-storm`**: hook + **Conhecimento, Uso, Aprovações** — ≤1 RPC por `loadKey` com re-renders forçados.

**PB §2 (quadro por projeto):** drill-down usa **`getProjectBoard` + `moveTicket`** (`ConnectedProjectFlowBoard` → `ProjectFlowBoard` + **`FlowKanbanBoard`** colunas 296px, faixa categoria 4px, WIP, tint `needs_you`, scroll-snap). **`SprintBand`** (ativo / tracejada idle). Hub: **`listBoards`** quando host responde; **visão global** `GlobalCategoryLanes`; **Novo projeto** → `NewProjectFlowModal` + `createWorkflowFromTemplate`. Editor: **`WorkflowEditorModal`** (lista colunas; save = fechar por ora). **`FlowIcon`** nos selos (Brush).

**Cartão Muse:** título + chips meta; **rodapé** avatar 24 + chip estado + menu ⋯ com **`flowMoveTargets`** (sem `<select>`).

**Pendente PB:** §3 planejamento sprint, §4 encerrar sprint (modal + marco), editor completo (arrastar colunas, destino ao remover), abas projeto Conversa/Arquivos/Rotinas/Sprints; capturas `panel:Quadros` + quadros Contratação/Site.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run …/remote-load-storm …/flow-kanban …/boards-home …/kanban-preview …/connected-kanban …/live-tenant-bridge …/lumen-a11y
→ 7 files / 25 passed (storm 5 + flow 1 + …)
pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle
```

## 2026-11-03 19:18 — PB-5 §1 Quadros (BOARDS-SPEC) + cartão Kanban Muse

**Pronto:** Rail **Kanban → Quadros** (`shell` locale). Slot `kanban` agora abre **`BoardsHome`** (`data-persona-boards`): grade 320px, selo do modelo (BrandIcon/UiIcon até Brush `flow-*`), chips modelo+sprint, **barra de categorias** (`--persona-cat-*`), avatares 24px sobrepostos, chip “Precisa de você”. Mocks **Contratação + Site** para captura Muse; `deriveBoardSummaries` usa host quando ≥2 projetos. Drill-down abre **`KanbanWithReview`** filtrado por projeto (interim até colunas de fluxo PB-4). **Cartão:** avatar 24 + chip estado, projeto, prazo/dep/evidência, menu ⋯ (sem `<select>`), coluna vazia `EmptyState` compact + min-height 420px. **`usePersonaRemoteLoad`:** `loadRef` + deps estáveis (P0 tempestade). Instrumentação `personaRemoteLoadStartCounts`.

**Capturas Muse:** `node scripts/persona/design-shots.mjs panel:Quadros` → `.maestri/tmp/shots/design/panel-quadros-light.png`, `panel-quadros-dark.png` (380 chars main, **0** console errors).

**Fila PB (próximo):** §2 quadro por fluxo (colunas 296px, faixa sprint, WIP, needs_you tint), §3 planejamento, §4 encerrar sprint, §5 editor — depende **Anvil PB-4** + assets Brush `empty-col-*` / `sprint-concluida`. Visão global raias recolhíveis.

**Testes:**
```
pnpm exec vitest run …/boards-home.client.spec.tsx …/kanban-preview …/connected-kanban …/live-tenant-bridge …/lumen-a11y …/remote-load-storm
→ 6 files / 22 passed (storm 3 + boards 1 + kanban 4 + connected 1 + bridge 2 + a11y 10)
pnpm --filter @deepseek-ai/dsh-client-ui-persona run bundle
```

## 2026-11-03 18:20 — Capturas Muse pós-unwrap + design-shots wait

**Pronto:** Após fix Prism (bootstrap/conflict), **`design-shots.mjs`** re-run **Kanban / Conexões / Aprovações** (light+dark) — Kanban **451 chars** (não mais skeleton infinito); 6 PNG em `.maestri/tmp/shots/design/`. Script: **`waitPanelSettled`** antes do screenshot; aliases de painel; waits para knowledge/files/routines/usage. **Canvas G2:** linhas da lista com `tabIndex` + foco visível. **D5b:** UI + `usageBookToMeters` + Remote já entregues (PLAN `todo` é flag Keel).

**Pendente:** lote `panel:Conhecimento|Arquivos|Rotinas|Uso` **enfileirado** atrás do lock `ui-boot-check` (Prism). **axe/Lighthouse** = Probe PRO-6.

**Testes:**
```
pnpm exec vitest run …/lumen-a11y …/connected-kanban …/lumen-rpc-adapters → 3 files / 19 passed
```

## 2026-11-03 18:12 — a11y sweep superfícies + Conexões live region

**Pronto:** **`lumen-a11y.client.spec.tsx`** ampliado (10 casos): Aprovações (`h2` reativo + botão primário), Conexões (`aria-busy` loading + `role="status"` ao copiar comando), Cofre (tab focável), Membros (convite). **Conexões:** loading unificado em `PersonaSurfaceLoading`; anúncio SR ao copiar (`aria-live="polite"`). **G2 (PLAN):** modo lista + teclado nos nós Canvas já coberto nos testes anteriores.

**Capturas Muse:** `design-shots.mjs panel:Kanban panel:Conexoes panel:Canvas` → 4 PNG (`panel-kanban-*`, `panel-canvas-*` em `.maestri/tmp/shots/design/`). Kanban ainda **“Carregando quadro…”** (bootstrap live store: `createWorkspace` conflict + unwrap); Conexões falhou nav **Conexoes** sem acento → corrigido alias no script. **Dependência:** Prism/Anvil bootstrap verde para shots úteis.

**Fila Lumen restante:** re-shot painéis com dados reais pós-host; **axe/Lighthouse** = aceite Probe (PRO-6).

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-a11y.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts
→ 3 files / 26 passed
```

**Post-it:** `18:12 Lumen — a11y 10 tests (aprovações/conexões/cofre/membros); Conexões copy live region; capturas design-shots tentadas.`

## 2026-11-03 18:05 — Canvas a11y + Kanban FLIP + testes

**Pronto:** **Canvas (G2):** região `a11y.graphRegion`, dica `a11y.graphHint`, nós SVG com `Enter`/`Espaço`, `aria-pressed`, `role="status"` ao selecionar; foco visível no círculo; aba Lista com `<th scope="col">`. **Kanban FLIP:** `use-kanban-flip.ts` + `data-persona-kanban-card` (WAAPI, off em `prefers-reduced-motion`). **Testes:** `lumen-a11y` +2 (canvas teclado + lista).

**Microcópia:** vazios/retries já consistentes nos 20 bundles (sem “Falha”/“Clique aqui”).

**Fila restante (Atlas):** axe/Lighthouse manual (Probe pode assumir); **`design-shots.mjs panel:*`** → **depende host bootstrap** (Prism unwrap + Anvil P0). Escritas memória/skills no UI fora do escopo v1 read-only.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-a11y.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx
→ 2 files / 9 passed
```

**Post-it:** `18:05 Lumen — Canvas a11y+FLIP kanban; lumen-a11y 5 tests; capturas aguardam host.`

## 2026-11-03 18:00 — Atlas fila: a11y Kanban + microcópia import + motion hover

**Pronto (a11y, lente-acessibilidade):** Região do quadro com `a11y.boardRegion` (não mais só dica de arrastar). Contagem por coluna com `a11y.columnCount` interpolada. **WCAG 2.5.7:** `<select>` “Mover tarefa para” em cada card quando `onMoveCard` existe (teclado + leitor de tela). Filtro de estágio com `aria-labelledby` (`useId`). Foco visível no select. **`lumen-a11y.client.spec.tsx`** (região, move select, `aria-pressed`, stepper import).

**Microcópia:** `importers` `error.title` pt/en humanizado (sem “Falha na importação” seco).

**Motion (parcial UX-GUIDE):** hover lift nos cards Kanban + respeito `prefers-reduced-motion`. FLIP / carry avatar já existentes; capturas Muse ainda pendentes.

**Locale en:** paridade pt/en verificada nos 20 `locale-sources` (sem chaves faltando).

**Fila restante:** axe/Lighthouse manual em todas as telas; sweep microcópia completo (botões/vazios); FLIP kanban refinado; **`design-shots.mjs panel:*`** (depende host Anvil/Prism bootstrap).

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-a11y.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx
→ 3 files / 15 passed (incl. 7 kanban+a11y)
```

**Post-it Persona · Status:** `18:00 Lumen — a11y Kanban (move select 2.5.7), lumen-a11y tests, import error copy, card hover; capturas aguardam host.`

## 2026-11-03 17:50 — Atlas: D5a Uso + memória/skills Remote

**Pronto:** **Uso (D5b UI + D5a livro):** `RemoteUsagePanel` chama `getUsage` (mês UTC) + `getOfficialQuota` via `personaScreensRemote`; `usageBookToMeters` (sem `0%` falso). **Perfil:** `listMemory` / `listSkills` no load do `RemoteProfilePanel` → `MemoryPanel` / `SkillsPanel` com dados reais (preview isolado mantém mocks). **`persona-screens-remote.ts`** (padrão review wire). Adaptadores `adapters/{usage,memory,skills}.ts`.

**Fila Lumen (Atlas 17:56 restante):** a11y (axe/teclado), lente-microcópia sweep, motion UX-GUIDE (kanban FLIP/patinhas), locale `en` completo, capturas Muse pós-host.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 3 files / 18 passed
```

## 2026-11-03 17:43 — Muse captura (review-lumen-light): loading + Kanban + Import + layout

**Pronto:** **Loading infinito** — causa principal: `initialState` congelado em `useState` (Kanban global, Cofre, Arquivos, Rotinas, Uso); agora sync + `initialCards` effect. **Timeout 8 s** em `usePersonaRemoteLoad` + tenant gate → `ErrorState` com microcópia Muse (`error.title` pt/en via `patch-lumen-remote-error-copy.mjs`) + **Tentar de novo** (`onRemoteRetry` nos painéis Remote). **Kanban:** filtros Equipe/Projeto/Persona com `KanbanFilterSelect` (chevron `UiIcon`); Estado = botões-adesivo `aria-pressed`; estágio usa `initialState` live. **Importar:** stepper estilo onboarding; um primário (Continuar); Escolher exportação = secondary + ícone attach. **Arquivos:** tabela `width:100%` (remove `max-width` shell). **Membros:** convite `size="m"`. **Perfil/Import:** `Screen` default (não reading).

**Pendente (Atlas 17:56):** Uso → RPC D5a fold/official; Memória/Skills → `listMemory`/`listSkills`; fila a11y/microcópia/motion/en. **Capturas:** aguardo host; depois `design-shots.mjs panel:*`.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/connected-kanban.client.spec.tsx packages/persona/client-ui-persona/tests/live-tenant-bridge.client.spec.tsx
→ 4 files / 19 passed
```

## 2026-11-03 17:29 — Muse polish: Memory/Skills/Proactive + rem sweep

**Pronto:** **MemoryPanel**, **SkillsPanel**, **ProactiveDailySummaries** migrados para `Card`/`Chip`/`Button` + CSS próprio; removido **`LumenPage.module.css`**. **ApprovalsProactivity.module.css** — tokens semânticos/espaço. Sweep `rem` → `--persona-space-*` / `--persona-radius-*` em knowledge, routines, usage, files.

**Fila Lumen (PLAN):** itens C6–C7, D4b, PRO-5 UI, E9/F2 preview **done**; **D5b** UI (`UsageLimits` + `RemoteUsagePanel` + `limitsToUsageMeters`) pronta — PLAN ainda `todo` aguarda **D5a Rivet** (livro/cota oficial no host). **Muse capturas** `panel:*` bloqueadas em **Anvil P0** (host).

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx … (8 arquivos)
→ 8 files / 34 passed
```

## 2026-11-03 17:12 — Muse revisão (e) parte 1 — SCREEN-SPECS + tokens

**Pronto:** Telas pendentes alinhadas a `SCREEN-SPECS.md`: **ApprovalsInbox**, **TriageRulesView** (`Input` nos limites), **MembersView**, **CanvasView** (`Tabs` canvas/lista), **PersonaProfilePage** (`Screen`/`Tabs`/herói `Card`), **ImportWizard**. `header.eyebrow` + `subtitle` (perfil) nos `locale-sources` (en/pt) + `gen-client-ui-persona-locales.mjs`. Migração CSS Lumen: `--persona-active-*` / `--persona-lilac-*` → semânticos em knowledge, files, routines, usage, connections, kanban, canvas, `ProactivityMetrics`, `ApprovalsProactivity`; gaps kanban → `--persona-space-*`. **ProactivityMetricsPanel** deixou `LumenPage.module.css`.

**Pendente Muse (captura):** `design-shots.mjs panel:*` quando host (Anvil P0) voltar. **Opcional follow-up:** `MemoryPanel`/`SkillsPanel`/`ProactiveDailySummaries` ainda importam `LumenPage.module.css`; sweep rem restante em usage/knowledge/routines CSS.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx packages/persona/client-ui-persona/tests/observable-bridges.client.spec.ts packages/persona/client-ui-persona/tests/connected-kanban.client.spec.tsx packages/persona/client-ui-persona/tests/live-tenant-bridge.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx
→ 6 files / 24 passed
```

## 2026-11-03 17:05 — React #185 + SCREEN-SPECS (Cofre, Uso, Rotinas, Arquivos)

**Pronto:** `createLiveTenantObservable` com cache referencial (fix #185 Kanban/remotos). Pass Muse em **KnowledgeVault**, **UsageLimits**, **Usage.module.css** (barras sunken + âmbar/danger), **RoutinesView**, **FilesView** — `Screen`/`ScreenHeader`/`Card`/`Chip`/`Tabs`/`Button`/`Skeleton`, `header.eyebrow` nos locales.

**Fila Muse (resto):** Aprovações, Regras, Perfil, Membros, Importadores (receita comum).

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run --project thread-safe packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/live-tenant-bridge.client.spec.tsx
→ 11 passed
```

## 2026-11-03 17:00 — Kanban + Conexões (SCREEN-SPECS)

**Pronto:** `Screen` + `ScreenHeader` + `Card`/`Chip` + `EmptyState`/`ErrorState`/`Skeleton` (illustrações Brush). Kanban: filtros em `Card`, colunas `--persona-paper-sunken`, tickets `Card padding="s" interactive`, chips sem emoji, `PawTrail` na celebração. Conexões: grade 2 col, `empty-connections`. Removido `withLumenPanelBoundary` (Muse `PanelBoundary` no frame). Host: `listConnections` tipado (`kind: row.id`, filtro de `error.code`).

**Fix React #185 (Muse):** `createLiveTenantObservable` alocava um `PersonaTenantSnapshot` novo a cada `getSnapshot()` → `useTenant(s => s)` via uSES entrava em loop. Agora cache por referência do live snap + snapshots canônicos loading/error + igualdade de scope.

**Testes:** `live-tenant-bridge.client.spec.tsx` (estabilidade + `ConnectedGlobalKanban` com `createSnapshotStore` + `bindSnapshotSelector`), `connected-kanban`, `kanban-preview` → 8 passed nesse trio.

## 2026-11-03 — Galeria real (`real-app-shots`)

**Pronto:** run com skip de onboarding (`persona.onboarding.complete.v1`) concluiu; `.maestri/tmp/shots/real/` inclui os 12 painéis Lumen (`kanban`, `knowledge`, `routines`, `files`, `usage`, `connections`, `approvals`, `rules`, `profile`, `members`, `importers`, `canvas`) + shell/canal. Disponível para pass Muse.

## 2026-11-03 16:35 — PRO-5 Remote: decide + limites + métricas

**Pronto:** `RemoteApprovalsPanel` → `decideApproval` (reativo + resumo diário com `approvalKind`); `RemoteRulesPanel` → `setProjectLimits` (Salvar nos limites); perfil: taxa de aceitação derivada de `getOverviewNow` (ou `—` sem entregas). **D5b** uso: já via `RemoteUsagePanel` + `limitsToUsageMeters` (origem rotulada).

**Dependências:** `putAttentionPolicy` / editar janelas de silêncio na UI; bench preguiça real (Rivet); PRO-6 E2E (Probe); aceite `(app)` PRO-5.

**Arquivos:** `approvals/*`, `rules/TriageRulesView.tsx`, `data/{lumen-remote-panels,adapters/proactive}.ts`, `profile/ProactivityMetricsPanel.tsx`, `locale-sources/profile.*`.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-*.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx
→ 5 files / 28 tests passed
```

## 2026-11-03 16:25 — Revisar ligado ao Remote + Kanban

**Pronto:** `reviewSummaryFromHost` + `KanbanReviewSheet` (`acceptReview` / `requestChanges` / `discardReview`, conflito → chip Bloqueado). **Kanban produção:** `ConnectedGlobalKanban` + `KanbanWithReview` (inject `persona` + `refresh`); botão **Revisar** em `in_review`/bloqueado. Locale `persona.review` registrado. Contrato `lumen-rpc.md` § Revisar.

**Dependências:** `acceptReview.mode` fixo `ff` até política de merge no projeto; taxa de aceitação no perfil ainda estimada (70%); PRO-6 E2E (Probe).

**Arquivos:** `review/{KanbanReviewSheet,KanbanWithReview}.tsx`, `remote/ConnectedGlobalKanban.tsx`, `kanban/{KanbanCard,GlobalKanban}.tsx`, `register-lumen-ui.tsx`, `data/adapters/review.ts`, `contracts/lumen-rpc.md`.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 5 files / 28 tests passed
```

## 2026-11-03 16:20 — Conexões (loginHint + erros) + painel Revisar (ReviewDelivery)

**Pronto:** `connectionsToEntries` preserva `loginHint` / `error` do host (`loggedIn`, códigos `cli_not_found` | `not_logged_in` | `quota_exhausted`), mensagem pt-BR na linha, **Copiar comando** (sem campo de token, D-015). Anvil: `listConnections` passa por `toUiConnection`. **Revisar:** `ReviewDeliveryPanel` (arquivos +/−, patch, truncagem/redação, testes citados, Aceitar âmbar / Pedir ajustes / Descartar com confirmação; conflito = chip Bloqueado · Precisa de você). `RemoteReviewDeliveryPanel` stub até RPC Anvil.

**Dependências:** `persona.reviewSummary` / accept / requestChanges / discard no Remote; abrir painel a partir do card Kanban em revisão.

**Arquivos:** `connections/*`, `data/adapters/{connections,review}.ts`, `review/*`, `locale-sources/{connections,review}.*`, `persona-host/{types,index}.ts`, `gen-client-ui-persona-locales.mjs`, testes `lumen-surfaces` + `lumen-rpc-adapters`.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 5 files / 26 tests passed
```

## 2026-11-03 19:58 — Contrato `lumen-rpc.md` (Anvil) ligado nos painéis

**Pronto:** RPCs `listCanvas`, `listDailySummaries`, `listRoutineSchedule`, `listTriageLog`, arquivos `need-root` + `setProjectRoot` (estado `needRoot` pt-BR, ação primária). Adaptadores `triage`, `proactive`, `routines`, `canvas`; `GlobalKanban` deriva filtros dos cards (sem `MOCK_KANBAN_FILTERS` em produção). Overview/canal sem fallback mock. **Muse:** não toquei `theme/` nem `primitives/`; aguardo `DESIGN-SYSTEM.md` + specs por tela.

**Dependências:** seletor nativo de pasta (hoje `prompt` de caminho absoluto até picker desktop); `listConnections` async Rivet; memória/skills no perfil ainda preview local.

**Arquivos:** `data/lumen-remote-panels.tsx`, `data/adapters/{triage,proactive,routines,canvas}.ts`, `files/{FilesView,pick-project-root}.ts`, `kanban/{derive-filter-options,GlobalKanban}.tsx`, `remote/Connected*.tsx`, `locale-sources/files.{pt,en}.json`, `tests/lumen-rpc-adapters.client.spec.ts`, `scripts/persona/real-app-shots.mjs`.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-rpc-adapters.client.spec.ts packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 5 files / 23 tests passed

node scripts/persona/with-lock.mjs "Lumen lumen-rpc shots" -- node scripts/persona/real-app-shots.mjs
→ parcial: kanban.png, routines.png, usage.png (+ shell/channel); demais nav — script ajustado (labels pt/en + navigation scope) para próximo run
```

## 2026-11-03 19:15 — Muse (design) + B9 fechamento Remote

**Design:** Muse (Opus) passa a ser dona de theme/primitivos/identidade; Lumen mantém telas e aplica specs da Muse quando publicadas (devolver `.maestri/tmp/shots/real/` após cada pass).

**Pronto (Remote):** Canal #geral sem fallback de mock (`ConnectedGeneralChannelView`); `RoutinesView`/`CanvasView`/`PersonaProfilePage` só dados via props (Remote ou testes); fila 1+2 já em `Remote*Panel` + `ConnectedGlobalKanban`.

**Gaps Anvil:** histórico de execuções de rotina, grafo canvas, log triage, resumo proativo RPC.

## 2026-11-03 18:35 — B9 Remote real (Keel): mocks só em testes

**Pronto:** Produção usa `ctx.remote.persona` via `createLiveTenantObservable` (sem bootstrap duplicado). **Queue 1:** `ConnectedGlobalKanban` + `Remote*{Knowledge,Routines,Files,Usage,Connections}Panel` em `register-lumen-ui.tsx`. **Queue 2:** `register-prism-screens.tsx` registra `Remote*{Approvals,Rules,Profile,Members,Import,Canvas}Panel` (Prism mantém overview/canais/projetos). Adaptadores em `src/client/data/adapters/*`; painéis em `lumen-remote-panels.tsx`. Views sem defaults de mock (`initialCards`/`items`/`entries` vazios). Testes passam mocks explicitamente.

**Gaps (Anvil / follow-up):** Canvas sem RPC (empty); resumo proativo diário vazio em aprovações; `RoutinesView` ainda renderiza grade mock quando host tem rotinas; triage log sem RPC; arquivos podem falhar sem `project.rootPath`.

**Arquivos:** `data/{live-tenant-bridge,lumen-remote-panels,lumen-inject,use-persona-remote-load,remote-call}.ts`, `data/adapters/*`, `kanban/register-lumen-ui.tsx`, `shell/register-prism-screens.tsx`, testes `lumen-*` + `kanban-preview`.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests/lumen-surfaces.client.spec.tsx packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-queue2.client.spec.tsx packages/persona/client-ui-persona/tests/lumen-proactivity.client.spec.tsx
→ 4 files / 18 tests passed

node scripts/persona/with-lock.mjs "Lumen real shots" -- node scripts/persona/real-app-shots.mjs
→ .maestri/tmp/shots/real/{kanban,knowledge,…}.png
```

## 2026-11-03 15:16 — Proatividade v1 (PROACTIVITY.md) — UI Lumen

**Pronto:** (1) **Aprovações** — `ProactiveDailySummaries` agrupa propostas do dia por persona (`data-persona-approvals="proactive-daily"`), aceitar/recusar/editar, prévia impacto + custo; reativas em seção “Precisa de você agora”. (2) **Regras** — limites (propostas/dia, tokens persona/projeto), janelas de silêncio, log modo “só registrar”. (3) **Perfil** — `ProactivityMetricsPanel` (propostas, aceitas, ociosidade, bench preguiça). Mocks em `proactivity-mock-data.ts`, locales pt/en, `tests/lumen-proactivity.client.spec.tsx`.

**RCD:** orçamento de atenção (resumo vs ping); uma pergunta por cartão reativo; value-first nos limites editáveis.

**Arquivos:** `approvals/{ApprovalsInbox,ProactiveDailySummaries,proactivity-mock-data}.*`, `rules/{TriageRulesView,mock-data,RulesProactivity.module.css}`, `profile/{ProactivityMetricsPanel,mock-data}.*`, `locale-sources/{approvals,rules,profile}.*`, `tests/lumen-proactivity.client.spec.tsx`, fix `tests/lumen-queue2` (h3 reativo).

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec tsc -p packages/persona/client-ui-persona/tsconfig.json --noEmit → exit 0
pnpm exec vitest run packages/persona/client-ui-persona/tests --no-cache
→ Test Files 14 passed (14) / Tests 31 passed (31)
```

**Fora:** wire RPC (engine/Vigia + host types); registrar approvals/rules/profile no shell; aceitar/recusar persistidos.

## 2026-11-03 17:26 — Mount shell + fila 2 + gate ui-boot

**Pronto:** Seis superfícies registradas em `register-lumen-ui.tsx` (`main`: kanban, knowledge, routines, files, usage, connections) + locales; sidebar NAV com rótulos `persona.shell`; `mount.ts` chama `registerLumenUi` e ping host **após** inject; `tsconfig` inclui todo código Lumen; fila 2 (profile, memory, skills, approvals, rules, members, importers, canvas) com mocks tipados `@deepseek-ai/dsh-persona-core`, testes queue2 verdes; fixes tsc (CSS modules, `carry`, profile não repassa dict errado para Memory/Skills).

**RCD:** sidebar expõe valor (Kanban, Cofre, Rotinas…) antes de host B3; empty states mantidos nos previews.

**Arquivos principais:**
- `packages/persona/client-ui-persona/src/client/kanban/register-lumen-ui.tsx`
- `packages/persona/client-ui-persona/src/client/{shell/create-shell-store.ts, shell/PersonaSidebar.tsx, mount.ts}`
- `packages/persona/client-ui-persona/locale-sources/shell.{pt,en}.json`
- `packages/persona/client-ui-persona/tsconfig.json`, `package.json` (devDep persona-core)
- `persona-spec/contracts/ui-shell.md`
- Fila 2: `src/client/{profile,memory,skills,approvals,rules,members,importers,canvas}/**`, `tests/lumen-queue2.client.spec.tsx`

**Upstream (1 linha cada):**
- `mount.ts` / `PersonaSidebar` / `create-shell-store.ts` — contrato ui-shell: Lumen main keys + navegação (Keel).
- `mount.ts` ping dentro do inject — host online sem ler remote antes do inject.

**Testes:**
```
node scripts/persona/gen-client-ui-persona-locales.mjs
pnpm exec tsc -p packages/persona/client-ui-persona/tsconfig.json --noEmit
→ exit 0

pnpm exec vitest run packages/persona/client-ui-persona/tests --no-cache
→ Test Files  13 passed (13) / Tests  28 passed (28)

node scripts/persona/with-lock.mjs "Lumen ui boot" -- node scripts/persona/ui-boot-check.mjs
→ console errors (0): (none)
→ shots .maestri/tmp/shots/persona-light.png, persona-dark.png (sidebar com Kanban…Conexões; host online p1)
```

**Fora / próximo:**
- Anvil B3: adaptadores Remote tipados `persona-host/src/types.ts` no lugar dos mocks.
- Fila 2 no app: keys/sidebar no contrato + `register-lumen-ui` (ou Prism) quando Keel estender `MainPanelId`.
- Probe: captura com painel Kanban ativo (hoje gate abre overview + overlay onboarding).
- `pnpm install` (Keel) para link formal de `@deepseek-ai/dsh-persona-core` no lockfile se ainda não aplicado.

## 2026-11-03 14:08 — Fila C6a–D4b/D5b (preview isolado)

**Pronto:** Seis superfícies Lumen em `src/client/{kanban,knowledge,routines,files,usage,connections}/` com mocks, dicionários via `locale-sources/*.json` + gerador, estados vazio/carregando/erro/cheio, `usePersonaMotion` + `PersonaButton`, Kanban D-029 (5 colunas, chip aguardando evento, selo de desfecho, drag lift, patinhas ao concluir), Uso (origem medido/estimado/oficial/indisponível, `—` sem 0% falso, aviso contextual), Conexões (CLIs + login nativo, value first).

**RCD:** Never ship a blank dashboard (empty + ilustração SVG + 1 primária); Expansion is born of usage (limite inline); Value first, ask later (conexões); Neutrality is omission (1 primária por tela).

**Arquivos principais:**
- `packages/persona/client-ui-persona/src/client/kanban/*` (ProjectKanban, GlobalKanban, KanbanBoard, stage-map, PersonaSurface)
- `packages/persona/client-ui-persona/src/client/knowledge/KnowledgeVault.tsx`
- `packages/persona/client-ui-persona/src/client/routines/RoutinesView.tsx`
- `packages/persona/client-ui-persona/src/client/files/FilesView.tsx`
- `packages/persona/client-ui-persona/src/client/usage/UsageLimits.tsx`
- `packages/persona/client-ui-persona/src/client/connections/ConnectionsView.tsx`
- `packages/persona/client-ui-persona/locale-sources/{kanban,knowledge,routines,files,usage,connections}.{pt,en}.json`
- `scripts/persona/gen-client-ui-persona-locales.mjs` (bundles Lumen)
- `packages/persona/client-ui-persona/tests/kanban-preview.client.spec.tsx`, `lumen-surfaces.client.spec.tsx`

**Upstream (1 linha):** `scripts/persona/gen-client-ui-persona-locales.mjs` — registrar bundles i18n Lumen no pipeline existente.

**Testes:**
```
pnpm exec vitest run packages/persona/client-ui-persona/tests --no-cache
```
Saída: `Test Files  12 passed (12)` / `Tests  21 passed (21)` (após `--no-cache`).

```
pnpm exec tsc -p packages/persona/client-ui-persona/tsconfig.json --noEmit
```
Saída: exit 0.

**Fora / próximo:**
- Prism: registrar namespaces `persona.kanban|knowledge|routines|files|usage|connections` em `src/client/index.ts` + slots shell.
- Anvil: Remotes → substituir mocks por store tipado em `persona-host/src/types.ts`.
- Probe: capturas claro/escuro vs `dirD-tela.png` (persona-e2e).
- FLIP persona carregando cartão: hook quando evento host existir (mock `carry` preparado no tipo).

**Realinhamento Keel:** pastas movidas de `src/{kanban,...}` para `src/client/{kanban,...}`.

## 05/11 04:45 — captura final do bundle 3 + 4 correções para o bundle 4 (Lumen)

**Captura do bundle 3 (feita; `.maestri/tmp/shots/lumen-viewport/bundle3`, claro/escuro × 1440/960/200%).** A 1ª rodada saiu errada e foi parada: o script procurava a aba por `[data-panel]` (o atributo real é `data-tab-panel`) e pulava o clique em silêncio — "saúde" mostrava "Membros e convites". Agora `nav()` falha ALTO se a aba não existe ou não fica selecionada; imagens erradas em `.maestri/tmp/shots/lumen/descartadas-bundle3-seletor-errado`. Rodada refeita: saúde, segundo cérebro, importadores (4), aprovações, enfeites, quadro+caminho/bilhete, revisar (lista, conflito), decisions: axe 0, console 0. Falta só o passo "sucesso" da Revisão (dist antigo, ver 1). Evidência do bug em `bundle3/evidencia-bug-aplicar`.

**Correções no tree (testes verdes, check-pkg OK 04:40):**
1. **Quadro desmontava a folha de Revisar no Aplicar** (`remote/ConnectedProjectFlowBoard.tsx`): `reload()` punha o estado em "carregando", `flow` virava `null`, outra árvore era renderizada e a folha perdia a tela de sucesso + Desfazer (voltava do zero). Agora o quadro anterior fica até o novo chegar (outro projeto nunca pega o quadro velho). Prova: `tests/review-survives-reload.client.spec.tsx` (falha sem a correção: `review-applied` não aparece). Efeito bom: mover cartão não pisca o esqueleto.
2. **Trava HT-9**: no V2 uma ação externa (`kind:'action'`) só tinha o detalhe genérico e o Aceitar aprovaria o envio SEM mostrar o conteúdo. `approvals/action-approval.ts#genericDecisionRoute` (+ `ConnectedApprovalsPanel`): Aceitar genérico recusado, Dispensar = `cancel`; `decisions/derive-decisions.ts#riskOf`: action/connector sempre `normal` (nunca no lote "de risco baixo"). Ember pôs a prévia/ConnectorActions no detalhe do V2 e marcou `blindAction`. Testes em `approvals-action-card` (27).
3. **Texto da Revisão (Muse 04:10/04:33)**: sem "A persona" no meio da frase; com nome "{nome} e você mudaram…", sem nome "Você e a equipe…"; "Ficar com a versão de {nome}/do rascunho"; cópia SEMPRE "{arquivo} (rascunho).ext"; fallback do cabeçalho "O rascunho". `review/simple/conflict-text.ts` (novo), `ConflictChoices`, `DraftReviewPanel`, `locale-sources/review.{pt,en}.json`, gen-locales rodado; 4 specs do review ajustados + 2 novos (39/39).
4. **Barra de abas encolhia em página alta** (`shell/PlaceTabsBar.module.css`): `.center > * {flex:1 1 auto}` do quadro tem a mesma especificidade de `.bar {flex:0 0 auto}` e ganha pela ordem; medi no app real a `.bar` com 31 px (1440), 28 (960) e 22 (200%) para um track de 42 px. Agora `div.bar` em todas as regras; `tests/place-tabs-bar-css.client.spec.ts`. A captura imprime `geom` (healthShots) para confirmar no bundle 4.

**Régua**: `shoot()` grava a sonda do pré-aceite (`<captura>.probe.json`, Ember); cena `connector` agora entra pela lista do V2 e fotografa os 4 cartões (conector colega, iniciativa, e-mail, pagamento).

**Dependências abertas (não minhas)**: host gravar a cópia como `(rascunho)` (hoje `history.ts` grava "(da persona)"; Forge/Keel); `personaId` no `ReviewSummaryView` para ter o nome real (Anvil); ícone `arquivo` aguarda o verbo `file` da ação externa.

## 05/11 05:52 — captura final do bundle 4 (Lumen) — FEITA

**Onde:** `.maestri/tmp/shots/lumen-viewport/bundle4` (claro/escuro × 1440/960/200%; régua `scripts/persona/lumen-viewport-shots.mjs`, `LUMEN_SCENARIOS=health,review`, axe 4.13.0, sonda do pré-aceite do Ember; manifesto `scripts/persona/preaccept-manifests/lumen.json`).

**Pré-aceite mecânico:** 24 capturas → 24 PASSOU, 0 FALHOU, 0 INCOMPLETO; 4/4 cenas prontas para a Muse (`revisar-lista`, `revisar-conflito`, `revisar-sucesso`, `saude-1o-dia`). axe 0 em todas; console 0.

**Provas no app real (dist do bundle 4):**
- Revisão completa nos 6 contextos: lista → clash → "Manter os dois" → Aplicar → "Aplicado na pasta · 5 arquivos · Desfazer por 30 dias" + toast. É o passo que falhava no bundle 3 (o quadro recarregava e desmontava a folha).
- Barra de abas da Saúde: `.bar` = 58 px (= 16 de respiro + 42 do track) nas seis janelas; antes 31/28/22 px (log `geom` do `healthShots`).
- Texto novo da Revisão (Muse 04:10/04:33): "Você e a equipe mudaram {arquivo}", "O rascunho foi feito enquanto você mudava o arquivo", "Ficar com a versão do rascunho", cópia "{arquivo} (rascunho).ext" (o host grava o mesmo, Forge 04:41).

**Achados para a Muse (enviados 05:51; vão no bundle 5, final):** no cabeçalho sem nome o fallback "O rascunho" deixa "O rascunho fez isto num rascunho." (tautologia), avatar com as iniciais "OR" e, no Histórico, "O rascunho aplicou 1 mudança". Propostas enviadas: "Isto está num rascunho…", ícone de rascunho no lugar das iniciais, "Mudanças prontas para revisar" / "Mudanças aplicadas".

**Avisos:** Flint (próximo na ordem) e Keel com "captura Lumen feita" + caminho; trava build liberada.

**Congelamento geral (Keel 05:18):** sem saves em `src`/`lib` até o "rodada real terminada" do Probe. O que fica para depois: texto do cabeçalho sem nome (Muse), `personaId` no `ReviewSummaryView` (Anvil), Ctrl K sobreposto (v1.2; spec em `persona-spec/design/CMDK-OVERLAY-SPEC.md`).

## 05/11 06:05 — bundle 4 aceito pela Muse + bundle 5 (meu item) no tree (Lumen)

**Muse aceitou o lote do bundle 4** (05:51): Revisão (lista antes → depois, conflito com o texto novo, sucesso "Aplicado na pasta · Desfazer por 30 dias" + Toast) e a barra de abas da Saúde na altura natural.

**Bundle 5 — textos "sem nome" da Revisão (Muse 05:51), `src` liberado pelo Keel 06:02, no tree 06:04:**
- Cabeçalho sem nome: "Mudanças prontas para revisar" (com tarefa: "… em {tarefa}"); subtítulo "Isto está num rascunho. Sua pasta ainda não mudou."; ícone `revisao` do pack no avatar (nunca iniciais "OR"; só quando não há nome nem retrato).
- Descarte sem nome: "As mudanças do rascunho somem. Sua pasta continua como está." (achado meu no mesmo molde: dizia "As mudanças de O rascunho somem").
- Histórico sem nome: "1 mudança aplicada · hora" / "{n} mudanças aplicadas · hora" (mantive a contagem). Com nome segue "{nome} preparou mudanças" / "{nome} aplicou…".
- `HistoryEntryUi.who` agora `string | undefined`; `persona.fallback` removida dos locales (nada mais a usa); `review/simple/conflict-text.ts` ganhou `unnamedText`. Preparado em staging (`.maestri/staging/lumen-b5`, com `apply.sh` que confere se alguém mexeu nos arquivos) enquanto o `src` estava congelado.
- Testes: 64/64 nos 6 specs da área (draft-review-panel, project-history, lumen-surfaces, kanban-review-sheet, review-dev-sample, review-survives-reload) + css; check-pkg client-ui-persona OK; find-bad-css [].

**Aberto (não é meu):** Saúde › Teste dos 2 dias marca ✕ em "Resumo da manhã" (rotina do sistema) e isso baixa a nota — causa no host: `persona-host/src/governance.ts:174-182` + `persona-core/src/governance/health.ts` (pedido ao Anvil/Forge 05:53; recapturo a Saúde se entrar no bundle 5). `personaId` no `ReviewSummaryView` (Anvil). Ícone `arquivo` espera o verbo `file`. Ctrl K sobreposto: o Prism adianta em staging a pedido do Atlas; eu reviso (spec em `persona-spec/design/CMDK-OVERLAY-SPEC.md`).


## 12/11 01:50 — COLHEITA: item 8 (tabela de autoridade + porteiro) e Cofre (tela) — relato curto

Contrato: `persona-spec/contracts/authority-table.md`. Memória de continuidade do agente: `harvest-item8-cofre-decisions.md`.

**Item 8, fatia 1 (Claude hook + falha fechada) — VERDE (11/11 23:56).**
- **Tabela única** (`persona-runners/src/authority/authority-table.ts`): autoridade (`person` | `routine` | `unattended`) × ação (`read`, `draft-change`, `interact`, `unknown`, `delete`, `send`, `outside-change`, `secret`, `never`) = `allow` | `ask` | `deny`. `ask` só existe para a pessoa (vira cartão); rotina e desacompanhada são recusadas. A concessão de shell da persona só estreita (`none`/`read`/`write`).
- **Juiz de comandos** (`command-policy.ts`, bash e PowerShell): lista de permissão que falha fechada (só `read` e mudança dentro do rascunho passam). Segue `bash -c` e `powershell -Command`. Não é fronteira de segurança; o que não se lê com certeza é `unknown` e espera a pessoa.
- **Hook do Claude** (`resolve/permission-gate.ts`): também julga `Bash`/`PowerShell`, recusa `Read`/`Grep`/`Glob` de caminho secreto e `mcp__browser__*` pela linha do navegador. Só estreita.
- **ACHADO:** o gate (inclusive a trava de escrita só no rascunho) só existia para Tarefa Claude COM conectores. `native-gate.ts` + 4 linhas em `resolve-runner.ts`: agora toda Tarefa Claude que salva arquivo, roda comando ou leva o navegador (`carriesBrowser`) roda atrás dele.
- **Porteiro por CLI** (`cli-gates.ts`): Claude hook; Codex sandbox (0.167.1 não despacha `PreToolUse`: nunca fingimos gate); OpenCode bloco `permission` (`opencode-config.ts`, provado seco no 1.19.3); Cursor falha fechada; `hasBrowserGate` só no Claude.
- **Regras do Keel:** e-mail recebido nunca aprova envio sozinho (`viaEmail`, `preAllowAfterOrigin`); `interact` no navegador liberado sem cartão só com pessoa por trás e perfil com grant, cada interação vai ao livro sem valores (`takeInteractions()`); senha nunca por `fill`.
- **Provas:** `persona-runners` 92 arquivos / 888 testes; `check-pkg` runners/host/client OK; `check-cleanroom` e `check-css-hygiene` PASSARAM; contra o `claude 2.1.322` REAL (endpoint falso, zero modelo, zero gasto) `scripts/authority-dry.ts` 11/11 (`reports/authority-dry.json`). Limite: o tool Bash do CLI não termina nesse harness; os cenários Bash "permitidos" provam só que o hook não recusou e a ferramenta iniciou.
- **Pendente em outros donos:** host passa `authority`/`viaEmail` em `ActionBridge.arm` (Prism + Jade 19b); Onyx liga `carriesBrowser: true` e lê `takeInteractions()`; cartão de aprovação do pedido de shell (Prism/Muse).

**Cofre, tela (item 15), fatias 1 e 2a — VERDE (12/11 01:16).**
- Configurações › Cofre (aba ao lado de Conexões; desenho da Muse): ficha, logins e chaves; painel de 440 px; remoção confirmada na linha; importar CSV do Chrome/Bitwarden em 3 passos (prévia sem senha) e aviso do resultado; ligada ao Remote do Zinc. 22 testes de cliente, `check-pkg client-ui-persona` OK, css-hygiene/cleanroom PASSARAM.
- **Em staging (aplicar após o FIM DO CONGELAMENTO; anchors validados com `--check`):** `.maestri/tmp/lumen/` com os 3 acertos da Muse + erro no campo com foco (`muse-fixes.mjs`, `tests-fixes.mjs`, `locale-fixes.mjs`), o cartão "Precisa de um código" (`cofre-2fa/`) e a ação opcional do `ApprovedStamp` (`stamp-action.mjs`, pedido do Anvil/Muse).
- **ALERTA:** o host JÁ oferece `ask_vault_code` (`harness-dispatch.ts:77`): uma persona pode abrir pedidos de código que ninguém vê até o cartão entrar. É a prioridade 1 pós-congelamento.
- **Dependências:** Zinc (`cofreStatus {sealable}`, senha opcional na edição — hoje vazio APAGARIA a senha — e `site` no view do pedido); Brush (glifo `key`, arte do vazio); "Tentar de novo" do 2FA precisa de um caminho para pedir o código de novo à persona.

## P0-02 (Carbon, snapshot 1): digitação cega não vaza mais a senha nem os 6 dígitos (Lumen, 12/11 03:55)

**Reproduzido (RED) antes de corrigir:** `persona-host/tests/browser-secret-leak.host.spec.ts` (9 de 10 falhavam), `persona-runners/tests/secret-window.spec.ts` (arquivo nem carregava), o `it.fails` do Probe virado em `it` (falhava) e as expectativas novas de `browser-blind-typing.host.spec.ts` (Chrome real: a chamada bloqueava até o fim do vigia e a aba ficava na URL com a senha).

**Corrigido (VERDE):**
- `browser/login-port.ts`: a resposta de `browser_login` é montada pela porta com frases NOSSAS (`loginTypedLine(título)`, as frases fixas de `BLIND_LOGIN_LINES`/`LOGIN_NO_SITE`, ou `LOGIN_FAILED`); o texto da digitação (e a mensagem de um erro dela) nunca chega ao modelo; `mask.redact` na frase como última camada.
- `mcp/gateway.ts`: opção `redact` aplicada a TODA resposta do gateway (fonte única); o host liga `this.browser.mask.redact` (`index.ts`). `fillCofreCode` arma a máscara com os 6 dígitos (digitados e sem separador).
- `browser/blind-typing.ts`: `SecretMask` conhece `%XX` maiúsculo/minúsculo, `+` de form, escape JSON e base64/base64url nos 3 alinhamentos; `live(now)` diz se há janela aberta. `typeLoginBlind` volta logo após digitar; o vigia da barra de endereço roda DEPOIS (2 min, em segundo plano), manda a aba para `about:blank` (+ `Page.resetNavigationHistory`) quando a senha aparece na URL e reporta por `watch` (`limpo | vazou-na-url | interrompida`).
- `browser/cdp.ts`: listeners de `close`/`error` rejeitam o que esperava (e o próximo comando), timeout por comando (15 s) e na abertura (10 s), `CdpConnection.over(socket)` (testável).
- `authority/secret-window.ts` + `browser-policy.ts` + `permission-gate.ts`: com a janela da máscara aberta, as leituras que carregam dado cru da página (`list/get_network_request(s)`, `list/get_console_message(s)`, traces, lighthouse) viram `secret` (recusadas para todos); `take_memory_snapshot` é `never` sempre. NOVO hook `PostToolUse` (só `mcp__browser__*`) devolve `updatedToolOutput` com os segredos mascarados em qualquer forma da resposta (um "mostrar senha" + `take_snapshot` não entrega o valor).
- Prova no CLI REAL (claude 2.1.322, sem modelo, US$ 0): `persona-runners/scripts/secret-mask-dry.ts` → `persona-spec/reports/secret-mask-dry.json`, 4/4 (controle: sem hook o snapshot leva a senha; com hook o modelo lê `••••••`; `get_network_request` recusado com a janela aberta; liberado com a janela fechada).

**Limites conhecidos:** (1) `take_screenshot` é imagem: não dá para mascarar; um "mostrar senha" + screenshot ainda mostra o valor a um modelo com visão (só o site do próprio login, digitado por nós, pode fazer isso). (2) A janela é do host (qualquer segredo vivo fecha as leituras cruas de TODAS as personas por 10 min), não por persona. (3) O hook PostToolUse falha aberto (como todo hook do CLI); quem fecha de verdade as leituras cruas é o PreToolUse. (4) `onLeak` existe em `BrowserLoginPortsDeps` mas não está ligado ao livro de atividade (decisão do Keel); hoje o modelo só vê a aba em branco. (5) O vazamento por URL só é visto no ritmo do vigia (1 s).

## P0-03a (Carbon, snapshot 1): a rotina e o run sem ninguém por trás deixam de rodar como "pessoa" (Lumen, 12/11 04:55)

**Reproduzido (RED):** `persona-runners/tests/session-authority.spec.ts` (sessão não levava authority; o gate nativo armava todo turno como `person`: um `click` do navegador passava numa rotina), `persona-host/tests/action-bridge-authority.spec.ts` (`ActionBridge.arm` só recebia `viaEmail`) e a asserção nova em `routine-events.host.spec.ts` (`actions.arm` nunca recebia `authority`). O teste puro `run-authority.spec.ts` foi escrito junto com o módulo.

**Corrigido (VERDE):** `persona-host/src/run-authority.ts` (`authorityOfRun`): `routine-run:` = routine; `routine-run:…@event:` / `initiative:` / `plan:` = unattended; o resto = person; contagioso por `handoff:`/`split:`/`inputs`/`origin.triggerIds` (o mais restrito vence); corrente longa, ciclo e Task de origem sumida nunca são person. Fiação: `orchestration.ts` (`runOrigin.authority` → `ActionBridge.arm` → `gate.arm`; e `HostRunnerRequest.authorityOf` por turno) → `runner.ts` (`authorityFor`) → `oar/session.ts` (`StartTurnInput.authority`) → `native-gate.ts` (`own.arm({ authority: input.authority ?? padrão })`). Por turno, não na criação: o runner é quente entre Tasks.

**Decisão do Keel (12/11) e feito:** rotina AGENDADA (`routine`) mantém a renúncia "não perguntar de novo" pré-permitindo `send`; `unattended` (iniciativa, `plan:`, evento) nunca pré-permite `send`/`pay`/`delete` (1 linha em `preAllowAfterOrigin`, `authority` vai do gate: `permission-gate.ts`). RED provado revertendo a linha do gate: `permission-gate-commands.spec.ts` e `ht9-host-bridge.spec.ts` (iniciativa com renúncia gera cartão; rotina agendada com a mesma renúncia envia) falhavam; verdes com ela.

## P1-04 (Carbon, snapshot 1): ask_vault_code / browser_login chegam à persona comum e o cartão de 6 dígitos tem uso (Lumen, 12/11 05:35)

**Reproduzido (RED):** `harness-turn-browser-tools.spec.ts` (5 falhas: com `toolLevel` `none` nenhuma das duas ferramentas era oferecida), `cofre-2fa.spec.ts` (5 falhas: cancelar não apagava o selado, código preenchido não expirava, sem `sweep`/`filledFor`/`peek`/`onFilled`) e `browser-login-code.host.spec.ts` (a porta só digitava senha). Sobre o item "cartão sem uso na UI": já existia `ConnectedCodeRequests` (Aprovações, `listCofreCodes`/`fillCofreCode`/`cancelCofreCode`); o que faltava era o resto da cadeia.

**Corrigido (VERDE):** ver a seção "Código 2FA do Cofre" de `persona-spec/contracts/authority-table.md`. Arquivos: `harness-turn.ts` (COORDINATION + oferta por `browserLoginOf`), `cofre-2fa.ts` (cancel assíncrono que apaga, expiração do preenchido, `sweep`, `peek`, `filledFor`, `onFilled`), `cofre.ts` (`onCodeFilled`), `index.ts` (acorda a Task ao preencher; `cancelCofreCode` assíncrono; `sweep` em `listCofreCodes`; porta com `codes`), `browser/login-port.ts` (`code: true`), `browser/login-tool.ts` (`blindCode`), `browser/blind-typing.ts` (`field: 'code'`, `BLIND_CODE_NO_FIELD`), `harness-dispatch.ts`/`harness-ports.ts`/`runners/mcp/harness-tools.ts` (flag `code`, descrições).

**Limites:** OTP segmentado (uma caixinha por dígito) não é coberto. A cadeia inteira (persona real pede o código, dono preenche, Task acordada digita) não foi rodada com IA real (sem OK do Atlas para turno pago): cada elo tem teste, o último contra Chrome real.
