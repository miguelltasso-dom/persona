# Flint (builder de UI — composer, teclado, conversa; sob o Prism)

Mais recente no topo. Regra D-072 v2: a Muse atribui e dá o aceite. **D-077 (04/11 16:55): acabou o hold por arquivo** — a publicação segue o gate; o aceite da Muse trava a ENTREGA (varredura no app instalado do H2). Meus itens abertos estão listados em `UX-BEYOND-T3.md` §Andamento; mudança grande/arriscada vai atrás de flag.

## 04/11 19:10 — plano FL-11 (IV-5 + streaming + Parar + "está escrevendo…"); só leitura/planejamento, congelamento D-082

**Estado:** nada aberto além do que está na rodada 3. Meus jobs da trava `build` foram cancelados por D-082 (o `bundle` é `--exclusive` e reescreve saída); reenfileiro bundle + `proof2`, `proof2-on`, `proof-bar` e `proof-limit` quando o Keel anunciar o hash do H2 #3.

**Base (lida em `contracts/working-control.md` e `contracts/streaming.md`, Bolt):** host entregue. Hoje o cliente NÃO chama nenhum dos remotes (`listWorkingQueue` só aparece em `persona-host/**`) e `map-host-ui.ts` não mapeia `streaming`/`steeredPersonaId`/`stopped`. O `GeneralChannelView` já tem o modo controlado (`queuedMessages`, `onSendQueuedNow`, `onEditQueued`, `onRemoveQueued`): com `queuedMessages` definido a fila local e o auto-envio local se desligam (o agendador do host envia a fila quando a persona fica ociosa).

**Passos (cada um fecha com teste + `check-pkg client-ui-persona`; atrás da flag `persona.flag.workingControl`, desligada = comportamento atual; D-077):**
1. **Dados.** Wrappers dos 8 remotes (`enqueueWorkingMessage`, `listWorkingQueue`, `editQueuedMessage`, `dropQueuedMessage`, `restoreQueuedMessage`, `flushWorkingQueue({queueItemId?})`, `steerWorkingTurn`, `stopTurn`) no adaptador do cliente, com o escopo (workspace, projeto, persona, assunto); `map-host-ui.ts` passa `streaming`, `steeredPersonaId`, `stopped`, `stoppedTicketId` para a mensagem da UI; erros tipados → texto pt-BR (`invalid-payload`: o do host; `not-found`: "Essa mensagem já saiu da fila."; `forbidden`).
2. **Fila por item (P0-18).** `ConnectedGeneralChannelView` e `ConnectedDirectMessagesView` passam `queuedMessages` vindo de `listWorkingQueue` (reabrir/recarregar já volta). "Mandar agora" = `flushWorkingQueue({queueItemId})`; "Editar" = `editQueuedMessage`; "Tirar" = `dropQueuedMessage` + Toast "Desfazer" = `restoreQueuedMessage({item})` (mesmo id, mesma posição). Item `reason:'quota'` (Bolt confirmou o campo opcional) = o balão "Na fila · sai quando a cota voltar às {hora}" do P0-19 e NÃO sai sozinho. A fila local do P0-19 (`composer-queue-store.ts`, `localStorage`) vira só o que ainda não foi ao host: migrar uma vez (reenfileirar no host com `reason:'quota'` quando era "por cota") e apagar a chave; item com anexo perdido continua com o aviso.
3. **Direcionar agora (Ctrl+Enter).** `steerWorkingTurn` → `mode:'steer'` marca a mensagem (chip "Direcionada a {persona}" a partir de `steeredPersonaId`, sobrevive a recarregar); `mode:'sent'` é envio normal, sem aviso e sem erro.
4. **Parar.** O botão Enviar vira **Parar** (`Button variant="secondary"`, ícone `close`, Tooltip "Parar" + `Esc`) enquanto existe mensagem com `streaming:true` (resposta) ou Tarefa em andamento (`getOverviewNow`: working + `currentTaskId`); Esc no composer vazio também para; `stopTurn({personaId, eventId})` para resposta, `ticketId` para Tarefa; o foco volta ao campo; fala "Parado" em região ao vivo.
5. **Balão que cresce.** A mensagem `coord-<id>-reply` com `streaming:true` renderiza o texto cumulativo pelo `MarkdownBody` (bloco aberto = texto até fechar, já suportado), `key = message.id`, sem reanimar a entrada a cada upsert (teste: o mesmo nó do DOM entre upserts), `aria-busy`, cursor-bloco âmbar que pisca no fim só sem reduced-motion; a rolagem "perto do fim" já existe. O final substitui o parcial (o host não marca a diferença).
6. **"Você parou aqui · Continuar".** Linha `ink-soft` sob o balão com `stopped:true`; "Continuar" = mensagem nova da pessoa (`postMessage`; "retomar na mesma sessão" depende do IV-11 do Bolt).
7. **P1-4 "está escrevendo…"** (Muse 18:30): persona trabalhando e ainda sem mensagem `streaming:true`; `hasPose(id,'digitando')` verdadeiro → pose inteira ≥ 48 px, falso (os 12 extras) → Avatar portrait 32 + texto; reticências animadas, sem animação em reduced-motion.

**Prova planejada:** testes de contrato dos wrappers com host falso; fila controlada (flush/editar/tirar/desfazer/`not-found`); chip de steer; estado do botão Parar e Esc; upsert sem remontar; linha "parou aqui"; pose com e sem `digitando`. No shell real: cenários `queue`, `stream`, `stop` no harness (claro/escuro, 1440/960/200%, axe) — precisam de um runner que faça streaming no home descartável (pergunta ao Bolt abaixo).

**Perguntas abertas (não invento texto):**
- ~~Muse~~ **RESPONDIDO (Muse 19:10), textos do FL-11 para usar quando abrir (pt/en no mesmo padrão):** (1) "Continuar" envia uma mensagem da pessoa **"Continue de onde parou."** com o chip pequeno **"Retomada"** no balão (é uma mensagem nova, honesto; o host recebe a resposta parcial como contexto se o Bolt puder). (2) Chip da mensagem direcionada: **"Direcionou {persona}"** (UX-PHASE-PRISM-SPEC §4; nada de "Direcionada a"). (3) Parar: Tooltip **"Parar"** com `shortcut={['Esc']}`; `aria-label` do botão **"Parar a resposta de {persona}"**; ao parar, a região ao vivo diz **"{persona} parou."** e o balão fica com **"Você parou aqui · Continuar"**. (4) Balão que cresce: VISUALMENTE só o cursor-bloco âmbar (sem rótulo); para leitor de tela `aria-busy="true"` no balão + região ao vivo UMA vez no início **"{persona} está escrevendo…"** e UMA no fim **"{persona} respondeu."**, nunca por token. (5) O Desfazer do Tirar reutiliza os `composer.steer.*` existentes, sem texto novo.
- ~~Bolt~~ **RESPONDIDO (Bolt 19:10):** (1) NÃO existe flag/env que faça o fake streamar nem segurar turno longo (`PERSONA_SCRIPTED=1` = fake instantâneo, sem deltas); o balão que cresce, o Parar e a fila "de verdade" só rodam nos testes/script dele (`streaming.spec.ts`, `working-control.spec.ts`, `scripts/proactivity-live.ts` fases 6–7). Proposta dele: `PERSONA_SCRIPTED_STREAM=1` (fake que segura o turno ~8 s com 6 parciais crescentes e que o Parar cancela de verdade; pequeno, `runner.ts` do host, código em `packages/**`: só depois do hash do H2 #3 e se o Keel priorizar). Até lá a captura de streaming no shell real fica **bloqueada**; `proactivity-live.ts` mostra o formato exato dos quadros. (2) A DM usa a MESMA fila: `enqueueWorkingMessage({…, personaId, subjectId, text, streamKind:'dm', ownerId:<id da DM>})` com `subjectId` = o id da DM (o host trata `subjectId==ownerId` como "sem tópico"); usar o MESMO `subjectId` em list/edit/drop/restore/flush; chave da fila e do Parar = `personaId:subjectId`; o flush manda cada balão para a própria conversa (não mistura DM e canal); steer com os mesmos `streamKind`/`ownerId`; Parar de resposta de DM: `stopTurn({personaId, eventId:<id da mensagem da pessoa respondida>})`, com Tarefa `ticketId`. (3) `listWorkingQueue` = crescente por `createdAt` (empate por id), igual para canal e assuntos; cada (persona, assunto) é uma fila; o Desfazer reinsere com o mesmo id/`createdAt` (volta à posição original); o flush envia nessa ordem.
- Prism: `ConnectedGeneralChannelView.tsx`/`GeneralChannelView.tsx` são dele; este passo mexe nos dois (modo controlado já previsto).

**Ordem sugerida quando abrir vaga (D-076):** 1+2 (fila, o P0-18), 4+5+6 (streaming + Parar), 3, 7.

## 04/11 17:58 — rodada 3: P0-19 (limite + fila) no código e provas parciais no shell real

**Estado:** meus 2 itens abertos (D-076) são **P0-19** e **P0-22/A-5**. Os dois em código + testes + `check-pkg client-ui-persona` OK. Falta a captura do P0-19 com cota esgotada de verdade no host (enfileirada na trava `build`: bundle 4 exclusivo + `flint-shots.mjs limit`).

**P0-19 (ACCOUNT-SWAP-SPEC §3 + 3 textos e 2 mudanças aprovadas pela Muse às 17:35):**
- No limite o composer NUNCA desabilita (campo e Enviar ativos); faixa "No limite até {hora} · as tarefas esperam na fila." (`spot-limite` 48 px, "Ver uso e limites", "Usar {motor} enquanto isso" só com outro motor); sem hora do host: "No limite por enquanto" (nunca hora inventada).
- A mensagem entra na fila (balão tracejado) "Na fila · sai quando a cota voltar às {hora}", **com os anexos** (chips); sai sozinha quando o host diz que a cota voltou, com o aviso "A cota voltou · N mensagens saíram da fila"; "Mandar agora" segue funcionando.
- A fila local sobrevive a recarregar (`composer-queue-store.ts`, `localStorage` por conversa, só TEXTO e NOMES de anexo, nunca ids): balão "Ainda na fila" (ou com a hora quando é por cota); anexo que não sobrevive avisa "O anexo não ficou guardado; anexe de novo" e a fila **não o envia calado** (a pessoa usa Editar ou Mandar agora).
- Depois de recarregar o item "por cota" espera o **primeiro estado de cota do host** (`quotaKnown`, novo em `derive-channel-composer-hints.ts`) ou 15 s; host diz que voltou → sai; ainda no limite → fica (conexão lenta nunca manda para conta no limite).
- Contrato mantido: sem anexos `onSendMessage(texto)` com UM argumento (os testes antigos do steer seguem válidos).
- Arquivos: `chat/ChannelComposer.tsx(.module.css)`, `chat/LimitBanner.tsx(+css)`, `chat/QueuedMessageBubble.tsx(+css)`, `chat/composer-queue-store.ts` (novo), `chat/GeneralChannelView.tsx`, `remote/derive-channel-composer-hints.ts`, `remote/ConnectedGeneralChannelView.tsx`, `chat.pt|en.json` (+ locales gerados), `tests/limit-banner-queue.client.spec.tsx`.

**Testes (04/11 17:5x, sob a trava `check`):** `vitest run --no-watch` de `limit-banner-queue` + `queued-message-steer` + `composer-memory-keyboard` + `send-failed` + `channel-markdown` = **5 arquivos, 65/65**. `check-pkg client-ui-persona`: **OK in 109.1s**.

**Provas no shell real (harness `.maestri/tmp/flint/flint-shots.mjs`, host `--profile persona` em home descartável, Chrome headless; claro/escuro; 1440×900, 960×640, 640×360@2×; axe WCAG 2.x AA):**
- `proof` (flag A-1 desligada, padrão): rail, card, pill, dms, composer, hint, markdown, sendfail — **57 capturas, axe 0 violações**; os erros de console são só os do `sendfail` (o host é derrubado de propósito). Rail a 200%: rodapé 66 px (18% da altura, antes ~45%); cartão da persona cabe e Esc devolve o foco; pílula "Claude · —" + popover; DMs com a equipe inteira ("Começar conversa"); "Não enviado · Tentar de novo" com o host derrubado de verdade. Markdown: lista, tabela, citação, código com Copiar e links renderizados na captura `markdown-light-1440x900.png` (a sonda de fatos pegava o nó errado; corrigida no harness, a captura é a prova visual).
- `proof-on` (flag A-1 ligada): rail, pill, footerKeys — **12 capturas, axe 0**; Tab chega em Configurações e Ajuda e Enter abre a Ajuda.

**Achados / limitações:**
- **Composer a 200% (640×360@2×): a barra de baixo estoura** — o seletor "Quem responde" fica por baixo do Enviar e o nome "Atlas" aparece cortado (`proof/hint-light-640x360@2x.png`). Proposta enviada à Muse (A: duas linhas; B: emoji/@ vão para o menu do +). Não abro antes do aceite dela/vaga (D-076).
- O balão "Quem responde" não aparece no shell real do dev seed (há plano "proposed" → `suppressHint`), então o clamp só tem prova em jsdom (`who-responds-hint-fit`) até existir um home sem planos.
- O host ainda não guarda a fila: a fila local é transitória até o IV-5 (Bolt entregou o host às 17:45 e confirmou `reason:'quota'` opcional no item da fila). Streaming do texto: o Bolt já está fazendo o lado do host (`contracts/streaming.md`); a UI (balão que cresce, "Você parou aqui · Continuar") é o FL-11, não iniciado.
- Linha de troca de conta e "Perguntar" (D-078): **não pintadas** — esperam o evento do Tally (sem dado, nada na tela).

## 04/11 16:55 — rodada 2 (D-076: parei de abrir itens; falta SÓ a prova no shell real + aceite)

**Estado:** FL-1…FL-10 em `review` no PLAN (UI-3). Código + testes verdes + `check-pkg client-ui-persona` OK. Sem hold por arquivo (D-077): entra no commit o que passa no gate; o aceite da Muse é na varredura do instalado.

**Fechado por teste nesta rodada (além da rodada 1):**
- **P0-17** (`composer-memory-keyboard`, 20 testes + `composer-memory`): Ctrl+S guarda E esvazia o campo, com o campo vazio devolve; ↑ de novo vai mais para trás (antes só o 1º ↑ funcionava); colagem ≥ 32 KiB vira o cartão "Texto colado · N mil caracteres · Abrir" (Modal com o texto, ✕ remove, só em memória); histórico e rascunho em `localStorage` (sobrevivem a reinício) sem lançar com storage bloqueado/cheio; só o texto digitado vai para o bolso.
- **Achado grave corrigido:** o composer das DMs não recebia `conversationKey` nem `key`, então o histórico/rascunho eram de TODAS as DMs e o rascunho digitado numa DM aparecia em outra (risco de mandar à persona errada). Teste: "o rascunho digitado numa DM não aparece na outra".
- **P0-27** menu "/" só lista o que tem ação (`/limites` sempre; `/assunto nome` e `/contratar` no canal e na DM; `/ensinar` na DM; `/lado` e `/resumo` saíram do menu até terem ação). 4 linhas em `register-prism-screens.tsx` (aceitas pelo Prism).
- **IV-4 = P0-28** `/limites` e gaveta sem 38/66/42: cotas oficiais reais (`engine-limits`), sem dado "—" e "Cota oficial indisponível".
- **IV-3** markdown ligado às respostas das personas (a pessoa continua com texto simples); `MarkdownBody` sem `dangerouslySetInnerHTML`.
- **P0-30** envio que falha: `failedSends` no live store, "Não enviado · Tentar de novo" no fio (canal e DM), retentativa com os mesmos anexos.
- **A-5 ajuste da Muse:** tooltip da pílula + frase na linha do popover quando a cota oficial não existe.
- **HINT-clamp** (balão "Quem responde" dentro da janela a 200%) e ajuste da engrenagem a 200% (mesma altura da pílula).

**Suíte completa `pnpm exec vitest run packages/persona/client-ui-persona` (04/11 ~17:10):** 261 de 264 arquivos passam, 1209 de 1219 testes. As 10 falhas estão em 3 arquivos do Revisar (`kanban-review-sheet`, `connected-project-flow-board` "Revisar", `lumen-surfaces` "review delivery"): "Found multiple elements with the text: hero.tsx". São de `review/KanbanReviewSheet.tsx` e `review.pt/en.json`, que estão modificados por outro builder em paralelo; nenhum arquivo meu é importado por eles. Nada do que eu mexi quebrou outro teste.

**Prova que falta (uma rodada só, já enfileirada na trava `build`: bundle exclusivo + `proof-shots`):** `.maestri/tmp/flint/flint-shots.mjs rail card pill keys dms composer hint markdown sendfail`, claro/escuro, 1440×900 / 960×640 / 640×360@2×, axe, saída em `.maestri/tmp/shots/flint/proof/` (+ `results.json` com as medidas). O IV-3 usa uma resposta de persona com lista/tabela/código/link inserida no banco TEMPORÁRIO; o P0-30 mata o host de verdade antes de enviar.

**Correções ao que eu tinha dito:** o ↓ após editar um pedido recuperado NÃO apagava a edição (o `onChange` já zerava o índice). O defeito real era o 2º ↑.

**Não iniciados (D-076):** P0-18 (balão da fila; a UI do Prism já existe com 7 testes), P0-20 (F6 + Ctrl K), IV-5 (streaming + Parar; depende do Bolt), P1 de atalhos (NEXT-STEP-SHORTCUTS-SPEC).

## 04/11 16:15 — rodada 1: rail (P0-22, A-5, Configurações, Ajuda), A-2, IV-3 (markdown)

### Itens e arquivos (todos em `packages/persona/client-ui-persona/`)

| Item | O que mudou | Arquivos |
|---|---|---|
| **P0-13** cartão da persona | **Código é do Prism** (max-height 100dvh−24, ResizeObserver, hover não reabre após Esc). Eu valido no app real e guardo os arquivos no hold. | `primitives/PersonaCard.tsx`, `.module.css`, `tests/persona-card-keyboard-fit.client.spec.tsx` |
| **P0-22** rodapé a 200% | Altura < 600 px: folhagem sai, o rodapé vira uma linha (pílula de estado trunca + Configurações só ícone com tooltip + Ajuda). `useShortViewport` (media query). | `shell/use-short-viewport.ts`, `PersonaSidebar.tsx/.module.css`, `tests/rail-short-viewport.client.spec.tsx` |
| **A-5** pílula do rodapé | Estado REAL da IA: "Claude · 82% livre" / "Claude · —" / "Sem IA conectada · Conectar" (warning) / "Conferindo a IA…" (lilás). Prioridade da Muse: equipe fora do ar > Fora até > sem IA > conferindo > motor. < 20% livre = ponto âmbar. O popover "Estou fora" ganhou no topo a linha da IA com "Ver uso e limites" / "Conectar uma IA". Polling 4 s (não pronta) / 30 s (pronta) + foco da janela; só consulta enquanto o rail está montado. | `shell/rail-ai-status.ts`, `rail-pill.ts`, `UserAwayControl.tsx/.module.css` (prop `header`), `mount.ts` (1 observável), `shell.pt/en.json`, `tests/rail-ai-status.client.spec.ts`, `rail-ai-pill.client.spec.tsx` |
| **Configurações + Ajuda** (decisão da Muse) | O nosso botão ocupa o `settings.launcher` do DSW (uma engrenagem só); o slot do DSW segue montado, então os indicadores de conexão/atualização continuam ao lado; entrega `openSettings` à ponte do Prism (aba "Sobre e atualizações"). Ajuda e atalhos: botão só ícone, tooltip com `?`, a tecla `?` abre a Ajuda (fora de campos e de modais). `data-nav-*` para o Probe. | `shell/SettingsLauncher.tsx/.module.css`, `persona-slots.ts` (`settings.launcher`), `PersonaSidebar.tsx/.css`, `mount.ts`, `tests/settings-launcher.client.spec.tsx` |
| **A-2** DMs com a equipe inteira | Quem nunca conversou aparece com "Começar conversa"; o clique abre a DM. | `chat/DirectMessagesView.tsx`, `remote/ConnectedDirectMessagesView.tsx`, `remote/dm-team-rows.ts`, `chat.pt/en.json`, `tests/dm-team-list.client.spec.tsx` |
| **IV-3** markdown nas respostas | Parser próprio sem dependência + `MarkdownBody` (subconjunto da Muse; nunca HTML cru; links http/https/mailto; código com Copiar; tabela e código com rolagem própria; bloco aberto durante o streaming vira texto). **Ainda NÃO ligado ao `GeneralChannelView`** (janela de estabilidade do Keel). | `chat/markdown/parse-markdown.ts`, `MarkdownBody.tsx/.module.css`, `chat.pt/en.json`, `tests/markdown-parse.client.spec.ts`, `markdown-body.client.spec.tsx` |

### Verificação já feita
- vitest (último run por item): rail-ai-status **25**, rail-short-viewport/rail-away-host/approvals-badge/card keyboard-fit/rail-team **26**, A-2 (dm-team-list + dm-view + map-dm-list + new-dm-modal + rail-ai-pill) **28/28**, markdown-parse + markdown-body **34/34**.
- `node scripts/persona/check-pkg.mjs client-ui-persona`: OK (rodadas A-5, A-2, IV-3b).
- Capturas no app real: **pendentes** (fila FIFO da trava `build`; bundle exclusivo e capturas já enfileirados; harness `.maestri/tmp/flint/flint-shots.mjs`).

### Limitações conhecidas / decisões
- "% livre" = 100 − maior `usedPercent` entre as janelas da conta; com várias contas do motor vale a com mais folga (a UI não sabe qual a persona usará).
- `getEngineStatus` desconhecido (host antigo/fake sem o método) fica em "Conferindo a IA…" para sempre; o host real responde.
- O hold do P0-13 segura código do Prism (PersonaCard) até o aceite.
- Propostas F-1…F-6 no `UX-BEYOND-T3.md` (divisor de dia mentiroso, copiar resposta, "ir para o fim", soltar arquivo, origem do número da pílula, contrato de Esc).
