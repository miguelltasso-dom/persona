# Inventário do T3 Code — tudo que ele tem

**Fonte:** `C:/Users/migue/dev/_ext/t3code`, commit `25bf84ab07f53f141c20239c63e383823a9d5ea0` (07/11/2026, `git pull` feito nesta sessão). Licença MIT.
**Método:** cada linha foi lida no código ou nos docs do próprio repo. As colunas `Onde` citam `arquivo:linha` reais, conferidos abrindo o arquivo. Nada foi inferido de memória.
**Escopo:** funcionalidade e interação de produto. Não é inventário de arquitetura interna (isso está em `DESEMPENHO.md`).

## Como ler

- **Área** — agrupamento de produto.
- **O que faz** — a interação em pt-BR, uma linha.
- **Onde** — `arquivo:linha` no repo do T3 (relativo à raiz). `;` separa pontos-chave.
- **Persona** — `sim` / `parcial` / `não`, com o caminho do nosso código quando existe. Estado conferido em 07/11/2026, não no audit de 04/11.
- **Recomendação** — `PEGAR` (trazer quase como está), `ADAPTAR` (trazer o padrão, redesenhar na nossa linguagem) ou `IGNORAR` (com o motivo).
- **Tamanho** — esforço para a Persona: `P` ≤ 1 dia; `M` 2–4 dias; `G` ≥ 1 semana.

## Índice

| # | Área | Itens | Onde |
|---|---|---|---|
| 1 | Animações e microinterações | 35 | §1 |
| 2 | Composer | 45 | §2 |
| 3 | Streaming e estados do turno | 43 | §3 |
| 4 | Aprovações e permissões | 30 | §4 |
| 5 | Diff, revisão e source control | 35 | §5 |
| 6 | Terminal | 30 | §6 |
| 7 | Threads, sessões e histórico | 42 | §7 |
| 8 | Busca | 25 | §8 |
| 9 | Paleta de comandos e atalhos | 60 | §9 |
| 10 | Configurações | 35 | §10 |
| 11 | Modelos, esforço e provedores | 40 | §11 |
| 12 | Git e worktrees | 34 | §12 |
| 13 | Notificações e background | 30 | §13 |
| 14 | Estados vazios, erro, carregando e acessibilidade | 40 | §14 |
| 15 | Onboarding e links de entrada | 30 | §15 |
| 16 | Atualização, telemetria, segredos e acesso remoto | 35 | §16 |
| 17 | Tarefas agendadas e webhooks | 21 | §17 |
| 18 | SnapShot (captura de janela com árvore de acessibilidade) | 13 | §18 |
| 19 | Triagem de problema | 5 | §19 |
| 20 | Handoff portátil (troca de motor) | 15 | §20 |
| 21 | Arquivos: explorador, visualizadores e editor | 49 | §21 |
| 22 | Preview e navegador embutido | 35 | §22 |
| 23 | Dispositivos (espelhamento de celular) | 25 | §23 |
| 24 | Acesso remoto, cloud e agentes externos | 36 | §24 |
| 25 | Instalação e setup de provedor | 37 | §25 |
| 26 | Respostas visuais, apps MCP e anexos na pergunta | 17 | §26 |
| | **Total** | **842** | |

## O que a Persona já tem, o que falta e o que é melhor que o T3

Contagem sobre os 842 itens: **314 PEGAR · 341 ADAPTAR · 187 IGNORAR**. Estado da Persona conferido no nosso código em 07/11:

- **A Persona já tem, e é igual ou melhor:** atividade agrupada com rosto (`primitives/Pooled.tsx`), limites por conta (`usage/UsageLimits.tsx`), F6 entre áreas (`shell/area-navigation.ts`), citação (`chat/MessageQuoteToolbar.tsx`), composer com memória (`chat/ChannelComposer.tsx`), markdown seguro (`chat/markdown/MarkdownBody.tsx`), Revisar com antes/depois (`review/simple/`), onboarding com 1ª entrega (`onboarding/OnboardingFirstDeliveryStep.tsx`), locale pt-BR (o T3 **não tem i18n**).
- **A Persona tem o controle mas ele não faz nada:** `/` comandos (5 de 6), chip de autonomia, "Lembrar depois", "Concluir assunto", Retomar no limite, `/limites` com número fixo. São os P0 do UX-BEYOND e aparecem aqui como `parcial`.
- **A Persona não tem:** terminal **na tela** (§6 — o backend `ctx.terminals` existe, sem UI e sem persistência), SnapShot (§18), sistema de atalhos remapeáveis (§9), busca full-text nas mensagens (§8.6), find dentro da conversa (§8.13), rewind de turno (§3.33), fila real com steer (§3.35), notificação que dispara (§13.1), webhooks (§17.7), convidado (§15.22), checkpoint por turno (§12.27), handoff com orçamento de contexto (§20), explorador de arquivos com editor e visualizadores (§21), navegador com anotação sobre a página (§22), instalação/atualização de CLI com diagnóstico (§25), resposta visual em página (§26.1).
- **O T3 tem e a Persona deve recusar:** default `full-access` (§4.2), telemetria ligada por padrão (§16.22), editor de tema (§10.9), 23 seções de configuração (§10.1), PR completo (§5.26-5.32), worktree por thread (§12.1-12.9).

## Cobertura (o que foi lido)

**Docs do T3:** os 48 arquivos de `docs/user/` (composer, keybindings, keyboard-focus, thread-sidebar, usage, activity-log, permission-modes, question-attachments, portable-handoffs, prompt-links, html-renders, mobile-notifications, appearance, install, faq, cursor, snap-shot, triage, updating, telemetry, secrets, devices, remote-access, outside-agents, guest-links, browser-import, background-service, default-browser, managed-policy, project-settings, source-control, terminal, thread-migration, providers-*, t3-connect-troubleshooting, welcome-wizard, open-source-licenses) e os de `docs/internals/` e `docs/orchestration-v2/` citados nas linhas.

**Código do T3:** `apps/web/src/components/**` (chat, composer, sidebar, settings, diffs, pullRequest, files, preview, device, cloud, permissions, terminal, ui, onboarding, guest, promptLinks, search, usage), `apps/web/src/*.ts` (keybindings, composer-*, thread*, browser*, appearance*, theme*, workspaceFocus, sidebarTree, questionAttachments), `apps/server/src/**` (orchestration-v2, terminal, git, vcs, device, cloud, provider, persistence, preview, workspace, auth, telemetry, secrets, mcp), `packages/contracts`, `packages/client-runtime`, `packages/provider-*`, `packages/shared`, `apps/desktop/src/**` (window, updates, snapShot, preview, backend, ipc, app, telemetry), `apps/mobile/src/**` e `scripts/` (build, release, launcher).

**O que NÃO está aqui:** detalhes de protocolo interno do Effect (ver `DESEMPENHO.md`), e o conteúdo de `docs/operations/` fora do que afeta release e empacotamento.

## Divisão com o inventário do backend

`INVENTARIO-BACKEND.md` (Zinc) cobre o **mecanismo**: protocolo RPC, auth/escopo, event sourcing, projeções, ciclo de sessão/turno, adaptadores de provedor, checkpoints, MCP, git/worktree, terminal PTY, packaging. Este arquivo cobre **o que a pessoa vê e faz** e cita arquivo de servidor só quando ele é o dono do comportamento descrito.

Onde os dois se encostam, o de cá descreve a interação e o de lá o mecanismo: §4 ↔ RuntimePolicy/DispatchModeLimit; §6 ↔ terminal/Manager; §7 ↔ settlement/deleção/fork; §12 ↔ GitVcsDriverCore/CheckpointStore; §16 ↔ AnalyticsService/DesktopUpdates; §20 ↔ handoffBudget/ContextHandoffService; §24 ↔ EnvironmentAuth/ConnectReachability; §25 ↔ instalação de provider.

**Duas divergências de tamanho, resolvidas assim:**
- **Terminal (§6):** o backend já existe (`packages/terminal` → `ctx.terminals`, `packages/terminal-bash`). O trabalho é expor a UI e persistir a sessão — não construir PTY. Por isso o §6 aqui é `ADAPTAR` no topo, não `PEGAR` de ponta a ponta.
- **Handoff (§20):** o backend de lá chama de `ADAPTAR/M`; aqui o orçamento de contexto é `PEGAR/G`, porque a Persona tem troca de contexto entre personas mas **não** tem a contabilidade por token nem a recuperação do histórico omitido.

**Duas correções que o inventário do backend trouxe para este:** `packages/terminal` (acima) e `packages/compaction` (§3.24 — a compactação existe, o divisor no fio não).

---

## §1 · Animações e microinterações

O T3 não usa biblioteca de animação no web (`framer-motion`/`motion` ausente por grep). Tudo é CSS, Web Animations API e um FLIP próprio. Dois padrões estruturais valem mais que as animações individuais: **`steps()` para reduzir frames em tela de 120 Hz** e **`animation-play-state` pausado quando o elemento está fora da tela**.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 1.1 | Anima a altura de um bloco medindo o conteúdo e transicionando `height` (200 ms ease-out), com clip durante a transição e timer de fallback de 250 ms | `apps/web/src/components/AnimatedHeight.tsx:86`; `:6`; `:47` | parcial — `primitives/` tem transições próprias, sem medidor de altura reutilizável | ADAPTAR: primitivo `AnimatedHeight` no Brush/Muse; hoje cada tela resolve o próprio colapso | M |
| 1.2 | Anima a largura de um rótulo inline (150 ms ease-out) observando o conteúdo com `ResizeObserver` | `apps/web/src/components/AnimatedWidth.tsx:30`; `:20` | não | ADAPTAR: é o que falta no chip de autonomia/limites quando o texto muda | P |
| 1.3 | Acordeão colapsa animando `height` de 0 até a altura medida em 200 ms, sem transição em reduced-motion | `apps/web/src/components/ui/collapsible.tsx:29` | sim — `primitives/` (Tabs/Stagger) e CSS de cada módulo | IGNORAR: já temos o padrão | P |
| 1.4 | Botão comprime para `scale(0.97)` no `:active`, com `will-change` só quando não é popup | `apps/web/src/components/ui/button.tsx:9` | parcial — `primitives/Button.module.css` tem hover/foco; conferir o `:active` | ADAPTAR: garantir o "afunda" de 1 px em todo botão | P |
| 1.5 | Anel de foco padrão `focus-visible:ring-2` inset + `ring-offset-1`, com `outline-offset:-2px` global | `apps/web/src/components/ui/button.tsx:9`; `apps/web/src/index.css:717` | sim — tokens de foco da Muse | IGNORAR: já temos | P |
| 1.6 | Modal entra/sai com `scale(0.98)` + opacity + translate em 200 ms, escalonando por `--nested-dialogs` | `apps/web/src/components/ui/dialog-styles.ts:8` | parcial — `primitives/Overlays.tsx` | ADAPTAR: o escalonamento por profundidade (modal sobre modal) é o detalhe que falta | M |
| 1.7 | Backdrop do modal faz fade de opacidade em 200 ms (variante "media" com preto 75%) | `apps/web/src/components/ui/dialog-styles.ts:2`; `:5` | sim | IGNORAR | P |
| 1.8 | Sheet/drawer desliza do lado (2 rem) + opacity em 200 ms, com duração 0 para abrir/fechar instantâneo | `apps/web/src/components/ui/sheet.tsx:93`; `:70` | parcial — `TurnContextDrawer` | ADAPTAR: a duração configurável por chamada evita animação em ação programática | M |
| 1.9 | Popover anima `width,height,scale,opacity` com origem no ponto de ancoragem e crossfade entre viewports | `apps/web/src/components/ui/popover.tsx:95`; `:113` | parcial — `primitives/MenuButton.tsx` | ADAPTAR: origem no gatilho é o que faz o menu parecer "sair do botão" | M |
| 1.10 | Tooltip entra/sai com `scale(0.98)` + opacity e reposiciona com transição de `top/left/right/bottom/transform` | `apps/web/src/components/ui/tooltip.tsx:141`; `:107` | parcial | ADAPTAR: junto do P0 "tooltip com atalho" (UX-BEYOND P1-3) | P |
| 1.11 | Pilha de toasts: entrada/saída com `transform .5s cubic-bezier(.22,1,.36,1)`, `opacity .5s`, `height .15s`, empilhados por índice | `apps/web/src/components/ui/toast.tsx:602`; `:625-634` | parcial — `primitives/Feedback.tsx` | ADAPTAR: o `height .15s` é o que faz o toast de baixo subir suave quando um sai | G |
| 1.12 | Toast é arrastável para dispensar; a saída usa a direção do swipe | `apps/web/src/components/ui/toast.tsx:631-638` | não | IGNORAR: no desktop o arrasto de toast atrapalha; o nosso toast tem botão | M |
| 1.13 | Skeleton "shimmer": pulso de opacidade 1→0.55 em 2.4 s com `steps(4)`, por container | `apps/web/src/index.css:295`; `:223`; `apps/web/src/components/ui/skeleton.tsx:5` | parcial — `primitives/` tem esqueleto; conferir o `steps()` | ADAPTAR: trocar a animação contínua por `steps()` (menos frames em 120 Hz) | P |
| 1.14 | Spinner gira mas **pausa quando fora da tela** (`--visible-animation-state`) | `apps/web/src/components/ui/spinner.tsx:7`; `apps/web/src/index.css:580` | não | PEGAR: é a correção de GPU mais barata que existe; vale para todo ícone animado | P |
| 1.15 | Indicador de status pulsa opacidade 1→0.5 em ciclo de 2 s com `steps(6)` | `apps/web/src/index.css:332`; `apps/web/src/components/ConnectionStatusDot.tsx:40` | parcial — `shell/FoliageLampHalo.tsx` | ADAPTAR: usar `steps()` no nosso halo | P |
| 1.16 | "Ping" de status: burst de escala 0.75→2 + fade em 2 s com `steps(8)`, depois invisível até o próximo ciclo | `apps/web/src/index.css:347`; `apps/web/src/components/ConnectionStatusDot.tsx:40` | não | ADAPTAR: bom para "precisa de você" pulsar **1×** (o UX-BEYOND A-9 já pede isso) | P |
| 1.17 | Stash do composer pisca a linha e o contador por 1400 ms, alternando dois keyframes idênticos para reiniciar sem remontar | `apps/web/src/components/chat/ComposerStashBadge.tsx:23`; `:49`; `apps/web/src/index.css:314` | não | PEGAR: é exatamente o feedback do "Rascunho guardado" (T3-UX-HARVEST §3) | M |
| 1.18 | Lista da sidebar faz FLIP: linhas entram/saem/movem com `translateY`+opacity de 150 ms, clonando as removidas para o fade | `apps/web/src/components/Sidebar.motion.ts:1`; `:147` | não | ADAPTAR: o rail de conversas da Persona muda de ordem ao vivo; sem FLIP, "pula" | G |
| 1.19 | Reordenação por drag-and-drop (sidebar, abas do painel, rotas) via dnd-kit, com autoscroll e rótulos de limite | `apps/web/src/components/Sidebar.tsx:3296`; `:881`; `apps/web/src/index.css:2413` | não | ADAPTAR: só se o Miguel quiser reordenar conversas por arrasto | G |
| 1.20 | Sidebar colapsa animando `width`/`left`/`right` com `ease-out` na duração configurável | `apps/web/src/components/ui/sidebar.tsx:376`; `:364` | parcial — `shell/PersonaSidebar.tsx` | ADAPTAR: a duração vem de uma variável, não fixa no CSS | M |
| 1.21 | Streaming: cada bloco novo de markdown faz fade-in de 600 ms via `@starting-style`, só com `data-streaming` | `apps/web/src/index.css:2208-2216` | não | PEGAR: é o que faz o texto "nascer" em vez de piscar, sem cursor falso | P |
| 1.22 | Citação clicada pulsa 2× (650 ms) e mantém highlight 1575 ms antes de esmaecer 450 ms, via Web Animations API | `apps/web/src/components/chat/AssistantCitationSource.tsx:245`; `:11-17` | parcial — `chat/MessageQuoteToolbar.tsx` | ADAPTAR: ao clicar numa citação, achar a origem no fio | M |
| 1.23 | Timeline "cola" no fim com scroll animado enquanto o agente trabalha, desligado em reduced-motion | `apps/web/src/components/chat/MessagesTimeline.tsx:202`; `:1347` | parcial — `chat/GeneralChannelView.tsx` | ADAPTAR: junto do F-3 ("↓ 2 novas") | M |
| 1.24 | Botão "Scroll to end" aparece com debounce de 150 ms para não piscar em troca de thread; esconder é imediato | `apps/web/src/components/chat/useTimelineFollow.ts:70` | não | PEGAR: a assimetria (aparece devagar, some na hora) é o detalhe | P |
| 1.25 | Transição de rota do composer mobile via View Transitions API (compositor expandido↔docked) | `apps/web/src/components/chat/draftHeroTransition.ts:52`; `apps/web/src/index.css:48-84` | não | IGNORAR: é do mobile deles; a Persona é desktop | M |
| 1.26 | Composer "assenta" ao colapsar/expandir animando altura, prompt e controles com `cubic-bezier(0.32,0.72,0,1)` | `apps/web/src/components/chat/useComposerRestingTransition.ts:6` | não | ADAPTAR: a curva é a mesma que a Muse usa; vale para o composer que cresce | G |
| 1.27 | Rótulos da barra de contexto do composer fazem FLIP de largura (180 ms) quando viram ícones | `apps/web/src/components/BranchToolbar.tsx:435`; `:456` | não | ADAPTAR: o chip de motor/limites muda de largura ao vivo | M |
| 1.28 | Busca de configurações pulsa o alvo encontrado (`box-shadow` inset 2 px, 650 ms, 2 iterações) | `apps/web/src/index.css:935`; `:923` | não | PEGAR: quando o Ctrl K leva a uma tela, o alvo se acende | P |
| 1.29 | Barra de progresso do preview: `scaleX(0.04)→0.9` em 5.3 s, com fade de saída de 150 ms | `apps/web/src/index.css:2395`; `:2388` | não | IGNORAR: barra de progresso falsa; a nossa regra é "nunca inventar" | P |
| 1.30 | Brilho de ferramenta em execução: gradiente varrendo o texto em 2.2 s `steps(30)`, pausado fora da tela | `apps/web/src/index.css:575`; `:551` | não | ADAPTAR: para a atividade viva do `ActivityGroup` | P |
| 1.31 | Confete de celebração ao favoritar o repo: 160 partículas, spread 360, `disableForReducedMotion` | `apps/web/src/components/GitHubStarPrompt.tsx:75`; `:51` | sim — `primitives/Celebration.tsx` | IGNORAR: o nosso carimbo/patinhas é melhor e é a nossa marca | P |
| 1.32 | Reduced-motion tratado por componente (`motion-safe:`/`motion-reduce:` + media queries) | `apps/web/src/index.css:638`; `apps/web/src/components/ui/skeleton.tsx:5`; `apps/web/src/components/Sidebar.motion.ts:18` | sim — 61 arquivos CSS com `prefers-reduced-motion` | IGNORAR | M |
| 1.33 | Toast mobile entra de baixo com `withTiming` 200 ms e sai com `FadeOut` 150 ms | `apps/mobile/src/components/ui/Toast.tsx:138`; `:143`; `:182` | n/a | IGNORAR: mobile | M |
| 1.34 | Ações por swipe nas linhas da lista mobile (revelação progressiva, stretch no full-swipe) | `apps/mobile/src/features/home/thread-swipe-actions.tsx:332`; `:548` | n/a | IGNORAR | G |
| 1.35 | Painéis do workspace mobile animam largura/opacidade/translate em 260 ms com `ReduceMotion.System` | `apps/mobile/src/features/layout/workspace-pane-animation.ts:1`; `workspace-inspector-pane.tsx:47` | n/a | IGNORAR | M |

**Notas da área (fatos não óbvios):**
- Animações de painel são **desligadas por padrão**: `panelAnimationDurationMs` default `0`, faixa 0–400 ms (`packages/contracts/src/settings.ts:155-164`), exposta como `--panel-animation-duration` e condicionada a `data-panel-animations` (`apps/web/src/components/AppSidebarLayout.tsx:441-449`).
- Menus **não** animam abertura: `MenuPopup` só declara `origin-(--transform-origin)`, sem classe de transição (`apps/web/src/components/ui/menu.tsx:57`); o positioner é mantido no fechamento (`closing-positioner.tsx:11`).
- Skeleton e status usam keyframes "stepped" (`steps(4)`, `steps(6)`, `steps(8)`) de propósito, para reduzir frames do compositor em tela de 120 Hz (`apps/web/src/index.css:295-313`, `:332-346`).
- Spinner, refresh icon e brilho de ferramenta usam `animation-play-state: var(--visible-animation-state, paused)`, controlado por `observeVisibleAnimation` (`apps/web/src/index.css:580-584`; `apps/web/src/lib/visibleAnimation.ts`).
- Troca de tema não tem crossfade: só existe regra que **suprime** transições durante o probe de tokens (`apps/web/src/index.css:1393-1398`); as cores trocam instantaneamente.
- Toasts usam `z-index: calc(9999 - var(--toast-index))` e `transition: transform .5s cubic-bezier(.22,1,.36,1), opacity .5s, height .15s` (`apps/web/src/components/ui/toast.tsx:602`).
- O FLIP da sidebar limita a 40 linhas por atualização e ignora tudo em `prefers-reduced-motion` (`apps/web/src/components/Sidebar.motion.ts:3`, `:147-149`).
- **Não há cursor piscante de streaming**: o efeito de "digitando" é só o fade-in de 600 ms por bloco (`apps/web/src/index.css:2208`).

---

## §2 · Composer

O composer do T3 é o componente mais trabalhado do produto: **45 interações distintas**. A Persona já tem o essencial no `chat/ChannelComposer.tsx` (↑ histórico, Ctrl+S stash, colagem ≥ 32 KiB, citação, anexos, `/`), mas sem o editor rico, sem `@`/`#`/`$` e com a memória compartilhada entre DMs (P0-17).

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 2.1 | Editor Tiptap com Markdown estilizado ao vivo (negrito, itálico, tachado, código, listas, tarefas, citação, título, régua, bloco de código) e serialização de volta para Markdown | `apps/web/src/components/ComposerPromptEditorTiptap.tsx:696`; `apps/web/src/composer-rich-text-doc.ts:1461` | não — `chat/ChannelComposer.tsx` é textarea | ADAPTAR: é o maior salto de qualidade do composer, e o T3 é a prova de que dá para fazer sem perder o Markdown | G |
| 2.2 | Os marcadores Markdown aparecem como texto quando o cursor entra no trecho estilizado e somem quando ele sai | `apps/web/src/composer-markdown-source.ts:537`; `:250` | não | PEGAR: resolve o pior problema do editor rico (não saber o que vai ser enviado) | M |
| 2.3 | Atalhos de formatação `mod+B`, `mod+I`, `mod+shift+S` (tachado) e `mod+E` (código) | `apps/web/src/composer-markdown-source.ts:561` | não | PEGAR | P |
| 2.4 | Enter envia; Shift+Enter quebra linha | `apps/web/src/components/chat/composerCommandKey.ts:201`; `composer-logic.ts:59` | sim | IGNORAR | P |
| 2.5 | `mod+Enter` executa a ação **oposta** à configurada (faz steer quando o padrão é fila e vice-versa) | `apps/web/src/components/chat/composerCommandKey.ts:245`; `client-runtime/src/state/composerDispatch.ts:4` | parcial — Ctrl+Enter existe na UI | PEGAR: "o oposto" é mais útil que "outro envio" | P |
| 2.6 | Atalho de envio configurável em três modos (Enter, `mod+Enter`, `mod+Enter` só em multilinha) | `packages/contracts/src/settings.ts:507`; `composer-logic.ts:49` | não | PEGAR | P |
| 2.7 | ↑/↓ em composer vazio relembram os prompts enviados, com o caret na primeira/última linha visual | `apps/web/src/components/chat/composerCommandKey.ts:242`; `composerPromptHistory.ts:140` | parcial — `ChannelComposer.tsx:424` | PEGAR: a regra do caret por linha visual é o que faz funcionar com texto longo | M |
| 2.8 | Autocomplete fecha com Esc, navega com ↑/↓ e seleciona com Enter ou Tab | `composerCommandKey.ts:220`; `:226` | parcial | ADAPTAR | P |
| 2.9 | Enter continua listas (marcador, numerada, tarefa) e citação, criando o próximo item com o mesmo marcador | `apps/web/src/composer-list-continuation.ts:222` | não | PEGAR: quem escreve lista no chat espera isso | M |
| 2.10 | Tab aninha o item de lista sob o anterior e Shift+Tab desaninha | `apps/web/src/composer-list-continuation.ts:265`; `:306` | não | PEGAR | M |
| 2.11 | Bloco de código: ` ``` ` + Enter abre; Enter herda a indentação; ` ``` ` de fechamento ou duas linhas em branco encerram | `apps/web/src/composer-code-block.ts:165`; `:45`; `:84` | não | ADAPTAR: só com o editor rico | M |
| 2.12 | Tab/Shift+Tab indentam as linhas selecionadas dentro do bloco de código | `apps/web/src/composer-code-block.ts:120` | não | PEGAR | P |
| 2.13 | Seletor de linguagem no canto do bloco de código, com busca e ícone | `apps/web/src/components/chat/ComposerCodeBlockLanguagePicker.tsx:33`; `ComposerCodeBlockNodeView.tsx:15` | não | IGNORAR: detalhe de nicho | P |
| 2.14 | Undo/redo agrupado por **tipo** de mudança (digitar, apagar, colar/recortar), não só por tempo | `apps/web/src/composer-undo-grouping.ts:34` | não | PEGAR: o undo nativo do textarea agrupa errado em colagem | M |
| 2.15 | `@` lista arquivos e pastas do workspace e insere o chip do caminho | `apps/web/src/composer-logic.ts:285`; `chat/useComposerMenuItems.ts:191` | não | PEGAR: é o "contexto" que a Persona hoje só dá por anexo | M |
| 2.16 | `@` também lista threads e máquinas mencionáveis, inserindo chips de contexto | `chat/useComposerMenuItems.ts:193`; `:203` | não | ADAPTAR: threads sim; máquinas não | M |
| 2.17 | `#` busca pull requests por número ou texto e insere chip | `composer-logic.ts:267`; `chat/useComposerMenuItems.ts:329` | não | IGNORAR: a Persona não é ferramenta de PR | M |
| 2.18 | `$` lista skills do provedor e insere a menção (valores como `$5` não disparam) | `composer-logic.ts:274`; `chat/useComposerMenuItems.ts:316` | não | PEGAR: a Persona tem skills; o `$` é o gatilho que falta | M |
| 2.19 | `/` abre o menu de comandos embutidos: `/model`, `/plan`, `/default`, `/side`, `/btw`, `/clear` | `chat/useComposerMenuItems.ts:220` | parcial — `chat/ComposerSlashMenu.tsx`, 5 de 6 mortos (P0-27) | PEGAR: ligar os que existem e esconder os que não (P0-27) | M |
| 2.20 | `/clear` sozinho arma uma sessão nova e mostra banner para desistir | `composer-logic.ts:174`; `chat/ComposerFreshSession.tsx:6` | não | ADAPTAR: "começar de novo sem perder o fio" | P |
| 2.21 | `/model` abre o seletor de modelo em vez de enviar texto | `chat/ChatComposer.tsx:1932` | não | PEGAR | P |
| 2.22 | `/compact` reduz o contexto pela mesma ação do medidor | `chat/ChatComposer.tsx:2271`; `ContextWindowMeter.tsx:153` | não | ADAPTAR: a Persona compacta sozinha; um comando manual ajuda | P |
| 2.23 | Chips de contexto inline (arquivo, imagem, thread, máquina, terminal, PR, anotação de preview, comentário de review, citação) com popover e ações | `apps/web/src/lib/composerContextRecords.ts:130`; `:277`; `apps/web/src/components/composerContextPresentation.tsx:484` | parcial — `chat/MessageQuoteToolbar.tsx` | ADAPTAR: o registro unificado de contexto é a peça de arquitetura que falta | G |
| 2.24 | Selecionar texto de uma resposta mostra "Citar" e insere a citação (bloqueado acima de 8.000 caracteres) | `chat/AssistantSelectionToolbar.tsx:185`; `:180` | sim — `chat/MessageQuoteToolbar.tsx` | IGNORAR: já temos | M |
| 2.25 | Clipe anexa vários arquivos e insere chips de referência no texto | `chat/ComposerAttachmentStrip.tsx:671` | parcial | ADAPTAR | M |
| 2.26 | Arrastar e soltar arquivos ou pastas no composer anexa e destaca a superfície | `chat/workspaceFileDrop.ts:51`; `ChatComposer.tsx:3280` | não — F-4 do Flint | PEGAR: é o F-4, e aqui está a implementação | M |
| 2.27 | Arrastar uma menção da árvore de arquivos ou um PR para o composer insere o contexto no fim do texto | `chat/composerMentionDrag.ts:55` | não | ADAPTAR | M |
| 2.28 | Colar arquivos ou imagens do clipboard anexa ao rascunho | `chat/ChatComposer.tsx:2667` | parcial | ADAPTAR | M |
| 2.29 | Imagens são comprimidas/redimensionadas e HEIC/HEIF convertidos para JPEG antes de anexar | `chat/useComposerAttachmentIntake.ts:263`; `lib/imageCompression.ts:475` | não | PEGAR: no Windows a pessoa cola print de iPhone e nada abre | M |
| 2.30 | Colagem de texto ≥ 32 KiB (ou que estouraria o limite) vira anexo `.txt`; `mod+shift+V` mantém inline | `packages/client-runtime/src/textPaste.ts:31`; `ChatComposer.tsx:1096` | sim — `chat/ChannelComposer.tsx` | IGNORAR: já temos, inclusive o escape | P |
| 2.31 | Mensagem limitada a 120.000 caracteres, com aviso dizendo quantos excedem | `chat/composerSubmission.ts:12`; `ComposerPromptLengthValidation.tsx:1` | não | PEGAR | P |
| 2.32 | Rascunho por thread (texto, anexos, contextos, modelo, modo) persistido em localStorage | `apps/web/src/composerDraftStore.ts:113`; `:127` | parcial — `chat/ChannelComposer.tsx` guarda só o texto | PEGAR: o rascunho precisa levar anexos e modelo junto | G |
| 2.33 | Botão de envio vira "Fila" ou "Direcionar" durante o turno e alterna com `mod` pressionado | `chat/ComposerPrimaryActions.tsx:118`; `:310` | parcial — `chat/ChannelComposer.tsx` tem o balão, sem alternância | PEGAR: junto do P0-18 | M |
| 2.34 | Composer vazio durante o turno mostra só "Interromper" | `chat/ComposerPrimaryActions.tsx:269`; `:145` | sim — `ChannelComposer.tsx:260` | IGNORAR | P |
| 2.35 | Mensagens na fila aparecem como cartões com "Mandar agora", editar (lápis) e remover | `chat/QueuedRunsControl.tsx:293`; `:328`; `:360` | parcial — `chat/QueuedMessageBubble.tsx` | ADAPTAR: o lápis que edita no lugar é o que falta | M |
| 2.36 | Editar mensagem da fila carrega texto e anexos no composer, salva no lugar e restaura o rascunho anterior | `chat/useQueuedRunEdit.ts:229`; `:304`; `ChatView.tsx:2757` | não | PEGAR: "restaura o rascunho anterior" é o detalhe que evita perder texto | M |
| 2.37 | "Retomar" retoma fila/execução parada quando o composer está vazio | `chat/ComposerPrimaryActions.tsx:273`; `ChatComposer.tsx:1264` | parcial — Retomar só recarrega (P0-19) | PEGAR | P |
| 2.38 | "Editar daqui" volta a conversa até uma mensagem e devolve o prompt ao composer | `chat/useTimelineRewind.ts:60` | não | PEGAR: junto do §3.33 | G |
| 2.39 | Seletor de modelo e esforço no rodapé, com coluna de níveis de raciocínio | `chat/ComposerControlsBar.tsx:192`; `ComposerModelEffort.tsx:503` | parcial — `chat/ResponderMenu.tsx` | ADAPTAR | M |
| 2.40 | Chip de permissões abre o seletor de modo de execução | `chat/ComposerFooterControls.tsx:165`; `ComposerContextPermissions.tsx:19` | parcial — chip morto (P0-29) | PEGAR | M |
| 2.41 | Medidor de contexto em anel com popover (usado/máximo, total processado, compactação automática) | `chat/ContextWindowMeter.tsx:22` | parcial — `chat/TurnContextDrawer.tsx` com números fixos | ADAPTAR: mesma forma, dado real (P0-28) | M |
| 2.42 | Custo acumulado no popover do medidor | `chat/ContextWindowMeter.tsx:140` | não | ADAPTAR: só com preço real (COTA-NAO-DOLAR-SPEC) | P |
| 2.43 | Ditado por voz pelo microfone ou `mod+shift+d`, com preparar/gravando/transcrevendo, cancelar e confirmar | `chat/ComposerSpeechButton.tsx:181`; `packages/shared/src/keybindings.ts:72` | não | ADAPTAR: alto valor para "falar com a equipe", mas exige transcrição real | G |
| 2.44 | `mod+S` guarda prompt **e anexos** num stash; com composer vazio restaura o único ou abre o menu | `chat/useComposerStash.ts:71`; `packages/shared/src/keybindings.ts:92` | parcial — `chat/ChannelComposer.tsx:564` guarda o texto e só os **nomes** dos anexos | ADAPTAR: o bolso precisa levar os anexos, não só os nomes | M |
| 2.45 | O mesmo composer vira resposta a pergunta do agente, com anexos próprios do rascunho da pergunta | `chat/ChatComposer.tsx:652` | parcial | ADAPTAR | M |

**Notas da área:**
- Limites de anexo: **100 arquivos** por mensagem, **10 MiB** por imagem e **80 MiB** de imagens por mensagem (`packages/contracts/src/chatAttachment.ts:14-16`).
- O limiar de colagem grande é medido em **bytes** (32 KiB), não em caracteres, porque Unicode pesado subestima o custo de contexto (`packages/client-runtime/src/textPaste.ts:1`).
- Defaults: rich text **ligado**, envio por Enter, follow-up em **steer**, medidor de contexto **desligado**, skills no menu `/` **ligadas** (`packages/contracts/src/settings.ts:505-514`).
- Syntax highlighting do bloco de código desliga acima de 20.000 caracteres e é **adiado** acima de 2.000 para não travar a digitação (`apps/web/src/components/composerCodeBlockHighlight.ts:18`; `:21`).
- O undo fecha um passo a cada mudança de tipo, com atraso de grupo de **1.000 ms** (`apps/web/src/composer-undo-grouping.ts:6`).
- Rascunhos usam `t3code:composer-drafts:v1`, versão **9**, com gravação adiada de 300 ms (`apps/web/src/composerDraftStore.ts:113`; `:114`; `:121`).
- Citação guarda no máximo 8.000 caracteres de texto e 8.000 de comentário (`packages/contracts/src/assistantCitations.ts:4-5`).
- Comandos do provedor, `/side`, `/btw` e `/clear` só valem **no início** da mensagem; `/clear` só age sozinho (`chat/composerSlashCommandSearch.ts:7-20`; `composer-logic.ts:174`).

---

## §3 · Streaming e estados do turno

Nota de contexto: a Persona já tem `chat/markdown/MarkdownBody.tsx` (markdown seguro, sem `dangerouslySetInnerHTML`), `chat/ConversationStreamPreview.tsx`, `remote/apply-message-stream.ts`, `chat/TypingIndicator.tsx`, `chat/QueuedMessageBubble.tsx`, `primitives/Pooled.tsx` (`ActivityGroup`), `primitives/RunErrorCard.tsx`, `chat/LimitBanner.tsx` e `chat/TurnContextDrawer.tsx`. O que falta é a **honestidade do estado** (tempo, dobra, "parou aqui") e o **rewind**.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 3.1 | Assina só o texto da mensagem que está transmitindo, para o resto da timeline não re-renderizar a cada chunk | `apps/web/src/components/chat/TimelineAssistantRows.tsx:29-35` | parcial — `remote/apply-message-stream.ts` atualiza o fio inteiro | PEGAR: é o que impede o fio de engasgar com resposta longa | M |
| 3.2 | Renderiza markdown parcial: corta o texto em blocos fechados, re-parseia só o último e reusa o cache dos anteriores | `apps/web/src/components/ChatMarkdown.tsx:1734-1745`; `:1792-1793` | parcial — `MarkdownBody` tem `streaming`, mas parseia o texto todo | PEGAR: o fatiar por bloco é o que dá fluidez | G |
| 3.3 | Fade-in de 600 ms só nos blocos recém-inseridos durante o streaming (`data-streaming`) | `apps/web/src/components/ChatMarkdown.tsx:1776`; `apps/web/src/index.css:2209` | não | PEGAR: barato e é o que faz parecer "vivo" | P |
| 3.4 | Bloco de código em streaming é destacado linha a linha e mantém as linhas montadas ao terminar | `apps/web/src/components/chat/MarkdownCodeBlock.tsx:283-308` | não | ADAPTAR: só se tivermos highlight; senão, texto puro | M |
| 3.5 | Botão "Run" em bloco shell aparece só quando o fence fechou e não está transmitindo | `apps/web/src/components/ChatMarkdown.tsx:1638-1643`; `MarkdownCodeBlock.tsx:170-181` | não | IGNORAR: a Persona não executa comando de bloco de código | P |
| 3.6 | Mermaid e math de display só renderizam depois que o fence fecha; antes mostram o código-fonte | `apps/web/src/components/chat/MarkdownMermaidCodeBlock.tsx:30-42`; `ChatMarkdown.tsx:1585-1588` | não | IGNORAR: não temos Mermaid/KaTeX no balão | P |
| 3.7 | Linha "Thinking" ao vivo, com brilho animado e prévia de 4 linhas do raciocínio | `apps/web/src/components/chat/TimelineWorkGroupRows.tsx:493-510`; `:361-405` | parcial — `chat/TypingIndicator.tsx` | ADAPTAR: "pensando" com o que ela está fazendo, não só um pontinho | M |
| 3.8 | Trace de raciocínio expandido em markdown, com scroll interno que segue o fim enquanto transmite | `apps/web/src/components/chat/TimelineWorkEntryRow.tsx:121-143`; `WorkLog.tsx:120-160` | não | ADAPTAR: só se o motor expuser raciocínio | M |
| 3.9 | Agrupa chamadas de ferramenta num cabeçalho com resumo ("Rodou 2 comandos…") e contagem dos ocultos | `apps/web/src/components/chat/MessagesTimeline.logic.ts:2035-2050`; `TimelineWorkGroupRows.tsx:588-610` | sim — `primitives/Pooled.tsx` (`ActivityGroup`) | IGNORAR: o nosso já tem rosto e linguagem de gente | G |
| 3.10 | Grupo expandido vira lista virtualizada com altura máxima `min(18rem, 50dvh)` e scroll próprio | `apps/web/src/components/chat/TimelineWorkGroupRows.tsx:125-240`; `:263-265` | parcial — `primitives/FixedRowVirtualScroller.tsx` existe | ADAPTAR: o teto de altura com scroll próprio é o que falta | G |
| 3.11 | Cada chamada expande para comando, entrada e saída; saída longa segue o fim ao vivo | `apps/web/src/components/chat/TimelineWorkEntryRow.tsx:537-570`; `WorkLog.tsx:120-160` | parcial | ADAPTAR | M |
| 3.12 | Ferramenta que falhou ganha ícone/realce destrutivo e rótulo acessível "Tool call failed" | `apps/web/src/components/chat/TimelineWorkEntryRow.tsx:275-300`; `:455-470` | sim — `ActivityGroup` marca falha fora da contagem de feitos | IGNORAR | M |
| 3.13 | Erro do turno vira linha no fio com mensagem e "Retry" quando é falha de preparação | `apps/web/src/components/chat/TimelineWorkEntryRow.tsx:209-268` | sim — `primitives/RunErrorCard.tsx` | IGNORAR | M |
| 3.14 | Aviso de limite no fio: "Usage limit reached. Retry after …" no fuso de quem lê | `apps/web/src/components/chat/TimelineWorkEntryRow.tsx:214-240` | parcial — `chat/LimitBanner.tsx` | ADAPTAR: mostrar a hora local, não "18:30" fixo | P |
| 3.15 | Banner de erro da thread sobre a timeline, dispensável por sessão, com variante warning para limite | `apps/web/src/components/chat/ThreadErrorBanner.tsx:72-140`; `ChatBannerLane.tsx:51-60` | parcial | ADAPTAR | M |
| 3.16 | "Resume thread" continua o run interrompido enviando "Continue where you left off." | `apps/web/src/components/chat/useComposerResume.ts:87-160`; `ComposerPrimaryActions.tsx:273-282` | parcial — Retomar só recarrega (P0-19) | PEGAR: o botão precisa **mandar** a continuação, não recarregar | M |
| 3.17 | Banner de recuperação de limite com "Resume at reset" e "Snooze until reset" | `apps/web/src/components/chat/UsageLimitRecoveryBanner.tsx:37-152` | não | PEGAR: é o P0-19 do UX-BEYOND, e aqui está a forma pronta | M |
| 3.18 | "Stop generation" no composer, que vira envio quando há texto | `apps/web/src/components/chat/ComposerPrimaryActions.tsx:130-146`; `:269-270` | sim — `chat/ChannelComposer.tsx:260` | IGNORAR: já temos, atrás de flag | P |
| 3.19 | Force stop quando o agente ignora o Stop, com aviso de processo compartilhado | `apps/web/src/components/chat/useForceStopThread.ts:15-60`; `ThreadActivityBanners.tsx:129-163` | não | ADAPTAR: a Persona roda CLIs nativas que às vezes ignoram SIGINT | M |
| 3.20 | Turno interrompido mostra "You stopped after 12s" em vez de "Worked for" | `apps/web/src/components/chat/MessagesTimeline.logic.ts:1179-1185` | parcial — "Você parou aqui · Continuar" | IGNORAR: o nosso texto é melhor | P |
| 3.21 | Estado de trabalho honesto: "Working for 0:42", "Setting up worktree…" ou "Compacting for 0:12", com cronômetro | `apps/web/src/components/chat/TimelineWorkGroupRows.tsx:278-330`; `:114-120` | parcial | PEGAR: cronômetro honesto é o antídoto do spinner mentiroso | M |
| 3.22 | Dobra o turno concluído em "Worked for 22s"/"Continued for 20s", carregando o histórico só ao expandir | `apps/web/src/components/chat/MessagesTimeline.logic.ts:1169-1216`; `MessagesTimeline.tsx:1652-1690` | não | PEGAR: é o que mantém um fio de 200 turnos legível | G |
| 3.23 | Tentativa superada por um steer vira dobra "Cut off by a steer" separada | `apps/web/src/components/chat/MessagesTimeline.tsx:1692-1720`; `MessagesTimeline.logic.ts:1857-1865` | não | ADAPTAR: depende do steer real | M |
| 3.24 | Divisor de compactação de contexto no fio, com contagem antes → depois em tokens | `apps/web/src/components/chat/MessagesTimeline.tsx:1545-1580` | parcial — `packages/compaction` compacta, mas o fio não mostra | ADAPTAR: a Persona compacta; hoje isso é invisível | M |
| 3.25 | Card de arquivos alterados **abaixo da resposta** (árvore, totais, "Open diff") | `apps/web/src/components/chat/TimelineAssistantRows.tsx:63-70`; `ChangedFilesTree.tsx:30-140` | parcial — `review/simple/ReviewFileList.tsx` existe, mas só dentro do `DraftReviewPanel`, não no fio | ADAPTAR: o cartão no fim da resposta é o que evita abrir o Revisar para saber o que mudou | G |
| 3.26 | Diff completo no painel direito por turno/ferramenta, anotável, aberto por "Open diff" | `apps/web/src/components/DiffPanel.tsx:1426-1440`; `V2ItemInspector.tsx:287-301` | parcial — `review/simple/DraftReviewPanel.tsx` | ADAPTAR | G |
| 3.27 | Imagens no markdown com estado de carregando/indisponível, fallback copiável e clique para expandir | `apps/web/src/components/chat/ChatMarkdownMedia.tsx:157-250` | parcial | ADAPTAR | M |
| 3.28 | HTML publicado roda em iframe sandbox, ajusta a altura e abre em tela cheia | `apps/web/src/components/chat/HtmlRenderFrame.tsx:23-124`; `files/BrowserDocumentFrame.tsx:324-328` | não | IGNORAR: não é o nosso produto | G |
| 3.29 | App MCP substitui a chamada de ferramenta por um frame interativo sandboxado | `apps/web/src/components/chat/TimelineAssistantRows.tsx:273-300`; `McpAppFrame.tsx:473-475` | não | IGNORAR | G |
| 3.30 | Card de plano proposto: colapsa plano longo, copia, baixa e salva no workspace | `apps/web/src/components/chat/ProposedPlanCard.tsx:41-90`; `:171-230` | sim — `chat/GestorPlanMessageCard.tsx` | IGNORAR: o nosso tem o porquê | M |
| 3.31 | Botão de copiar a resposta só aparece quando o streaming terminou e há texto | `apps/web/src/components/chat/MessagesTimeline.logic.ts:672-684`; `TimelineAssistantRows.tsx:205-230` | não | PEGAR: é o F-2 do Flint, e a regra "só no fim" é o detalhe | P |
| 3.32 | Copiar a mensagem do usuário (com as referências de contexto) e copiar o prompt link | `apps/web/src/components/chat/TimelineUserMessageRow.tsx:798-815` | não | ADAPTAR: copiar mensagem sim; prompt link é marketing | P |
| 3.33 | "Edit from here" volta o chat para antes da mensagem, devolve prompt/anexos ao composer e oferece reverter os arquivos | `apps/web/src/components/chat/TimelineUserMessageRow.tsx:1091-1100`; `ChatOverlayHosts.tsx:193-220`; `useTimelineRewind.ts:93` | não | PEGAR: é a correção de rumo que a Persona não tem | G |
| 3.34 | Fork de uma resposta cria uma thread nova a partir daquele run | `apps/web/src/components/chat/TimelineAssistantRows.tsx:85-120`; `useTimelineRewind.ts:150` | não | ADAPTAR: "seguir por outro caminho" combina com a nossa equipe | M |
| 3.35 | Fila: mostra 3, envia agora, edita e cancela, com estado otimista antes do servidor | `apps/web/src/components/chat/QueuedRunsControl.tsx:56`; `:280-320` | parcial — `chat/QueuedMessageBubble.tsx`, fila local (P0-18) | PEGAR: o "mostra 3 e esconde o resto" é o que falta | G |
| 3.36 | Follow-up configurável (enfileirar vs steer) e marcador "Steer" na mensagem enviada | `apps/web/src/components/chat/ChatComposer.tsx:1197-1202`; `TimelineUserMessageRow.tsx:1049-1072` | parcial | ADAPTAR | M |
| 3.37 | Scroll segue o fim; ao sair, aparece a pílula "Scroll to end" com resumo ("2 na fila", aguardando) | `apps/web/src/components/chat/useTimelineFollow.ts:70`; `TimelineOverlays.tsx:26-51`; `ChatView.tsx:3133-3136` | não | PEGAR: é o F-3 do Flint, com o resumo que faltava | G |
| 3.38 | Divisores de sistema no fio: "Run interrupted", "New session", troca de modelo/esforço, handoff e fork | `apps/web/src/components/chat/V2LifecycleRow.tsx:80-105`; `:602-646` | parcial — `chat/HarnessEventLine.tsx`, `chat/ActionEventLine.tsx` | ADAPTAR | M |
| 3.39 | Fim do turno notifica por toast in-app com "Open thread", som, notificação desktop e badge do dock | `apps/web/src/components/ThreadNotificationCoordinator.tsx:133-210` | parcial — `apps/desktop/src/notifications.ts` pronto, renderer não chama (P0-16) | PEGAR: é o P0-16 | M |
| 3.40 | Medidor de contexto no composer: anel de uso, tokens e custo estimado no popover | `apps/web/src/components/chat/ContextWindowMeter.tsx:35-146` | parcial — `chat/TurnContextDrawer.tsx` com números fixos (P0-28) | ADAPTAR: mesma forma, dado real | M |
| 3.41 | Cartão de aprovação pendente aparece inline no lugar da chamada de ferramenta | `apps/web/src/components/chat/TimelinePendingApprovalRow.tsx:34`; `MessagesTimeline.tsx:1267-1269` | sim — `approvals/` | IGNORAR | M |
| 3.42 | Prompt de automação aparece como bolha dobrada com resumo e link para a automação | `apps/web/src/components/chat/TimelineUserMessageRow.tsx:280-380` | não | ADAPTAR: junto do §17 | P |
| 3.43 | Rodapé da timeline mostra o que a thread faz agora: atenção, trabalho em background, sincronização e meta | `apps/web/src/components/chat/ThreadNow.tsx:83-102` | parcial — `chat/TeamLine.tsx`, `chat/TypingIndicator.tsx` | ADAPTAR: é o "agora" que a Persona promete | M |

**Notas da área:**
- **Não existe cursor piscante** no T3: o streaming só marca `data-streaming` e faz fade-in dos blocos novos (`apps/web/src/index.css:2209`). Também **não há "regenerar resposta"** nem reação em mensagens; a única regeneração é de título de thread (`apps/web/src/components/Sidebar.logic.ts:619-631`).
- Copiar do assistente fica oculto enquanto `streaming` ou enquanto o run ainda está em andamento (`MessagesTimeline.logic.ts:680`; `:2168`).
- Expansão de dobra carrega histórico sob demanda e mostra "Couldn't load work. Click to retry." ao falhar (`MessagesTimeline.tsx:1625-1630`).
- O grupo de ferramentas expandido é virtualizado (LegendList) e limitado a `calc(min(18rem, 50dvh) + altura extra)` (`TimelineWorkGroupRows.tsx:263-265`).
- A fila mostra no máximo 3 mensagens antes do botão de mostrar o resto (`QueuedRunsControl.tsx:56`).
- A pílula "Scroll to end" tem debounce de 150 ms ao aparecer (esconder é imediato) e junta "aguardando" + "N na fila" (`useTimelineFollow.ts:70`; `ChatView.tsx:3133-3136`).
- HTML publicado roda em iframe com `sandbox="allow-scripts allow-forms"` e **nunca** `allow-same-origin` (`files/BrowserDocumentFrame.tsx:324-328`).
- Reverter checkpoint exige provider com rollback e turno parado; senão grava erro na thread ("This provider does not support reverting…") (`useTimelineRewind.ts:109-125`).

---

## §4 · Aprovações e permissões

A Persona tem o **inbox de aprovações** (`approvals/ApprovalsInboxV2.tsx`, `InboxDetail.tsx`) e o chip de autonomia no composer (`chat/ChannelComposer.tsx:527`), mas o chip é controle morto e não há fila, escopo de "sempre permitir" nem registro da decisão. O T3 tem o ciclo inteiro — e o default dele é **Full access**, o oposto da nossa regra.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 4.1 | Quatro modos por thread (Supervisionado, Aceitar edições, Automático, Acesso total) com rótulo, descrição e ícone | `packages/contracts/src/providerPolicy.ts:25-32`; `chat/runtimeModeConfig.ts:7-30` | parcial — chip de autonomia | ADAPTAR: mapear para "Sempre pergunta · Edita sozinha · Decide o rotineiro · Livre" | M |
| 4.2 | Novas threads nascem em **Full access** (`DEFAULT_RUNTIME_MODE`), não em Supervisionado | `packages/contracts/src/providerPolicy.ts:32`; `docs/user/permission-modes.md:10-11` | parcial | IGNORAR o default: a Persona deve nascer em "Sempre pergunta" (D-077 e a nossa regra de confiança) | P |
| 4.3 | Chip "Permissões: <modo>" abre menu com toggle horizontal dos modos e a descrição do modo em foco | `apps/web/src/components/ComposerContextPermissions.tsx:19-63`; `chat/ComposerFooterControls.tsx:165-243` | parcial — chip sem ação (P0-29) | PEGAR: é o P0-29, e aqui está a forma pronta | M |
| 4.4 | `mod+shift+a` abre o seletor de permissões do composer | `packages/shared/src/keybindings.ts:119`; `ComposerContextPermissions.tsx:26-29` | não | PEGAR | P |
| 4.5 | A faixa do novo thread (rascunho) mostra o modo que o primeiro envio vai usar | `apps/web/src/components/BranchToolbar.logic.ts:70-75`; `ChatView.tsx:3843-3849` | não | PEGAR: o modo precisa estar visível **antes** de enviar | P |
| 4.6 | O chip fica oculto no padrão e vira rótulo realçado quando a thread está fora do padrão | `apps/web/src/components/chat/ComposerControlsBar.tsx:140-182`; `composerControlsOwnership.ts:6-8` | parcial — há um 2º chip duplicado (P0-29) | PEGAR: "só aparece quando foge do padrão" resolve a duplicação | P |
| 4.7 | Default de permissões por projeto (override do default do ambiente) | `apps/web/src/components/settings/ProjectDefaultsSettings.tsx:342-380`; `packages/contracts/src/settings.ts:1081-1084` | não | ADAPTAR | M |
| 4.8 | Troca o modo de uma thread existente pelo comando `thread.runtime-mode.set` | `apps/web/src/components/ChatView.tsx:447-449`; `:2071-2079` | não | PEGAR | M |
| 4.9 | Modos acima do teto da política aparecem desabilitados, com o motivo e o nome da organização | `apps/web/src/components/chat/runtimeModeConfig.ts:44-53`; `packages/contracts/src/managedPolicy.ts:183-205` | não | ADAPTAR: a Persona tem limite por persona/projeto | M |
| 4.10 | Aviso de teto no composer ("a organização limita a X") com "Mudar para X" e envio bloqueado | `apps/web/src/components/chat/ChatComposer.tsx:936-941`; `:2478-2500` | não | PEGAR | M |
| 4.11 | O servidor recusa rodar turno acima do teto e **segura a fila** até alguém baixar o modo | `apps/server/src/orchestration-v2/RuntimePolicy.ts:105-117`; `Orchestrator.ts:1751-1754`; `DispatchModeLimit.ts:73-91` | não | PEGAR: o limite tem que valer no host, não só na tela | G |
| 4.12 | Controles travados pela política mostram "Gerenciado por <org>" e há um painel Organization | `apps/web/src/components/settings/settingsLayout.tsx:429-431`; `ManagedPolicy.tsx:52-56` | não | ADAPTAR | M |
| 4.13 | Linha de aprovação no timeline com o **texto completo** do comando/pedido (mono, rolável, copiável) | `apps/web/src/components/chat/TimelinePendingApprovalRow.tsx:15-28`; `:56-64` | parcial — `approvals/InboxDetail.tsx` | PEGAR: mostrar o comando inteiro é o mínimo para decidir | M |
| 4.14 | Botões Aprovar/Recusar e menu "Mais opções" com as opções e avisos que o provedor enviou | `apps/web/src/components/chat/ComposerPendingApprovalActions.tsx:28-31`; `:89-120` | parcial | ADAPTAR | M |
| 4.15 | Aprovação de comando shell, com o comando como detalhe | `TimelinePendingApprovalRow.tsx:16`; `providerPolicy.ts:47-56` | parcial | ADAPTAR | P |
| 4.16 | Aprovação de edição de arquivo | `TimelinePendingApprovalRow.tsx:17`; `docs/user/permission-modes.md:15-18` | parcial | ADAPTAR | P |
| 4.17 | Aprovação de acesso a app MCP, mostrando o nome do app pedinte | `TimelinePendingApprovalRow.tsx:24-27`; `:68-70` | não | ADAPTAR | M |
| 4.18 | Escopo do "sempre permitir": `accept` (uma vez), `acceptForSession` (sessão), `acceptAlways` (permanente) | `packages/contracts/src/providerPolicy.ts:58-64`; `:72-77` | não | PEGAR: é exatamente o "Permissão concedida" do Segundo cérebro (escopo/validade) | M |
| 4.19 | Recusar com feedback: o texto digitado no composer vira recusa **mais** mensagem ao agente que pediu | `apps/web/src/components/chat/useComposerSend.ts:553-556`; `:1093-1114` | não | PEGAR: recusar explicando é o que evita repetir o erro | M |
| 4.20 | Enviar mensagem com aprovação pendente **declina todas** e desvia o turno em vez de enfileirar | `useComposerSend.ts:1057`; `:1131-1134` | não | PEGAR: sem isso, a pessoa fica presa numa aprovação esquecida | M |
| 4.21 | Fila de aprovações: várias na mesma thread, cada uma respondível; a primeira é a ativa do composer | `apps/web/src/components/chat/usePendingThreadRequests.ts:260`; `MessagesTimeline.logic.ts:1523-1529` | parcial — `approvals/ReactiveApprovalsList.tsx` | ADAPTAR | M |
| 4.22 | Aprovações novas ficam "seguradas" (não respondíveis) por 1,5 s enquanto você digita | `apps/web/src/components/chat/composerTypingGuard.ts:1`; `:24-40` | não | PEGAR: evita Enter acidental aprovando comando | P |
| 4.23 | Aprovação de subagente aparece na conversa pai com o nome da filha | `packages/client-runtime/src/state/threadRequests.ts:358-380`; `chat/ChildThreadApprovals.tsx:78-90` | não | PEGAR: a Persona delega; a aprovação tem que subir | M |
| 4.24 | Status "Aprovação"/"Aguardando" na sidebar, no inbox e na aba do painel | `sidebar/Sidebar.logic.ts:1096-1101`; `client-runtime/src/state/threadInbox.ts:202-206` | parcial — `shell/RailTeam.tsx` | ADAPTAR | M |
| 4.25 | Notificação "Approval needed" no desktop/web e push no celular, com card para responder do mobile | `apps/web/src/components/ThreadNotificationCoordinator.tsx:133-135`; `apps/mobile/.../PendingApprovalCard.tsx:27-38` | não | PEGAR: junto do §13 | G |
| 4.26 | Registro persistido da decisão: status, `resolvedAt`, `decision` e `feedback` | `packages/contracts/src/orchestrationV2.ts:1236-1238`; `docs/user/activity-log.md:29` | parcial — `decisions/` | ADAPTAR: a auditoria do MAESTRO.md pede exatamente isso | M |
| 4.27 | Cada modo vira approval policy + sandbox do provedor (`readOnly` / `workspaceWrite` / `dangerFullAccess`) | `apps/server/src/orchestration-v2/Adapters/CodexAdapterV2.ts:719-755` | não | PEGAR | G |
| 4.28 | Aprovação de agente externo via MCP: escolher nível de acesso e Aprovar/Negar (ou código de pareamento) | `apps/web/src/components/auth/ConnectAgentSurface.tsx:89-91`; `:210-274` | não | IGNORAR: fora do v1 | G |
| 4.29 | Revogação de acesso: link de pareamento, sessão de cliente e "Revogar os outros" | `apps/web/src/components/settings/AuthorizedClientsSettings.tsx:394-399`; `:562-567`; `:646-651` | não | ADAPTAR | M |
| 4.30 | Pedido de segredo do agente: card com "Salvar com segurança"/"Recusar", valor nunca na conversa | `apps/web/src/components/chat/SecretRequestCard.tsx:207-232`; `docs/user/secrets.md:45-49` | não | PEGAR: é o Cofre da empresa, e o pedido precisa de um cartão | M |

**Notas da área:**
- O default do T3 é `full-access` (`packages/contracts/src/providerPolicy.ts:32`); a política rejeita um `defaultRuntimeMode` acima de `limits.maxRuntimeMode` (`apps/server/src/policy/managedSettings.ts:367-373`).
- Aprovações só ficam "held" se o composer está focado **e** você digitou nos últimos 1500 ms (`COMPOSER_TYPING_IDLE_MS`); são liberadas ao enviar, desfocar ou ficar ocioso (`composerTypingGuard.ts:1`, `:24-40`).
- `responseCapability` pode ser `live`, `message` ou `not_resumable`; quando não é `live`, a linha mostra "Provider process is gone. Interrupt or restart the run to respond." e **os botões não aparecem** (`TimelinePendingApprovalRow.tsx:41`, `:99-101`).
- Mesmo em Full access um pedido pode chegar por `ask_rule` (regra do próprio agente) ou `provider_check`; o popover "Why am I being asked this?" explica (`client-runtime/src/state/threadRequests.ts:65-73`; `TimelinePendingApprovalRow.tsx:103-116`).
- `apps/web/src/components/permissions/` **não é** sobre aprovações de agente: é checklist de permissões do SO (Full Disk Access, gravação de tela) usada em importação de navegador e SnapShot (`BrowserImportWizard.tsx:251`; `SnapShotSetupDialog.tsx:114`).
- O T3 envia ao provedor apenas o tipo de sandbox por modo; **acesso à rede não é uma permissão do T3** (`CodexAdapterV2.ts:727-753`).
- Subagente nativo do provedor não tem composer próprio: aprovações e perguntas sobem para a thread pai (`ChatView.tsx:1725-1727`).
- Texto enviado por convidado roda com o modo de permissão atual da thread no momento do envio (`docs/user/guest-links.md:47-48`).

---

## §5 · Diff, revisão e source control

A Persona tem o "Revisar" (`review/simple/DraftReviewPanel.tsx`, `review/simple/ReviewFileList.tsx`, `review/simple/BeforeAfterText.tsx`, `ConflictChoices.tsx`, `ProjectHistoryView.tsx`) — que é melhor que o do T3 no **produto** (antes/depois por tipo, Desfazer 30 dias) e muito mais pobre no **motor de diff** (sem virtualização, sem busca, sem árvore, sem PR).

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 5.1 | Seletor de escopo do diff: Changes, Uncommitted, Latest turn e Turn N | `apps/web/src/components/DiffPanel.tsx:824`; `:859` | parcial — `review/simple/DraftReviewPanel.tsx` | PEGAR: "o que mudou neste turno" é a pergunta que a pessoa faz | M |
| 5.2 | Comparação contra ref base em combobox buscável, incluindo refs só remotas | `apps/web/src/components/DiffPanel.tsx:1015`; `:1030` | não | ADAPTAR | M |
| 5.3 | Revisão commit a commit pela lista "Commits" do branch | `apps/web/src/components/DiffPanel.tsx:898` | não | ADAPTAR | M |
| 5.4 | Alternância entre diff empilhado e lado a lado | `apps/web/src/components/DiffPanel.tsx:1172` | parcial — `review/simple/BeforeAfterText.tsx` | ADAPTAR | P |
| 5.5 | Quebra de linha no diff | `apps/web/src/components/DiffPanel.tsx:1194` | não | PEGAR: barato e resolve arquivo de texto longo | P |
| 5.6 | Ignorar mudanças de espaço em branco | `apps/web/src/components/DiffPanel.tsx:1214` | não | PEGAR: sem isso, formatação esconde a mudança real | P |
| 5.7 | Ocultar arquivos de teste do diff, com contagem dos ocultos | `apps/web/src/components/DiffPanel.tsx:1237`; `diffs/useHideTestFiles.ts:5` | não | ADAPTAR: para a Persona, "ocultar arquivos irrelevantes" | P |
| 5.8 | Árvore de arquivos alterados com status git, seleção, revelar e expandir/recolher pastas | `apps/web/src/components/diffs/DiffFileTree.tsx:189`; `:146` | parcial — `review/simple/ReviewFileList.tsx` | ADAPTAR: a árvore com status é melhor que a lista | M |
| 5.9 | Viewer virtualizado com highlight, cabeçalhos fixos e separadores de hunk expansíveis | `apps/web/src/components/diffs/StyledDiffCodeView.tsx:220`; `:242` | não | ADAPTAR: virtualização só se a Persona mostrar diffs grandes | G |
| 5.10 | Busca dentro do diff (`mod+F`) com realce, navegação e salto para arquivo dobrado | `apps/web/src/components/diffs/codeViewSearch.test.ts:5`; `patches/@pierre%2Fdiffs@1.6.1.patch:368` | não | PEGAR: é o que falta para revisar mudança grande | G |
| 5.11 | Carregamento sob demanda dos patches por arquivo (4 primeiros, resto ao rolar) | `apps/web/src/components/diffs/useReviewFilePatches.ts:22`; `DiffFileLoadingBoundary.tsx:8` | não | PEGAR: o mesmo padrão do §DESEMPENHO 1.33 | M |
| 5.12 | Aviso por arquivo de diff truncado (arquivo grande) ou erro, com retry | `apps/web/src/components/diffs/DiffFileStatus.tsx:8` | não | PEGAR: honestidade em arquivo grande | P |
| 5.13 | Contagem +/− total e por arquivo, compactada em k/m/b | `apps/web/src/components/chat/DiffStatLabel.tsx:21`; `DiffPanel.tsx:1122` | parcial | ADAPTAR | P |
| 5.14 | Clique no cabeçalho do arquivo abre no editor/preview preferido | `apps/web/src/components/DiffPanel.tsx:1392`; `apps/web/src/diffFileActions.ts:92` | não | ADAPTAR | P |
| 5.15 | Comentário inline no diff do turno: seleção de linhas vira rascunho no composer | `apps/web/src/components/diffs/AnnotatableCodeView.tsx:228`; `:280` | não | PEGAR: é a nossa "Citar" aplicada a arquivo | M |
| 5.16 | Botão de ação git rápida contextual (Commit, Commit & push, Push & PR, Pull) | `apps/web/src/components/GitActionsControl.logic.ts:177`; `GitActionsControl.tsx:1573` | não | ADAPTAR: a Persona aplica na pasta; o próximo passo é o git | M |
| 5.17 | Menu de ações git com o **motivo** da desabilitação | `apps/web/src/components/GitActionsControl.logic.ts:108`; `GitActionsControl.tsx:1623` | não | PEGAR: a regra "nunca botão desabilitado sem motivo" | M |
| 5.18 | Diálogo de commit com lista de arquivos, exclusão individual e totais +/− | `apps/web/src/components/GitActionsControl.tsx:1695`; `:1365` | não | ADAPTAR | M |
| 5.19 | Mensagem de commit opcional; em branco é gerada pela IA | `apps/web/src/components/GitActionsControl.tsx:1821`; `apps/server/src/git/GitManager.ts:2140` | não | PEGAR: é exatamente o tipo de tarefa que a equipe faz sozinha | M |
| 5.20 | Criar PR pelas ações Git, com título e corpo gerados e sem diálogo | `apps/web/src/components/GitActionsControl.tsx:1346`; `GitManager.ts:2340` | não | ADAPTAR | M |
| 5.21 | Assistente de publicação de repositório (host, caminho, visibilidade, remoto) | `apps/web/src/components/GitActionsControl.tsx:583` | não | IGNORAR: fora do v1 | G |
| 5.22 | Pull do branch atual pela ação rápida quando está atrás do upstream | `apps/web/src/components/GitActionsControl.tsx:1289` | não | ADAPTAR | P |
| 5.23 | Linha "Changes" com totais +/− e a base de comparação | `apps/web/src/components/GitActionsControl.tsx:1643` | parcial | ADAPTAR | P |
| 5.24 | Seletor de branch: criar/checkout, refs remotas e início de worktree | `apps/web/src/components/BranchToolbarBranchSelector.tsx:251`; `BranchPicker.tsx:222` | não | ADAPTAR | G |
| 5.25 | Modo de workspace por thread: checkout atual ou novo worktree (com o anterior) | `apps/web/src/components/BranchToolbarEnvModeSelector.tsx:56` | não | ADAPTAR: a Persona trabalha na pasta do projeto | M |
| 5.26 | Lista de PRs com busca, filtros (estado, envolvimento, autor, label, draft, review, checks, host, servidor, projeto) e ordenação | `apps/web/src/components/pullRequest/PullRequestsPage.tsx:1107`; `PullRequestListFilters.tsx:469` | não | IGNORAR: a Persona não é ferramenta de PR | G |
| 5.27 | Abas do PR: Summary, Guide, Timeline e Code | `apps/web/src/components/pullRequest/PullRequestDetailPanel.tsx:200` | não | IGNORAR | M |
| 5.28 | Aba Code do PR: escopo por commit, marcas de "viewed", árvore e paginação | `apps/web/src/components/pullRequest/PullRequestCodeTab.tsx:1111`; `:285`; `:1605` | não | IGNORAR | G |
| 5.29 | Comentários inline e threads de review no PR, com responder, resolver e reagir | `apps/web/src/components/pullRequest/PullRequestCodeTab.tsx:815`; `:1017` | não | IGNORAR | G |
| 5.30 | Formulário de review com veredito Comment/Approve/Request changes | `apps/web/src/components/pullRequest/PullRequestReviewForm.tsx:33`; `:108` | não | IGNORAR | M |
| 5.31 | Composer de review com contagem de comentários pendentes, modos e descarte | `apps/web/src/components/pullRequest/PullRequestComposer.tsx:82`; `:131` | não | IGNORAR | M |
| 5.32 | Menu de ações do PR: merge/auto-merge/método, draft, close, reopen, revert, deletar branch | `apps/web/src/components/pullRequest/PullRequestActionsMenu.tsx:330`; `:418` | não | IGNORAR | G |
| 5.33 | Resolver conflitos: handoff que prepara o checkout e abre thread com prompt pronto | `apps/web/src/components/pullRequest/PullRequestDetailActions.tsx:154`; `chat/ThreadDetailsPrRow.tsx:192` | parcial — `review/simple/ConflictChoices.tsx` | ADAPTAR: o "abre thread com o prompt pronto" é a nossa cara | M |
| 5.34 | Vincular PR à thread por URL ou "#número" | `apps/web/src/components/pullRequest/LinkPullRequestDialog.tsx:60`; `:135` | não | IGNORAR | M |
| 5.35 | Reverter para um turno/checkpoint, opcionalmente restaurando os arquivos | `apps/web/src/components/chat/ChatOverlayHosts.tsx:212`; `:220` | parcial — Desfazer 30 dias no Revisar | ADAPTAR: o Desfazer por turno é o que falta | M |

**Notas da área:**
- **Não há stage/unstage nem amend**: o commit envia `filePaths` e o servidor faz stage só desses caminhos (`apps/server/src/git/GitManager.ts:2254-2257`); "amend" não existe na UI web.
- Mensagem de commit em branco aciona geração por IA com política de estilo/repo/custom (`GitManager.ts:2140`; `settings/SourceControlWritingSettings.tsx:175`).
- PR é criado **sem diálogo** de título/corpo: `generatePrContent` gera ambos (`GitManager.ts:2340`) e `create_pr` roda direto (`GitActionsControl.tsx:1346`).
- Ação em branch default abre confirmação com "Check out feature branch & continue" (`GitActionsControl.tsx:1877`; `:1907`).
- Find-in-diff é um **patch local** do `@pierre/diffs`: painel só de find (sem replace), limite de 1e5 matches (`patches/@pierre%2Fdiffs@1.6.1.patch:344`; `:368`).
- "Remove agent credits when merging" remove linhas de co-autoria de agente apenas em merge/squash do host, mantendo co-autores humanos (`settings/ProjectDefaultsSettings.tsx:452`).
- Comentário inline no PR só existe em "All commits"; fora disso a seleção vira "Add to agent" (`PullRequestCodeTab.tsx:568`; `:1048`).
- Ocultar arquivos de teste persiste em localStorage na chave `t3code.diffHideTestFiles` (`diffs/useHideTestFiles.ts:5`).

---

## §6 · Terminal

**Correção importante:** a Persona **tem o backend** — `packages/terminal` expõe `ctx.terminals` (sessões PTY com id opaco, isolamento por dono, limpeza aguardada) e `packages/terminal-bash` registra o backend bash/pwsh sob a política de sandbox, com detecção de prontidão e saída limitada. O que **não existe** é a superfície: nenhuma tela, nenhum drawer, nenhum atalho, e as sessões **morrem no restart** (o README diz "do not survive a restart"). Então o trabalho é expor o que já temos + persistência, não construir um terminal do zero.

Não é só "um xterm": o valor está em (a) a sessão viver no host e sobreviver à navegação, (b) o agente e a pessoa compartilharem o mesmo shell, e (c) o trecho do terminal virar contexto no composer.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 6.1 | Botão no cabeçalho da thread e `mod+j` abrem/fecham o drawer de terminal da thread | `apps/web/src/components/chat/PanelLayoutControls.tsx:91`; `packages/shared/src/keybindings.ts:66` | parcial — `ctx.terminals` existe, sem UI | ADAPTAR: a Persona roda CLIs nativas; ver o que elas fazem é metade do valor | P |
| 6.2 | `+` e `mod+n` criam um terminal novo, ou reusam a sessão existente quando o drawer está vazio | `apps/web/src/components/chat/useChatTerminalActions.ts:185` | não | PEGAR: reusar em vez de empilhar é o detalhe que evita 6 terminais mortos | P |
| 6.3 | Split horizontal/vertical do grupo ativo (`mod+d` / `mod+shift+d`), limitado a 4 terminais por grupo | `apps/web/src/components/ThreadTerminalDrawer.tsx:1300`; `:1656` | não | ADAPTAR: 4 é um bom teto | M |
| 6.4 | Sidebar de abas quando há mais de um terminal, com cabeçalhos de grupo e fechar por aba | `apps/web/src/components/ThreadTerminalDrawer.tsx:1652`; `:1385` | não | ADAPTAR | M |
| 6.5 | Fechar terminal pede confirmação, encerra o processo, apaga o histórico e, se o close falhar, digita `exit` | `apps/web/src/lib/terminalCloseConfirm.ts:12`; `terminal/useThreadTerminalActions.ts:118` | não | PEGAR: o fallback `exit` é o que salva o shell travado | P |
| 6.6 | Estado do drawer por thread (aberto, altura, ids, grupos, ativo) persiste em localStorage | `apps/web/src/terminalUiStateStore.ts:22`; `:769` | não | PEGAR | M |
| 6.7 | Até 10 drawers de threads com terminal ficam montados fora da tela para preservar as sessões ao navegar | `apps/web/src/components/chat/ChatTerminalDrawers.tsx:71`; `ChatView.logic.ts:113` | não | PEGAR: sem isso, trocar de conversa mata o processo | M |
| 6.8 | Terminal nasce no cwd do projeto/worktree, com o env dos scripts do projeto | `apps/web/src/components/PersistentThreadTerminals.tsx:177`; `:186` | não | PEGAR | P |
| 6.9 | PTY, ciclo de vida e histórico vivem no servidor; o cliente anexa (operate) ou só observa (read) | `apps/web/src/state/terminalSessions.ts:138`; `apps/server/src/terminal/Manager.ts:182` | parcial — `ctx.terminals` já é owner-scoped; falta o histórico e o modo "observar" | PEGAR: é a arquitetura certa para a Persona (host local) | G |
| 6.10 | Reconexão reanexa com `resume`; terminal desconhecido reabre o shell e restaura o histórico do disco | `packages/client-runtime/src/state/terminal.ts:61`; `Manager.ts:2984` | não — as nossas sessões morrem no restart | PEGAR: é a diferença entre "terminal" e "terminal que serve" | M |
| 6.11 | Renderer Ghostty (libghostty-vt em WebAssembly) desenha em canvas, com uma instância WASM por aba do navegador | `apps/web/src/terminal/ghostty/core.ts:234`; `runtime.ts:240` | não | ADAPTAR: xterm.js é mais barato; o WASM é otimização de nicho | G |
| 6.12 | Links no output: URL abre preview ou navegador, caminho de arquivo abre no editor, com validação de existência | `apps/web/src/components/ThreadTerminalDrawer.tsx:1041`; `apps/web/src/terminal-links.ts:33` | não | PEGAR: é o que faz o terminal ser útil e não só decorativo | M |
| 6.13 | Menu de contexto: Add to chat, Copy, Paste, Select all e Jump to latest | `apps/web/src/components/ThreadTerminalDrawer.tsx:419`; `:902` | não | ADAPTAR | M |
| 6.14 | Popover sobre a seleção oferece "Add to chat" e "Copy", levando o trecho com faixa de linhas ao composer | `apps/web/src/components/ThreadTerminalDrawer.tsx:950`; `:855` | não | PEGAR: é o "Citar" aplicado ao terminal, e é a ponte com a persona | M |
| 6.15 | Copiar/colar por teclado (`mod+C`, `mod+shift+V`, `Shift+Insert`) e colar com clique do meio no Linux | `apps/web/src/terminal/ghostty/surface.ts:315`; `:1394` | não | PEGAR | M |
| 6.16 | Seleção por arrasto, duplo clique (palavra), triplo clique (linha) e autoscroll ao arrastar fora | `apps/web/src/terminal/ghostty/surface.ts:1431`; `:1571` | não | PEGAR | M |
| 6.17 | Scrollback por teclado: `Shift+PageUp/Down`, `mod+shift+Home/End` e select all | `apps/web/src/terminal/ghostty/surface.ts:1120`; `:1132` | não | PEGAR | P |
| 6.18 | Atalhos do app são interceptados antes do shell quando o terminal tem foco; teclas de edição viram sequências do terminal | `apps/web/src/components/ThreadTerminalDrawer.tsx:1002`; `apps/web/src/keybindings.ts:288` | não | PEGAR: sem isso, `Ctrl+K` no terminal quebra o shell | M |
| 6.19 | Altura do drawer ajustável por arrasto (mín. 180 px, máx. 75% da viewport), gravada ao soltar | `apps/web/src/components/ThreadTerminalDrawer.tsx:111`; `:1701` | não | PEGAR | P |
| 6.20 | Fit do grid ao painel e resize do PTY; com vários viewers vale o menor grid por eixo | `apps/web/src/terminal/ghostty/surface.ts:868`; `Manager.ts:1732` | não | ADAPTAR | M |
| 6.21 | Histórico limitado a 5.000 linhas e 8 MiB no servidor (512 KiB no cliente), persistido e lido só pela cauda | `apps/server/src/terminal/Manager.ts:94`; `:1989` | não — o nosso `terminal-bash` só tem saída limitada, sem histórico persistido | PEGAR: o teto é o que impede o app de crescer sem limite | G |
| 6.22 | Shell padrão `pwsh.exe` no Windows e `$SHELL`/`bash` nos demais, com cadeia de fallback | `apps/server/src/terminal/Manager.ts:514`; `:608` | não | PEGAR: no Windows é `pwsh` ou `powershell` — importa para a Persona | P |
| 6.23 | Env do PTY herda o ambiente, remove `T3CODE_`/`VITE_`/blocklist, sobrepõe env de runtime e força `COLORTERM=truecolor` | `apps/server/src/terminal/Manager.ts:1352` | não | PEGAR: a blocklist evita vazar segredo para o shell | M |
| 6.24 | Título da aba vem do comando filho em execução, com fallback "Terminal N" | `apps/server/src/terminal/Manager.ts:379`; `packages/shared/src/terminalLabels.ts:12` | não | PEGAR | M |
| 6.25 | Processo em execução pulsa indicador na sidebar; ao sair, escreve "[terminal] Process exited" e a aba fecha | `apps/web/src/components/ThreadStatusIndicators.tsx:500`; `ThreadTerminalDrawer.tsx:650` | não | ADAPTAR | P |
| 6.26 | Scripts do projeto rodam no terminal, reusando um terminal ocioso ou criando um de 120×30 | `apps/web/src/components/chat/useChatTerminalActions.ts:201`; `lib/projectScriptTerminal.ts:6` | não | ADAPTAR: junto das "Ações do projeto" (§10.29) | M |
| 6.27 | "Run in terminal" em blocos de código shell da resposta envia o comando ao terminal | `apps/web/src/components/chat/MarkdownCodeBlock.tsx:170` | não | ADAPTAR: só com confirmação, pela nossa regra de segurança | P |
| 6.28 | Permissões separam `terminal:read` (observar) de `terminal:operate` (anexar, escrever, fechar) | `apps/web/src/state/terminalSessions.ts:153`; `ThreadTerminalDrawer.tsx:671` | não | PEGAR: a Persona tem autonomia configurável; o terminal precisa do mesmo eixo | M |
| 6.29 | Acessibilidade: canvas `aria-hidden`, textarea rotulado "Terminal input", scrollbar com `aria-value*`, cursor sem blink com reduced motion | `apps/web/src/terminal/ghostty/surface.ts:687`; `:123` | não | PEGAR: terminal é o componente mais hostil a leitor de tela | P |
| 6.30 | Render em `requestAnimationFrame`, saída sincronizada com timeout de 500 ms e seleção comparada até 3.000 células | `apps/web/src/terminal/ghostty/surface.ts:40`; `ThreadTerminalDrawer.tsx:174` | não | ADAPTAR | M |

**Notas da área:**
- Limites de retenção: servidor 5.000 linhas/8 MiB (`apps/server/src/terminal/Manager.ts:94-95`), cliente 512 KiB (`packages/contracts/src/terminal.ts:7`), Ghostty 10.000 linhas (`apps/web/src/terminal/ghostty/core.ts:12`).
- **Não existe busca dentro do terminal**; `chat.find` (`mod+f`) é explicitamente "outside terminals and previews" (`docs/user/keybindings.md:146-148`). É uma lacuna que a Persona pode fechar.
- Menu de contexto e diálogo de fechamento dependem de `localApi` (desktop); no navegador o menu não abre e o fechamento não pede confirmação (`ThreadTerminalDrawer.tsx:902-903`; `lib/terminalCloseConfirm.ts:12-13`).
- **Não há notificação de SO ao terminar comando**: só o pulso na sidebar e a mensagem no terminal (`ThreadStatusIndicators.tsx:500-510`; `ThreadTerminalDrawer.tsx:650-665`).
- Fechar apaga o histórico (`deleteHistory: true`) e, se o close falhar, digita `exit\n` (`terminal/useThreadTerminalActions.ts:118-132`).
- `stopOnSettle` fecha terminais de scripts quando a thread assenta (`apps/server/src/terminal/Manager.ts:3461-3472`).
- Grid compartilhado usa o menor viewer por eixo e o resize é latest-wins (`Manager.ts:1732-1745`; `client-runtime/src/state/terminal.ts:100-104`).
- A saída de comando **do agente** não passa pelo terminal; é renderizada no timeline por `CommandOutputPanel` (`apps/web/src/components/chat/CommandOutputPanel.tsx:26-37`).

---

## §7 · Threads, sessões e histórico

A Persona tem **assuntos** (`chat/SubjectBar.tsx`, `shell/ConversationsRail.tsx`) e DMs, com "Concluir"/"Lembrar depois" que existem mas **nenhuma tela passa os handlers** (P1-20). O T3 tem a lista de threads mais trabalhada do mercado: seções, arrasto entre seções, sweep, undo de 5 s, seleção múltipla e lineage.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 7.1 | Lista dividida em seções fixas Pinned, Active, Working, Snoozed e Settled, com marcadores e placeholders | `apps/web/src/components/Sidebar.tsx:612`; `:3486` | parcial — `shell/ConversationsRail.tsx` | ADAPTAR: "Trabalhando" recolhida é o padrão que falta (T3-UX-HARVEST §10) | G |
| 7.2 | Ordena a ativa por `activeOrderKey` (ou atividade) e a fixada por `pinOrderKey`, com fallback por data | `Sidebar.tsx:680`; `packages/client-runtime/src/state/threadSort.ts:303` | parcial | ADAPTAR | M |
| 7.3 | Seção **Working** recolhível (beta, ligada por padrão) agrupando threads trabalhando/aguardando, com contagem | `Sidebar.tsx:3527`; `packages/contracts/src/settings.ts:532` | não | PEGAR: a Persona trabalha sozinha; sem isso o rail vira ruído | M |
| 7.4 | Fixa/desfixa pelo menu de contexto | `threadActionMenu.logic.ts:136` | parcial | ADAPTAR | P |
| 7.5 | Reordena threads fixadas arrastando, gravando a ordem no servidor | `Sidebar.tsx:2075`; `:2193` | não | ADAPTAR: ordem por arrasto só depois do FLIP (§1.18) | M |
| 7.6 | Arrasta thread entre seções para fixar, desafixar, assentar, reassentar ou acordar, mostrando o verbo da ação | `Sidebar.logic.ts:284`; `Sidebar.tsx:2154` | não | ADAPTAR: o "verbo durante o arrasto" é o detalhe que ensina | G |
| 7.7 | Assenta (settle) / reassenta uma thread pelo menu | `threadActionMenu.logic.ts:142` | parcial — "Concluir assunto" sem handler | PEGAR: é o P1-20 | M |
| 7.8 | **Sweep**: arrastar o botão Settle/Un-settle/Wake sobre várias linhas aplica em todas do intervalo | `Sidebar.tsx:1792`; `Sidebar.logic.ts:296` | não | IGNORAR: gesto obscuro para o nosso público | M |
| 7.9 | Adia (snooze) com presets do ambiente ou "Personalizado…" por data/hora ou duração | `threadActionMenu.logic.ts:151`; `CustomSnoozeDialog.tsx:65` | não | PEGAR: é o "Lembrar depois" do T3-UX-HARVEST §10 | M |
| 7.10 | Acorda e mostra o indicador "Woke" até ser visitada | `threadActionMenu.logic.ts:149`; `client-runtime/src/state/threadSettled.ts:168` | não | ADAPTAR | P |
| 7.11 | Arquiva com confirmação e permite desarquivar em Configurações → Threads arquivadas | `Sidebar.tsx:2814`; `settings/ArchivedThreadsPanel.tsx:32` | não | PEGAR: arquivar precisa de um lugar para voltar | M |
| 7.12 | Exclui com confirmação, apagando o histórico pelo plano de deleção do servidor | `Sidebar.tsx:2842`; `apps/server/src/orchestration-v2/ThreadDeletion.ts:17` | parcial | ADAPTAR | M |
| 7.13 | Renomeia inline na sidebar e no cabeçalho (duplo clique), com Enter/Esc e blur | `Sidebar.tsx:1524`; `chat/ChatHeader.tsx:162` | parcial — F2 no rail | ADAPTAR: o duplo clique no título é o que falta | P |
| 7.14 | Regenera o título a partir da conversa, bloqueado enquanto a geração está em curso | `Sidebar.tsx:2767`; `ThreadTitleRegenerationService.ts:33` | não | PEGAR: título gerado erra; a pessoa precisa refazer | M |
| 7.15 | Gera título automaticamente na primeira mensagem | `client-runtime/src/operations/commands.ts:721`; `ThreadLaunchService.ts:995` | parcial | ADAPTAR | M |
| 7.16 | Marca como não lida e mostra o badge "Done" quando há conclusão não vista | `Sidebar.tsx:2785`; `sidebar/SidebarThreadRow.tsx:779` | parcial | ADAPTAR | P |
| 7.17 | Deriva o rótulo de estado: Setting up, Working/Goal, Waiting, Approval, Input, Request, Limited, Failed | `Sidebar.logic.ts:861`; `SidebarThreadRow.tsx:723` | parcial — `chat/TeamLine.tsx` | ADAPTAR: o rótulo precisa dizer **o quê**, não só o estado | M |
| 7.18 | Menu de contexto: Find, New thread on branch, Copy path/branch/thread/ID, Project settings | `threadActionMenu.logic.ts:116`; `Sidebar.tsx:2578` | parcial | ADAPTAR: "Copiar caminho" é útil; o resto não | P |
| 7.19 | Liga/desliga o auto-settle só para uma thread | `threadActionMenu.logic.ts:208` | não | ADAPTAR: "nunca lembrar sozinho" por assunto | P |
| 7.20 | Regras globais de auto-settle: inatividade, merge e PR (aberto/fechado), por ambiente | `ThreadSettlementService.ts:196`; `settings/SettingsPanels.tsx:1662` | não | ADAPTAR: a Persona precisa de regra de arquivamento automático | M |
| 7.21 | Busca threads na sidebar por título/branch/PR, com contagem e teclado | `sidebar/SidebarThreadHeader.tsx:70`; `Sidebar.logic.ts:1007` | parcial | ADAPTAR | M |
| 7.22 | Paleta busca threads em todos os ambientes, ranqueando por uso e escolhas recentes | `CommandPaletteThreadItems.tsx:96`; `ThreadSearch.ts:437` | parcial — `shell/SearchPlaceholderView.tsx` | ADAPTAR: o ranking por uso é o que falta | M |
| 7.23 | Resultado de mensagem abre a thread com o Find posicionado na palavra encontrada | `CommandPaletteThreadItems.tsx:220` | não | PEGAR: é o §8.7, e é o que faz a busca valer | P |
| 7.24 | Find in thread: barra dentro da conversa, com contagem e salto entre ocorrências | `chat/ThreadFindBar.tsx:26`; `chat/threadFindStore.ts:85` | não | PEGAR: Ctrl+F dentro da conversa é expectativa básica | M |
| 7.25 | Saltos 1–9 para a n-ésima thread, com dicas numéricas ao segurar o modificador | `Sidebar.tsx:2917`; `Sidebar.logic.ts:677` | não | PEGAR: é o P1-18 do UX-BEYOND | P |
| 7.26 | Thread anterior/próxima por atalho, na ordem visível | `Sidebar.tsx:2904`; `Sidebar.logic.ts:789` | não | PEGAR: barato e resolve a navegação diária | P |
| 7.27 | Seleção múltipla com `mod+clique` e `shift+clique` em intervalo | `apps/web/src/threadSelectionStore.ts:32`; `Sidebar.tsx:1557` | não | ADAPTAR: só faz sentido com ações em lote | P |
| 7.28 | Ações em lote sobre a seleção: settle, snooze, marcar não lida, excluir, desafixar, regenerar título | `Sidebar.tsx:2268`; `:2323` | não | ADAPTAR | M |
| 7.29 | **Undo de 5 s** para pin/settle/snooze/archive/descartar rascunho, acionável por `mod+z` | `hooks/showThreadUndoNotice.ts:135`; `sidebar/SidebarThreadUndoNotice.tsx:16` | não | PEGAR: é o P1-10 do UX-BEYOND, e aqui está a forma | M |
| 7.30 | Agrupa threads ativas por projeto (beta), com contagem e ponto de status na pasta fechada | `Sidebar.logic.ts:943`; `sidebar/SidebarProjectFolderHeader.tsx:38` | parcial — `shell/ProjectsPanel.tsx` | ADAPTAR | G |
| 7.31 | Filtra a lista por projeto, alternando "Filtrar por…" e "Mostrar todos" | `Sidebar.tsx:1134`; `threadActionMenu.logic.ts:187` | parcial | ADAPTAR | M |
| 7.32 | Arrasta arquivos do computador para a linha da thread, abrindo-a e anexando no composer | `Sidebar.tsx:1453`; `sidebarPendingFileDropStore.ts:33` | não | PEGAR: junto do F-4 | P |
| 7.33 | Fork de thread a partir de uma resposta, com título "<origem> fork" e transferência de contexto | `chat/useTimelineRewind.ts:174`; `ThreadForkService.ts:52` | não | ADAPTAR | G |
| 7.34 | Mostra lineage (pai, forks, subagentes, side chats, transferência) e oferece "Merge back" | `chat/ThreadRelationshipsControl.tsx:879`; `:203` | não | ADAPTAR: a Persona tem handoff; a árvore visível é o que falta | G |
| 7.35 | Troca de provider no meio da thread via handoff de contexto | `ChatView.tsx:813`; `ContextHandoffService.ts:70` | não | PEGAR: é a nossa troca de motor | G |
| 7.36 | Carrega turnos antigos ("Load earlier turns") sob a política de página do servidor | `chat/MessagesTimeline.tsx:1391`; `threadHistoryPaging.ts:15` | parcial | ADAPTAR | M |
| 7.37 | Estados de carregamento/sincronização e redirect quando a thread está ausente ou excluída | `apps/web/src/threadSync.ts:5`; `ThreadRouteView.tsx:113` | parcial | ADAPTAR | M |
| 7.38 | Migra V1 → V2 na primeira execução, importando transcripts | `legacy/LegacyV1ThreadImporter.ts:110`; `apps/server/src/config.ts:148` | n/a | IGNORAR | G |
| 7.39 | Thread em background: envio com `mod+Enter` abre outro rascunho e a thread segue montada | `chat/useComposerSend.ts:1358`; `routes/_chat.tsx:26` | não | PEGAR: é o que faz a equipe trabalhar em paralelo | M |
| 7.40 | Notifica conclusão/pedido por som, toast e notificação desktop, mantendo o badge de não lidas | `ThreadNotificationCoordinator.tsx:61`; `threadNotifications.ts:41` | não | PEGAR: junto do §13 | M |
| 7.41 | **Side chat**: `/side` ou `/btw` (ou "+" no painel direito) abre uma aba que pergunta sobre a thread **sem entrar nela**, com composer próprio, começando com o que a thread sabe | `docs/user/thread-sidebar.md` §Side chats; `apps/web/src/components/chat/ComposerSlashCommandSearch.ts:7-20` | parcial — `chat/AsideCard.tsx`, host tem `aside`, client nunca chama (P1-21) | PEGAR: é o P1-21, e o "não poluir o fio" é o valor | M |
| 7.42 | **"Bring back"**: a thread recebe o side chat junto da próxima mensagem, quando ela está ociosa | `docs/user/thread-sidebar.md` §Side chats | não | PEGAR: é o que transforma a pergunta paralela em trabalho | M |

**Notas da área:**
- Jump 1–9 é **exclusivo do desktop**: o binding é `mod+1..9` com `when: "... && isDesktop"` (`packages/shared/src/keybindings.ts:133`).
- Auto-settle padrão é **7 dias** de inatividade; PR aberto não impede a menos que "Keep threads with a PR" esteja ligado (`packages/contracts/src/settings.ts:97`; `ThreadSettlementService.ts:147`).
- Snooze aceita no máximo **8 presets** e **30 dias** por preset; a opção "hoje" some do menu depois do horário (`packages/contracts/src/settings.ts:99-100`; `client-runtime/src/state/threadSettled.ts:292`).
- Snooze acorda cedo com aprovação, pergunta nova, falha ou mensagem; uma pergunta **já existente** quando se adia não acorda a thread (`threadSettled.ts:95`).
- Página de histórico: 10 turnos de usuário, 75 itens, 500 itens por turno e 1 MiB; acima de **150 itens** de trabalho viram "deferred work" (`threadHistoryPaging.ts:15-22`).
- A prateleira Settled carrega 10 threads e depois 25 por clique em "Show N more" (`Sidebar.tsx:327-328`).
- **Não há** exportação de thread inteira, duplicação, resumo de thread nem multi-janela; a janela auxiliar do Electron serve só à recuperação de startup (`docs/user/thread-migration.md:41`; `DesktopStartupRecovery.ts:281`).
- O Undo expira em 5 s e reivindica `mod+z` até outra tecla ou edição de texto (`showThreadUndoNotice.ts:141-155`).

---

## §8 · Busca

A Persona tem a tela Buscar (`shell/SearchPlaceholderView.tsx`, `remote/ConnectedSearchView.tsx`) e o Ctrl K. O T3 tem **três modos num overlay** (comando, arquivo, conteúdo), **busca full-text nas mensagens** com FTS5 e **find dentro da conversa**.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 8.1 | Overlay de busca com 3 modos (comando, arquivos, conteúdo) por `mod+k`, `mod+p` e `mod+shift+f` | `CommandPalette.tsx:375`; `CommandPalette.logic.ts:871` | parcial — `shell/SearchPlaceholderView.tsx` | PEGAR: o Ctrl K hoje é página inteira (CMDK-OVERLAY-SPEC já decide o overlay) | G |
| 8.2 | Teclado do palette: Enter executa a linha destacada mesmo virtualizada, Backspace vazio volta do submenu, Tab completa caminho, ↓ destaca a primeira, Esc fecha | `CommandPalette.tsx:2462`; `:2568`; `:2618` | parcial | PEGAR: o Backspace-para-voltar é o que faz menu aninhado funcionar | M |
| 8.3 | Prefixo `>` restringe a busca a ações | `CommandPalette.logic.ts:571` | não | PEGAR: barato e é o padrão que o público técnico já conhece | P |
| 8.4 | Ranking compartilhado: palavra inteira/prefixo, typo de 1 edição, palavras juntas, camelCase/CJK e boost por uso recente | `packages/shared/src/paletteSearch.ts:1008`; `CommandPalette.logic.ts:544` | não | PEGAR: é o que separa "busca" de "busca que acha" | G |
| 8.5 | Busca de threads por título, branch, PR, projeto e ambiente, com descrição e horário relativo por linha | `CommandPalette.logic.ts:423`; `CommandPaletteThreadItems.tsx:105` | parcial | ADAPTAR | M |
| 8.6 | **Full-text nas mensagens** (índice FTS5 trigram, melhor mensagem por thread, snippet de 240 caracteres) | `ThreadSearch.ts:437`; `messageSearchIndex.ts:52` | não | PEGAR: é o "Nas conversas" que o UX-BEYOND promete e não entrega | G |
| 8.7 | Abrir resultado de mensagem **na mensagem exata**: navega e abre o find ancorado, com "Você:/Agente:" e termos destacados | `CommandPaletteThreadItems.tsx:222`; `ThreadSearchMatch.tsx:24` | não | PEGAR: sem isso, a busca só leva ao lugar aproximado | M |
| 8.8 | Lista de threads recentes no palette (12, por último uso) | `CommandPalette.tsx:900`; `CommandPalette.logic.ts:37` | não | PEGAR | P |
| 8.9 | Busca de projetos por título, `workspaceRoot` e label do ambiente | `CommandPaletteProjectItems.tsx:41`; `CommandPalette.logic.ts:351` | parcial | ADAPTAR | P |
| 8.10 | Resultados de configurações no palette, que navegam para a âncora da opção | `CommandPalette.tsx:1695`; `settings/settingsSearch.ts:1466` | não | PEGAR: junto do §10.2 | M |
| 8.11 | Sugestões achatadas de submenus ("Nova conversa em X", "Mudar tema: Y") | `CommandPalette.logic.ts:664`; `:560` | não | ADAPTAR | M |
| 8.12 | Busca de threads na sidebar, escopada aos projetos selecionados, com `aria-activedescendant` | `Sidebar.tsx:1185`; `:1498`; `:3239` | parcial | ADAPTAR | M |
| 8.13 | **Find dentro da thread** (`mod+f`) com contador "n/m", próxima/anterior, retry e varredura no servidor | `chat/ThreadFindBar.tsx:26`; `chat/useThreadFind.ts:279`; `ThreadFind.ts:409` | não | PEGAR: é o que falta para reencontrar uma decisão | G |
| 8.14 | File picker fuzzy (`mod+p`) com destaque de subsequência no nome e no caminho, 200 resultados, frecency na query vazia | `files/ProjectFilePicker.tsx:83`; `ProjectFilePicker.logic.ts:4`; `projectFilesQueryState.ts:221` | não | PEGAR: é o `@` do composer e o "abrir arquivo" | M |
| 8.15 | Índice de workspace no servidor (fff nativo): 25k entradas, scan com timeout de 15 s, TTL ocioso de 15 min | `WorkspaceSearchIndex.ts:34`; `:452` | não | ADAPTAR: a Persona tem Arquivos; falta o índice | G |
| 8.16 | Busca de conteúdo do projeto (`mod+shift+f`) com match case, whole word e regex, agrupada por arquivo e abrindo em `arquivo:linha` | `search/ProjectContentSearchDialog.tsx:119`; `:143`; `:157` | não | ADAPTAR: alto valor para "onde está essa regra?" | G |
| 8.17 | Servidor da busca de conteúdo: grep com budget de 250 ms, 100 matches por arquivo e fallback literal para regex inválida | `WorkspaceSearchIndex.ts:478`; `:505` | não | PEGAR: o budget é o que impede a busca de travar o app | G |
| 8.18 | Find no diff com case/whole-word/regex e teto de 100.000 matches | `patches/@pierre%2Fdiffs@1.6.1.patch:485`; `:344` | não | PEGAR: junto do §5.10 | G |
| 8.19 | Busca de modelos no picker: tokens fuzzy, nome exato primeiro, boost de favorito | `chat/modelPickerSearch.ts:55`; `ModelPickerContent.tsx:923` | não | PEGAR: junto do §11.4 | M |
| 8.20 | Busca de temas no submenu "Mudar tema" | `CommandPaletteThemeItems.tsx:69` | n/a | IGNORAR | P |
| 8.21 | Busca remota de temas no Open VSX com debounce de 350 ms | `settings/ThemeSearchSection.tsx:44`; `apps/web/src/openVsxThemes.ts:240` | n/a | IGNORAR | M |
| 8.22 | Busca da navegação de configurações (`mod+f` ou `/`) com ↑↓/Enter/Esc | `settings/SettingsSidebarNav.tsx:166`; `:229` | não | PEGAR: junto do §10.2 | M |
| 8.23 | Estados vazios/carregando da busca | `CommandPaletteResults.tsx:37`; `Sidebar.tsx:3285` | parcial | ADAPTAR | P |
| 8.24 | Fan-out da busca para todos os ambientes, mantendo as linhas já exibidas enquanto os lentos respondem | `CommandPaletteThreadItems.tsx:69`; `client-runtime/src/state/threadSearch.ts:291` | n/a | IGNORAR: a Persona é um host | M |
| 8.25 | Debounce de 120 ms nas buscas, com query de thread cortada em 200 caracteres | `apps/web/src/state/queries.ts:42`; `packages/contracts/src/threadSearch.ts:16` | não | PEGAR | P |

**Notas da área:**
- Mensagens só entram na busca com token de **3+ caracteres**; títulos de threads antigas casam a partir de 2 (`apps/web/src/state/queries.ts:115`).
- Limites do palette: **20 threads, 10 mensagens e 3 linhas** por grupo secundário (`packages/shared/src/paletteSearch.ts:1120`), além de 12 threads recentes (`CommandPalette.logic.ts:37`).
- O índice FTS5 trigram é **opcional**: sem ele a busca varre as 20.000 mensagens mais novas; hits limitados a 2.000 e candidatos a 10.000 (`ThreadSearch.ts:98`; `messageSearchIndex.ts:96`).
- Busca de conteúdo: 500 resultados no cliente, janela de render de 100, budget de 250 ms e 100 matches/arquivo no servidor; linhas acima de 512 caracteres não têm ranges para whole-word (`state/queries.ts:45`; `ProjectContentSearchDialog.tsx:25`; `WorkspaceSearchIndex.ts:39`; `:516`).
- O índice do workspace indexa conteúdo só na variante "content"; a variante "paths" usa índice leve (`WorkspaceSearchIndex.ts:297`).
- Busca de arquivos/conteúdo exige `AuthFilesystemReadScope`; sem escopo o campo fica **desabilitado** (`apps/server/src/auth/RpcAuthorization.ts:152`; `ProjectContentSearchDialog.tsx:153`).
- Find na thread: debounce de 100 ms, refresh 300 ms após conteúdo streamado e input limitado a 200 caracteres (`useThreadFind.ts:279`; `:191`; `ThreadFindBar.tsx:83`).
- **Não existe busca no terminal**: nenhuma UI/addon de search em `apps/web/src/terminal` nem em `ThreadTerminalDrawer.tsx`.

---

## §9 · Paleta de comandos e atalhos

**A Persona não tem sistema de atalhos**: os atalhos são fixos no código (`shell/area-navigation.ts`, `shell/rail-roving-focus.ts`, `chat/ChannelComposer.tsx`). O T3 tem um **arquivo de regras** (`keybindings.json`) com `when`, precedência, conflito e tela de edição — 60 comandos catalogados.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 9.1 | Alterna a sidebar (recolhe/expande) | `packages/shared/src/keybindings.ts:58`; `AppSidebarLayout.tsx:347` | parcial | ADAPTAR | P |
| 9.2 | **F6/Shift+F6** percorre as áreas do workspace, dando a volta, pulando ocultas e restaurando o último foco | `keybindings.ts:59-63`; `AppSidebarLayout.tsx:184`; `lib/workspaceFocus.ts:90` | sim — `shell/area-navigation.ts` | IGNORAR: já temos; falta o drawer (P1-17) | M |
| 9.3 | Voltar/avançar no histórico de páginas | `keybindings.ts:64-65`; `AppSidebarLayout.tsx:153` | não | PEGAR: `mod+[` / `mod+]` como no navegador | P |
| 9.4 | Abre/fecha o painel direito | `keybindings.ts:67`; `chat/useRightPanelActions.ts:331` | parcial — `TurnContextDrawer` | ADAPTAR | P |
| 9.5 | Abre o menu de nova aba do painel direito | `keybindings.ts:69`; `RightPanelTabs.tsx:1046` | n/a | IGNORAR | P |
| 9.6 | Fecha a aba ativa do painel direito | `keybindings.ts:75`; `useRightPanelActions.ts:336` | n/a | IGNORAR | P |
| 9.7 | Abre/fecha o painel de threads | `keybindings.ts:68`; `useRightPanelActions.ts:335` | n/a | IGNORAR | P |
| 9.8 | Reabre a última aba fechada, em ordem | `keybindings.ts:76`; `ReopenClosedViewShortcut.tsx:143` | não | ADAPTAR: `mod+shift+T` para telas fechadas | M |
| 9.9 | Aciona o "abrir no editor favorito" da tela | `keybindings.ts:126`; `chat/OpenInPickerShortcut.ts:26` | não | ADAPTAR | P |
| 9.10 | Abre/fecha a paleta; Esc fecha e, numa busca filha, volta para a lista de comandos | `keybindings.ts:85`; `shortcuts/commandPaletteCommands.ts:95`; `:47` | parcial — Ctrl K troca de tela | PEGAR: o overlay é a decisão já tomada no CMDK-OVERLAY-SPEC | P |
| 9.11 | Busca de arquivos e busca de conteúdo no projeto | `keybindings.ts:86-87`; `commandPaletteCommands.ts:96` | não | PEGAR | P |
| 9.12 | Seções Actions e Recent Threads na raiz; na busca, Suggestions, Threads, Projects, Settings e In messages | `CommandPalette.logic.ts:763`; `:596`; `:37` | parcial | ADAPTAR | M |
| 9.13 | Ranking por início de palavra, tolerância a erro e histórico de uso | `CommandPalette.logic.ts:544`; `CommandPalette.tsx:1693` | não | PEGAR | M |
| 9.14 | Prefixo `>` mostra só ações | `CommandPalette.logic.ts:571` | não | PEGAR | P |
| 9.15 | `mod+1..9` executa direto o item que carrega aquele atalho | `CommandPalette.tsx:2487`; `CommandPalette.logic.ts:339` | não | PEGAR: é o P1-18 | P |
| 9.16 | Itens `keepOpen` executam sem fechar a paleta | `CommandPalette.tsx:2642`; `:1485` | não | ADAPTAR | P |
| 9.17 | Backspace com busca vazia volta do submenu; Tab completa o caminho | `CommandPalette.tsx:2568`; `:2576` | não | PEGAR | P |
| 9.18 | Nova thread (`mod+n`) e nova thread local (`mod+shift+N`) | `keybindings.ts:111-113`; `shortcuts/chatRouteCommands.ts:115` | parcial | ADAPTAR | M |
| 9.19 | Nova thread sem projeto | `keybindings.ts:114`; `chatRouteCommands.ts:116` | n/a | IGNORAR | P |
| 9.20 | Busca na conversa e nos planos da thread atual | `keybindings.ts:115`; `ChatView.tsx:2740` | não | PEGAR: junto do §8.13 | M |
| 9.21 | Thread anterior/próxima | `keybindings.ts:127-128`; `Sidebar.tsx:2906` | não | PEGAR | P |
| 9.22 | Salta para as 9 primeiras threads, com dicas numéricas ao segurar `mod` | `keybindings.ts:133-137`; `Sidebar.tsx:2917`; `:2932` | não | PEGAR | M |
| 9.23 | Copia o link/referência (PR ou thread) e o número do PR | `keybindings.ts:129`; `:123` | não | ADAPTAR: copiar link do assunto | P |
| 9.24 | Settle e pin da thread ativa | `keybindings.ts:130-131`; `chat/useThreadLifecycle.tsx:656` | não | ADAPTAR | P |
| 9.25 | Desfaz a última ação da sidebar, agrupando ações do mesmo tipo | `keybindings.ts:132`; `AppSidebarLayout.tsx:236` | não | PEGAR: junto do §7.29 | M |
| 9.26 | Navegação por teclado na lista: ↑↓/Home/End movem, ←→ expandem, Enter abre, F2 renomeia, Shift+F10 abre menu | `lib/sidebarTree.ts:98`; `sidebar/SidebarThreadRow.tsx:843` | parcial — `shell/rail-roving-focus.ts` | ADAPTAR: Home/End e F2 são o que falta | M |
| 9.27 | `mod+Enter` com turno rodando faz a ação oposta; em rascunho envia em background | `keybindings.ts:95`; `composer-logic.ts:82` | parcial | PEGAR | M |
| 9.28 | `mod+Alt+Enter` envia e abre uma nova thread | `keybindings.ts:106-110`; `composer-logic.ts:84` | não | PEGAR: é o "manda e continua" | P |
| 9.29 | `mod+Shift+Enter` envia a primeira mensagem da fila | `keybindings.ts:93`; `ChatView.tsx:2755` | não | PEGAR | P |
| 9.30 | `Alt+↑` edita a última mensagem da fila, exigindo cursor no início | `keybindings.ts:94`; `ChatView.tsx:2757` | não | PEGAR | P |
| 9.31 | Preferência de envio com 3 modos, com Shift+Enter sempre quebrando linha | `composer-logic.ts:49`; `settings/SettingsPanels.tsx:1081` | não | PEGAR | M |
| 9.32 | `mod+S` guarda o prompt no stash (captura antes do diálogo do navegador) | `keybindings.ts:92`; `chat/useComposerStash.ts:701` | sim | IGNORAR | M |
| 9.33 | `mod+Shift+D` inicia/finaliza ditado (hold ou toggle, limiar de 300 ms); Esc descarta | `keybindings.ts:72`; `speech/useDictationShortcut.ts:10` | não | ADAPTAR: junto do §2.43 | M |
| 9.34 | Abre os pickers de host, esforço, modo, workspace, branch e worktree anterior | `keybindings.ts:117-122`; `chat/composerShortcuts.ts:27` | parcial | ADAPTAR | P |
| 9.35 | Abre/fecha o seletor de modelo | `keybindings.ts:116`; `chat/composerShortcuts.ts:18` | parcial | ADAPTAR | P |
| 9.36 | Teclado do model picker (←/Shift+Tab vai aos provedores, → aos esforços, ↑↓ navegam, Enter escolhe) | `ModelPickerContent.tsx:941`; `:795`; `keybindings.ts:138-142` | não | ADAPTAR: o teclado em colunas é o que falta | M |
| 9.37 | Menu de slash/mention (↑↓, Enter/Tab, Esc) e histórico de prompts com ↑/↓ nas bordas | `chat/composerCommandKey.ts:205`; `:231` | parcial | ADAPTAR | M |
| 9.38 | Tab/Shift+Tab indenta listas; Shift+Tab sem lista alterna o plan mode | `chat/composerCommandKey.ts:194` | não | ADAPTAR | P |
| 9.39 | Digitar um caractere fora de campos foca o composer e insere o texto | `chat/composerFocusRedirect.ts:72` | não | PEGAR: é o "comece a digitar de qualquer lugar" | P |
| 9.40 | Comandos **sem atalho padrão**: parar turno, ciclar host, aumentar/diminuir esforço, maximizar painel | `ChatView.tsx:2761`; `chat/composerShortcuts.ts:21`; `useRightPanelActions.ts:332` | n/a | ADAPTAR: deixar sem atalho e documentar é melhor que inventar | P |
| 9.41 | Terminal: abre/fecha o drawer | `keybindings.ts:66`; `chat/useChatTerminalActions.ts:407` | n/a | ADAPTAR: junto do §6 | P |
| 9.42 | Terminal: divide horizontal e verticalmente | `keybindings.ts:70-71`; `useChatTerminalActions.ts:416` | n/a | ADAPTAR | P |
| 9.43 | Terminal: cria um novo | `keybindings.ts:73`; `useChatTerminalActions.ts:436` | n/a | ADAPTAR | P |
| 9.44 | Terminal: fecha o ativo com confirmação; tecla segurada não fecha em cascata | `keybindings.ts:74`; `useChatTerminalActions.ts:428`; `lib/terminalCloseShortcut.ts:17` | n/a | PEGAR: o "não fecha em cascata" é o detalhe | P |
| 9.45 | Diff: abre/fecha o painel | `keybindings.ts:77`; `useRightPanelActions.ts:340` | parcial | ADAPTAR | P |
| 9.46 | Diff: busca em todos os arquivos (Enter/Shift+Enter, Esc, arquivos dobrados, teto de 100 mil) | `patches/@pierre%2Fdiffs@1.6.1.patch:485`; `diffs/codeViewSearch.test.ts:5` | não | PEGAR | M |
| 9.47 | Preview: abre/fecha, recarrega e foca a URL | `keybindings.ts:78-80`; `chatRouteCommands.ts:142` | n/a | IGNORAR | P |
| 9.48 | Preview: zoom in/out/reset | `keybindings.ts:81-84` | n/a | IGNORAR | P |
| 9.49 | Abre o seletor de tema dentro da paleta | `keybindings.ts:89`; `commandPaletteCommands.ts:80` | parcial | ADAPTAR | P |
| 9.50 | Cicla system→light→dark com toast de 1,5 s e abre o editor de tema | `keybindings.ts:90-91`; `commandPaletteCommands.ts:64`; `:85` | não | ADAPTAR: o ciclo com toast é bom; o editor não | P |
| 9.51 | Usage: abre a página e troca métrica (c/t/l) e período (`mod+shift+1..4`) | `keybindings.ts:88`; `:143-149`; `usage/usageShortcuts.ts:7` | não | ADAPTAR | P |
| 9.52 | Tela de atalhos agrupada (Navigation, Threads, Composer, Terminal, Preview & diff, Appearance, Project scripts, Other) com busca | `settings/KeybindingsSettings.logic.ts:210`; `settingsSearch.ts:158` | não | PEGAR: é o P1-22 do UX-BEYOND | M |
| 9.53 | Grava o atalho pressionando as teclas (Esc cancela, Tab sai), adiciona novo e reseta/remove | `settings/KeybindingsSettings.tsx:740`; `:1480`; `:936` | não | PEGAR | M |
| 9.54 | Aviso de conflito comparando o acorde resolvido e o `when`, com precedência da última regra | `KeybindingsSettings.tsx:262`; `KeybindingsSettings.logic.ts:181`; `keybindings.ts:189` | não | PEGAR | M |
| 9.55 | Editor de `when` com condições/grupos e expressão textual, validando e sinalizando variáveis desconhecidas | `KeybindingsSettings.tsx:556`; `KeybindingsSettings.logic.ts:118` | não | ADAPTAR: expressão textual é poder demais; o essencial é o grupo de condições | M |
| 9.56 | `keybindings.json` no servidor, merge com defaults por comando, limite de 256 regras e profundidade 64 | `apps/server/src/config.ts:156`; `packages/shared/src/keybindings.ts:391`; `packages/contracts/src/keybindings.ts:7` | não | PEGAR: arquivo editável à mão é o que torna o atalho "seu" | M |
| 9.57 | Sair com `mod+Q` (segurar 1,2 s ou dois toques em 500 ms; modos Hold/Direct/Double) | `apps/desktop/src/window/QuitHold.ts:5-6`; `DesktopWindow.ts:650` | não | ADAPTAR: o "segurar para sair" evita fechar sem querer | M |
| 9.58 | Menu do app com `mod+,`, `mod+R`, `shift+mod+R`, DevTools, zoom e fullscreen | `DesktopApplicationMenu.ts:174`; `:241`; `:253` | parcial | ADAPTAR | M |
| 9.59 | `mod+w` nunca fecha a janela (segurar fecha só uma aba) e Ctrl+roda dá zoom no app | `DesktopWindow.ts:676`; `:689` | não | PEGAR: `mod+w` que fecha o app é o acidente mais caro do desktop | P |
| 9.60 | Atalhos de teclado físico no iPad | `apps/mobile/modules/t3-native-controls/ios/T3KeyboardCommandsModule.swift:41-85` | n/a | IGNORAR | M |

**Notas da área:**
- A resolução varre as regras **de trás para frente**: a última regra cujo `key` e `when` casam vence, mesmo sendo de outro comando (`apps/web/src/keybindings.ts:189`).
- `mod` é Command no macOS e Ctrl em Windows/Linux, resolvido no match por `isMacPlatform` (`packages/shared/src/keybindingMatching.ts:49`).
- Os saltos `mod+1..9` de thread e de modelo têm `when` `isDesktop` justamente para **não roubar** o Ctrl+1..9 do navegador (`packages/shared/src/keybindings.ts:133-142`).
- `mod+shift+d` tem **dois comandos com condições opostas**: split vertical no terminal e ditado fora dele (`keybindings.ts:71-72`).
- `mod+enter` é reescrito em runtime para `mod+shift+enter` quando a preferência de envio exige modificador, **sem alterar o atalho salvo** (`apps/web/src/keybindings.ts:113-121`).
- Limites do contrato: **256 regras** por configuração e profundidade máxima **64** na expressão `when` (`packages/contracts/src/keybindings.ts:7-8`).
- O merge de defaults remove **todos** os defaults de um comando que o usuário customizou, não só a tecla igual (`packages/shared/src/keybindings.ts:391-400`).
- `mod+w` no desktop é tratado no processo principal: nunca fecha a janela e, segurado, fecha apenas uma aba/terminal (`DesktopWindow.ts:676-680`).

---

## §10 · Configurações

A Persona tem `shell/AppearanceSettingsPanel.tsx`, `shell/AboutSettingsPanel.tsx`, `settings-personas/PersonasSettingsPanel.tsx`, `theme/` e um sistema de locale (pt-BR/en) que o T3 **não tem**. O que falta é a **arquitetura de configuração**: busca, herança por projeto/ambiente, reset por linha e editor de atalhos.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 10.1 | Modal de Configurações com navegação lateral em 5 grupos e 23 seções | `apps/web/src/components/settings/SettingsSidebarNav.tsx:130`; `settingsSearch.ts:114` | parcial — `shell/SettingsLauncher.tsx` | ADAPTAR: 23 seções é demais para a Persona; agrupar em ~8 | M |
| 10.2 | Busca de configurações com filtro por disponibilidade, atalhos `mod+F` e `/`, setas + Enter e destaque do item encontrado | `apps/web/src/components/settings/SettingsSidebarNav.tsx:160`; `settingsSearch.ts:1466` | não | PEGAR: é o que resolve "onde fica aquela opção" | M |
| 10.3 | Seletor "Aplicando para" (projeto × ambiente) que define onde a mudança é gravada; páginas só de dispositivo não o mostram | `apps/web/src/components/settings/SettingsScopeSentence.tsx:63`; `settingsScopeAxis.ts:58` | não | ADAPTAR: a Persona tem "projeto" e "empresa"; o seletor de escopo é a peça que falta | G |
| 10.4 | Cadeia de herança por configuração (projeto → ambiente → `t3.json` → padrão), estado **Mixed** quando os ambientes divergem, reset do override | `apps/web/src/components/settings/SettingInheritance.tsx:100`; `settingsLayout.tsx:398` | não | ADAPTAR: mostrar de onde veio o valor é o que evita "por que está assim?" | G |
| 10.5 | "Restore device defaults": confirma, lista as opções alteradas e reseta tema/aparência/servidor | `apps/web/src/routes/_chat.settings.tsx:30`; `SettingsPanels.tsx:581` | não | PEGAR: a lista do que será perdido é o detalhe | M |
| 10.6 | Botão de reset por linha, só quando o valor difere do padrão | `apps/web/src/components/settings/settingsLayout.tsx:550` | não | PEGAR: barato e é o padrão de app de verdade | P |
| 10.7 | Aparência Sistema/Claro/Escuro e tema por modo, com cartões de tema e seleção radial de variante | `apps/web/src/components/settings/ThemeSettings.tsx:638`; `:697` | parcial — `shell/AppearanceSettingsPanel.tsx` | ADAPTAR | M |
| 10.8 | Importar tema do T3 Code ou do VS Code por arquivo, colagem de JSON ou arrastar, com pareamento claro/escuro | `apps/web/src/components/settings/ThemeImportDialog.tsx:144`; `apps/web/src/vscodeThemeImport.ts:173` | não | IGNORAR: a Persona tem identidade visual própria e aprovada (direção D) | G |
| 10.9 | Editor de tema: duas cores com o resto derivado, modo avançado por papel e conta-gotas que lê a própria UI | `apps/web/src/components/settings/ThemeEditorPanel.tsx:310`; `:1152` | não | IGNORAR: contraria a marca | G |
| 10.10 | Exportar tema como JSON | `apps/web/src/components/settings/ThemeSettings.tsx:77`; `:795` | não | IGNORAR | P |
| 10.11 | Slider de contraste da interface (50–200%, passo 5) | `apps/web/src/components/settings/AppearanceSettingsPanel.tsx:167` | não | ADAPTAR: resolve acessibilidade de uma vez (P0-21) | P |
| 10.12 | Slider de duração das animações de painel (0–400 ms, passo 25) com preview | `apps/web/src/components/settings/AppearanceSettingsPanel.tsx:361` | não | ADAPTAR: o "0 ms" é o modo "sem animação" que falta | P |
| 10.13 | Tipografia: família e tamanho para interface, prompt, código e terminal | `apps/web/src/components/settings/TypographySettings.tsx:321` | parcial — `theme/` | ADAPTAR: tamanho de interface é acessibilidade, não gosto | M |
| 10.14 | Fontes por área, suavização (só macOS) e word wrap padrão em código/diffs/preview | `apps/web/src/components/settings/TypographySettings.tsx:278`; `:209`; `:237` | não | ADAPTAR: o word wrap em bloco de código é o que falta no balão | P |
| 10.15 | Modo de notificação (off / só notificação / só som / ambos) com pedido de permissão e mensagens de erro | `apps/web/src/components/settings/NotificationSettings.tsx:15` | não | PEGAR: junto do §13 | M |
| 10.16 | Notificações in-app (toast) quando outra thread termina, falha ou pede algo | `apps/web/src/components/settings/SettingsPanels.tsx:797` | não | PEGAR | P |
| 10.17 | Atalho de envio do composer (Enter envia / `mod+Enter` em multilinha / `mod+Enter` sempre) | `apps/web/src/components/settings/SettingsPanels.tsx:1119` | não | PEGAR: é a preferência que mais gera atrito no começo | P |
| 10.18 | Follow-up: enfileirar ou dirigir o turno em execução | `apps/web/src/components/settings/SettingsPanels.tsx:1195` | não | PEGAR: junto do steer | P |
| 10.19 | Preferências de diff: esquema de cores, empilhado/lado a lado, ignorar espaço, estado inicial dos arquivos | `apps/web/src/components/settings/SettingsPanels.tsx:1293`; `:1301` | parcial — `review/simple/` | ADAPTAR: "ignorar espaço" é o que falta para revisar formatação | M |
| 10.20 | Editor de atalhos: rebind por captura de teclas, detecção de conflito, expressões `when`, reset e abrir o JSON | `apps/web/src/components/settings/KeybindingsSettings.tsx:916`; `:1494` | não — a Persona tem atalhos fixos | PEGAR: é o §9 inteiro; sem isso, todo atalho novo é uma discussão | G |
| 10.21 | Editor preferido: guarda o último por dispositivo e valida contra os disponíveis no ambiente | `apps/web/src/editorPreferences.ts:47`; `:67` | não | ADAPTAR: a Persona aplica mudanças na pasta; "abrir no editor" é próximo | M |
| 10.22 | Destino de links: navegador do sistema ou navegador interno | `apps/web/src/components/settings/IntegrationsSettings.tsx:660` | não | ADAPTAR | P |
| 10.23 | Links de PR abrem no app em vez do host | `apps/web/src/components/settings/IntegrationsSettings.tsx:781` | não | IGNORAR | P |
| 10.24 | Dispositivos: hub, acesso de agentes e hosts SSH com editor por host | `apps/web/src/components/settings/IntegrationsSettings.tsx:810`; `DeviceSourcesSettings.tsx:142` | não | IGNORAR: multi-máquina fora do v1 | G |
| 10.25 | Acesso: criar link de pareamento com escopos, ver clientes, revogar link/sessão e "Revoke others" | `apps/web/src/components/settings/ConnectionsSettings.tsx:1265`; `AuthorizedClientsSettings.tsx:604` | não | ADAPTAR | G |
| 10.26 | Conta T3 Connect na sidebar, exibida só quando o build tem o recurso | `apps/web/src/components/clerk/T3ConnectSidebarSignIn.tsx:9` | não | IGNORAR: local-first | M |
| 10.27 | Política gerenciada: trava o controle, mostra "Managed by <org>", remove o reset e explica o motivo | `apps/web/src/components/settings/settingsLayout.tsx:353`; `:431` | não | IGNORAR: não temos cliente corporativo | G |
| 10.28 | Projeto: nome compartilhado, ícone/emoji/monograma, pin, arquivar e remover checkout | `apps/web/src/components/settings/ProjectSettingsPanel.tsx:515`; `:628` | parcial — `boards/`, `shell/ProjectsPanel.tsx` | ADAPTAR: ícone por projeto combina com a nossa direção visual | M |
| 10.29 | Ações/scripts do projeto: criar/editar, atalho, rodar no setup/settle, preview URL e importar de `t3.json` | `apps/web/src/components/settings/ProjectActionsSettings.tsx:36`; `:134` | não | ADAPTAR: "Ações do projeto" é como a Persona roda o trabalho do negócio | G |
| 10.30 | Defaults por projeto/ambiente: modelo padrão, workspace, permissões e modelo de fallback | `apps/web/src/components/settings/ProjectDefaultsSettings.tsx:55` | não | ADAPTAR | M |
| 10.31 | Persistência no servidor: `settings.json` **esparso** (só valores ≠ padrão), escrita atômica e watcher que reemite mudanças | `apps/server/src/serverSettings.ts:738`; `:1241` | parcial — `persona-store` | PEGAR: o arquivo esparso é o que torna a configuração legível à mão | G |
| 10.32 | Persistência por dispositivo em localStorage (aparência, notificações, editor, onboarding) | `apps/web/src/clientPersistenceStorage.ts:5` | parcial | ADAPTAR | M |
| 10.33 | Onboarding em 3 etapas: conectar ambiente, configurar agentes, importar projetos/conversas | `apps/web/src/components/onboarding/WelcomeWizard.tsx:117` | sim — `onboarding/` | IGNORAR: o nosso é melhor e é o P0 | G |
| 10.34 | Export OpenTelemetry por ambiente (traces/metrics/logs) com teste de conexão | `apps/web/src/components/settings/TelemetryExportSettings.tsx:74` | não | IGNORAR | M |
| 10.35 | Idioma de transcrição de voz (auto ou idiomas do modelo), com fallback | `apps/web/src/components/settings/SpeechLanguageSelect.tsx:14` | n/a | IGNORAR | P |

**Notas da área:**
- **Não existe idioma de UI**: o T3 não tem i18n; "idioma" só aparece como idioma de transcrição de voz (`SpeechLanguageSelect.tsx:14`) e formato de hora (`SettingsPanels.tsx:1033`). A Persona é pt-BR e tem locale — vantagem nossa.
- Não existe densidade nem import/export de configurações; o único export é de tema em JSON (`ThemeSettings.tsx:77`).
- Telemetria de produto **não tem toggle na UI**: só `T3CODE_TELEMETRY_ENABLED=false` ou política `limits.telemetry=false` (`apps/web/src/state/managedPolicy.ts:34`); o export OTel é separado e por ambiente.
- `settings.json` fica em `~/.t3/userdata/settings.json` (`apps/server/src/config.ts:157`), grava **só valores diferentes do padrão**, escrita atômica (`serverSettings.ts:738`); watcher com debounce de 100 ms recarrega edições externas (`:1290`).
- Preferências de dispositivo ficam em localStorage: `t3code:client-settings:v1` (`clientPersistenceStorage.ts:5`); temas em `t3code:themes:v1` (`themePalette.ts:49`).
- Defaults e faixas: contraste 100 (50–200), glass 80 (40–100), animação 0 (0–400 ms), interface 16 (12–20), prompt 14 (12–20), código 13 (10–18), terminal 12 (8–20) (`packages/contracts/src/settings.ts:146-196`).
- Import de tema recusa arquivo acima de 256 KB antes de ler e desliga o highlight de JSON acima de 20.000 caracteres (`ThemeImportDialog.tsx:27-33`).
- Conclusão do onboarding é client setting `onboardingCompletedAt` (`apps/web/src/onboarding/firstRun.ts:3`), não do servidor; sob política gerenciada o controle fica inerte e o reset desaparece (`settingsLayout.tsx:353-431`).

---

## §11 · Modelos, esforço e provedores

A Persona trata "quem responde" como persona/motor (`chat/ResponderMenu.tsx`, `profile/PersonaEngineOverlay.tsx`, `profile/engine-effort-model.ts`), e já tem cotas reais (`remote/engine-limits.ts` → `data/adapters/usage-pooled.ts` → `primitives/Pooled.tsx`). O que o T3 tem a mais é **a mecânica de escolher** (favoritos, busca, salto 1–9, esforço como coluna) e **a página de uso**.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 11.1 | Popover do seletor no composer, com ícone do provedor, nome do modelo, sufixo de esforço e selo "Unavailable" | `apps/web/src/components/chat/ProviderModelPicker.tsx:76` | parcial — `chat/ResponderMenu.tsx` | ADAPTAR: o selo "indisponível" com motivo é o que falta | M |
| 11.2 | Trilha lateral com aba Favoritos e um botão por instância de provedor, com tooltip do motivo quando desabilitada | `apps/web/src/components/chat/ModelPickerSidebar.tsx:38` | não | ADAPTAR: com várias contas (Onda 2) a trilha por conta é necessária | M |
| 11.3 | Estrela para favoritar modelo; a aba Favoritos mostra "No favorites yet" quando vazia | `apps/web/src/components/chat/ModelListRow.tsx:112`; `ModelPickerContent.tsx:442` | não | PEGAR: barato e é o que faz o seletor virar "os meus 3 modelos" | M |
| 11.4 | Busca de modelos com ranking por nome/alias/driver/instância, priorizando nome exato e dando bônus a favoritos | `apps/web/src/components/chat/modelPickerSearch.ts:55` | não | PEGAR: mesma função que o Ctrl K usa | M |
| 11.5 | Salto por tecla 1–9 para escolher o N-ésimo modelo visível, com o atalho na linha | `apps/web/src/components/chat/ModelPickerContent.tsx:813` | não | PEGAR: é o P1-18 do UX-BEYOND | M |
| 11.6 | Modelo indisponível aparece com selo e tooltip explicando por que não pode ser escolhido | `apps/web/src/components/chat/ModelListRow.tsx:140`; `ChatView.logic.ts:1341` | não | PEGAR: "nunca um botão desabilitado sem motivo" | P |
| 11.7 | Rodapé do picker mostra aviso de setup do provedor (instalar/entrar) e de modelo que exige atualizar o CLI | `apps/web/src/components/chat/ModelPickerContent.tsx:1067` | parcial — `connections/` | ADAPTAR | P |
| 11.8 | Coluna de esforço ao lado da lista: níveis como rádio, com marca "Default" e descrição no tooltip | `apps/web/src/components/chat/ComposerModelEffort.tsx:254` | parcial — `profile/PersonaEngineOverlay.tsx` (atrás de flag) | ADAPTAR: o esforço precisa estar no composer, não só no perfil | M |
| 11.9 | Demais opções do modelo (ex.: modo do agente) na mesma coluna, como menu lateral ou switch | `apps/web/src/components/chat/ComposerModelEffort.tsx:374` | não | ADAPTAR | M |
| 11.10 | Controle de velocidade no rodapé: segmentos do service tier ou toggle Fast/Standard | `apps/web/src/components/chat/ComposerModelEffort.tsx:573` | não | ADAPTAR: só se o motor expuser tier | M |
| 11.11 | Sufixo no gatilho do composer com a palavra do esforço ou barras, raio de Fast e janela de contexto | `apps/web/src/components/chat/ComposerModelEffort.tsx:89` | não | ADAPTAR: o chip do composer dizendo "Alto · 200k" | M |
| 11.12 | Preferência "Effort display" entre palavra (padrão) e barras | `apps/web/src/components/settings/AppearanceSettingsPanel.tsx:296` | não | IGNORAR: preferência de gosto, não de produto | P |
| 11.13 | "Ultrathink" digitado no prompt trava os níveis de esforço e avisa para remover do texto | `apps/web/src/components/chat/TraitsPicker.tsx:372` | não | IGNORAR: truque de um provedor só | M |
| 11.14 | Níveis de thinking derivados do modelo, com xhigh/max só por opt-in e default no nível mais próximo | `packages/provider-pi/src/server/thinkingCapabilities.ts:24` | não | ADAPTAR: o esforço deve seguir o que o motor aceita | M |
| 11.15 | Troca de provedor no meio da thread via handoff, com linha "Context handoff pending" antes do envio e divisória no histórico | `apps/web/src/components/ChatView.tsx:2462`; `chat/V2LifecycleRow.tsx:630` | não | PEGAR: é a nossa troca de motor com Chain of Recall | G |
| 11.16 | Quando a thread não suporta handoff, o picker trava o driver e os outros provedores ficam desabilitados com tooltip | `apps/web/src/components/ChatView.tsx:1244`; `ChatView.logic.ts:916` | não | PEGAR: a regra "não ofereça o que vai falhar" | M |
| 11.17 | Lista de instâncias de provedor com status, habilitar/desabilitar, atualizar e "Checked <tempo>" | `apps/web/src/components/settings/ProviderSettingsPanel.tsx:534` | parcial — `connections/` | ADAPTAR | M |
| 11.18 | Assistente "Add provider" com grade de drivers, busca no ACP Registry, comando local, rótulo, cor e config | `apps/web/src/components/settings/AddProviderInstanceDialog.tsx:146` | parcial — `connections/AccountDialogs.tsx` | ADAPTAR: a grade com busca é melhor que a nossa lista | G |
| 11.19 | Seção de conta: escolher método de login, abrir navegador/copiar link, cancelar, trocar conta, sair e revelar e-mail | `apps/web/src/components/settings/ProviderAuthenticationSection.tsx:29` | parcial | ADAPTAR | G |
| 11.20 | Banner de status do provedor no chat para não autenticado ou versão quebrada, com refresh e abrir setup | `apps/web/src/components/chat/ProviderStatusBanner.tsx:96` | parcial — `chat/EngineMissingBanner.tsx` | ADAPTAR | M |
| 11.21 | Aba Limits agrupando por provedor todas as contas, um segmento por conta por janela, ordem por próximo refill | `apps/web/src/components/usage/UsageLimitsPooled.tsx:605` | sim — `usage/UsageLimits.tsx` + `primitives/Pooled.tsx` | IGNORAR: já é nosso e é melhor | G |
| 11.22 | Popover do segmento com plano, onde está logada, reset, "% do pool que volta" e créditos | `apps/web/src/components/usage/UsageLimitsPooled.tsx:136` | parcial | ADAPTAR: o "onde está logada" ajuda com várias contas | M |
| 11.23 | Resgatar crédito de reset ("Use reset") com confirmação e mensagens de resultado | `apps/web/src/components/usage/UsageLimits.tsx:240` | não | ADAPTAR: só se o provedor publicar crédito | M |
| 11.24 | Barra de janela com % restante, marca de ritmo (adiantado/no ritmo/atrasado) e "resets in" | `apps/web/src/components/usage/UsageLimits.tsx:116` | parcial | ADAPTAR: a marca de ritmo é uma boa ideia e é honesta | M |
| 11.25 | `/usage-limits` abre um banner com os limites do provedor atual, sem rodar o agente | `apps/web/src/components/chat/useUsageLimitsPanel.ts:52`; `ComposerUsageLimits.tsx:47` | sim — `/limites` | IGNORAR | M |
| 11.26 | Banner "Usage limit reached" com "Resume at reset", "Snooze until reset"/"Wake now" | `apps/web/src/components/chat/UsageLimitRecoveryBanner.tsx:32` | parcial (P0-19) | PEGAR: é o P0-19 | G |
| 11.27 | Preferências para retomar automaticamente e sonegar threads limitadas até o reset | `apps/web/src/components/settings/SettingsPanels.tsx:1626` | não | PEGAR: junto do 11.26 | P |
| 11.28 | Cartão de detalhes da thread com janelas restantes e barra de contexto com a marca de compactação | `apps/web/src/components/chat/ThreadDetailsUsage.tsx:43` | parcial — `chat/TurnContextDrawer.tsx` | ADAPTAR: a marca "aqui ele resume" é o que falta | M |
| 11.29 | Página Usage com Cost/Tokens/Limits e janelas 24 h/7/30/90 dias | `apps/web/src/components/usage/UsagePage.tsx:177` | parcial — `usage/UsageTokenPanel.tsx`, `usage/LocalInsights.tsx` | ADAPTAR: as janelas de tempo são o que falta | G |
| 11.30 | Visão geral: total, sessões, participação por provedor, aviso de registro sem preço | `apps/web/src/components/usage/UsagePage.tsx:585` | parcial | ADAPTAR | M |
| 11.31 | Gráfico de uso por provedor ao longo de dias/horas, com breakdown por modelo ou por tempo | `apps/web/src/components/usage/UsageProviderChart.tsx:408` | não | ADAPTAR: gráfico só se houver dado real | M |
| 11.32 | Diálogo do modelo com custo, tokens, custo por 1M, cache hit, tendência e "Set price" | `apps/web/src/components/usage/UsageModelDialog.tsx:36` | não | ADAPTAR | M |
| 11.33 | Tabela de preços personalizados: editar taxas, "Map to", "Apply to" por ambiente, "Retry failed saves" | `apps/web/src/components/usage/UsagePriceOverrides.tsx:93` | não | IGNORAR: preço por modelo é complexidade de contabilidade | G |
| 11.34 | Filtros da página Usage por ambiente e por provedor oculto | `apps/web/src/components/usage/UsagePage.tsx:1112` | parcial | ADAPTAR | M |
| 11.35 | Leitura dos limites do OpenCode Go (5 h/semanal/mensal) pela API, exigindo API key | `packages/provider-opencode/src/server/usageLimits.ts:87` | não | ADAPTAR: quando o motor publicar, ler | M |
| 11.36 | Adicionar/remover hub CLIProxyAPI, guardando a management key como segredo | `apps/web/src/components/settings/UsageProviderSettings.tsx:20` | não | IGNORAR | M |
| 11.37 | Modelo de fallback usado em threads novas quando o padrão está sem cota, com banner "Using <modelo>" | `apps/web/src/components/settings/ProjectDefaultsSettings.tsx:255`; `ComposerUsageLimits.tsx:72` | não | PEGAR: é a resposta certa para "acabou a cota do Claude" | M |
| 11.38 | Gerenciar modelos por instância: adicionar/editar/remover custom, ocultar, reordenar e favoritar | `apps/web/src/components/settings/ProviderModelsSection.tsx:122` | não | ADAPTAR | G |
| 11.39 | Provider de replay semeado em servidor de dev para testar a UI sem modelo pago | `apps/server/src/provider/ProviderInstanceRegistryHydration.ts:92` | não | PEGAR: a Persona precisa disso para dogfood sem gastar | P |
| 11.40 | Manifesto de modelos empacotado, atualizável remotamente, com modelos marcados "update required" | `docs/internals/model-manifest.md:1` | não | ADAPTAR | M |

**Notas da área:**
- Defaults: esforço aparece como **palavra** (`effortDisplay: "label"`), medidor de contexto **desligado**, auto-resume e snooze de thread limitada **desligados** (`packages/contracts/src/settings.ts:398`, `:505`, `:1337`).
- O refresh automático de limites é limitado a **uma vez a cada 5 minutos por ambiente**, inclusive depois de falha (`packages/client-runtime/src/state/usage.ts:40`).
- Pooling: Codex agrupa janelas por `kind`; os outros drivers por `kind:id`; a mesma conta vista em vários ambientes conta **uma vez** (`packages/shared/src/usageLimits.ts:510`, `:218`).
- Existem exatamente 9 comandos de salto (`modelPicker.jump.1`…`9`), além de `modelPicker.toggle/previousProvider/nextProvider` (`packages/contracts/src/keybindings.ts:23`).
- Troca de provider em thread iniciada depende da capability `supportsProviderSwitchingViaHandoff`; sem ela o picker bloqueia o driver (`docs/orchestration-v2/provider-capability-system.md:31`; `ChatView.logic.ts:916`).
- O handoff padrão ao voltar a um provedor é retomar a provider-thread anterior e injetar um **resumo delta** (`docs/orchestration-v2/provider-switching-and-context.md:9`).
- Ao adicionar uma segunda conta Codex/Claude já logada, aparece "We do not recommend managing multiple accounts" (`apps/web/src/components/settings/MultipleAccountsNote.tsx:17`).
- Resgatar crédito de reset exige escopo de gerenciar providers e confirmação explícita, porque consome o crédito sem desfazer (`UsageLimits.tsx:240`, `:273`).

---

## §12 · Git e worktrees

A Persona aplica mudanças na pasta e tem Desfazer de 30 dias; não tem worktree, branch, commit nem PR. Para a Persona, o valor não é "ser um cliente Git" — é o **checkpoint por turno** e o **commit gerado pela IA**.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 12.1 | Seletor de workspace no composer alterna entre checkout atual e "Novo worktree" | `apps/web/src/components/BranchToolbarEnvModeSelector.tsx:61`; `BranchToolbar.tsx:416` | não | IGNORAR: a Persona trabalha na pasta do projeto | P |
| 12.2 | Menu "Workspace" repete Current checkout / New worktree / Previous worktree | `apps/web/src/components/BranchToolbar.tsx:394-426` | não | IGNORAR | P |
| 12.3 | "Previous worktree (branch)" reusa o último worktree de outra thread ativa | `BranchToolbar.tsx:634-650`; `BranchToolbar.logic.ts:119` | não | IGNORAR | P |
| 12.4 | Picker de branch base: busca, refs locais/remotos, paginação e badges | `apps/web/src/components/WorktreeBaseBranchPicker.tsx:14`; `BranchPicker.tsx:259-268` | não | ADAPTAR: se houver branch, o picker serve | M |
| 12.5 | Branch base é preenchida sozinha com a default do repo na primeira carga | `BranchToolbarBranchSelector.tsx:494-520` | não | PEGAR o princípio: nunca pedir o que dá para deduzir | P |
| 12.6 | "Start from remote" usa o último commit do upstream em vez do local | `BranchPicker.tsx:222` | não | ADAPTAR | P |
| 12.7 | Pasta do worktree é derivada do nome da branch (`/` → `-`) | `apps/server/src/vcs/GitVcsDriverCore.ts:4242` | não | IGNORAR | P |
| 12.8 | Nome da branch do worktree é gerado pelo modelo a partir da 1ª mensagem | `settings/BranchNamingSettings.tsx:26`; `ThreadLaunchService.ts:338-370` | não | ADAPTAR: é a mesma ideia do título gerado | M |
| 12.9 | Worktree é criado no envio da 1ª mensagem, com base e `startFromOrigin` | `chat/useComposerSend.ts:1347-1355`; `GitVcsDriverCore.ts:4218` | não | IGNORAR | G |
| 12.10 | Card de setup do worktree mostra etapas (fetch, checkout, submodules, setup script, agent), tempo e Cancel/Work locally | `chat/WorktreeSetupCard.tsx:314-388`; `useWorktreeSetup.ts:134` | não | ADAPTAR: o card de etapas com tempo é ótimo padrão para "preparando" | M |
| 12.11 | "Run on" escolhe a máquina/ambiente da thread | `BranchToolbarEnvironmentSelector.tsx:57-100` | não | IGNORAR | M |
| 12.12 | Caminho UNC do WSL é convertido e roteado ao backend WSL correspondente | `apps/web/src/wslPaths.ts:30-63`; `CommandPalette.tsx:2697` | não | IGNORAR | M |
| 12.13 | Trocar a branch da thread: checkout no worktree ou no local, com atualização otimista e rollback em erro | `BranchToolbarBranchSelector.tsx:386-430` | não | ADAPTAR: o padrão otimista com rollback | M |
| 12.14 | Criar branch pelo texto digitado no picker e já trocar | `BranchToolbarBranchSelector.tsx:448-470` | não | ADAPTAR | P |
| 12.15 | Se a branch já está checada em outro worktree, reusa esse worktree em vez de fazer checkout | `BranchToolbar.logic.ts:249` | não | IGNORAR | M |
| 12.16 | Digitar uma referência de PR no picker oferece "Checkout PR" | `BranchToolbarBranchSelector.tsx:247-250` | não | IGNORAR | P |
| 12.17 | Aviso "You're currently checked out on another branch" + diálogo "Switch to <branch>?" com mudanças não commitadas | `sidebar/SidebarThreadRow.tsx:299-305`; `chat/ChatOverlayHosts.tsx:140` | não | ADAPTAR | M |
| 12.18 | Ao deletar a última thread de um worktree, pergunta "Delete the worktree too?" e remove com `force` | `apps/web/src/hooks/useThreadActions.ts:522-537`; `:599` | não | IGNORAR | M |
| 12.19 | Detecta se o worktree é órfão ou compartilhado antes de oferecer removê-lo | `apps/web/src/worktreeCleanup.ts:5-31` | não | PEGAR o princípio: nunca apagar o que outra pessoa usa | P |
| 12.20 | Regras de limpeza automática: inativos por dias, settled, merged, unchanged e ao deletar thread | `settings/StorageSettings.tsx:524-700`; `apps/server/src/storageCleanup.ts:800` | não | ADAPTAR: a Persona precisa de limpeza de histórico/artefatos | G |
| 12.21 | "Delete now" executa e mostra relatório (removidos/mantidos com motivo, bytes, falhas) | `StorageSettings.tsx:347-400`; `storageCleanup.ts:447-535` | não | PEGAR: relatório com motivo é a nossa regra | M |
| 12.22 | "Keep worktrees with local changes" decide se arquivos ignorados protegem o worktree | `StorageSettings.tsx:663-700` | não | ADAPTAR | P |
| 12.23 | Barra de git actions: ação rápida contextual + menu + linha "Changes +N −N" | `GitActionsControl.logic.ts:177`; `GitActionsControl.tsx:1506`; `:1632` | não | ADAPTAR | G |
| 12.24 | Diálogo de commit com seleção de arquivos, mensagem opcional (gerada se vazia) e totais do subconjunto | `GitActionsControl.tsx:1694`; `:1064` | não | PEGAR: é a tarefa que a equipe faz sozinha | M |
| 12.25 | Detecção de repositório: sem repo, a barra vira "Initialize Git" | `GitActionsControl.tsx:1501`; `ChatView.tsx:1717` | não | ADAPTAR | P |
| 12.26 | Submodules no worktree novo: recursive / top-level / skip, com override por projeto | `settings/ProjectDefaultsSettings.tsx:527`; `GitVcsDriverCore.ts:4315-4365` | não | IGNORAR | M |
| 12.27 | **Checkpoint automático por turno** em `refs/t3/checkpoints/...` (captura, baseline, restore e diff) | `apps/server/src/checkpointing/CheckpointStore.ts:93`; `CheckpointCaptureService.ts:43` | parcial — Desfazer 30 dias no Revisar | PEGAR: é o que permite "voltar o turno" sem git | G |
| 12.28 | Revert de turno com "Revert files too" vs "Revert and keep changes" | `chat/ChatOverlayHosts.tsx:193`; `chat/chatViewSend.ts:206-217` | parcial | PEGAR: as duas opções são a diferença entre confiar e não confiar | M |
| 12.29 | Diff pane mostra o checkpoint por turno (latest/turn N), com ignorar espaço | `DiffPanel.tsx:350-365` | parcial | ADAPTAR | M |
| 12.30 | Diff pane lista os commits da branch (últimos 100) e compara com a base selecionável | `DiffPanel.tsx:401-412`; `:898` | não | IGNORAR | M |
| 12.31 | PR vinculado à thread: badge no composer, painel "Linked pull requests", link/unlink e watching | `BranchToolbarBranchSelector.tsx:694-705`; `pullRequest/ThreadPullRequestsPanel.tsx:364` | não | IGNORAR | G |
| 12.32 | Integração com 6 hosts (GitHub, GitLab, GitCafe, Forgejo, Bitbucket, Azure DevOps) | `packages/source-control-definitions/src/registry.ts:18-31` | não | IGNORAR | G |
| 12.33 | Clique em link de PR/commit abre no app (diff do commit) ou no navegador, respeitando modificadores | `apps/web/src/lib/openPullRequestLink.ts:49-140` | não | IGNORAR | M |
| 12.34 | "Resolve conflicts" prepara o checkout e injeta prompt para o agente resolver | `pullRequest/PullRequestDetailPanel.tsx:1098`; `pullRequestDetail.logic.ts:1059` | parcial — `review/simple/ConflictChoices.tsx` | ADAPTAR | M |

**Notas da área:**
- Worktrees ficam em `~/.t3/worktrees`; `worktreesDirectory` precisa ser caminho absoluto e não raiz de drive (`GitVcsDriverCore.ts:4228-4240`).
- `git worktree add` deixa submodules vazios; o T3 roda `submodule init` + `update --init` depois, e falha de submodule só gera **warning** (`GitVcsDriverCore.ts:4315-4377`).
- O prompt de deletar worktree só aparece quando a thread é a **única dona** do caminho, há escopo `source-control:write` e a política `worktreeOnDelete` está desligada (`useThreadActions.ts:522`; `worktreeCleanup.ts:20-30`).
- Limpeza só remove worktrees gerenciadas pelo T3; pastas no diretório sem thread são apenas **listadas com tamanho** e nunca apagadas (`storageCleanup.ts:447-535`; `:83`).
- Default de "Keep worktrees with local changes" é `uncommitted-changes`: protege edits e untracked, mas apaga ignorados como `.env` (`StorageSettings.tsx:663-680`).
- Nome de branch começa **temporário** e só é renomeado quando a geração do modelo termina (`ThreadLaunchService.ts:490-500`).
- **Não existe git stash**: o "Stash" da UI é stash de prompt do compositor (`apps/web/src/promptStashStore.ts:11`), e push com mudanças locais é bloqueado com "Commit or stash local changes before pushing." (`GitActionsControl.tsx:247`).
- Criar/remover worktree, criar/trocar ref, pull e ações empilhadas exigem escopo `source-control:write` (`packages/contracts/src/clientRpcPermissions.ts:52-56`).

---

## §13 · Notificações e background

A Persona tem a **mecânica** pronta (`apps/desktop/src/notifications.ts`, `apps/desktop/src/background-notice.ts`, `apps/desktop/src/always-on-ipc.ts`) mas **nenhum aviso sai**: o renderer nunca chama `personaAlwaysOn.attention` e o `needsYouCount` da bandeja não está no preload (UX-BEYOND P0-16 / IV-2). O T3 tem a política inteira — e, de propósito, **vem desligada por padrão**.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 13.1 | Detecta transições de estado da thread (concluído, falhou, aprovação, pergunta, limite, convidado) e dispara **uma** notificação por mudança, ignorando a primeira aparição e runs parados | `apps/web/src/components/ThreadNotificationCoordinator.logic.ts:21`; `ThreadNotificationCoordinator.tsx:283` | não — a lógica existe no desktop, sem gatilho | PEGAR: é o P0-16 | M |
| 13.2 | Título muda por estado: "Thread completed", "Approval needed", "Thread failed", "Usage limit reached", "Input needed" | `apps/web/src/components/ThreadNotificationCoordinator.tsx:131` | não | ADAPTAR: "Nina terminou *Pesquisa de preços*" com o rosto | P |
| 13.3 | Deduplica por thread com tag hash de 16 hex, substituindo a anterior da mesma thread | `apps/web/src/threadNotifications.ts:28`; `ThreadNotificationCoordinator.tsx:71` | não | PEGAR: sem isso, 10 turnos = 10 avisos | P |
| 13.4 | Fecha a notificação e o toast abertos quando a thread é arquivada ou escondida pelo filtro | `apps/web/src/components/ThreadNotificationCoordinator.tsx:89` | não | PEGAR: aviso de coisa que não existe mais é mentira | P |
| 13.5 | **Não** notifica quando a janela está visível e focada | `apps/web/src/components/ThreadNotificationCoordinator.tsx:189` | não | PEGAR: é a regra do UX-BEYOND §14 | P |
| 13.6 | Toca som de conclusão ou de pergunta (dois MP3), decodificados antes e coalescidos por som para não clipar | `apps/web/src/threadNotifications.ts:115` | não | ADAPTAR: o P1-15 do UX-BEYOND pede exatamente isso, desligado por padrão | M |
| 13.7 | Toast in-app com ícone por estado e ação "Open thread" | `apps/web/src/components/ThreadNotificationCoordinator.tsx:155` | parcial — `primitives/Feedback.tsx` | ADAPTAR | M |
| 13.8 | Badge/contador no dock (macOS/Linux) e overlay na barra de tarefas (Windows), zerado ao focar a janela | `apps/desktop/src/ipc/methods/notificationBadge.ts:20`; `ThreadNotificationCoordinator.tsx:78` | parcial — `needsYouCount` existe, não está no preload | PEGAR: é o P0-16 | M |
| 13.9 | Troca o favicon por um contador desenhado em canvas, no navegador | `apps/web/src/threadNotifications.ts:41` | n/a | IGNORAR: a Persona é desktop | P |
| 13.10 | Clique na notificação abre a thread e revela/foca a janela | `apps/web/src/components/ThreadNotificationCoordinator.tsx:205`; `apps/desktop/src/ipc/methods/window.ts:436` | não | PEGAR | P |
| 13.11 | Modo de notificação (Desligado / Só notificação / Só som / Notificação com som) com pedido de permissão | `apps/web/src/components/settings/NotificationSettings.tsx:26` | não | PEGAR: as 4 opções resolvem o "quero silêncio" sem esconder a configuração | M |
| 13.12 | Título da janela mostra o nome do ambiente | `apps/desktop/src/window/DesktopWindow.ts:697` | não | ADAPTAR: "Persona — #geral" identifica a janela na barra | P |
| 13.13 | Anúncios `aria-live` para leitor de tela (Working, Needs approval, Needs your input, Done, Failed, Stopped) na thread aberta e nas de background | `apps/web/src/components/chat/ThreadActivityAnnouncer.tsx:14`; `BackgroundThreadAnnouncer.tsx:33` | não | PEGAR: a Persona trabalha sozinha; quem não vê a tela precisa saber | M |
| 13.14 | Linha de "precisa de você" no fim da timeline com `role="alert"` | `apps/web/src/components/chat/ThreadNow.tsx:97` | parcial | ADAPTAR | P |
| 13.15 | Pílula de status na sidebar: Pending Approval, Awaiting Input, Working, Waiting, Failed, Plan Ready, Completed | `apps/web/src/components/Sidebar.logic.ts:1091` | parcial — `shell/RailTeam.tsx`, `chat/TeamLine.tsx` | ADAPTAR: a pílula precisa dizer **o quê**, não só o estado | P |
| 13.16 | Menu de soneca com presets e "Custom…" | `apps/web/src/components/Sidebar.tsx:2330` | não (P1-20) | PEGAR: é o "Lembrar depois" do T3-UX-HARVEST §10 | M |
| 13.17 | Diálogo de soneca por data/hora ou duração, validando horário futuro | `apps/web/src/components/CustomSnoozeDialog.tsx:41` | não | PEGAR | M |
| 13.18 | Permissão de notificação no mobile e canal Android "agent-alerts" com importance HIGH | `apps/mobile/src/features/agent-awareness/notificationPermissions.ts:33` | n/a | IGNORAR | M |
| 13.19 | Suprime o banner só para a thread que está na tela, no foreground do mobile | `apps/mobile/src/features/agent-awareness/foregroundNotificationBehavior.ts:19` | n/a | IGNORAR | P |
| 13.20 | Toque na notificação abre o deep link da thread, inclusive no cold start | `apps/mobile/src/features/agent-awareness/notificationNavigation.ts:21` | n/a | IGNORAR | M |
| 13.21 | Handler nativo Android consome FCM sem o JS rodando, checando device/user, frescor e permissão | `apps/mobile/modules/t3-agent-notifications/android/.../AgentNotifications.kt:21` | n/a | IGNORAR | G |
| 13.22 | Agrupa alertas Android por thread e cria resumo InboxStyle | `apps/mobile/modules/t3-agent-notifications/android/.../AgentNotifications.kt:170` | n/a | IGNORAR | M |
| 13.23 | Cartão "ongoing activity" no Android com chip (Working/Approve/Answer), dismiss e expiração | `.../AgentNotifications.kt:285`; `AgentActivityPresentation.kt:21` | n/a | IGNORAR | G |
| 13.24 | Tela de notificações do mobile: Device Notifications, Live Activity Updates, Live Update Settings | `apps/mobile/src/features/settings/SettingsNotificationsRouteScreen.tsx:427`; `:441`; `:474` | n/a | IGNORAR | M |
| 13.25 | Registra o dispositivo no relay (token APNs/FCM, preferências) e re-registra ao voltar ao foreground | `apps/mobile/src/features/agent-awareness/remoteRegistration.ts:631`; `:723` | n/a | IGNORAR | G |
| 13.26 | Relay agrupa threads num alerta ("2 agents need attention") e só alerta conclusão/falha com até 2 min de idade | `infra/relay/src/agentActivity/agentActivityAlerts.ts:125`; `:14` | n/a | IGNORAR | M |
| 13.27 | Instala/consulta/reinicia/remove o servidor como serviço de usuário (systemd/launchd) | `apps/server/src/cli/service.ts:217`; `apps/server/src/cloud/bootService.ts:95` | não | IGNORAR: a Persona é app desktop | G |
| 13.28 | Lê e grava `service.env`, preservando o arquivo entre instalações e updates | `apps/server/src/cli/service.ts:66` | não | IGNORAR | M |
| 13.29 | `t3 service protect` protege a memória do servidor contra agentes, com `--undo` | `apps/server/src/cli/service.ts:352` | não | IGNORAR | M |
| 13.30 | Fechar a última janela encerra o app (fora do macOS), parando o servidor local; o serviço instalado continua | `apps/desktop/src/app/DesktopLifecycle.ts:291` | parcial — `apps/desktop/src/always-on-ipc.ts` | ADAPTAR: a Persona precisa de "continuar trabalhando com a janela fechada" | P |

**Notas da área:**
- Defaults do T3: `notificationMode = "off"` e `inAppNotificationsEnabled = false`; ambos são preferência **por dispositivo** (`packages/contracts/src/settings.ts:390-393`). É a política certa para a Persona também.
- Notificação do SO no web exige `Notification.permission === "granted"` e contexto seguro; sem isso o app oferece só "sound only" (`ThreadNotificationCoordinator.tsx:193`; `NotificationSettings.tsx:43`).
- A tag do Windows é um hash FNV de 16 hex porque toasts com a tag de 73 caracteres (ambiente/thread) são **descartados** (`apps/web/src/threadNotifications.ts:27-37`).
- O desktop **não tem tray/menu-bar icon** (nenhum `Tray` em `apps/desktop`); o indicador é dock badge/overlay. Windows não tem serviço de background — só Linux/systemd e macOS/launchd (`apps/server/src/cli/service.ts:157`).
- Eventos de lock/unlock/suspend/resume do SO vão **só para telemetria**; não silenciam nem disparam notificações (`apps/desktop/src/telemetry/DesktopTelemetryPublisher.ts:186-192`).
- O mobile registra as preferências por fase fixas em `true` (aprovação, entrada, conclusão, falha); não há UI para desligá-las separadamente (`apps/mobile/src/features/agent-awareness/registrationPayload.ts:43-47`).
- Limites do relay/Android: linha running expira em 2 h, waiting em 24 h, cartão concluído em 15 min, mensagens FCM em 5 min com dead-letter (`infra/relay/src/agentActivity/agentActivityPayloads.ts:16-17`; `agentActivityAggregate.ts:58`; `FcmDeliveries.ts:190`).
- Soneca só silencia os anúncios de leitor de tela; o coordenador de notificações web **não** filtra threads snoozed (`apps/web/src/components/backgroundThreadAnnouncement.ts:66`).

---

## §14 · Estados vazios, erro, carregando e acessibilidade

A Persona já tem `EmptyState`, `Skeleton`, `Toast`/`ToastRegion`, `PanelBoundary`, `RunErrorCard` e 38 usos de `aria-live`. O que falta é **cobertura** (quase todo vazio do T3 tem uma variante específica) e o **anúncio de segundo plano**.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 14.1 | Estado vazio com título, descrição, mídia (glifo duplicado decorativo) e ações, em 3 tamanhos (`compact`/`default`/`hero`) | `apps/web/src/components/ui/empty.tsx:12` | sim — `primitives/` `EmptyState` | ADAPTAR: conferir se temos os 3 tamanhos | P |
| 14.2 | Esqueleto com formas `block`/`card`/`pill`, animação só sob `motion-safe` | `apps/web/src/components/ui/skeleton.tsx:16` | sim — `primitives/` `Skeleton` | IGNORAR | P |
| 14.3 | Spinner com `role="status"` e `aria-label="Loading"`, que pausa fora da viewport, com aba oculta ou reduced-motion | `apps/web/src/components/ui/spinner.tsx:23`; `apps/web/src/lib/visibleAnimation.ts:24` | parcial | PEGAR: a pausa é o item de GPU mais barato do inventário | P |
| 14.4 | Vazio "sem projeto": herói "What should we work on?" com "Add project" e "Start without a project" | `apps/web/src/components/NoProjectsHero.tsx:13` | sim — `overview/`, `onboarding/` | IGNORAR | P |
| 14.5 | Vazio "sem thread": "Pick a thread to continue" com cabeçalho "No active thread" | `apps/web/src/components/NoActiveThreadState.tsx:6` | parcial — `overview/OverviewView.tsx` cobre o estado, sem o texto de "escolha uma conversa" | ADAPTAR | P |
| 14.6 | Vazio "sem computador": "No computer connected"/"This computer is off" com passos numerados, login e link de download | `apps/web/src/components/HostedEmptyState.tsx:21` | parcial — `chat/EngineMissingBanner.tsx` | ADAPTAR: os passos numerados com comando copiável | M |
| 14.7 | Vazio "sem terminal" com botão de nova sessão (desabilitado sem permissão) | `apps/web/src/components/ThreadTerminalDrawer.tsx:1817` | n/a — não temos terminal | IGNORAR: só existe com terminal (§6) | P |
| 14.8 | Vazio do diff em 4 variantes: sem thread, projeto não é git, sem turno concluído, sem mudança líquida | `apps/web/src/components/DiffPanel.tsx:1283`; `:1291`; `:1368` | parcial — `review/simple/` | PEGAR: as 4 variantes evitam o "vazio genérico" | P |
| 14.9 | Vazio do preview: "No preview yet" com instrução, ou lista de recentes e servidores descobertos | `apps/web/src/components/preview/PreviewEmptyState.tsx:41` | n/a | IGNORAR | P |
| 14.10 | Vazio da lista de PRs em 4 variantes (sem projeto, nada sob filtro, sem PR, busca vazia) com "Clear search"/"Check again"/"Load more" | `apps/web/src/components/pullRequest/PullRequestListEmptyState.tsx:48` | não | ADAPTAR: a mesma lógica para Quadros/Arquivos/Rotinas | M |
| 14.11 | Vazio da sidebar: "No projects yet" com botão inline, ou "No threads yet"/"No threads in {projeto} yet" | `apps/web/src/components/Sidebar.tsx:3638` | parcial | ADAPTAR: é o PB-5 do UX-BEYOND | P |
| 14.12 | Busca de threads na sidebar: `role="status"` com "Searching thread messages…" ou "No threads found" | `apps/web/src/components/Sidebar.tsx:3282` | parcial — `remote/ConnectedSearchView.tsx` | ADAPTAR | P |
| 14.13 | Paleta sem resultado: "No matching commands, projects, or threads." ou "No matching actions." | `apps/web/src/components/CommandPaletteResults.tsx:37` | parcial | ADAPTAR | P |
| 14.14 | Composer sem provider: "No provider available" ou "Open provider settings" com ícone de alerta | `apps/web/src/components/chat/ComposerControlsBar.tsx:267` | sim — `chat/EngineMissingBanner.tsx` | IGNORAR | P |
| 14.15 | Sem conta: item "Sign in to T3 Connect" na sidebar | `apps/web/src/components/clerk/T3ConnectSidebarSignIn.tsx:61` | não | IGNORAR: a Persona é local-first | P |
| 14.16 | Página de erro raiz do router: "Something went wrong." + "Try again"/"Reload app"/"Copy error" e o erro em `<pre>` | `apps/web/src/routes/__root.tsx:227` | parcial — `primitives/PanelBoundary.tsx` | PEGAR: o "Copy error" é o que faz o relato chegar útil | M |
| 14.17 | Página 404 com explicação e "Go home" | `apps/web/src/routes/__root.tsx:116` | parcial | ADAPTAR | P |
| 14.18 | Recuperação de primeira execução: "Could not read settings"/"Still connecting" com "Retry"/"Reload" | `apps/web/src/components/onboarding/FirstRunGate.tsx:183` | parcial | ADAPTAR | P |
| 14.19 | Banner de erro da thread (`role="alert"`), texto expansível, dispensável por sessão | `apps/web/src/components/chat/ThreadErrorBanner.tsx:72` | parcial | ADAPTAR | M |
| 14.20 | Banner de limite de uso com variante warning e "Copy request for admin" | `apps/web/src/components/chat/ThreadErrorBanner.tsx:98` | parcial — `chat/LimitBanner.tsx` | ADAPTAR | M |
| 14.21 | Banner de ambiente offline/reconectando com diagnóstico, "Reconnect" e "Disconnect server" (com carência) | `apps/web/src/components/chat/useSystemComposerBanners.tsx:192` | parcial — `shell/rail-pill.ts` | ADAPTAR: a carência evita piscar "offline" a cada soluço | M |
| 14.22 | Banner de atualização do servidor: "Updating"/"Could not update", estágio, "Retry" e dispensa | `apps/web/src/components/chat/useSystemComposerBanners.tsx:230` | não | ADAPTAR: junto do §16 | M |
| 14.23 | Toast de envio bloqueado: "Not connected: message not sent" | `apps/web/src/components/chat/useComposerSend.ts:482` | parcial (P0-30) | PEGAR: é o P0-30 | P |
| 14.24 | Toasts de conteúdo grande: "Pasted text is too large for this message"/"…to attach" | `apps/web/src/components/chat/useComposerAttachmentIntake.ts:400` | não | PEGAR: junto do composer (§2) | P |
| 14.25 | Falha ao carregar PRs: "Could not load pull requests" com erro, "Retry" (`aria-busy`) e link para o host | `apps/web/src/components/pullRequest/PullRequestsUnavailableState.tsx:8` | não | ADAPTAR | P |
| 14.26 | Falha de autenticação de provider: mensagem do erro e "Retry sign-in"/"Retry connection" | `apps/web/src/components/settings/ProviderAuthenticationSection.tsx:100` | parcial — `connections/AccountDialogs.tsx` | ADAPTAR | P |
| 14.27 | Permissão negada em provider: linha "Limited permissions" explicando que a sessão só visualiza | `apps/web/src/components/settings/ProviderSettingsPanel.tsx:1034` | não | ADAPTAR | P |
| 14.28 | Error boundary de render com `fallback` e `resetKeys` que rearma o boundary quando as chaves mudam | `apps/web/src/components/RenderErrorBoundary.tsx:14` | parcial — `primitives/PanelBoundary.tsx` | PEGAR: `resetKeys` é o que falta para o boundary não ficar preso | P |
| 14.29 | Carregamento do diff: esqueleto com `role="status"`, `aria-live="polite"` e rótulo textual | `apps/web/src/components/DiffPanelShell.tsx:92` | parcial | ADAPTAR | P |
| 14.30 | Sistema de toasts: tipos error/info/loading/success/warning, copiar erro, detalhes expansíveis, dispensar no canto | `apps/web/src/components/ui/toast.tsx:97`; `:544` | parcial — `primitives/Feedback.tsx` | ADAPTAR: falta o "Copiar erro" e os detalhes expansíveis | G |
| 14.31 | Região viva reutilizável escrita direto no DOM, que limpa o texto após 7 s e usa NBSP para repetição idêntica | `apps/web/src/hooks/useLiveRegion.ts:6` | não | PEGAR: sem o NBSP o leitor ignora a segunda mensagem igual | P |
| 14.32 | Anúncio para leitor de tela das threads em segundo plano (região `aria-live="polite"` fora da sidebar) | `apps/web/src/components/BackgroundThreadAnnouncer.tsx:88` | não | PEGAR: a Persona trabalha sozinha; quem não vê a tela precisa saber | M |
| 14.33 | Anúncio da atividade da thread aberta (início/fim de turno, pedidos) | `apps/web/src/components/chat/ThreadActivityAnnouncer.tsx:12` | parcial | ADAPTAR | M |
| 14.34 | Ciclo F6/Shift+F6 entre áreas, restaurando o último controle focado por área, pulando ocultas e recusando dentro de diálogos | `apps/web/src/lib/workspaceFocus.ts:12`; `:333`; `apps/web/src/components/AppSidebarLayout.tsx:175` | sim — `shell/area-navigation.ts` | ADAPTAR: falta marcar o `TurnContextDrawer` como parada (P1-17) | G |
| 14.35 | Foco preso em modal: foco inicial, fechamento por Esc e botão "Close" rotulado | `apps/web/src/components/ui/dialog.tsx:84`; `:121` | parcial — `primitives/Overlays.tsx` | ADAPTAR: o teste de contrato do F-6 | M |
| 14.36 | Foco da paleta: inicial no campo de busca e `finalFocus` devolvendo ao composer/controle anterior | `apps/web/src/components/ui/command.tsx:73`; `CommandPalette.tsx:361` | parcial | ADAPTAR | P |
| 14.37 | Navegação por teclado na sidebar: setas/Home/End movem sem abrir, Left/Right expandem, Shift+F10 abre menu, foco recuperado após remontagem | `apps/web/src/lib/sidebarTree.ts:12` | parcial — `shell/rail-roving-focus.ts` | ADAPTAR: Home/End e o "foco recuperado" | G |
| 14.38 | Navegação por teclado na lista de seções de Configurações: um tab stop, setas/Home/End sem abrir | `apps/web/src/components/settings/useSettingsSectionNavigation.ts:9` | não | PEGAR: barato e é o padrão de app de verdade | M |
| 14.39 | Reduced-motion respeitado em esqueleto, spinner e transições | `apps/web/src/index.css:638`; `apps/web/src/components/ui/skeleton.tsx:5` | sim — 61 CSS | IGNORAR | P |
| 14.40 | Ajuste de contraste por variáveis (`--appearance-contrast-boost`) que misturam texto, borda, placeholder e sidebar | `apps/web/src/index.css:94` | parcial — `theme/` | ADAPTAR: é o que resolve o P0-21 (axe no rail) de forma sistêmica | M |

**Notas da área:**
- O toast só desconta o tempo de exibição enquanto `document.visibilityState === "visible"` **e** a janela tem foco (`apps/web/src/components/ui/toast.tsx:461`).
- Toasts com `threadRef`/`threadId` só renderizam na thread ativa; os demais são globais (`toast.logic.ts:96`).
- Descrições de erro com ≥180 caracteres recebem `line-clamp-4`; erros ganham "Copy error" salvo `hideCopyButton` (`toast.tsx:107`; `:315`).
- Regiões vivas **deliberadamente não usam `role="status"`**: o comentário no código diz que o Orca 50 mapeia isso para status bar no Chromium e descarta atualizações (`BackgroundThreadAnnouncer.tsx:89`; `ThreadActivityAnnouncer.tsx:52`).
- F6 é registrado em **fase de captura**, para sair de widgets que engolem teclas como o terminal; dentro de diálogo o movimento é recusado mas a tecla é consumida (`AppSidebarLayout.tsx:174`; `:178`).
- Áreas do workspace são `role="region"` com `tabIndex={-1}` e `aria-label`, e ganham contorno de 2 px quando focadas por F6 (`workspaceFocus.ts:12`; `index.css:2572`).
- **Não existe atalho `?` de ajuda**: nenhuma ocorrência de binding para `"?"` nem diálogo de atalhos; a doc manda para Settings → Keybindings (`docs/user/keybindings.md:3`). O P1-22 do UX-BEYOND continua sendo nosso diferencial.

---

## §15 · Onboarding e links de entrada

A Persona tem o onboarding próprio (`onboarding/OnboardingWizard.tsx`, `onboarding/OnboardingFirstDeliveryStep.tsx`, `TeamIntroQueue.tsx`, `VaultCofrePanel.tsx`) e importadores (`importers/ImportWizard.tsx`, `bring-context/`). O que o T3 tem a mais é a **detecção de prontidão por máquina** e o **link de convidado**.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 15.1 | Gate de primeira execução decide entre app ou wizard; após 4 s mostra "Ainda conectando" com Recarregar, e settings ilegíveis mostram "Não consegui ler as configurações" com Tentar de novo | `onboarding/FirstRunGate.tsx:31`; `:92`; `:171` | parcial — `onboarding/OnboardingShellOverlay.tsx` | ADAPTAR: o timeout de 4 s com saída é o que falta | M |
| 15.2 | O wizard só abre sozinho na rota inicial; link direto abre normal | `FirstRunGate.tsx:163`; `onboarding/firstRun.logic.ts:148` | parcial | PEGAR: quem clica num link não quer o wizard na cara | P |
| 15.3 | Pular o setup fechando o diálogo, e retomar depois por `/welcome` | `WelcomeWizard.tsx:229`; `routes/welcome.tsx:26` | parcial — `shell/onboarding-persistence.ts` | ADAPTAR | P |
| 15.4 | Passo Connect lista computadores com checkbox, estado ("Off", "Cliente não suportado" + erro) e auto-seleção dos descobertos | `WelcomeWizard.tsx:353`; `:129` | n/a | IGNORAR: a Persona é um host | M |
| 15.5 | Opção de conta descobre as máquinas e mostra o comando para rodar em cada uma | `WelcomeWizard.tsx:475`; `:544` | n/a | IGNORAR | G |
| 15.6 | "Adicionar computador" expande formulário de pareamento com validação e erro inline | `WelcomeWizard.tsx:555`; `:633` | n/a | IGNORAR | M |
| 15.7 | Continue só habilita quando todos os selecionados conectam; os que falham são pulados com aviso nominal | `onboarding/targetEnvironment.logic.ts:17`; `WelcomeWizard.tsx:440` | não | PEGAR: o "pulado com nome" é a nossa regra de honestidade | P |
| 15.8 | Rodapé do passo Connect mostra o aviso de telemetria (ou o texto da política) e link para a privacidade | `WelcomeWizard.tsx:446` | não | PEGAR: transparência no primeiro contato | P |
| 15.9 | Passo Agents mostra um cartão por máquina para cada CLI, com estados ready/checking/disabled/attention/install/signIn | `WelcomeWizard.tsx:972`; `onboarding/providerReadiness.logic.ts:36` | parcial — `onboarding/harness-from-connections.ts` | PEGAR: os 5 estados por motor são o que falta | M |
| 15.10 | Install/Sign in abre um terminal de setup que **pré-digita** o comando, espera Enter e trata preparing/openFailed/writeFailed com Retry | `WelcomeWizard.tsx:1033`; `:1148` | não | PEGAR: é a melhor ideia do onboarding deles (resolve o P0-26) | G |
| 15.11 | Codex oferece "Continuar com ChatGPT" (OAuth) ou "Usar CLI existente", e permite conectar outra conta sem sair do wizard | `settings/CodexSetupSection.tsx:120`; `:164`; `WelcomeWizard.tsx:859` | parcial — `connections/AccountDialogs.tsx` | ADAPTAR | G |
| 15.12 | Passo Projects escaneia sessões por computador, com spinner, erro por máquina + Retry e aviso de limite atingido | `WelcomeWizard.tsx:1447`; `:1518` | parcial — `importers/ImportWizard.tsx` | ADAPTAR | M |
| 15.13 | Projetos agrupados por repositório, com seleção default de repos git ativos em 30 dias com ≥3 conversas e Select all/none | `onboarding/projectImport.logic.ts:4`; `WelcomeWizard.tsx:1477` | não | PEGAR: o default inteligente é o que evita 40 checkboxes | M |
| 15.14 | Importar cria o projeto e importa threads por candidato, com toast de contagem e aviso de histórico parcial | `WelcomeWizard.tsx:1307`; `:192`; `:1547` | parcial | ADAPTAR | G |
| 15.15 | Limites do scan/import: 100 transcripts, 4 GiB e 100.000 registros por projeto; 200 mensagens e 32 MiB por conversa | `apps/server/src/project/AgentSessionScanner.ts:71`; `:75` | não | PEGAR: sem teto, importar trava o app | M |
| 15.16 | Ao concluir, abre uma thread nova no projeto importado | `routes/welcome.tsx:42` | sim — `onboarding/OnboardingFirstDeliveryStep.tsx` | IGNORAR: a nossa 1ª entrega é melhor | P |
| 15.17 | Home sem projetos oferece "Adicionar projeto" e "Começar sem projeto" | `NoProjectsHero.tsx:38`; `:46` | parcial | ADAPTAR | P |
| 15.18 | Copiar prompt link do rascunho pela paleta, com toast e limite de 8.000 caracteres | `CommandPalette.tsx:1364`; `promptLinks/copyPromptLink.ts:22` | não | ADAPTAR: útil para o LAUNCH-KIT da Persona | M |
| 15.19 | Landing do prompt link mostra o prompt, alerta de caracteres ocultos e escolha app/desktop com "Lembrar minha escolha" | `promptLinks/HostedPromptLinkLanding.tsx:22`; `:166` | não | ADAPTAR: junto do marketing | M |
| 15.20 | Prompt de link entra como **rascunho** (nunca executa), avisa sobre caracteres invisíveis removidos e pede confirmação para substituir rascunho | `promptLinks/linkedPrompt.ts:7`; `:42`; `ThreadLinkPrompt.tsx:24` | não | PEGAR: é a regra de segurança certa para qualquer link | M |
| 15.21 | Link com repo ausente oferece "Clonar" ou "Usar sem projeto"; link de PR só faz checkout após confirmação | `promptLinks/NewThreadLinkView.tsx:370`; `:394` | não | ADAPTAR | G |
| 15.22 | Compartilhar thread com convidado cria link de uso único (24 h, um navegador), avisa "um novo link encerra o atual" e permite parar | `chat/GuestShareControls.tsx:83`; `:136`; `:201` | não | ADAPTAR: convidar cliente para ver o trabalho é o nosso caso | M |
| 15.23 | Página do convidado pede só um nome, sem conta | `guest/GuestPage.tsx:352`; `:374` | não | PEGAR: fricção zero para o convidado | M |
| 15.24 | Mensagens do convidado ficam pendentes com Enviar/Descartar, badge "Guest Request", anexos limitados a 4 arquivos/10 MB | `GuestShareControls.tsx:307`; `Sidebar.logic.ts:869`; `packages/contracts/src/guestShare.ts:25` | não | PEGAR: moderação antes de entrar no fio | G |
| 15.25 | Estados de erro do link: "Este link terminou ou não é válido" e "Este link terminou" | `guest/GuestPage.tsx:253`; `:337` | não | PEGAR | P |
| 15.26 | Wizard de importação de cookies do navegador (só desktop), com escolha de perfil de origem e destino | `settings/IntegrationsSettings.tsx:1327`; `settings/BrowserImportWizard.tsx:57` | não | IGNORAR: não temos navegador embutido | G |
| 15.27 | Importação de cookies trata navegador aberto, Full Disk Access, keychain e bloqueios, com Retry só para motivos recuperáveis | `settings/browserImportWizard.logic.ts:82`; `:131` | não | ADAPTAR: o "Retry só quando faz sentido" é padrão geral | M |
| 15.28 | Pareamento: `/pair` auto-submete o token do hash e o remove da URL; link/QR no CLI e em Configurações | `auth/PairingRouteSurface.tsx:70`; `:139`; `apps/server/src/cli/pair.ts:199` | não | ADAPTAR | M |
| 15.29 | "Copiar URL do MCP" no menu do ambiente, para agentes externos | `settings/SavedEnvironmentRows.tsx:421` | não | IGNORAR | P |
| 15.30 | Página de aprovação de agente externo mostra cliente, host, escolha de escopo e exige código de pareamento | `auth/ConnectAgentSurface.tsx:93`; `:211`; `:236` | não | IGNORAR | G |

**Notas da área:**
- Seleção default do import: repo git com atividade nos últimos **30 dias** e **≥3 conversas**; pastas não-git nunca entram selecionadas (`onboarding/projectImport.logic.ts:4-5`).
- O wizard **não fecha por clique fora** (`disablePointerDismissal`); só `close-press` conclui, bloqueado durante importação; voltar passo é permitido, avançar não (`WelcomeWizard.tsx:230-255`).
- Guest link: TTL de **24 h**, 3 mensagens pendentes, 20 resolvidas mantidas; exige toggle em Labs e o túnel, e é escondido se a política gerencia "connect" (`packages/contracts/src/guestShare.ts:18-22`; `chat/guestShareAvailability.ts:16-18`).
- Prompt link **nunca executa** nada e não altera permissão/branch/worktree; checkout de PR só ocorre após confirmar porque roda o setup script (`docs/user/prompt-links.md`; `NewThreadLinkView.tsx:393-420`).
- Tokens de pareamento: one-time expira em **5 min** e bootstrap desktop em 24 h; o token viaja no hash da URL e é removido antes do submit (`PairingGrantStore.ts:252-254`; `PairingRouteSurface.tsx:75-88`).
- Sessão de agente externo (MCP) dura **30 dias**; `read-only` não recebe `runtimeModeCeiling` (`EnvironmentAuth.ts:78`; `:1328-1330`).
- Importação de navegador copia **somente cookies** (sem histórico), uma vez; Safari exige Full Disk Access e Chromium no Windows com app-bound encryption não é importável (`docs/user/browser-import.md`; `apps/desktop/src/preview/BrowserImport/Sources.ts:108-110`).
- **Não há evento de telemetria de onboarding** nem galeria de prompts de exemplo; o único registro ligado ao fluxo é `feature.used` (`GuestShareService.ts:379`; `:470`; `WelcomeWizard.tsx:446`).

---

## §16 · Atualização, telemetria, segredos e acesso remoto

A Persona tem a **máquina** de atualização (`apps/desktop/src/update-coordinator.ts`, `apps/desktop/src/github-releases-feed.ts`, `apps/desktop/src/updates/electron-updater/`) mas **nenhuma tela** no cliente: não há botão, pill, progresso nem "reiniciar para atualizar". Não há telemetria nenhuma.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 16.1 | Verifica atualização sozinho 15 s após iniciar e depois a cada 4 min | `apps/desktop/src/updates/DesktopUpdates.ts:889`; `:904` | parcial — `apps/desktop/src/update-coordinator.ts` | ADAPTAR: conferir a cadência | P |
| 16.2 | "Check for Updates" em Configurações › Sobre, com toast quando não há updater | `apps/web/src/components/settings/SettingsPanels.tsx:249-251` | não | PEGAR: barato e é o que falta para o usuário confiar | P |
| 16.3 | Pill de atualização no rodapé da sidebar com estados (checando, baixando, baixado, erro) e tooltip por estado | `apps/web/src/components/sidebar/SidebarUpdatePill.tsx:198`; `apps/web/src/components/desktopUpdate.logic.ts:44` | não | PEGAR: é o lugar onde a pessoa já olha | M |
| 16.4 | Download com percentual, desligando diferencial em Mac Intel sob Rosetta | `apps/desktop/src/updates/DesktopUpdates.ts:606`; `desktopUpdate.toast.tsx:47` | parcial | ADAPTAR: o percentual sim; o caso Rosetta não se aplica | M |
| 16.5 | Instala e reinicia após confirmação que **avisa sobre tarefas interrompidas** | `apps/desktop/src/updates/DesktopUpdates.ts:827`; `desktopUpdate.logic.ts:123` | não | PEGAR: a Persona trabalha sozinha; reiniciar sem avisar mata trabalho | M |
| 16.6 | Falha de instalação mantém janelas abertas, reinicia os backends parados e grava estado de erro "install" | `apps/desktop/src/updates/DesktopUpdates.ts:813-830`; `DesktopUpdates.test.ts:503` | não | PEGAR: recuperação de update quebrado é obrigação de app instalado | M |
| 16.7 | Detecta que o app reiniciou na versão antiga e oferece retry, sem reinstalar sozinho | `apps/desktop/src/updates/updateMachine.ts:220`; `DesktopUpdates.ts:685` | não | PEGAR: evita o loop de "atualiza e não muda" | P |
| 16.8 | Canal Stable/Nightly no autoUpdater (prerelease, changelog completo, downgrade bloqueado) | `apps/desktop/src/updates/DesktopUpdates.ts:513`; `updateChannels.ts:4` | parcial — `apps/desktop/src/updates/electron-updater/channel.ts` | ADAPTAR | P |
| 16.9 | Troca de trilha move o app e todas as máquinas conectadas, bloqueando se o banco tem migração não suportada | `apps/web/src/components/settings/UpdateTrackSwitchDialog.tsx:35`; `sidebar/updateEverything.logic.ts:158` | não | IGNORAR: multi-máquina não é o nosso v1 | G |
| 16.10 | "Atualizar tudo": provedores, servidores atrasados e, por fim, o app desktop | `apps/web/src/components/sidebar/useUpdateEverything.ts:51` | não | IGNORAR | G |
| 16.11 | Diálogo de confirmação lista máquinas, as puladas com motivo, e conta threads interrompidas/retomáveis | `apps/web/src/components/sidebar/UpdateEverythingDialog.tsx:67`; `:223` | não | ADAPTAR: a contagem de threads interrompidas vale mesmo com uma máquina | M |
| 16.12 | Cápsula de progresso "restart in Ns" com Later/Retry/Dismiss | `apps/web/src/components/sidebar/SidebarUpdateCapsule.tsx:47-49`; `:80` | não | PEGAR | M |
| 16.13 | Servidor remoto se auto-atualiza por RPC com versão exata e stream de progresso | `apps/server/src/ws.ts:2657`; `apps/server/src/cloud/selfUpdate.ts:336` | não | IGNORAR: o nosso host é local | G |
| 16.14 | Update do servidor hospedado no desktop usa handoff em duas fases (prepare → commit) para não perder o RPC | `apps/server/src/desktopUpdate/DesktopAppUpdate.ts:189`; `ws.ts:2661` | não | ADAPTAR: princípio útil se o host reiniciar | G |
| 16.15 | Bloqueia conexão quando o protocolo difere: cliente novo pede update do servidor e vice-versa | `packages/client-runtime/src/connection/compatibility.ts:11` | não | PEGAR: com host e cliente versionados juntos, é a defesa contra "tela branca" | M |
| 16.16 | Oferece copiar o comando de update/relaunch quando a máquina não pode se atualizar sozinha | `apps/web/src/components/ServerUpdateAction.tsx:350-356`; `:278` | não | ADAPTAR | P |
| 16.17 | Popover de novidades com release notes normalizadas por canal e link para o GitHub | `apps/web/src/components/sidebar/SidebarUpdateReleaseNotes.tsx:58`; `apps/desktop/src/updates/releaseNotes.ts:175` | não | PEGAR: "Novidades" já existe na Persona; falta o conteúdo real | M |
| 16.18 | Política gerenciada restringe updates (feed próprio, sem Nightly) e **desliga tudo se o arquivo for ilegível** | `apps/desktop/src/updates/DesktopUpdatePolicy.ts:39`; `:76` | não | IGNORAR: não temos cliente corporativo | M |
| 16.19 | CLI `t3 update` com versão exata, `--channel`, `--allow-downgrade` e `--yes` | `apps/server/src/cli/update.ts:273` | não | IGNORAR | M |
| 16.20 | Serviço em background: install, restart, status, uninstall e protect | `apps/server/src/cli/service.ts:217`; `:264` | não | IGNORAR: a Persona é app desktop com host embutido | G |
| 16.21 | "Continue threads after restarts" retoma threads após update/crash, **ligado por padrão** | `apps/web/src/components/settings/SettingsPanels.tsx:1966` | não | PEGAR: é o que faz a proatividade sobreviver a um reinício | G |
| 16.22 | Envia eventos de produto para PostHog com ids hasheados de conta e instalação | `apps/server/src/telemetry/AnalyticsService.ts:67`; `:230` | não | ADAPTAR: só com opt-in explícito e lista do que sai | M |
| 16.23 | Desliga telemetria por variável de ambiente ou política gerenciada (nunca religa pela política) | `apps/server/src/telemetry/AnalyticsService.ts:74`; `:127` | não | PEGAR: o "nunca religa" é a regra certa | P |
| 16.24 | Export OTLP próprio (traces/métricas/logs) por ambiente, com botão Test e status do endpoint | `apps/web/src/components/settings/TelemetryExportSettings.tsx:76` | não | IGNORAR: público técnico | M |
| 16.25 | Crash reports do mobile com opt-out em Configurações › Sobre › Diagnóstico | `apps/mobile/src/features/observability/observe.ts:30`; `SettingsDiagnosticsRouteScreen.tsx:181` | parcial — `apps/desktop/src/crash-report.ts` | ADAPTAR: expor o opt-out na UI | M |
| 16.26 | "Publish agent activity" envia atividade ao relay para notificações, separado da telemetria | `apps/web/src/components/settings/SavedEnvironmentRows.tsx:694` | não | IGNORAR: a Persona calcula isso local | M |
| 16.27 | Cadastro de 1Password por ambiente (nome + conta) lido via CLI `op` no servidor | `apps/web/src/components/settings/SecretsSettings.tsx:37`; `packages/secret-provider-onepassword/src/server/driver.ts:21` | não | ADAPTAR: o Cofre da empresa é nosso; 1Password é integração opcional | M |
| 16.28 | Seletor "Valor" vs provedor de segredo nos campos de credencial, validando a referência `op://` | `apps/web/src/components/settings/SecretSourceInput.tsx:64`; `:128` | não | ADAPTAR | M |
| 16.29 | Cartão de pedido de segredo na thread com "Save securely"/"Decline", respondível por web, desktop ou mobile | `apps/web/src/components/chat/SecretRequestCard.tsx:73` | não | PEGAR: a persona precisa pedir uma senha sem que ela passe pelo chat | M |
| 16.30 | Liga/desliga túnel por ambiente, com estado de alcance, limite de túneis e reparo de link | `apps/web/src/components/settings/SavedEnvironmentRows.tsx:517`; `apps/server/src/cloud/CloudLink.ts:1022` | parcial — `packages/persona/persona-sync`, `apps/persona-edge` | ADAPTAR: a nossa base é Cloudflare | G |
| 16.31 | Cria link de pareamento com escopos e rótulo, exibindo QR e link `t3code://pair` | `apps/web/src/components/settings/AuthorizedClientsSettings.tsx:604`; `:321` | não | ADAPTAR: para o futuro "acompanhar do celular" | M |
| 16.32 | Lista clientes autorizados e revoga link ou sessão individual, além de "Revoke others" | `apps/web/src/components/settings/AuthorizedClientsSettings.tsx:650`; `apps/server/src/auth/EnvironmentAuth.ts:1121` | não | PEGAR: qualquer aparelho conectado precisa de revogação | P |
| 16.33 | Liga "Network access" (expõe o backend na LAN, com restart) e "Tailscale HTTPS" com confirmação | `apps/web/src/components/settings/ConnectionsSettings.tsx:1067`; `:1004` | não | IGNORAR: a Persona não expõe backend na LAN no v1 | M |
| 16.34 | Adiciona ambiente por SSH (host/alias, portas, hosts descobertos) e reusa servidor remoto via túnel | `apps/web/src/components/settings/AddEnvironmentDialog.tsx:230` | não | IGNORAR | G |
| 16.35 | Descobre portas locais abertas por terminais/agentes a cada 3 s para o preview do browser | `apps/server/src/preview/PortScanner.ts:73`; `:883` | não | ADAPTAR: se tivermos preview de servidor | M |

**Notas da área:**
- A checagem automática espera 15 s após o start e repete a cada 4 min; troca de canal tenta 30× com 1 s entre elas (`apps/desktop/src/updates/DesktopUpdates.ts:58-59`, `:56-57`).
- Ao instalar, grava `desktop-update-install.json` com versão de origem/destino; se o app volta na versão antiga, o alvo vira `notAppliedVersion` e só um clique manual tenta de novo (`DesktopUpdates.ts:685`; `updateMachine.ts:220`).
- Política gerenciada é **fail-closed**: se o arquivo não puder ser lido, updates ficam `mode: "off"` com mensagem ao administrador (`DesktopUpdatePolicy.ts:70-80`).
- Telemetria vem **ligada por padrão**; envia lotes de 20, guarda até 1000 eventos, flush a cada 10 s e 1 s no shutdown (`AnalyticsService.ts:67-79`, `:43-47`). A Persona deve fazer o contrário: desligada por padrão.
- 1Password é lido com `op --cache=false` para não travar em prompt do daemon, com timeout de 45 s por leitura (`packages/secret-provider-onepassword/src/server/driver.ts:15`, `:21`).
- Segredo entregue a comando de agente fica em arquivo privado com TTL de 24 h, diretório `0700`, varredura a cada 1 h (`apps/server/src/secrets/SecretRequests.ts:36`, `:273-274`, `:385-388`).
- Token de pareamento one-time expira em 5 min por padrão; bootstrap de desktop e dev token duram 24 h (`apps/server/src/auth/PairingGrantStore.ts:252-253`).
- Porta padrão do servidor é 3773; `T3CODE_PORT_DISCOVERY=0` desliga a descoberta de listeners mas mantém o probe de URLs de preview (`apps/server/src/config.ts:29`; `PortScanner.ts:72-73`).

---

## §17 · Tarefas agendadas e webhooks

A Persona tem **Rotinas** (`routines/`), que é o mesmo conceito na metade do caminho: agenda e editor, sem destino por execução, sem webhook, sem assinatura, sem filtros, sem dedupe.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 17.1 | Lista de tarefas agendadas com filtro por ambiente e por projeto, e criação/edição numa tela só | `apps/web/src/components/settings/ScheduledTasksSettings.tsx:1`; `:307` | parcial — `routines/RoutinesView.tsx` | ADAPTAR: a nossa lista é por rotina; falta o filtro por projeto | M |
| 17.2 | Agendamento por hora fixa usa o fuso do **ambiente**, não o do aparelho | `docs/user/project-settings.md` §Scheduled tasks | não | PEGAR: evita "rodou 3 h errado" quando o desktop muda de fuso | P |
| 17.3 | Opção **Uma vez** agenda uma execução única no fuso de quem criou | `docs/user/project-settings.md` §Scheduled tasks | parcial — `routines/routine-schedule.ts` | ADAPTAR | P |
| 17.4 | **Destino** por execução: thread nova a cada rodada, mesma conversa, ou sessão nova na mesma thread (contexto não cresce) | `apps/web/src/components/settings/ScheduledTasksSettings.tsx:1172` | não | PEGAR: é o que impede a rotina de virar uma thread infinita e caríssima | M |
| 17.5 | Cada tarefa pode ser editada, pausada, retomada, rodada na hora e apagada; webhook não roda na hora | `apps/web/src/components/chat/ThreadAutomationsPanel.tsx:211` | parcial | ADAPTAR | M |
| 17.6 | Painel de automações **dentro da thread**: mostra as tarefas daquela conversa e leva para a gestão | `apps/web/src/components/chat/ThreadAutomationsPanel.tsx:43`; `:142` | não | PEGAR: a rotina precisa aparecer onde o trabalho acontece | M |
| 17.7 | Agendar por **webhook**: a tarefa roda quando outra máquina chama a URL (GitHub, CI) | `apps/web/src/components/settings/ScheduledTasksSettings.tsx:1730` | não | ADAPTAR: só com a Cloudflare (a nossa base remota); a URL pública é o mesmo problema do túnel | G |
| 17.8 | URL do webhook só é pública com túnel gerenciado; sem túnel a tela mostra só o caminho | `docs/user/project-settings.md` §Webhook automations | não | ADAPTAR: na Persona a URL vem do Durable Object | M |
| 17.9 | **Rotacionar** a URL do webhook, com confirmação de que a antiga para de funcionar | `apps/web/src/components/settings/ScheduledTasksSettings.tsx:1073`; `:1116` | não | PEGAR: segurança básica de qualquer URL pública | P |
| 17.10 | Placeholders no prompt: `{{body.path}}`, `{{headers.name}}`, `{{query.name}}`, `{{body}}`, `{{request}}` | `docs/user/project-settings.md` §Webhook automations | não | PEGAR | M |
| 17.11 | Cada valor do webhook chega embrulhado em `<webhook-data-…>` e marcado como dado não confiável | `docs/user/project-settings.md` §Webhook automations | não | PEGAR: é a defesa contra injeção de prompt por payload | M |
| 17.12 | Dentro do valor, `$`, `@` e `/` de início de palavra ganham um caractere invisível, para `$skill`/`@file`/`/command` não agirem | `docs/user/project-settings.md` §Webhook automations | não | PEGAR: detalhe fino, e é o que impede o payload de virar comando | M |
| 17.13 | **Exigir assinatura** (`x-hub-signature-256`, hex, prefixo `sha256=`), com o mesmo segredo no GitHub | `apps/web/src/components/settings/ScheduledTasksSettings.tsx:1836` | não | ADAPTAR | M |
| 17.14 | **Filtros** por valor (`headers.x-github-event` é `pull_request`; `body.action` está entre `opened, reopened`); sem filtro que case, nada roda e fica "Filtered" | `docs/user/project-settings.md` §Webhook automations | não | PEGAR | M |
| 17.15 | **Chave de duplicata** (ex.: `{{headers.delivery-id}}`): a mesma entrega é ignorada por 7 dias | `apps/web/src/components/settings/ScheduledTasksSettings.tsx:1779` | não | PEGAR | M |
| 17.16 | **Coalescer** rajada por chave e janela de 10–3600 s (padrão 120), usando o último corpo quando a janela fecha; sobrevive a restart | `apps/web/src/components/settings/ScheduledTasksSettings.tsx:1796`; `:1810` | não | ADAPTAR: só se houver webhook | M |
| 17.17 | Limites de log e de validação: 10 entradas por tarefa por minuto; 60 validações por minuto, depois HTTP 429 | `docs/user/project-settings.md` §Webhook automations | não | PEGAR: sem isso, um CI barulhento derruba o servidor | P |
| 17.18 | Tela **Deliveries**: as últimas requisições e o prompt que cada uma gerou | `apps/web/src/components/settings/ScheduledTasksSettings.tsx:875`; `:914` | não | PEGAR: é a única forma de depurar um webhook | M |
| 17.19 | Modelo e projeto padrão de uma tarefa agendada são derivados do escopo aberto | `apps/web/src/components/settings/scheduledTasksSettings.logic.ts:299`; `:337` | não | ADAPTAR | P |
| 17.20 | Apagar a thread apaga as tarefas que publicam nela; as de "thread nova por rodada" sobrevivem | `docs/user/project-settings.md` §Scheduled tasks | não | PEGAR | P |
| 17.21 | Sair do formulário editado pergunta antes de descartar | `docs/user/project-settings.md` §Scheduled tasks | parcial | IGNORAR: já temos confirmação de descarte | P |

---

## §18 · SnapShot — captura de janela com a árvore de acessibilidade

**É a maior descoberta desta varredura para a Persona.** O T3 captura qualquer janela do sistema (não só a dele) e anexa ao rascunho **a imagem + o texto e os controles daquela janela com posição**. É exatamente o insumo que falta no "Ensinar a persona" (WAVE2 §2): hoje o nosso `teach-recorder.ts` grava o viewport do app; o SnapShot ensina a persona a partir de qualquer programa.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 18.1 | Atalho global captura a janela em foco e anexa ao rascunho atual; sem thread aberta, abre um rascunho no projeto atual | `apps/desktop/src/snapShot/DesktopSnapShot.ts:189`; `docs/user/snap-shot.md` | não | PEGAR | G |
| 18.2 | O anexo carrega nome do app, título da janela e, quando disponível, o ícone | `docs/user/snap-shot.md` §Taking a capture | não | PEGAR | M |
| 18.3 | Anexa também a **árvore de acessibilidade** da janela (controles, textos e posições na imagem), para o agente raciocinar sobre a tela | `apps/desktop/src/snapShot/SnapShotAccessibility.ts:230`; `apps/desktop/src/snapShot/snapShot.ts:298` | não | PEGAR: é o diferencial sobre "só um print" | G |
| 18.4 | A árvore é **compactada e limitada** antes de sair (`compactAccessibilityTree`, `boundedSnapShotString`, `accessibleWindowText(maxChars)`) | `apps/desktop/src/snapShot/snapShot.ts:298`; `:156`; `:92` | não | PEGAR: sem teto, um app grande manda megabytes | M |
| 18.5 | "Incluir texto do app" é opcional; desligado, manda só a imagem (e no macOS dispensa a permissão de Acessibilidade) | `docs/user/snap-shot.md` §Include app text | não | PEGAR | M |
| 18.6 | Ícone no anexo diz se a árvore foi incluída, e clicar mostra o que foi capturado | `docs/user/snap-shot.md` §Include app text | não | PEGAR: é a nossa regra de "nunca inventar" aplicada ao anexo | P |
| 18.7 | Captura pendente fica em disco até ser salva no rascunho; sobrevive a fechar o app no meio | `docs/user/snap-shot.md` §Taking a capture | não | PEGAR | M |
| 18.8 | Captura recusada por tamanho é descartada, não anexada pela metade | `docs/user/snap-shot.md` §Taking a capture | não | PEGAR | P |
| 18.9 | Som, flash na janela e animação de "voar para o rascunho" são três toggles independentes; reduced-motion desliga a animação | `docs/user/snap-shot.md` §Sound, flash, and animation | parcial — `primitives/Celebration.tsx` tem reduced-motion | ADAPTAR | P |
| 18.10 | Atalho configurável por par de modificadores (Cmd+Cmd, Ctrl+Ctrl) ou acorde, com recusa de conflito com o SO e com os próprios atalhos | `apps/desktop/src/snapShot/CaptureShortcutConfig.ts:96`; `apps/desktop/src/snapShot/snapShot.ts:65` | não | ADAPTAR | M |
| 18.11 | Setup em duas etapas (permitir captura, escolher atalho), cada uma mostrando só o que aquele desktop precisa, com "Finish later" | `docs/user/snap-shot.md` §Turning it on | parcial — `onboarding/` | ADAPTAR | M |
| 18.12 | Linux por desktop: extensão GNOME, helper KDE, edição de config do Hyprland/Niri **com prévia exata da mudança, backup e validação** | `apps/desktop/src/snapShot/gnomeCaptureBundle.ts`; `captureConfigKdl.ts`; `NiriCaptureShortcut.ts` | não | IGNORAR: a Persona é Windows primeiro; deixar para a etapa Linux | G |
| 18.13 | Capturar o próprio T3 quando ele está na frente | `docs/user/snap-shot.md` §Taking a capture | não | PEGAR: é o caso do "ensinar a usar a Persona" | P |

**Nota de segurança:** o SnapShot só existe porque roda em worker/filho com prazo, nunca no main process (`docs/internals/overview.md`: `@crowecawcaw/xa11y` só em filho Node e worker thread; `ffi-rs` carrega sob demanda em `WindowsForeground.ts`). Copiar a arquitetura, não só a funcionalidade.

---

## §19 · Triagem de problema

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 19.1 | Comando **Triar um problema** na paleta abre uma thread sem projeto com o playbook de triagem já linkado | `apps/web/src/components/CommandPalette.tsx:1311`; `:1316` | não | ADAPTAR: a Persona não tem "reportar problema" dentro do app | M |
| 19.2 | A triagem roda na máquina da thread aberta; sem thread, usa a máquina primária que suporta | `apps/web/src/lib/triageTarget.ts` (`pickTriageEnvironment`) | não | ADAPTAR | P |
| 19.3 | O servidor baixa o **código-fonte da versão que está rodando** enquanto a pessoa escreve | `docs/user/triage.md` §In the app | não | IGNORAR: só faz sentido para um app open source com usuários técnicos | M |
| 19.4 | O agente lê logs e estado da máquina, procura issues conhecidas e ajuda a escrever o relato; **pede antes** de aplicar correção ou publicar | `docs/user/triage.md` §In the app | não | PEGAR o princípio: agente que investiga pede antes de mexer | P |
| 19.5 | `npx t3 triage` sobe Claude Code ou Codex no terminal com as mesmas instruções, para quando o app não abre | `apps/server/src/cli/triage.ts` | não | IGNORAR: não temos CLI pública | P |

---

## §20 · Handoff portátil (troca de motor sem perder o fio)

É o que a Persona chama de **Chain of Recall**: trocar de motor (ou continuar depois de uma queda) sem perder o que já foi conversado. O T3 faz com um **orçamento explícito de tokens**, não com um resumo escrito pelo agente — e deixa o agente recuperar o que ficou de fora por uma ferramenta.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 20.1 | Conversa curta transfere **intacta**; longa prioriza pedidos e respostas recentes, o pedido original e atividade relevante (resultado de comando) | `docs/user/portable-handoffs.md` §Context in portable handoffs | parcial — `persona-spec/SUPERAGENT-ADOPTION.md` (Chain of Recall) | PEGAR: a regra de prioridade é o que faz o handoff não virar resumo ruim | G |
| 20.2 | Mensagens selecionadas mantêm **texto completo, ordem e papel**, incluindo trabalho parcial de turno que falhou ou foi interrompido | `docs/user/portable-handoffs.md` | não | PEGAR: descartar o turno interrompido é o que faz o motor novo repetir o erro | M |
| 20.3 | O **pedido novo fica separado** e nunca é encurtado para caber no histórico | `docs/user/portable-handoffs.md` | não | PEGAR: encurtar o pedido é a pior forma de perder a intenção | P |
| 20.4 | O handoff **não copia** raciocínio, estado de ferramenta nem anexos do motor anterior | `docs/user/portable-handoffs.md` | não | PEGAR: copiar raciocínio de outro modelo produz contexto incoerente | M |
| 20.5 | O handoff inclui **referências ao histórico omitido**, e o agente pode recuperar pela ferramenta `t3_thread_read` (com `afterPosition`, `itemId`, `textOffset`) | `apps/server/src/orchestration-v2/ContextHandoffDelivery.ts:53` | não | PEGAR: é o que transforma "orçamento" em "nada se perde" | G |
| 20.6 | Orçamento padrão de **16.000 tokens**, configurável por `T3CODE_CONTEXT_HANDOFF_TOKEN_CAP`, preso entre 1.024 e 64.000 | `packages/provider-core/src/server/handoffBudget.ts:14`; `:15`; `:16-19` | não | PEGAR: número explícito e limitado, não "o que couber" | M |
| 20.7 | Contabilidade conservadora: **1 token por byte UTF-8**, incluindo atribuição e escape de JSON | `docs/user/portable-handoffs.md` §Context limits | não | PEGAR: errar para mais é seguro; para menos estoura o contexto | P |
| 20.8 | Imagem reserva **8.192 tokens** cada; outro anexo reserva **4.096** — independente do tamanho do arquivo | `packages/provider-core/src/server/handoffBudget.ts:93` | não | PEGAR: sem essa reserva, o anexo come o orçamento inteiro | P |
| 20.9 | Sem informação de capacidade, assume janela de **128.000 tokens** e reserva `max(16.000, janela/4)` para instruções, ferramentas e trabalho seguinte | `packages/provider-core/src/server/handoffBudget.ts:109`; `:122` | não | PEGAR: o fallback precisa ser explícito, não um chute silencioso | P |
| 20.10 | Se não couber nem numa conversa nova, a Persona **avisa** e pede para encurtar ou escolher modelo maior — nunca corta o pedido | `docs/user/portable-handoffs.md` §Context limits | não | PEGAR: a recusa honesta é melhor que o truncamento invisível | P |
| 20.11 | Handoff só é oferecido quando o motor declara a capability; sem ela o seletor **bloqueia** o driver | `apps/web/src/components/ChatView.logic.ts:916`; `docs/orchestration-v2/provider-capability-system.md:31` | não | PEGAR: não oferecer o que vai falhar (§11.16) | M |
| 20.12 | Linha "Context handoff pending" antes do envio e divisória "Context handoff" no histórico | `apps/web/src/components/ChatView.tsx:2462`; `chat/V2LifecycleRow.tsx:630` | não | PEGAR: a pessoa precisa ver que o motor mudou | M |
| 20.13 | Ao **voltar** para um motor anterior, retoma a provider-thread dele e injeta só um **resumo delta** | `docs/orchestration-v2/provider-switching-and-context.md:9` | não | PEGAR: voltar não deve custar um handoff inteiro | M |
| 20.14 | Histórico importado tem teto **separado** de 64.000 bytes, que o pedido atual e os anexos não consomem | `docs/user/portable-handoffs.md` §Context limits | não | ADAPTAR: só se importarmos histórico de fora | P |
| 20.15 | Trabalho de fundo em execução **sobrevive** ao handoff; é preciso deixar terminar ou parar antes de tentar de novo | `docs/user/portable-handoffs.md` §Context limits | não | PEGAR: o handoff não pode matar a tarefa que roda | M |

**Notas da área:**
- O orçamento é **derivado**, não fixo: `handoffBudget` subtrai do tamanho da janela o uso nativo, o pedido atual e a reserva (`packages/provider-core/src/server/handoffBudget.ts:122`).
- O uso nativo só conta se o `nativeThreadRef` bater com a tentativa e o run — "row reuse must not revive old usage" (`handoffBudget.ts:21`).
- O texto de cobertura gerado cita explicitamente a ferramenta e os parâmetros de paginação (`ContextHandoffDelivery.ts:53`).
- O handoff carrega `omittedItems` e `omittedItemIds` para o agente saber **o que** ficou de fora (`ContextHandoffDelivery.ts:74`; `:81`).
- Trocar de modelo ou de opção de janela **descarta** uso e limiares de compactação antigos (`docs/user/portable-handoffs.md`).
- A seleção é feita sobre os itens **visíveis** da conversa (`visibleConversationItems`), não sobre o log bruto (`ContextHandoffService.ts:134`).
- Itens herdados de um fork/handoff anterior também entram, sem duplicar thread já vista (`ContextHandoffService.ts:166`; `:173`).

---

## §21 · Arquivos: explorador, visualizadores e editor

A Persona tem `files/FilesView.tsx` (que ainda cai em `mock-data.ts`) e `preview/PreviewFrame.tsx`. O T3 tem um **gerenciador de arquivos completo**: árvore sob demanda, editor com gravação automática, anotações por linha e **12 visualizadores especializados** (PDF, Office, notebook, Mermaid, fonte, binário, SQLite, texto grande, tabela, áudio, vídeo, imagem).

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 21.1 | Clicar numa linha de arquivo abre no painel (clique simples, não duplo) | `files/FileBrowserPanel.tsx:275` | parcial | PEGAR: o clique simples é o que o público de hoje espera | P |
| 21.2 | Expandir pasta carrega as entradas **sob demanda**, com "Loading…" na linha | `FileBrowserPanel.tsx:331`; `files/useDirectoryEntries.ts:31` | não | PEGAR: sem isso, abrir a raiz de um projeto grande trava | M |
| 21.3 | Busca na árvore com debounce de 200 ms, query limitada a 256 caracteres e modo "esconder não-correspondentes" | `FileBrowserPanel.tsx:163` | não | PEGAR | M |
| 21.4 | Busca avisa "More matches available. Refine your search." ao truncar e "No matching files." no vazio | `FileBrowserPanel.tsx:536`; `:553` | não | PEGAR: truncar em silêncio é mentira | P |
| 21.5 | Expandir/recolher todas as pastas, pulando as ignoradas (ex. `node_modules`) | `FileBrowserPanel.tsx:311`; `:132` | não | PEGAR | P |
| 21.6 | Refresh da árvore, inclusive automático após mutação do workspace | `FileBrowserPanel.tsx:377`; `:382` | não | PEGAR: a persona escreve arquivo; a árvore precisa acompanhar | P |
| 21.7 | Linhas ignoradas pelo git recebem status "ignored" | `FileBrowserPanel.tsx:351` | não | ADAPTAR | P |
| 21.8 | Falha ao ler pasta mostra o erro com "Click to retry." | `FileBrowserPanel.tsx:533` | parcial | PEGAR | P |
| 21.9 | Menu de contexto da linha: Abrir, Revelar no gerenciador, Abrir com (editores), **Copiar menção** e **Adicionar à conversa** | `FileBrowserPanel.tsx:178` | não | PEGAR: "adicionar à conversa" é a ponte com a persona | M |
| 21.10 | Arrastar uma ou várias linhas da árvore para o composer insere menções de arquivo | `FileBrowserPanel.tsx:257`; `files/fileTreeDragMention.ts:47` | não | PEGAR: junto do F-4 | M |
| 21.11 | Revelar caminho selecionado de fora: expande ancestrais, limpa busca, seleciona e rola até a linha com foco | `FileBrowserPanel.tsx:413` | não | PEGAR: é o que faz "abrir no arquivo" funcionar | M |
| 21.12 | Carrega os diretórios ancestrais do arquivo aberto para ele aparecer na árvore | `FileBrowserPanel.tsx:364`; `files/loadFileAncestors.ts:2` | não | PEGAR | P |
| 21.13 | Coluna do explorador redimensionável (160–560 px), com largura persistida e ajuste por setas/Home/End | `files/FileExplorerPane.tsx:8`; `:79` | não | ADAPTAR | P |
| 21.14 | Mostrar/ocultar o explorador, com preferência salva | `files/FilePreviewPanel.tsx:1207`; `:161` | não | PEGAR | P |
| 21.15 | Explorador é ocultado quando o painel mostra anexo ou caminho fora do workspace | `files/filePreviewMode.ts:32` | não | ADAPTAR | P |
| 21.16 | Breadcrumbs clicáveis do projeto até o arquivo, com auto-scroll para o crumb atual | `files/FileBreadcrumbs.tsx:295`; `FilePreviewPanel.tsx:1197` | não | PEGAR | M |
| 21.17 | Menu de cada pasta nos breadcrumbs: voltar ao pai, listar irmãos (pastas primeiro), navegar por seta esquerda, com vazio/erro/índice parcial | `FileBreadcrumbs.tsx:75` | não | ADAPTAR | M |
| 21.18 | Edição inline com **gravação automática** debounced de 500 ms (não existe Ctrl+S) | `FilePreviewPanel.tsx:726`; `files/fileSaveSessions.ts:140` | não | PEGAR: salvar sozinho é o certo para quem não é programador | M |
| 21.19 | Sessão de save por arquivo: fila ordenada, flush na última lease, recuperação de rascunho não confirmado e indicador de pendência na aba | `fileSaveSessions.ts:96`; `ChatView.tsx:1151` | não | PEGAR: é o que impede perda silenciosa de edição | G |
| 21.20 | Sem permissão de escrita, mostra "Read-only connection" e **mantém** as edições até o acesso voltar | `FilePreviewPanel.tsx:1344` | não | PEGAR: nunca descartar o trabalho da pessoa | M |
| 21.21 | Alteração externa do arquivo substitui o rascunho (só mudanças ecoadas são ignoradas) | `FilePreviewPanel.tsx:702` | não | ADAPTAR: precisa avisar antes de sobrescrever | M |
| 21.22 | Selecionar linhas no editor abre formulário de comentário ancorado ao intervalo | `FilePreviewPanel.tsx:844`; `:792` | não | PEGAR: é a nossa "Citar" aplicada a arquivo | M |
| 21.23 | Enviar ou apagar um comentário de linha adiciona/remove o comentário no composer | `FilePreviewPanel.tsx:760`; `:749` | não | PEGAR: o comentário vira contexto, não fica órfão | M |
| 21.24 | Clique fora ou Escape descarta a seleção (bloqueado enquanto há formulário aberto) | `files/fileEditorDismissal.ts:32` | não | PEGAR | P |
| 21.25 | Revelar linha específica: centraliza no scroll, com até 30 tentativas e guarda de 20 frames contra resets | `FilePreviewPanel.tsx:434`; `:422` | não | ADAPTAR: o detalhe do scroll instável é real | M |
| 21.26 | Arquivo truncado, host ou sem write access cai no visualizador somente leitura | `FilePreviewPanel.tsx:1515` | não | PEGAR | P |
| 21.27 | Alternar quebra de linha no painel | `FilePreviewPanel.tsx:1319` | não | PEGAR | P |
| 21.28 | Alternar entre fonte e renderizado para markdown, Mermaid, HTML e tabela, com preferência por tipo | `FilePreviewPanel.tsx:1299` | não | ADAPTAR | M |
| 21.29 | Markdown renderizado continua editável (checkbox de tarefa escreve no arquivo) | `FilePreviewPanel.tsx:1496` | não | ADAPTAR: bom para "lista de tarefas do projeto" | M |
| 21.30 | Visualizador de imagem com zoom 5%–800%, ajustar à tela, tamanho real e diálogo expandido | `files/PreviewImageContent.tsx:44` | parcial — `preview/PreviewFrame.tsx` | ADAPTAR | M |
| 21.31 | Visualizador de PDF virtualizado: página anterior/próxima, zoom, fit width, busca `mod+F` e posição salva por documento | `files/PdfViewer.tsx:132`; `:395` | não | ADAPTAR: contrato e proposta em PDF são o dia a dia do cliente | G |
| 21.32 | Visualizador Office para docx/xlsx/pptx (OpenXML) e ods/odt, com seletor de planilha/capítulo e páginas | `files/OfficeViewer.tsx:50`; `:196` | não | ADAPTAR: a Persona vai receber planilha do cliente | G |
| 21.33 | Visualizador de notebook: células markdown/código/saída, "Show more cells" de 20 em 20, **sem executar** | `files/NotebookPreview.tsx:44`; `:174` | não | IGNORAR | G |
| 21.34 | Mermaid renderiza e **recusa** arquivos com URLs, `img:`, HTML, frontmatter ou `%%{` | `files/MermaidViewer.tsx:6`; `:12` | não | PEGAR o princípio: renderizar conteúdo externo exige recusa explícita | M |
| 21.35 | Visualizador de fonte com amostras em 12/16/24/40/64 px (limite 10 MB, timeout 30 s) | `files/FontViewer.tsx:41`; `:9` | não | IGNORAR | M |
| 21.36 | Visualizador binário: navega arquivo comprimido por pasta e abre texto/imagem de dentro | `files/BinaryViewer.tsx:80` | não | IGNORAR | G |
| 21.37 | Visualizador SQLite: seletor de tabela, paginação e aviso de leitura limitada a 50 colunas/1.024 caracteres | `BinaryViewer.tsx:270` | não | IGNORAR | G |
| 21.38 | Texto grande virtualizado por worker, com cópia do conteúdo completo | `files/LargeTextViewer.tsx:29`; `largeTextProtocol.ts:1` | não | ADAPTAR: o worker é o padrão para arquivo grande | G |
| 21.39 | Prévia de CSV/TSV com parser delimitado e tabela virtualizada (página de 32 linhas) | `files/DelimitedTablePreview.tsx:9`; `VirtualTablePreview.tsx:7` | não | ADAPTAR: planilha do cliente é caso real | M |
| 21.40 | Player de áudio nativo, recarregando o arquivo quando ele muda e a reprodução está pausada | `files/AudioPreview.tsx:24` | não | IGNORAR | P |
| 21.41 | Player de vídeo com controles, pausa ao esconder a janela e recarga só quando pausado | `media/MediaVideoPlayer.tsx:31`; `FilePreviewPanel.tsx:1373` | não | IGNORAR | M |
| 21.42 | Prévia de anexo escolhe o visualizador por tipo | `files/AttachmentFilePreview.tsx:102` | parcial | ADAPTAR | G |
| 21.43 | Ações do anexo: salvar/baixar e copiar o conteúdo (com aviso quando truncado em 1 MB) | `AttachmentFilePreview.tsx:236`; `:420` | parcial | PEGAR | M |
| 21.44 | Ações do anexo: remover do rascunho e fechar a prévia | `AttachmentFilePreview.tsx:459` | parcial | PEGAR | P |
| 21.45 | Abrir no editor externo pelo picker, com editor preferido persistido | `FilePreviewPanel.tsx:1287`; `apps/web/src/editorPreferences.ts:49` | não | ADAPTAR | M |
| 21.46 | Abrir no navegador de preview interno (só tipos suportados e com escopo de preview) | `FilePreviewPanel.tsx:1328` | não | ADAPTAR: junto do §22 | M |
| 21.47 | Link de arquivo no chat abre o arquivo no painel **já na linha indicada** | `apps/web/src/ChatMarkdown.tsx:796` | não | PEGAR: é o que torna `arquivo:12` clicável de verdade | P |
| 21.48 | "Ir para arquivo" com destaque fuzzy e limite de 200 resultados | `files/ProjectFilePicker.tsx:63`; `ProjectFilePicker.logic.ts:5` | não | PEGAR: junto do §8.14 | M |
| 21.49 | Erro de leitura mostra mensagem traduzida, caminho tentado e pasta do workspace; sem permissão, aviso próprio | `FilePreviewPanel.tsx:1460`; `:1255` | não | PEGAR: erro que diz o caminho é o que resolve o suporte | P |

**Notas da área:**
- **Não há atalho de salvar**: o editor grava sozinho após **500 ms** de inatividade e faz flush quando a última superfície que segura a sessão desmonta (`fileSaveSessions.ts:140`; `:119`).
- Se a escrita falhar, o rascunho fica em `unsaved` e é **reenviado** quando o ambiente recupera `AuthFilesystemWriteScope`; a sessão só fecha depois do flush (`fileSaveSessions.ts:70-83`).
- Texto é lido até **1 MB** (`FILE_TEXT_PREVIEW_MAX_BYTES`); acima disso o painel troca para o viewer de texto grande e o arquivo **deixa de ser editável** (`packages/shared/src/filePreview.ts:135`; `FilePreviewPanel.tsx:1354`).
- Limites por tipo: PDF **50 MB / 2.000 páginas / 4 MB de texto** para busca (`PdfViewer.tsx:32-33`); Office **50 MB / 250 mil linhas / 1.024 colunas** (`officePreviewProtocol.ts:3-5`); fonte 10 MB (`FontViewer.tsx:9`); texto grande **256 MB / 5 milhões de linhas** (`largeTextProtocol.ts:1-2`).
- Binário tem timeout de **15 s** por requisição e **30 s** para abrir, matando o worker (`BinaryViewer.tsx:108`; `:129`).
- Mermaid recusa qualquer diagrama que case com URLs, `img:`/`image:`, HTML, frontmatter YAML ou `%%{` **antes** de renderizar (`MermaidViewer.tsx:12`).
- Notebook **nunca executa código** e neutraliza HTML, links, imagens e blocos mermaid do markdown salvo (`NotebookPreview.tsx:11-30`; `:106`).
- A árvore limita a query a **256 caracteres** e o resultado a **200 entradas**; "expandir tudo" ignora pastas marcadas como `ignored` (`FileBrowserPanel.tsx:164-165`; `:132`).

---

## §22 · Preview e navegador embutido

A Persona tem `preview/PreviewFrame.tsx` e `preview/install-preview-theme.ts` (um preview simples). O T3 tem um **navegador de verdade** dentro do painel: abas, histórico por projeto, favicon, perfis com cookies, toolbar de dispositivo, **anotação sobre a página** e gravação de tela.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 22.1 | Abre nova aba de navegador pelo menu "+" de superfícies (item Browser) | `components/RightPanelTabs.tsx:1095` | não | ADAPTAR: a Persona mostra entregas; o preview é o lugar de ver o site do cliente | P |
| 22.2 | Liga/desliga o painel por atalho, com toast "Preview is desktop-only" fora do app | `shortcuts/chatRouteCommands.ts:142` | não | ADAPTAR | P |
| 22.3 | Atalhos: recarregar, focar a barra de endereço, zoom in/out e reset | `chatRouteCommands.ts:160` | não | PEGAR | P |
| 22.4 | Barra de endereço aceita URL **ou termo de busca**, resolvido pelo buscador configurado | `preview/PreviewView.tsx:266`; `packages/shared/src/preview.ts:148` | não | PEGAR: quem cola "site do cliente" espera que funcione | M |
| 22.5 | Enter navega e desfoca; Escape restaura a URL atual e desfoca | `preview/PreviewChromeRow.tsx:170` | não | PEGAR | P |
| 22.6 | Voltar/avançar habilitados conforme `canGoBack`/`canGoForward` | `PreviewChromeRow.tsx:106` | não | PEGAR | P |
| 22.7 | Recarregar com barra de progresso animada | `PreviewChromeRow.tsx:140`; `:293` | não | ADAPTAR: progresso honesto, não `scaleX` falso (§1.29) | P |
| 22.8 | Abre a URL atual no navegador do sistema | `PreviewChromeRow.tsx:199`; `PreviewView.tsx:388` | parcial | PEGAR | P |
| 22.9 | **"Anotar preview"**: ativa o seletor de elementos no guest e devolve a anotação ao composer | `PreviewView.tsx:736`; `apps/desktop/src/preview/PickPreload.ts:127` | não | PEGAR: é o "aponte para o que está errado" — a melhor forma de pedir mudança | G |
| 22.10 | Ferramentas de anotação: Selecionar (V), Região (R), Desenhar (D), Apagar (E) | `apps/desktop/src/preview/PickPreload.ts:1211` | não | ADAPTAR: começar com região + comentário | G |
| 22.11 | Caixa de comentário da anotação com "Anexar" (Enter) e envio direto (`mod+Enter`) | `PickPreload.ts:599`; `:834` | não | PEGAR | M |
| 22.12 | Painel de estilo do elemento selecionado (cor, fonte, espaçamento, borda, opacidade) | `PickPreload.ts:846` | não | IGNORAR: é ferramenta de designer, não de dono de negócio | G |
| 22.13 | Ditado por voz dentro do editor de anotação | `preview/PreviewAnnotationSpeech.tsx:21` | não | IGNORAR | G |
| 22.14 | Screenshot do preview com toast: copiar imagem, copiar caminho, revelar no explorador | `PreviewView.tsx:498`; `:605` | não | PEGAR: junto do SnapShot (§18) | M |
| 22.15 | Gravação de tela da aba ao `Shift+clique` no botão de câmera | `PreviewChromeRow.tsx:246`; `apps/web/src/browser/browserRecording.ts:501` | não | ADAPTAR: é o insumo do "Ensinar" (§18) | G |
| 22.16 | Flutua o preview sobre o chat (mini player) e fecha o painel | `PreviewView.tsx:432` | não | ADAPTAR | G |
| 22.17 | Abre o DevTools da aba | `preview/PreviewMoreMenu.tsx:91`; `PreviewView.tsx:445` | não | IGNORAR | P |
| 22.18 | Move a aba entre o browser do desktop e o do servidor, reabrindo com viewport/perfil | `PreviewView.tsx:401` | não | IGNORAR | M |
| 22.19 | Aparência por aba: Sistema, Claro ou Escuro | `PreviewMoreMenu.tsx:106` | não | ADAPTAR: junto do `install-preview-theme.ts` que já temos | P |
| 22.20 | Zoom por níveis, com indicador flutuante temporário da porcentagem | `PreviewMoreMenu.tsx:127`; `preview/ZoomIndicator.tsx:12` | não | PEGAR | M |
| 22.21 | Limpa cookies e cache do perfil ativo | `PreviewMoreMenu.tsx:171` | não | ADAPTAR | P |
| 22.22 | Toolbar de dispositivo: presets, largura×altura custom, girar e travar proporção | `apps/web/src/browser/BrowserDeviceToolbar.tsx:207`; `:153` | não | ADAPTAR: útil para "como fica no celular" | M |
| 22.23 | Estado vazio com "Usados recentemente" (até 8) e "Servidores locais" | `preview/PreviewEmptyState.tsx:33` | não | PEGAR | M |
| 22.24 | Descoberta automática de servidores locais, mesclando scanner e URLs configuradas | `preview/useDiscoveredLocalServers.ts:19`; `apps/web/src/portDiscoveryState.ts:50` | não | IGNORAR: a Persona não roda servidor | M |
| 22.25 | Histórico de URLs **por projeto**, com upsert por visita | `apps/web/src/browserHistoryStore.ts:54`; `:401` | não | ADAPTAR | M |
| 22.26 | Favicon capturado da página na aba, com fallback e globo | `RightPanelTabs.tsx:610`; `apps/web/src/browserFaviconStore.ts:223` | não | PEGAR: é o que faz a aba parecer um navegador | M |
| 22.27 | Menu de contexto da aba: mudo, fechar, fechar outras/à direita/todas; botão do meio fecha | `RightPanelTabs.tsx:1173`; `:1194` | não | ADAPTAR | M |
| 22.28 | Previews abertos pelo agente flutuam sobre o chat ou revelam a aba existente | `preview/agentOpenedPreviews.ts:24` | não | ADAPTAR: a persona abrindo o site do cliente é um bom momento | G |
| 22.29 | Página inacessível: mensagem amigável, detalhes, reload e mover para o browser do ambiente | `preview/PreviewUnreachable.tsx:69` | não | PEGAR | P |
| 22.30 | Perfis de navegador: criar, renomear, limpar cookies/cache, remover e definir padrão | `settings/IntegrationsSettings.tsx:1110` | não | IGNORAR: complexidade de navegador | M |
| 22.31 | Importar cookies de outro navegador por wizard | `settings/BrowserImportWizard.tsx:57` | não | IGNORAR | G |
| 22.32 | Preferência "Abrir links em": app ou navegador padrão, aplicada aos links do chat | `apps/web/src/browser/browserLinkTarget.ts:22`; `IntegrationsSettings.tsx:654` | parcial | PEGAR | P |
| 22.33 | Links do terminal abrem no preview quando a preferência é "app", com fallback | `preview/openTerminalLinkInPreview.ts:34` | n/a | ADAPTAR: junto do §6.12 | P |
| 22.34 | Isolamento do preview por partição persistente derivada do perfil | `apps/desktop/src/preview/BrowserSession.ts:14` | não | PEGAR: é a regra de segurança do preview | M |
| 22.35 | Bloqueia o painel quando o cliente não tem escopo de preview | `preview/PreviewPanel.tsx:36` | não | ADAPTAR | P |

**Notas da área:**
- O histórico guarda no máximo **50 URLs por projeto** e **20 projetos**, descarta URLs acima de 2048 caracteres e canonicaliza loopback/`0.0.0.0` como host `local` (`browserHistoryStore.ts:54-57`).
- Favicons só são aceitos como `data:image/png;base64,` dentro do limite, com **40 entradas** e 4 aliases por entrada; capturas chegam antes do projeto ser conhecido e ficam pendentes por thread (`browserFaviconLogic.ts:12-14`; `browserFaviconStore.ts:223`).
- O zoom usa **17 níveis fixos** de 0.25 a 5.0, padrão 1.0, e o indicador some após **1500 ms** (`packages/contracts/src/preview.ts:104-111`; `ZoomIndicator.tsx:5`).
- Viewport custom aceita **240–3840 px** por eixo e área máxima de 3840×2160; "Responsive" converte para `freeform` com o tamanho do painel (`packages/contracts/src/preview.ts:18-20`; `BrowserDeviceToolbar.tsx:97`).
- Na anotação, **"Anexar" é o padrão** (Enter); envio direto exige `mod+Enter` e permissão de orquestração; se o crop falhar, a anotação é mantida **sem** screenshot (`PickPreload.ts:834-838`; `PreviewView.tsx:787-800`).
- Perfis têm limite de **24**, com ids embutidos `default` e `incognito`; o incognito é a única partição efêmera (`packages/contracts/src/browserProfile.ts:5`; `:28-33`).
- `mod`/botão do meio do mouse **sempre** abrem no navegador do sistema, mesmo com a preferência em "app" (`browserLinkTarget.ts:23`).
- A device toolbar só aparece quando o viewport não é `fill` (`PreviewView.tsx:360-372`).

---

## §23 · Dispositivos (espelhamento de celular)

Superfície de nicho: controlar simulador iOS / emulador Android de dentro do app. Para a Persona isso é **fora do v1**, mas a arquitetura de streaming (WebCodecs com fallback, trava de transporte, entrada normalizada) é reutilizável para qualquer espelhamento futuro.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 23.1 | Lista simuladores/emuladores por iOS/Android, com host, versão, estado Running/Stopped e botão Open/Start | `apps/web/src/components/device/DevicePanel.tsx:342` | não | IGNORAR: fora do v1 | M |
| 23.2 | Abre ou liga o dispositivo via RPC `device.open` e cria a aba na thread que iniciou | `DevicePanel.tsx:111` | não | IGNORAR | M |
| 23.3 | Wizard de primeira configuração em 3 passos (hub → simuladores → acesso de agentes) com status e "Done" | `apps/web/src/components/device/DeviceSetup.tsx:185` | não | IGNORAR | M |
| 23.4 | Switch "Device hub" por ambiente; desligar também revoga o acesso dos agentes | `settings/IntegrationsSettings.tsx:952` | não | IGNORAR | P |
| 23.5 | Switch "Agents can use devices" por ambiente, liberando o CLI para novas sessões | `settings/IntegrationsSettings.tsx:991` | não | IGNORAR | P |
| 23.6 | Mostra versão instalada/rodando/exigida das ferramentas, com "Check versions" e "Update to vX" | `settings/IntegrationsSettings.tsx:898` | não | ADAPTAR o padrão: mostrar versão e oferecer atualizar vale para qualquer CLI | M |
| 23.7 | Banner por host em installing/starting/failed com detalhe e Retry | `device/DeviceHostUpdates.tsx:46` | não | IGNORAR | P |
| 23.8 | "Add source" para cadastrar host: SSH, EAS Simulator e Simlock pool | `settings/DeviceSourcesSettings.tsx:527` | não | IGNORAR | G |
| 23.9 | App mobile: botão de dispositivo acima do composer que abre a tela de preview com Back/Recents/Home/Rotate/Shut down | `apps/mobile/src/features/devices/device-preview-button.tsx:6`; `DevicePreviewRouteScreen.tsx:214` | não | IGNORAR | G |
| 23.10 | Decodifica H.264 no canvas via **WebCodecs** e cai para MJPEG quando o decoder não existe ou o perfil não é suportado | `packages/client-runtime/src/device/stream.ts:417` | não | ADAPTAR: o par "codec moderno + fallback de imagem" é o padrão para qualquer stream | G |
| 23.11 | Detecta host travado em WebRTC (409 `stream_transport_locked`) e troca o transporte com oferta/answer e ICE não-trickled | `stream.ts:1043` | não | IGNORAR | G |
| 23.12 | Envia toque/arrasto com coordenadas **normalizadas 0..1**, capturando o ponteiro até o fim do gesto | `device/DeviceStreamView.tsx:352` | não | ADAPTAR: coordenada normalizada é o que faz funcionar em qualquer tamanho de tela | M |
| 23.13 | Encaminha teclado físico (keydown/keyup com HID usage) e cola texto quando a tela está focada | `DeviceStreamView.tsx:326`; `:339` | não | IGNORAR | M |
| 23.14 | Botões físicos Home (todas), Back e Recents (Android) no rail de controles | `device/DeviceControlsRail.tsx:66` | não | IGNORAR | P |
| 23.15 | Girar: botão no iOS; no Android um menu Portrait/Landscape dispara `setOrientation` | `DeviceControlsRail.tsx:124`; `:97` | não | IGNORAR | P |
| 23.16 | Alterna viewport 3D (modelo do aparelho) e flat, com "Restore 3D" e motivo de indisponibilidade | `DeviceStreamView.tsx:152`; `DeviceControlsRail.tsx:239` | não | IGNORAR: é o efeito de vitrine, não o produto | G |
| 23.17 | iPhone Duo: controles de dobra, stance, pinça sobre o hinge e troca de tela ativa | `device/DeviceDuoControls.tsx:13`; `DeviceDuoViewport.tsx:106` | não | IGNORAR | G |
| 23.18 | Dobráveis Android: Fold/Unfold com estado otimista, timeout de 12 s e renovação de ticket no 401 | `device/DeviceAndroidFoldControls.tsx:40` | não | IGNORAR | M |
| 23.19 | Screenshot PNG do aparelho, baixado como `<nome>-<timestamp>.png` | `device/DeviceWorkspace.tsx:43` | não | ADAPTAR: o padrão "captura → anexo" é o mesmo do SnapShot (§18) | P |
| 23.20 | Drawer Tools › App: app em foreground, Terminate, Relaunch, abrir URL e lançar por bundle ID | `device/DeviceToolsPanel.tsx:129` | não | IGNORAR | M |
| 23.21 | Drawer Tools › Simulator: aparência, text size, Liquid Glass, filtros de cor, orientação, rede e acessibilidade | `DeviceToolsPanel.tsx:167` | não | IGNORAR | G |
| 23.22 | Drawer Tools › Permissions: concede, revoga ou reseta permissão de app (11 no iOS, 8 no Android) | `DeviceToolsPanel.tsx:554` | não | IGNORAR | M |
| 23.23 | "Float device over chat": move o aparelho para um mini player flutuante e fecha a aba, mantendo o streaming | `DeviceControlsRail.tsx:223` | não | IGNORAR | M |
| 23.24 | Estados de desconexão: "Input disconnected… reconnecting", "Waiting for device video…" após 2 s e tela de erro com Reconnect | `DeviceStreamView.tsx:464`; `:495` | não | ADAPTAR: os textos honestos de espera são bons | M |
| 23.25 | Limite de sessões simultâneas por host, com mensagem para fechar um no painel | `apps/server/src/device/EasDeviceHost.ts:470`; `SimlockDeviceHost.ts:427` | não | IGNORAR | M |

**Notas da área:**
- **Não existe gravação de interação**: a única captura é o screenshot PNG (`DeviceControlsRail.tsx:200`); não há `MediaRecorder`/`captureStream` nos diretórios de dispositivo.
- Fechar a aba só para o streaming; o aparelho continua rodando. "Power off device" desliga — e em host Simlock o mesmo item vira "Return device to the pool" (`DeviceControlsRail.tsx:225-232`).
- Só a aba visível assina o stream; trocar de aba pausa o vídeo sem desligar o aparelho (`DeviceStreamView.tsx:116-126`).
- Sem primeiro frame em **15 s** o stream vira erro; retries usam 1 s e um feed WebRTC parado por 15 s (checado a cada 5 s) reconecta (`client-runtime/src/device/stream.ts:128-134`).
- Texto no Android é fatiado em pacotes de até **300 bytes UTF-8**, no máximo 64 pacotes por envio (`stream.ts:150-152`).
- Overlay de acessibilidade faz poll a cada 2 s, limita a **500 elementos** e mantém o último frame quando a leitura falha (`device/deviceHubAtoms.ts:22`; `deviceHubApi.ts:69`).
- Defaults de host: EAS nasce com 2 sessões, 30 min e 10 min idle; Simlock com 2 leases e 60 min (`settings/easDeviceHostsSettings.logic.ts:14-16`; `simlockDeviceHostsSettings.logic.ts:18-19`).
- "Test connection" roda por ambiente, marca "Already available locally" quando o alvo é a própria máquina e exige escopo de escrita de settings (`settings/DeviceHostEditor.tsx:223`).

---

## §24 · Acesso remoto, cloud e agentes externos

A Persona tem `packages/persona/persona-sync` e `apps/persona-edge` (Cloudflare), e o Cofre fica no desktop. O T3 resolve o mesmo problema com **rotas múltiplas por ambiente** (LAN, Tailscale, túnel), **reconexão com cooldown** e **agentes externos via MCP**. É a referência mais próxima do que a decisão 12 da Persona desenha.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 24.1 | Lista as máquinas salvas (local + remotas) com "Add environment" no cabeçalho | `settings/ConnectionsSettings.tsx:1601`; `:1607` | parcial — `connections/` | ADAPTAR | P |
| 24.2 | Diálogo "Add Environment" com dois modos: link remoto (host + código) e SSH (só desktop) | `settings/AddEnvironmentDialog.tsx:628`; `:639` | não | ADAPTAR: para a Persona, "entrar na empresa" é o caso | M |
| 24.3 | Adiciona ambiente remoto com host e código de pareamento, validando os dois e com erro inline | `AddEnvironmentDialog.tsx:392`; `ConnectionsSettings.logic.ts:264` | não | PEGAR | M |
| 24.4 | Adiciona por SSH com autocomplete de `~/.ssh/config`, resolução de usuário/porta e túnel gerenciado | `AddEnvironmentDialog.tsx:485` | não | IGNORAR: não é o nosso público | G |
| 24.5 | Liga/desliga uma máquina salva sem removê-la | `settings/SavedEnvironmentRows.tsx:384` | não | ADAPTAR | P |
| 24.6 | Estado da conexão por fase: Connected, Connecting, Reconnecting com erro, Connection failed, Offline, Client not supported | `SavedEnvironmentRows.tsx:79` | parcial — `shell/rail-pill.ts` | PEGAR: os 6 estados são o que falta na pílula | P |
| 24.7 | Expande "Rotas" e marca qual está "em uso" e quais foram "encontradas automaticamente" | `SavedEnvironmentRows.tsx:275`; `settings/EnvironmentRoutesList.tsx:104` | não | ADAPTAR | M |
| 24.8 | Reordena rotas arrastando, com alternativa de teclado, e persiste | `EnvironmentRoutesList.tsx:82` | não | ADAPTAR: a alternativa de teclado é obrigatória | M |
| 24.9 | Remove rota com confirmação; rotas aprendidas e a última restante não podem ser removidas | `EnvironmentRoutesList.tsx:69`; `:111` | não | PEGAR: a regra "não deixe sem rota" evita o app inutilizável | P |
| 24.10 | Diagnóstico de conexão: hops ✓/✕, "O que tentar", fatos e ações Retry/Copy diagnostics/Add direct route | `settings/ConnectionDiagnosisDetails.tsx:119` | não | PEGAR: é o que transforma "não conecta" em algo acionável | M |
| 24.11 | Banner no composer quando o ambiente cai, com "X está offline" e Reconectar | `chat/useSystemComposerBanners.tsx:192`; `:208` | parcial — P0-16 | ADAPTAR | M |
| 24.12 | Conecta pela primeira rota que responde e **volta para uma rota melhor** quando ela volta (preflight + cooldown) | `packages/client-runtime/src/connection/supervisor.ts:392` | não | PEGAR: é o que faz "funciona em casa e no escritório" | G |
| 24.13 | Lista máquinas da conta ainda não adicionadas, com estado do relay e botão Add | `cloud/CloudEnvironmentConnectList.tsx:71` | não | ADAPTAR: junto da Cloudflare | M |
| 24.14 | Assistente "Configurar" após o login: publica o ambiente, adiciona dispositivos e oferece "Não mostrar de novo" | `cloud/ConnectOnboardingDialog.tsx:42`; `:166` | não | ADAPTAR | M |
| 24.15 | Liga/desliga o túnel gerenciado e descreve o estado de alcance | `SavedEnvironmentRows.tsx:517` | não | ADAPTAR | M |
| 24.16 | Medidor "N de M túneis em uso" e alerta "Acabaram os túneis" com upgrade | `cloud/TunnelUsage.tsx:28`; `:78` | não | IGNORAR: não vendemos plano | M |
| 24.17 | Verifica se o túnel é alcançável de fora e devolve motivo, dica e correção | `apps/server/src/cloud/ConnectReachability.ts:66` | não | ADAPTAR: o "motivo + correção" é o padrão | G |
| 24.18 | Repara link "fora de sincronia" religando o túnel | `SavedEnvironmentRows.tsx:665` | não | ADAPTAR | M |
| 24.19 | Cria link de pareamento com nome e escopos selecionáveis | `settings/AuthorizedClientsSettings.tsx:604` | não | ADAPTAR | M |
| 24.20 | Mostra o QR e deixa escolher por qual endpoint (LAN, Tailscale, loopback) ele aponta | `AuthorizedClientsSettings.tsx:402` | não | ADAPTAR | M |
| 24.21 | Revoga link de pareamento com "Revogando…" e remoção imediata | `AuthorizedClientsSettings.tsx:394` | não | PEGAR | P |
| 24.22 | Revoga uma sessão de cliente ou todas as outras | `AuthorizedClientsSettings.tsx:646`; `:563` | não | PEGAR: qualquer aparelho conectado precisa de revogação | P |
| 24.23 | Tela de aprovação de agente externo MCP: cliente, host, redirect, modo (somente leitura…acesso total) e código | `auth/ConnectAgentSurface.tsx:93`; `:213` | não | IGNORAR: fora do v1 | G |
| 24.24 | Sessão do agente MCP dura 30 dias; revogação corta na hora | `apps/server/src/auth/EnvironmentAuth.ts:78`; `:1328` | não | ADAPTAR | P |
| 24.25 | Copia a URL do MCP pelo menu "…", com toast de instrução | `SavedEnvironmentRows.tsx:421` | não | IGNORAR | P |
| 24.26 | Autoriza o CLI pelo navegador, com sign-in e redirect | `cloud/ConnectCliAuthSurface.tsx:21` | não | IGNORAR | M |
| 24.27 | Abre link `t3code://pair` no desktop, pede confirmação do host e pareia (ignorando clique repetido) | `desktop/DesktopWebLinkCoordinator.tsx:123` | não | ADAPTAR: deep link é como o app recebe convite | M |
| 24.28 | Link de pareamento hospedado lido e montado pelo app web | `apps/web/src/hostedPairing.ts:51`; `:71` | não | ADAPTAR | M |
| 24.29 | Liga "Acesso na rede" (LAN) com confirmação e restart; desligar derruba clientes de LAN | `settings/ConnectionsSettings.tsx:1067` | não | IGNORAR: a Persona não expõe backend na LAN | M |
| 24.30 | Liga "Tailscale HTTPS" e publica o endpoint como rota | `ConnectionsSettings.tsx:1004` | não | IGNORAR | M |
| 24.31 | Vincula outra máquina (peer link) escolhendo a máquina ou um endereço, com código | `settings/LinkedEnvironmentsSettings.tsx:169` | não | IGNORAR | G |
| 24.32 | Expõe ferramentas MCP para agentes externos (`thread_list/read/send/wait/interrupt`, `project_*`, `environment_*`) | `apps/server/src/mcp/toolkits/orchestrator/tools.ts:225`; `project/tools.ts:124` | não | ADAPTAR: é como um agente de fora entra na equipe | G |
| 24.33 | "Adicionar a outra máquina": clona o projeto e copia os arquivos que o git não rastreia | `components/AddProjectToMachineDialog.tsx:228` | não | IGNORAR | G |
| 24.34 | Migra threads V1 copiando `state.sqlite` para `statev2.sqlite` uma única vez, sem sobrescrever um V2 existente | `apps/server/src/persistence/initializeV2Database.ts:47`; `:53` | n/a | IGNORAR | G |
| 24.35 | Troca a máquina de um rascunho no composer (máquina específica ou "Auto balance") | `BranchToolbarEnvironmentSelector.tsx:57`; `chat/useDraftEnvironmentRouting.ts:205` | não | IGNORAR | M |
| 24.36 | Threads, shell e queries em cache continuam **legíveis offline** | `apps/web/src/connection/storage.ts:836`; `:913` | parcial | PEGAR: local-first é a nossa decisão; o app precisa abrir sem rede | G |

**Notas da área:**
- Sessão de agente MCP = **30 dias** (`EnvironmentAuth.ts:78`); código de pareamento de uso único expira em 5 min e o bootstrap do desktop em 24 h (`PairingGrantStore.ts:252-253`).
- Teto de túneis: **3** por padrão, 10 com Pro, 100 com Premier; override manual é exato e o plano não o eleva (`packages/contracts/src/relay.ts:969-972`; `apps/web/src/cloud/managedRelayState.ts:154-171`).
- Supervisor: rotas melhores são checadas a cada **60 s**, rota morta sofre backoff até **30 min**, e rota que respondeu mas falhou ao conectar fica **5 min** em cooldown (`client-runtime/src/connection/supervisor.ts:65-74`).
- O preflight **nunca** manda token por uma rota que o enviaria em claro: `sendsTokenInClear` devolve "silent" sem checar (`connection/driver.ts:219-223`).
- Reachability recheca a cada **5 min** e reinicia connector morto após 2 min, dobrando o intervalo até 1 h (`apps/server/src/cloud/ConnectReachability.ts:37-42`).
- O opt-out do onboarding é por conta em localStorage (`t3code:connect-onboarding-opt-out:v1`), porque sign-out limpa os ambientes (`apps/web/src/cloud/connectOnboarding.ts:4`).
- A cópia V1→V2 só acontece se `statev2.sqlite` **não existir**, e publica via hard link de um snapshot (`initializeV2Database.ts:56-72`).
- **Não existe mover thread entre ambientes**: `t3_thread_transfer` só faz `fork`/`merge_back` dentro do mesmo projeto (`apps/server/src/mcp/toolkits/thread/tools.ts:165`).

---

## §25 · Instalação e setup de provedor

A Persona instala CLIs nativas (`persona-runners`) e tem `connections/AccountDialogs.tsx`. O T3 trata "o provedor não aparece" como o **erro número 1** do produto e construiu a cadeia inteira: detectar, instalar, autenticar, atualizar e explicar.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 25.1 | Exige provedor instalado e autenticado antes de iniciar uma thread; o app abre antes da configuração | `docs/user/install.md:8` | sim — `chat/EngineMissingBanner.tsx` | IGNORAR: já temos, e o nosso onboarding é melhor | P |
| 25.2 | Instalador de CLI por SO (`curl … install.sh` / `irm … install.ps1`), gravando em `~/.local/bin` | `docs/user/install.md:14`; `:20` | parcial | ADAPTAR | P |
| 25.3 | Canal nightly ou versão exata na instalação por script | `docs/user/install.md:25` | não | IGNORAR | P |
| 25.4 | `npx t3@latest` para experimentar sem instalar | `docs/user/install.md:46` | n/a | IGNORAR | P |
| 25.5 | Launcher npm baixa o binário por plataforma, valida **SHA-256** e extrai em `runtime/versions/<versão>` | `scripts/npm-launcher/t3.mjs:163` | n/a | IGNORAR | M |
| 25.6 | `t3` sobe servidor e abre o web app; `t3 serve` sobe sem navegador | `docs/user/install.md:30` | n/a | IGNORAR | P |
| 25.7 | `t3 update` move para a release mais nova | `docs/user/install.md:34` | n/a | IGNORAR | P |
| 25.8 | `t3 uninstall` remove serviço, launcher e runtime, pedindo confirmação (`--yes` para scripts) | `docs/user/install.md:36`; `apps/server/src/cli/uninstall.ts:85` | não | ADAPTAR: o nosso desinstalador precisa ser igualmente explícito | M |
| 25.9 | Instala o desktop por gerenciador de pacotes (winget, Homebrew, `.deb`, AUR, Nix) | `docs/user/install.md:71` | não | ADAPTAR: winget é o caminho do Windows | P |
| 25.10 | No Linux, escolhe AppImage ou `.deb` conforme `uname -m` | `docs/user/install.md:80` | n/a | IGNORAR | P |
| 25.11 | Documenta que **não existe binário** para Mac Intel | `docs/user/install.md:51` | n/a | IGNORAR | P |
| 25.12 | Instalar/remover o comando `t3` no PATH a partir de Configurações › Sobre, sem sobrescrever um `t3` do npm | `docs/user/install.md:126` | não | IGNORAR | M |
| 25.13 | Escolher distro WSL; as CLIs devem ser instaladas dentro dela | `docs/user/install.md:134` | não | IGNORAR | M |
| 25.14 | Providers configurados **por ambiente**: instalação, login e config pertencem àquela máquina | `docs/user/install.md:175` | parcial | ADAPTAR | P |
| 25.15 | Tabela de instalação/autenticação por provedor (`codex login`, `claude auth login`, `agent login`, `grok login`, `kiro-cli login`, `opencode auth login`, sign-in no app, `pi` + `/login`, `muse login`, `fx login`) | `docs/user/install.md:182` | parcial — `connections/AccountDialogs.tsx` | PEGAR: a tabela por motor é o que falta no nosso "Conectar" | G |
| 25.16 | Exige a CLI no `PATH` do servidor e oferece **Binary path** como escape (version managers) | `docs/user/install.md:193` | não | PEGAR: é a correção do erro nº 1 | P |
| 25.17 | Avisa quando a versão do provedor tem problema conhecido e mostra a faixa recomendada; versão não listada fica "não verificada" | `docs/user/install.md:199`; `apps/server/src/provider/model-manifest.json:4` | não | PEGAR: "não verificada" é honesto; "quebrada" sem aviso não | M |
| 25.18 | **Atualizar agora** executa o instalador dono da CLI (Homebrew, npm/pnpm/Yarn/Bun/Volta) ou o comando de update do próprio CLI | `docs/user/install.md:206`; `packages/provider-core/src/server/maintenanceResolver.ts:466` | não | ADAPTAR: alto valor quando o motor quebra por versão | G |
| 25.19 | Adicionar outra instância de provedor com variáveis próprias (API key, base URL); valores sensíveis não são reexibidos | `docs/user/install.md:214` | parcial — Onda 2 | PEGAR: é a base das várias contas | M |
| 25.20 | No onboarding, checa as CLIs em cada computador e abre terminal **já com o comando pronto** | `docs/user/welcome-wizard.md:50`; `onboarding/WelcomeWizard.tsx:1033` | não | PEGAR: resolve o P0-26 | M |
| 25.21 | Comandos nativos de instalação por SO usados pelo onboarding | `apps/web/src/onboarding/providerReadiness.logic.ts:76` | não | PEGAR | P |
| 25.22 | Monta o comando de login respeitando o **Binary path** da instância e o quoting de shell por SO | `providerReadiness.logic.ts:95` | não | PEGAR: sem quoting, o caminho com espaço quebra | P |
| 25.23 | Deriva o estado do card: `checking`, `disabled`, `install`, `signIn`, `ready`, `attention` | `providerReadiness.logic.ts:36` | parcial | PEGAR: os 6 estados são o que falta | P |
| 25.24 | Resumo do status em manchetes: "Verificando", "Não encontrado"/"CLI não está no PATH", "Não autenticado", "Precisa de atenção", "Indisponível", "Autenticado" | `settings/providerStatus.ts:47` | parcial | PEGAR | P |
| 25.25 | Instala/atualiza/cancela/remove o runtime gerenciado, com progresso em MB e preservação da versão anterior ao cancelar | `apps/server/src/provider/AntigravityInstallation.ts:150`; `settings/ProviderSetupSection.tsx:195` | não | ADAPTAR: o "cancelei, então não perdi a versão boa" é o detalhe | G |
| 25.26 | Dois modos de setup: **runtime gerenciado** ou **CLI existente** | `settings/CodexSetupSection.tsx:95`; `docs/user/providers-codex.md:5` | não | ADAPTAR: é a escolha "não sei instalar" vs "já tenho" | G |
| 25.27 | Sign-in OAuth no navegador, aceitando **colar a URL final do callback** quando o localhost não abre | `settings/ProviderAuthenticationSection.tsx:450` | não | PEGAR: é o que salva o login em máquina remota | M |
| 25.28 | Escolher o método de sign-in quando o provedor anuncia vários | `ProviderAuthenticationSection.tsx:195` | não | ADAPTAR | P |
| 25.29 | Aceitar API key em vez de login, com precedência documentada | `docs/user/cursor.md:9`; `providers-kiro.md:13`; `providers-muse.md:17` | parcial | ADAPTAR | M |
| 25.30 | Receita OpenRouter via variáveis da instância (`ANTHROPIC_BASE_URL`, `ANTHROPIC_AUTH_TOKEN`, `ANTHROPIC_API_KEY` vazia) | `docs/user/providers-claude.md:108` | não | ADAPTAR: é como a Persona usa um gateway | M |
| 25.31 | Múltiplas contas com homes separados (`CODEX_HOME`, `CLAUDE_CONFIG_DIR`) | `docs/user/providers-codex.md:52`; `providers-claude.md:17` | parcial — Onda 2 | PEGAR: é a mecânica das várias contas | M |
| 25.32 | Sem provedor, o composer troca o seletor por "Nenhum provedor disponível" / "Abrir configurações" | `chat/ComposerControlsBar.tsx:267` | sim | IGNORAR | P |
| 25.33 | O FAQ explica o erro mais comum: a CLI não está instalada ou não está no `PATH` **da máquina do servidor** | `docs/user/faq.md:86` | não | PEGAR: esse texto deveria existir na nossa Ajuda | P |
| 25.34 | Requisitos de Node por componente (`^22.16` ou `^23.11` ou `>=24.10`) | `apps/server/package.json:104` | n/a | IGNORAR | P |
| 25.35 | Caminho de dados `T3CODE_HOME` (default `~/.t3`) com `userdata/`, `caches/` e `worktrees/` | `scripts/npm-launcher/t3.mjs:15`; `apps/server/src/config.ts:138` | parcial — `persona-store` | ADAPTAR: a nossa pasta de dados precisa ser tão previsível | M |
| 25.36 | Recusa a conexão quando cliente e servidor falam protocolos diferentes, dizendo qual lado atualizar | `docs/user/updating.md:87` | não | PEGAR: junto do §16.15 | M |
| 25.37 | Voltar de Nightly para Stable com `--allow-downgrade` | `docs/user/updating.md:48` | não | IGNORAR | P |

**Notas da área:**
- `t3 uninstall` **não apaga dados do usuário**: o plano só inclui serviço, launcher e `runtime/`, e imprime que instalações via npm devem ser removidas com `npm uninstall -g t3` (`apps/server/src/cli/uninstall.ts:98`; `:146`).
- O status de cada instância é cacheado em `caches/<instanceId>.json` e reidratado no boot; `updateState` é removido antes de gravar (`apps/server/src/provider/providerStatusCache.ts:98`; `:135`).
- O health check de providers roda a cada **5 minutos** por padrão e pode ser desligado com `0` (`packages/contracts/src/settings.ts:1002`; `settings/ProviderSettingsPanel.tsx:1108`).
- `enableProviderUpdateChecks` é `true` por padrão e também controla o download do catálogo de modelos (`packages/contracts/src/settings.ts:1269`).
- O instalador gerenciado exige espaço livre igual a archive + executável + harness + **256 MiB**, com timeout de download de **45 minutos** (`AntigravityInstallation.ts:43`; `:506`).
- O runtime gerenciado do Codex é fixado por plataforma numa tabela `RELEASES` (ex.: `darwin-arm64` → `0.166.0`), **não é "latest"** (`apps/server/src/provider/CodexInstallation.ts:60`).
- As políticas de compatibilidade são escopadas por versão do T3 Code (`t3CodeRange`), então servidores antigos usam faixas diferentes para o mesmo provedor (`model-manifest.json:6`; `providerCompatibility.ts:63`).
- `ProviderSetupError` é **proibido** de carregar códigos OAuth, URLs ou dados de token; só texto seguro de falha (`packages/contracts/src/providerSetup.ts:176`).

---

## §26 · Respostas visuais, apps MCP e anexos na pergunta

Três superfícies que o T3 trata como cidadãs de primeira e que a Persona não tem: o agente **responder com uma página** (gráfico, tabela, colagem), o **app MCP interativo** no lugar da chamada de ferramenta, e o **anexo dentro da resposta a uma pergunta**.

| # | O que faz | Onde | Persona | Recomendação | Tam. |
|---|---|---|---|---|---|
| 26.1 | O agente responde com uma **página HTML autocontida** (gráfico, tabela, diagrama, colagem) que aparece acima da resposta escrita | `apps/web/src/components/chat/HtmlRenderFrame.tsx:23`; `docs/user/html-renders.md` | não | ADAPTAR: é o "resposta visual" que o T3-UX-HARVEST deixou para depois, e é a cara de um relatório de equipe | G |
| 26.2 | A página usa o **tema atual** (inclusive tema custom) e acompanha claro/escuro | `docs/user/html-renders.md` §Visual replies | não | PEGAR: sem isso a página parece de outro produto | M |
| 26.3 | Scripts rodam **isolados** da sessão; links abrem no navegador; botão de tela cheia e zoom | `apps/web/src/components/files/BrowserDocumentFrame.tsx:324-328`; `HtmlRenderFrame.tsx:57` | não | PEGAR: `sandbox="allow-scripts allow-forms"` e **nunca** `allow-same-origin` | M |
| 26.4 | Imagens locais por caminho são **embutidas na publicação**, então a página continua funcionando depois que o arquivo some | `docs/user/html-renders.md` §Visual replies | não | PEGAR: é o que torna o relatório arquivável | M |
| 26.5 | Antes de publicar, o agente confere com screenshots de um **navegador headless próprio** (~120 MB, baixado uma vez) | `apps/server/src/preview/ServerBrowserContexts.ts:98-101`; `docs/user/html-renders.md` | não | ADAPTAR: o peso não se paga no v1; validar por outro caminho | G |
| 26.6 | Previews bloqueiam nomes que resolvem para endereço **privado ou reservado** | `docs/user/html-renders.md` §Visual replies | não | PEGAR: é a defesa contra SSRF via página gerada | M |
| 26.7 | Deleção da thread apaga as páginas dela | `docs/user/html-renders.md` §Visual replies | não | PEGAR | P |
| 26.8 | **App MCP** substitui a chamada de ferramenta por um frame interativo, no tema do app | `apps/web/src/components/chat/McpAppFrame.tsx:473-475`; `docs/user/html-renders.md` §MCP apps | não | IGNORAR: a Persona não tem MCP de UI no v1 | G |
| 26.9 | O app pede permissão **antes de cada mensagem** ao fio e antes de chamar ferramenta não read-only | `docs/user/html-renders.md` §MCP apps | não | ADAPTAR o princípio: ação que escreve pede, sempre | M |
| 26.10 | O app pode **informar o agente** do que a pessoa fez nele; a última nota de cada app vai na próxima mensagem | `docs/user/html-renders.md` §MCP apps | não | IGNORAR | M |
| 26.11 | App que navega para fora da própria página é **parado**; app que perde o agente fica visível mas não usável | `docs/user/html-renders.md` §MCP apps | não | ADAPTAR: o princípio de contenção | M |
| 26.12 | Anexar arquivo **dentro da resposta a uma pergunta**, com rascunho próprio por pergunta | `apps/web/src/questionAttachments.ts:11`; `chat/useComposerAttachmentIntake.ts:67` | não | PEGAR: a persona pergunta "qual o logo?" e a pessoa responde com o arquivo | M |
| 26.13 | O rascunho normal do composer **não é afetado** pelos anexos da pergunta; cada pergunta guarda os seus | `apps/web/src/questionAttachments.ts:29`; `docs/user/question-attachments.md` | não | PEGAR: é o que evita anexar no lugar errado | M |
| 26.14 | Pergunta que só aceita opções predefinidas **não** oferece anexo, e a tentativa avisa "This question cannot accept attachments." | `chat/useComposerAttachmentIntake.ts:132` | não | PEGAR: recusa explícita em vez de campo morto | P |
| 26.15 | Falha no envio da resposta **mantém o rascunho** para tentar de novo | `docs/user/question-attachments.md` | parcial — P0-30 no composer | PEGAR | P |
| 26.16 | Reverter a thread remove os anexos das respostas descartadas; apagar a thread usa a mesma limpeza | `docs/user/question-attachments.md` | não | ADAPTAR: junto do checkpoint (§12.27) | P |
| 26.17 | Até **100 arquivos** no conjunto de respostas, com os mesmos limites de imagem do composer | `docs/user/question-attachments.md`; `packages/contracts/src/chatAttachment.ts:14-16` | não | PEGAR | P |

**Notas da área:**
- A página é **publicada** (embutida), não referenciada: por isso sobrevive à movimentação dos arquivos (`docs/user/html-renders.md`).
- O navegador de conferência é **do T3**, nunca o que a pessoa instalou (`docs/user/html-renders.md`).
- Previews carregam recursos públicos (CDN), mas **nada da rede local**; DNS fake-IP (Clash/Mihomo) pode quebrar isso (`docs/user/html-renders.md`).
- O app MCP só aparece em Codex e Claude; Claude exige **2.1.301+**; outros provedores mostram a chamada comum (`docs/user/html-renders.md` §MCP apps).
- No mobile, tela cheia do app MCP **reabre** o app em outra tela, então o que ele não salvou se perde (`docs/user/html-renders.md` §MCP apps).
- O `DraftId` da pergunta é derivado de `ambiente + thread + requestId + questionId` (`apps/web/src/questionAttachments.ts:18`), então duas perguntas nunca compartilham rascunho.
- Anexo de pergunta sobe para o **ambiente da thread**, inclusive remoto, e o agente recebe o caminho (`docs/user/question-attachments.md`).
