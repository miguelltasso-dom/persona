# Flint (builder de UI — composer, teclado, conversa; sob o Prism)

Mais recente no topo. Regra D-072 v2: a Muse atribui e dá o aceite. **D-077 (04/11 16:55): acabou o hold por arquivo** — a publicação segue o gate; o aceite da Muse trava a ENTREGA (varredura no app instalado do H2). Meus itens abertos estão listados em `UX-BEYOND-T3.md` §Andamento; mudança grande/arriscada vai atrás de flag.

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
