# UX backlog: atritos de fluxo (Muse + Forge, priorizado)

Pedido do Miguel via Atlas, em 03/11/2026. Fontes:
- revisões por captura da Muse (`.maestri/tmp/shots/design/`);
- dogfooding "Padaria Lua" do Forge (`persona-spec/reports/dogfood-padaria.md`).

Os atritos do dogfood do Forge (rodada Padaria Lua, 03/11 22:25) entram com o prefixo **DF-** na seção própria abaixo.

**Prioridade**
- **P1**: confunde ou faz a pessoa errar no fluxo principal.
- **P2**: atrito visível, com contorno.
- **P3**: polimento.

**Estado**
- aberto;
- proposto (solução descrita, falta dono ou decisão);
- feito.

> **Fase de UX pós-v1:** as 10 maiores melhorias, com problema, solução, impacto, esforço e métrica, estão em `design/UX-PHASE.md`. Este backlog continua como a lista de atritos pontuais.

## P1

| # | Onde | Atrito | Proposta | Dono | Estado |
|---|---|---|---|---|---|
| UX-01 | Aprovações | A mesma decisão aparece duas vezes: em "Resumo de iniciativa" (Aceitar/Recusar) e em "Precisa de você agora" (Revisar e contratar). Não fica claro se aceitar uma resolve a outra. | Uma decisão, um cartão. "Precisa de você agora" fica só com o que bloqueia; propostas de iniciativa ficam no resumo. Ao decidir, o cartão sai das duas listas, com o carimbo. | Lumen + Anvil | proposto |
| UX-02 | Contratação proposta | A coordenação propõe "Contratar Cláusulas de rescisão?": uma persona por **tarefa**, contra a regra "uma persona por função que nunca acaba". | A proposta de contratação só nasce de função recorrente. Tarefa pontual vira cartão no quadro. A copy explica o porquê ("Toda semana chegam contratos para revisar → uma revisora jurídica"). | Forge (recommend) + Lumen | proposto |
| UX-03 | Navegação | "Projetos" e "Quadros" são duas entradas para quase o mesmo objeto. Cada projeto tem um quadro e ambos têm "Novo projeto". | Fundir num só item "Projetos": grade de projetos, e o clique abre o quadro na aba Quadro da página do projeto. "Quadros" sai do rail. | Prism + Lumen (BOARDS-SPEC) | proposto |
| UX-04 | Navegação | "Perfil" em *Mais* não diz de quem é. O perfil de verdade está a 2 cliques: avatar → ⋯ → Abrir perfil. | Tirar "Perfil" do rail. Perfil sempre a partir de uma persona: cartão, organograma, banner. No cartão, o nome vira link para o perfil (1 clique). | Prism (rail) + Muse (cartão) | **fechado** 04/11 (prova: teste `persona-card` + Busca → Equipe) · era: feito (cartão: Muse; rail: Prism; também pela Busca → Equipe) |
| UX-05 | Regras | Campos numéricos crus ("Tokens / mês por persona: 50000") sem unidade nem referência. Ninguém sabe o que é razoável. | Predefinições "Econômico · Normal · Generoso" com a estimativa em linguagem simples ("≈ 40 tarefas médias por mês"). Números só em "Personalizar". | Muse (com ok do Lumen) | **fechado** 04/11 (prova: `gallery/antes-depois/panel-regras-light.png`) · era: feito: cartões Econômico · Normal (recomendado) · Generoso · Personalizar com "até N propostas por dia · ≈ N tarefas médias por mês"; números só em Personalizar, com dica em tarefas; Salvar só fica primário quando algo mudou. A conversão (10 mil tokens por tarefa média) é para o Rivet calibrar pelo UsageStore |
| UX-06 | Rail em janela baixa | Com os grupos recolhidos (abaixo de 1000 px), os itens de Organização/Empresa somem e só voltam se a pessoa abrir o grupo. | Garantir que Ctrl K ache **todas** as telas e personas. O grupo da tela ativa já abre sozinho. Avaliar um contador no rótulo do grupo recolhido quando houver pendência ("Empresa · 1"). | Muse | **fechado** 04/11 (prova: Ctrl K global (teste) e grupo ativo que abre sozinho) · era: feito: Ctrl K/⌘K virou atalho global (antes a dica não fazia nada); a Busca mostra "Ir para" (todas as telas, mesmo em grupos recolhidos) e "Equipe", sem acento; ↓/Enter. Mensagens via `search()` do host: Prism (`contentResults`) |

## P2

| # | Onde | Atrito | Proposta | Dono | Estado |
|---|---|---|---|---|---|
| UX-07 | Rail / cartão | O cartão da persona abre por passar o mouse ou pelo ⋯. No modo avatares (janela baixa) não há ⋯, então pelo teclado não se chega ao cartão. | Foco no avatar e **Shift+F10** ou **Enter** longo abre o cartão; ou o ⋯ aparece no foco. Documentar o atalho no tooltip. | Muse | **fechado** 04/11 (prova: teste de `aria-keyshortcuts` (Shift+F10)) · era: feito: Shift+F10 / tecla Menu no avatar abre o cartão (`aria-keyshortcuts`, teste) |
| UX-17 | Onboarding passo 4 | Três caminhos competem no mesmo passo: "Assistente de estrutura" (botão largo no topo), modelos (Equipe sugerida, Startup, Agência, Em branco) e "Construtor conversacional" com "Gerar rascunho". A pessoa não sabe por onde começar. | O caminho principal é o modelo pré-selecionado (Equipe sugerida). Abaixo, um link "Não sabe? Responda 3 perguntas e montamos com você" abre o assistente; o construtor por descrição vira o passo 1 do assistente. | Prism | **feito 04/11 (prism), aguarda aceite da Muse**: modelo sugerido já marcado é o caminho principal; assistente e "descrever com suas palavras" viraram links secundários (o botão mantém "Assistente de estrutura" no nome; seletor do E2E). Prova: `onboarding-step4-paths` 5/5 |
| UX-08 | DM | "Nova conversa" abre a primeira persona disponível sem perguntar. | Abrir um seletor de persona (retratos e cargo) antes de criar a DM. | Prism | **feito 04/11 (prism), aguarda aceite da Muse**: seletor de persona antes da DM (ordem: DM existente, Coordenação, resto; setas/Enter/Esc; `aria-activedescendant`). Prova: `new-dm-persona-modal` 6/6 |
| UX-09 | Composer | "Responde: Atlas" é um seletor sem explicação. A pessoa não sabe que ele **roteia o pedido**. | Rótulo "Quem responde" com uma dica na primeira vez ("A coordenação distribui; escolha alguém para falar direto"). | Prism | **feito 04/11 (prism), aguarda aceite da Muse**: "Quem responde" + dica 1×/instalação (só com >1 persona, não rouba foco, Esc/Entendi) e chip de autonomia. Prova: `who-responds-hint` 6/6, `composer-autonomy-chip` 2/2 |
| UX-10 | Saúde | O botão "Teste dos 2 dias" no cabeçalho repete a seção logo abaixo e não diz o que faz. | Renomear para "Simular de novo" e colocar no próprio cartão do teste. Tirar do cabeçalho. | Muse (com ok do Lumen) | **fechado** 04/11 (prova: `gallery/antes-depois/panel-sau-de-light.png`) · era: feito: o botão saiu do cabeçalho e virou "Simular de novo" no próprio cartão do teste |
| UX-11 | Conexões | Os estados "Pronta", "Não conectado" e "Não detectada" não dizem o próximo passo, e "Como funciona" e "Conectar" competem. | Um estado por cartão, com **uma** ação clara ("Instalar", "Entrar", "Pronta ✓"), mais a frase do que a pessoa ganha com aquele motor. | Lumen + Rivet | aberto |
| UX-12 | Uso e limites | Mostra o consumo, mas não diz o que acontece no limite nem o que fazer. | Para cada motor no limite: "Volta às 18:30 · as tarefas esperam" e o botão "Trocar motor desta persona". Ligar com o cartão da persona. | Lumen | aberto |
| UX-13 | Cofre (vazio) | A copy fala do passado ("No onboarding você descreve a empresa"), mas a pessoa pode ter pulado o onboarding. | "Conte o básico da sua empresa e a equipe passa a usar em todo pedido", com a ação "Descrever a empresa". | Muse + Lumen | **fechado** 04/11 (prova: `gallery/antes-depois/panel-conhecimento-light.png`) · era: feito (cópia e prop `onDescribeCompany`); ligar a ação: Lumen |
| UX-14 | Rotinas (vazio) | "Sugerir rotina" não diz quem sugere nem o que acontece. | "Pedir sugestões à coordenação": abre a DM com Atlas e um pedido pronto. | Muse + Lumen/Prism | **fechado** 04/11 (prova: `gallery/antes-depois/panel-rotinas-light.png`) · era: feito (cópia e prop `onAskSuggestions`); ligar a ação (sendToPersona para a coordenação): Lumen |
| UX-18 | Estados vazios | **11 botões mortos**: o CTA do estado vazio aparecia sem ação em Canvas, Conexões, Arquivos (vazio), Cofre, Membros, Memória, Perfil, Rotinas, Regras, Skills e Uso. | O `PersonaSurfaceEmpty` só desenha o CTA quando há `onPrimary` (**feito**, Muse). Cada dono liga o seu para o botão voltar. | Lumen / Prism | primitivo **feito**; ligações abertas |

## P3

| # | Onde | Atrito | Proposta | Dono | Estado |
|---|---|---|---|---|---|
| UX-15 | Organograma | "Você" aparece com V maiúsculo no meio das frases da Saúde ("depende de Você") porque é o nome-placeholder do humano. | Usar o nome real do membro. Sem nome, a frase muda de forma ("depende de você"). | Muse | **fechado** 04/11 (prova: `integ/antes-depois/panel-sau-de-light.png`) · era: feito (`youInSentence` na apresentação da Saúde; o host fica intacto) |
| UX-16 | Figurinhas | Só o Atlas e o Bento tinham figurinhas, e o seletor misturava estilos. | Os 5 do modelo agora têm figurinhas (30 no pipeline). A figurinha segue o bicho do autor; nas mensagens do humano, usa o bicho da coordenação (#geral) ou do par (DM). O + sem reação virou ação flutuante. | Brush (8 bichos restantes) + Muse | **fechado** 04/11 (prova: `gallery/antes-depois/channel-light.png`) · era: feito para 9 bichos (5 do modelo + capivara, cervo, coelho, coruja: 54 figurinhas) |

## Fechados pela Muse em 04/11 (novos, antes/depois)

Provas em `.maestri/tmp/shots/design/`. Onde não guardei a captura do estado antigo, o "antes" vem como texto literal ou como resultado do axe.

| # | Onde | Antes | Depois | Prova |
|---|---|---|---|---|
| UX-19 | Canal | O `?` do cabeçalho não fazia nada (controle morto). | Abre a **Ajuda** no guia do contexto. A Ajuda é uma tela nova: 19 guias de `docs/persona` com busca sem acento, índice e "Nesta página", mais a aba **Novidades**. Ligada pelo Prism. | `fase-ux/antes-depois/ajuda.png`, `help/*`, axe 0 |
| UX-20 | Erros de execução | Texto cru no chat: "CLI codex não está logada…", "indisponível neste runner", "executor DSH não está montado neste host". Sem botão. | Cartão da persona (`RunErrorCard`) com o que aconteceu, o que fazer e 1 botão útil, em 8 códigos. Host (Anvil) e runner (Rivet) mandam o código; uma ponte cobre o texto antigo. | `run-errors/run-errors-pt-{light,dark}.png`, teste 0 jargão |
| UX-21 | 1ª janela do app instalado | Janela branca por 120 s, sem splash, mensagem ou saída. | `BOOT-SPEC` com protótipo funcional (splash ≤ 320 ms, prazo, "Tentar de novo", CSP estrito). Neste NSIS, só o fundo do tema; o porte completo vai no próximo (Rivet). | `fase-ux/antes-depois/boot-1a-janela.png`, `boot/*` |
| UX-22 | Liga/desliga no escuro | O switch desligado sumia no modal escuro (contorno quase preto, abaixo de 3:1). | Primitivo único `Switch`, com trilha em `outline-control`, alvo de 44 px e reduced-motion. Gestor, Ensinar e editor usam. | `teach-dark.png`, `launch/about-pt-dark.png` |
| UX-23 | Botão carregando | Perdia o nome acessível (`visibility: hidden` no rótulo). O axe acusou na página viva do design system. | `opacity: 0`: o rótulo segue no leitor de tela. | axe `button-name` 0 em `design/system/` |
| UX-24 | Texto em todo o app | Jargão: harness, CLI, host, workspace, onboarding, cache hit, patch; "Travado", "Offline", "Bem-vindo"; o app ora "o", ora "a Persona". | Glossário `design/MICROCOPY.md`. 22 dicionários pt e en, 9 guias e o "Primeiros passos" reescrito pelo onboarding real. O app é "a Persona". | testes de copy 49/49; `help/guides-light.png` |
| UX-25 | Quadro | O mini-avatar que "carrega o cartão" nunca aparecia (`carry` não era produzido, CSS inválido). | `use-kanban-carry` + FLIP de 360 ms (persona) e 220 ms (humano), com fade de 100 ms em reduced-motion. Ligado pelo Lumen. | teste `kanban-carry` |
| UX-26 | Erro de tela | O detalhe técnico aparecia solto embaixo da frase humana. | Dobrado em "Detalhes para o suporte", selecionável. | `design/system/` (ErrorState) |

## Dogfood do Forge (Padaria Lua, 03/11)

| # | Onde | Atrito | Proposta | Dono | Estado |
|---|---|---|---|---|---|
| DF-002 | Onboarding → Entrar | **P0.** O overlay do passo 5 volta depois de "Entrar no Persona". O contrato do RPC está errado: o cliente manda `roster`, e o host espera `team`/`personalProjectId`. | Alinhar ao `CompleteOnboardingRequest`. | Prism | **feito (prism)**: `completeOnboarding` do cliente já manda o `CompleteOnboardingRequest` do host (`team`, `personalProjectId`, `templateIds`, `cofreSeed`) e o overlay só fecha pelo host/pela pessoa; prova: `onboarding-overlay-sync`, `onboarding-delivery-lock` e o E2E do Probe |
| DF-001 | Onboarding passo 4 | **P1.** Com o assistente aberto, aparecem dois "Continuar", e o do rodapé avança sem aplicar a equipe. | Com o assistente aberto, o rodapé esconde o próprio Continuar (junta-se ao UX-17). | Prism | **feito (prism)**: com o assistente aberto o rodapé não mostra o 2º "Continuar" (`structure-assistant`, `onboarding-first-delivery` 1º teste) |
| DF-005/006 | Quadros → Novo projeto | **P1.** Não pede o nome; só troca o modelo do projeto Pessoal. | O passo 1 pede nome e modelo; "Usar este modelo" cria um projeto novo. | Lumen | aberto |
| DF-008 | DM | **P1.** A DM começa vazia, e "Nova conversa" não deixa escolher com quem falar (= UX-08). | Seletor de persona com retratos. | Prism | **feito 04/11 (prism)**: = UX-08 |
| DF-010 | Perfil / Visão geral | **P1.** Não existe controle para a pessoa se marcar como fora, o que bloqueia o "Enquanto você estava fora" (DF-011) e o Teste dos 2 dias real. | Interruptor "Estou fora até…" no perfil e na pílula de presença do rail. | Lumen + Prism | **feito 04/11 (prism, UI), aguarda aceite da Muse**: interruptor "Estou fora" no rail com prazo real e retorno automático; o substituto de aprovações depende do Anvil (aviso honesto enquanto isso). Prova: `user-away-control` 9/9 |
| DF-013 | #geral | **P1.** O pedido enviado não aparece no transcript. | Investigar o `postChannelMessage` otimista contra o host. | Prism | aberto |
| DF-007 | Projeto → Sprints | **P2.** Não há ação para criar ou iniciar a Sprint 1. | Botão "Planejar sprint" na faixa da sprint vazia (BOARDS-SPEC). | Lumen | aberto |
| DF-003 | Texto em todo o app | Relatado como P0 ("copy sem espaços"). **Falso positivo**: nas capturas `04-copy-sem-espacos.png` e `05-quadros.png` os espaços aparecem ("Bem-vindo ao #geral"). A leitura do passeio concatenou o `textContent`. | Trocar a extração do harness por `innerText` / `getByText`. | Forge (harness) | não é bug de UI |
| DF-M1 | Rail | Revelado pela captura 05: a pílula ativa ficava em branco e no lugar errado (fora do "Quadros"), porque a medição só acontecia uma vez. | `useActiveIndicator`: mede de novo com ResizeObserver, `transitionend` e fontes. | Muse | **fechado** 04/11 (prova: `panel-quadros-light.png`) · era: feito e confirmado por captura (`panel-quadros-light.png`) |
| DF-M2 | Tabs | Revelado pela captura 05: o indicador do "Todos" ficava deslocado e cortado (medido antes das fontes carregarem). | O mesmo hook. | Muse | **fechado** 04/11 (prova: `panel-quadros-light.png`) · era: feito e confirmado por captura (`panel-quadros-light.png`) |

## Feitos nesta rodada (referência)

- O rótulo "Equipe" era o mesmo para o grupo e para o item, o que gerava dois botões com o mesmo nome. O grupo virou **Organização**.
- "Revogar acesso" não aparece mais no próprio dono (Lumen).
- Motores e modelos com nome humano (`team/engine-label.ts`), sem "dsh · default".
- Zero inventado → "Sem estimativa ainda" / "indisponível".
- Projetos: o cartão inteiro é um botão de teclado e há o bloco "Novo projeto".
