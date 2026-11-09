# TOP 30 — o que trazer do T3 Code para a Persona

**Fonte:** `INVENTARIO.md` (842 itens em 26 áreas) e `DESEMPENHO.md`, lidos no commit `25bf84ab` do T3 Code em 07/11/2026.
**Re-verificação 09/11:** ver `TICKETS-UI-DRAFT.md`. O item 17 (aprovação com escopo) já está no tree; 5, 12, 14, 15, 21, 23, 24, 26, 27 e 30 são parciais — em vários deles o harness já tem o plugin (atalhos, `@`, draft, anexos, terminal) e a Persona o desliga. A tabela de integração abaixo é o retrato de 07/11 e não foi reescrita.
**Critério de ordem:** valor para a Persona **agora**, não completude do T3. Três filtros:
1. **Corrige algo que a Persona promete e não entrega** (proatividade, equipe visível, nunca mentir) — sobe.
2. **Faz a equipe parecer viva e competente** (streaming, tempo, rosto, aviso) — sobe.
3. **Só faz sentido em ferramenta de código** (PR, worktree, branch, editor de tema) — cai ou sai.

Cada item traz **por quê** (o que muda para a pessoa) e **primeiro passo** (o menor movimento real no nosso código).

---

## A lista

### Faixa 1 — a resposta precisa parecer viva (itens 1–5)

| # | O que trazer | Por quê | Primeiro passo | Tam. | Ref. |
|---|---|---|---|---|---|
| **1** | **Streaming incremental + Parar de verdade** | Hoje a resposta chega inteira: a pessoa acha que travou e a Persona parece lenta. É o P0-1 do UX-BEYOND e a única coisa que o T3 faz melhor no momento mais visível do produto. | `remote/apply-message-stream.ts` passa a escrever no balão aberto (não no preview) e `chat/ChannelComposer.tsx` mostra o Parar com o campo vazio — o handler já existe (`chat/host-turn.ts`). | G | §3.1, §3.2, §3.3, §3.18 |
| **2** | **Fila real + direcionar (steer)** | Sem isso, corrigir a persona no meio do turno é impossível: ela termina o trabalho errado e a pessoa recomeça. É o P0-18 e o maior desperdício de token do produto. | Ligar `persona-host/src/working-send-host.ts` (`enqueue`/`edit`/`flush`) no balão tracejado que já existe (`chat/QueuedMessageBubble.tsx`), atrás da flag `persona.flag.workingControl`. | G | §3.35, §3.36, §2.33, §2.36 |
| **3** | **"No limite" com Retomar e Sonegar até o reset** | Quando a cota acaba, o T3 guarda a fila, explica a hora do reset e retoma sozinho. A Persona hoje só recarrega. É o P0-19 e é o que separa "equipe que espera" de "equipe quebrada". | `chat/LimitBanner.tsx` ganha "Retomar às {hora}" e "Sonegar até o reset"; o envio com limite entra na fila do item 2 em vez de falhar. | M | §3.17, §11.26, §11.27 |
| **4** | **Notificação que dispara, só quando importa** | A equipe trabalha sozinha; sem aviso, a proatividade é invisível e a pessoa só descobre o trabalho perdido. É o P0-16 — a lógica já está pronta no desktop e ninguém a chama. | O renderer passa a chamar `personaAlwaysOn.attention` a partir do live store; `needsYouCount` entra no `apps/desktop/src/preload-app.ts`. Regra: silêncio com a janela em foco. | M | §13.1–13.11 |
| **5** | **Dobra do turno concluído + cronômetro honesto** | "Trabalhou 22s" no lugar de 40 linhas de atividade é o que mantém um fio de 200 turnos legível — e o cronômetro é o antídoto do spinner mentiroso. | `primitives/Pooled.tsx` (`ActivityGroup`) ganha a dobra e o tempo; o histórico só carrega ao expandir. | G | §3.21, §3.22 |

### Faixa 2 — a equipe precisa de rosto e de alcance (itens 6–11)

| # | O que trazer | Por quê | Primeiro passo | Tam. | Ref. |
|---|---|---|---|---|---|
| **6** | **SnapShot: captura de janela + árvore de acessibilidade** | É o insumo que falta no "Ensinar a persona" (WAVE2 §2). O nosso `teach/teach-recorder.ts` grava só o viewport do app; o T3 captura **qualquer** janela e manda, junto do print, os controles e textos com posição. A persona passa a aprender com o programa real do cliente. | Começar pelo Windows, que não exige permissão: atalho global → captura da janela em foco → anexo no rascunho. A árvore vem por `ffi-rs` **em processo filho**, nunca no main. | G | §18.1–18.13 |
| **7** | **Rewind: "Editar daqui" + reverter arquivos** | Corrigir o rumo sem recomeçar a conversa. O T3 devolve o prompt ao composer e oferece "reverter os arquivos também". É a diferença entre um erro de 2 minutos e um de 2 horas. | `chat/GeneralChannelView.tsx` ganha "Editar daqui" na mensagem; o host expõe rewind + restore do checkpoint (item 24). | G | §3.33, §2.38, §12.28 |
| **8** | **Tarefas agendadas com destino por execução** | As Rotinas da Persona existem, mas sem "thread nova a cada rodada / mesma conversa / sessão nova". Sem isso a rotina vira uma thread infinita e caríssima — ou uma bagunça. | `routines/routine-wire.ts` ganha o campo de destino e `RoutineEditorModal.tsx` as três opções; o host cria a thread conforme o destino. | M | §17.1–17.6, §17.20 |
| **9** | **Side chat (`/lado`) com "trazer de volta"** | Perguntar sobre um assunto **sem poluir o fio** e depois trazer o que aprendeu para dentro. O host já tem `aside`; o client nunca chama. É o P1-21. | Ligar `openAsideAsk` no `onSlashCommand` de `chat/ChannelComposer.tsx`; `chat/AsideCard.tsx` ganha "Trazer para a conversa". | M | §7.41, §7.42 |
| **10** | **Undo de 5 s em toda ação de lista** | Mover, arquivar, adiar, concluir: sem desfazer, a pessoa não mexe. O T3 reivindica `mod+z` por 5 s e mostra o que desfez. É o P1-10 e o par natural do "Desfazer 30 dias" que já temos no Revisar. | `primitives/Feedback.tsx` ganha o toast "{ação} · Desfazer" com 6 s; `mod+z` chama o mesmo handler enquanto o toast está vivo. | M | §7.29, §9.25 |
| **11** | **Concluir / Adiar / Arquivar com seções de verdade** | O `SubjectBar` já tem os itens e **nenhuma tela passa os handlers** (P1-20). O T3 mostra como: seção "Trabalhando" recolhida, prateleira "Concluídos", e o assunto volta ao topo quando precisa de você. | Ligar os handlers de `chat/SubjectBar.tsx:151` e adicionar a seção "Trabalhando" no `shell/ConversationsRail.tsx`. | M | §7.1, §7.3, §7.7, §7.9, §7.11 |

### Faixa 3 — achar e agir rápido (itens 12–16)

| # | O que trazer | Por quê | Primeiro passo | Tam. | Ref. |
|---|---|---|---|---|---|
| **12** | **Busca full-text nas mensagens, abrindo na mensagem exata** | O Ctrl K promete "Nas conversas" e hoje não acha. O T3 usa FTS5, ranqueia por thread e abre o fio **na mensagem**, com o termo destacado. | Índice FTS5 no `persona-store` + um `searchMessages` no host; a tela Buscar abre o assunto com o Find ancorado (item 13). | G | §8.6, §8.7 |
| **13** | **Find dentro da conversa (`Ctrl+F`)** | Reencontrar uma decisão num fio longo hoje é rolar. O T3 tem barra com "n/m", próxima/anterior e varredura no servidor. | `chat/GeneralChannelView.tsx` ganha a barra; o host expõe `findInThread` com debounce de 100 ms. | G | §8.13, §7.24 |
| **14** | **Sistema de atalhos remapeáveis com `when`** | A Persona tem atalhos fixos no código. Todo atalho novo vira discussão. O T3 tem um `keybindings.json` com regras, precedência, detecção de conflito e tela de edição. | Um registro de comandos + um `keybindings.json` no perfil do usuário; a tela de atalhos (item 15) vem depois. | G | §9.52–9.56, §10.20 |
| **15** | **Tela de atalhos (`?` abre)** | O UX-BEYOND já marca como PIOR que o T3. O T3 não tem o `?` — **nós podemos ter**, e é barato depois do item 14. | `help/` ganha a tela gerada a partir do registro do item 14, agrupada por área. | M | §9.52 |
| **16** | **Paleta overlay que executa, com ranking por uso** | O Ctrl K hoje troca a tela inteira. O CMDK-OVERLAY-SPEC já decide o overlay; falta o ranking (palavra inteira, typo de 1 edição, uso recente) e os números 1–9. | Implementar `shell/cmdk-overlay/` conforme a spec e trocar o `selectPanel('search')` por ela atrás da flag. | M | §8.1–8.4, §9.10–9.17 |

### Faixa 4 — confiança e controle (itens 17–22)

| # | O que trazer | Por quê | Primeiro passo | Tam. | Ref. |
|---|---|---|---|---|---|
| **17** | **Aprovação com escopo: uma vez / nesta sessão / sempre** | O Segundo cérebro promete "permissão concedida com escopo e validade". O T3 já tem os três escopos no pedido. Sem isso, a persona pergunta a mesma coisa dez vezes. | `approvals/InboxDetail.tsx` ganha os três botões; o host grava a concessão com escopo e validade. | M | §4.18, §4.13, §4.14 |
| **18** | **Recusar explicando** | O texto digitado no composer vira recusa **mais** mensagem ao agente. É o que evita repetir o mesmo erro três vezes. | `approvals/` e o composer: recusar com texto envia a mensagem ao motor que pediu. | M | §4.19, §4.20 |
| **19** | **Aprovação de subagente sobe para o pai** | A Persona delega (Gestor → personas). Se a aprovação de um filho não chega na conversa principal, o trabalho trava em silêncio. | O host propaga o pedido do subagente para a thread pai com o nome de quem pediu. | M | §4.23, §7.34 |
| **20** | **Aviso de limite no host, não só na tela** | O T3 recusa rodar acima do teto e **segura a fila** até alguém baixar o modo. A Persona tem autonomia configurável; o limite precisa valer no host. | `persona-host` valida a autonomia no despacho e devolve erro estruturado; a UI mostra "Mudar para X". | G | §4.9–4.11 |
| **21** | **Registro da decisão (quem, quando, por quê)** | O MAESTRO.md pede auditoria. O T3 persiste status, `resolvedAt`, `decision` e `feedback` por pedido. | O evento de aprovação no session log já é o registro; falta o campo `feedback` e a leitura em `decisions/`. | M | §4.26 |
| **22** | **Envio que falha avisa e oferece "Tentar de novo"** | P0-30: hoje a mensagem otimista fica pendurada e ninguém sabe. O T3 tem "Not connected: message not sent". | `remote/persona-live-store.ts` marca a mensagem como falha; o balão mostra "Não enviado · Tentar de novo". | P | §14.23, §3.13 |

### Faixa 5 — o composer que a pessoa merece (itens 23–26)

| # | O que trazer | Por quê | Primeiro passo | Tam. | Ref. |
|---|---|---|---|---|---|
| **23** | **`@` arquivos e `$` skills** | É como a pessoa dá contexto e chama uma habilidade sem decorar comando. O T3 usa `@` para arquivo/thread e `$` para skill (e `$5` não dispara). | `chat/ChannelComposer.tsx` ganha o menu com dois gatilhos; o host já lista arquivos do projeto e skills. | M | §2.15, §2.18 |
| **24** | **Rascunho que leva anexos e modelo** | Hoje o rascunho guarda só o texto. Quem troca de assunto e volta perde o anexo. O T3 persiste texto + anexos + contextos + modelo por thread. | `chat/ChannelComposer.tsx` e o store de rascunho passam a serializar a lista de anexos. | G | §2.32, §2.25 |
| **25** | **Diagnóstico de CLI: PATH, versão e "Atualizar agora"** | É o P0-26 do UX-BEYOND: hoje o "Adicionar conta" mostra um comando bruto de 10 linhas. O T3 detecta a CLI, diz "não está no PATH", oferece **Binary path**, avisa versão incompatível e executa o instalador dono da CLI. Resolve o erro nº 1 do produto com texto, não com suporte. | `connections/AccountDialogs.tsx` ganha os 6 estados (`checking/disabled/install/signIn/ready/attention`) e o campo Binary path; o host expõe `detectCli` + `updateCli`. | M | §25.15–25.18, §25.23, §25.24 |
| **26** | **Colar imagem comprimida e HEIC convertido** | No Windows a pessoa cola print de iPhone e nada abre. O T3 comprime/redimensiona e converte antes de anexar. | `chat/ChannelComposer.tsx`: normalizar no `onPaste` antes de criar o anexo. | M | §2.29 |

### Faixa 6 — o que só a Persona ganha (itens 27–30)

| # | O que trazer | Por quê | Primeiro passo | Tam. | Ref. |
|---|---|---|---|---|---|
| **27** | **Terminal na tela, com "mandar o trecho para a conversa"** | A Persona executa CLIs nativas; ver o que elas fazem é metade do valor. E o trecho selecionado virar contexto no composer é a ponte com a persona. **O backend já existe** (`packages/terminal` → `ctx.terminals`, `packages/terminal-bash`): falta a superfície e a persistência. | Abrir o drawer sobre `ctx.terminals` com um terminal por projeto, sem split; depois persistir a sessão (hoje ela morre no restart) e o popover "Mandar para a conversa". | M | §6.1–6.14, §6.21 |
| **28** | **Checkpoint por turno, sem git** | É o que permite "voltar o turno" e "reverter os arquivos" sem exigir que a pessoa use git. O T3 usa refs ocultas; a Persona pode usar cópia por turno dentro do workspace. | Gravar o estado da pasta antes de cada turno que escreve; o Revisar passa a comparar contra o checkpoint. | G | §12.27, §12.28 |
| **29** | **Convidado: link de uso único para o cliente ver o trabalho** | "Mostrar para o cliente" é o caso de uso que vende a Persona. O T3 tem o fluxo inteiro: link de 24 h, um navegador, mensagens do convidado pendentes de aprovação. | Só depois da Cloudflare (persona-sync). O modelo de dados é o do T3: share com TTL, mensagens pendentes, badge na lista. | G | §15.22–15.25 |
| **30** | **Acessibilidade que o T3 acertou e quase ninguém acerta** | A Persona é vendida como "equipe com rosto"; quem não vê a tela precisa saber que a Nina terminou. O T3 tem região viva com NBSP para repetição, F6 em fase de captura e navegação de árvore completa. | `primitives/` ganha `useLiveRegion` (com o NBSP) e o anúncio de segundo plano; o F6 passa a incluir o `TurnContextDrawer`. | M | §14.31, §14.32, §14.34, §14.37 |

---

## Integração com o backlog já aberto (para não criar ticket duplicado)

Cruzamento com `persona-spec/design/UX-BEYOND-T3.md` (P0/P1/IV/F/A) e `CMDK-OVERLAY-SPEC.md`. **Não abra ticket novo para o que já tem ID.**

| # | Já está em | Dono atual |
|---|---|---|
| 1 Streaming + Parar | **P1-1** (subiu para P0) + **IV-5** | Flint + Forge/Bolt |
| 2 Fila real + steer | **P0-18** + **IV-5** | Flint + Anvil/Bolt |
| 3 No limite + Retomar | **P0-19** + **IV-7** | Flint + Anvil/Bolt |
| 4 Notificação que dispara | **P0-16** + **IV-2** | Prism + Rivet + Anvil |
| 5 Dobra do turno + cronômetro | **novo** | — |
| 6 SnapShot | **novo** | — |
| 7 Rewind "Editar daqui" | **novo** (P1-10 é desfazer de ação, não rewind) | — |
| 8 Rotinas com destino | **novo** (IV-9 cobre só criar/editar) | — |
| 9 Side chat | **P1-21** + **IV-6** | Flint + Bolt |
| 10 Undo de 5 s | **P1-10** | Ember |
| 11 Concluir / Adiar / Arquivar | **P1-20** + **IV-6** | Flint + Anvil |
| 12 Busca full-text nas mensagens | **novo** | — |
| 13 Find na conversa | **novo** | — |
| 14 Atalhos remapeáveis | **novo** | — |
| 15 Tela de atalhos | **P1-22** (só o `?`; o editor é novo) | Muse |
| 16 Paleta overlay | **P1-18** (1–9) + **CMDK-OVERLAY-SPEC** (forma decidida) | Flint/Lumen |
| 17 Aprovação com escopo | **novo** | — |
| 18 Recusar explicando | **novo** | — |
| 19 Aprovação de subagente | **novo** | — |
| 20 Limite no host | **novo** | — |
| 21 Registro da decisão | **novo** | — |
| 22 Envio que falha | **P0-30** | Flint |
| 23 `@` arquivos e `$` skills | **P0-27** (só o `/`; `@` e `$` são novos) | Flint |
| 24 Rascunho com anexos | **novo** (P0-17 é a memória das DMs) | — |
| 25 Diagnóstico de CLI | **P0-26** | Quill (+ Rivet no P1) |
| 26 Colar imagem / HEIC | **novo** | — |
| 27 Terminal na tela | **novo** | — |
| 28 Checkpoint por turno | **novo** | — |
| 29 Convidado | **novo** | — |
| 30 Acessibilidade | **P0-4** (plural/live) + **P1-17** (F6 no drawer) | Prism + Lumen + Flint |

**Resultado:** 11 dos 30 já têm ID e dono — não precisam de ticket. **19 são novos.** Desses, 6 são baratos (`P`) e podem entrar na onda A sem esperar: 22 (já é P0-30), 25 (já é P0-26), 30 (já tem ID), e os novos 5, 13 e 26.

**Atenção para o Keel:** os itens 1, 2, 3, 4, 9, 11 e 22 já estão atribuídos a Flint/Anvil/Bolt/Rivet. O meu TOP30 não muda o dono; ele só acrescenta o **como** (o arquivo:linha do T3 que mostra a forma pronta).

---

## Menções honrosas (quase entraram)

| Item | Por que não está nos 30 | Ref. |
|---|---|---|
| Editor rico com Markdown estilizado ao vivo | É o maior salto de qualidade do composer, mas custa `G` e não desbloqueia nada antes dele. Fazer depois dos itens 23 e 24, e só se o textarea com preview não bastar. | §2.1, §2.2, §2.9 |
| Anotar sobre o preview ("aponte para o que está errado") | A melhor forma de pedir uma mudança ao cliente, e o T3 tem o fluxo inteiro (selecionar região, comentar, anexar). Caro: exige navegador embutido com seletor de elementos. | §22.9–22.11 |
| Resposta visual: a persona entrega uma página | Gráfico, tabela ou colagem acima da resposta — a cara de um relatório de equipe. Depende de sandbox de HTML e de tema injetado. | §26.1–26.7 |
| Explorador de arquivos com editor e visualizadores | A Persona tem `files/FilesView.tsx` em mock. O T3 tem 12 visualizadores e gravação automática. Entra por tipo: PDF e planilha primeiro. | §21.18–21.19, §21.31–21.32 |
| Handoff com orçamento de contexto | Já está no item 26; o detalhe fino (16k tokens, 1 token/byte, 8.192 por imagem, ferramenta de recuperação) está em §20 e é o que evita o resumo ruim. | §20.1–20.15 |
| Webhooks com placeholders e dado não confiável | Alto valor, mas só depois do item 29 (URL pública). | §17.7–17.16 |

---

## O que ficou de fora, e por quê

| Item do T3 | Por que não entra agora |
|---|---|
| PR completo (lista, abas, review, merge) — §5.26–5.32 | A Persona não é ferramenta de PR. O cliente dela não abre pull request. |
| Worktree por thread, branch, seletor de base — §12.1–12.9 | Estrutura de ferramenta de código. A Persona trabalha na pasta do projeto. |
| Editor de tema, importar tema do VS Code, Open VSX — §10.8–10.10 | Contraria a direção visual aprovada (D). |
| 23 seções de configuração com herança projeto × ambiente — §10.1, §10.3, §10.4 | Complexidade de multi-máquina. A Persona precisa de ~8 seções. |
| Multi-máquina, SSH, Tailscale, túnel próprio — §16.30–16.34 | A base remota da Persona é Cloudflare (decisão 12), não um servidor por máquina. |
| Política gerenciada corporativa — §10.27, §16.18 | Não temos cliente corporativo. |
| Webhooks com assinatura, dedupe e coalescência — §17.7–17.16 | Alto valor, mas depende da URL pública. Entra **depois** do item 29. |
| Voz (ditado) — §2.43 | Alto valor, mas exige transcrição real; não é o gargalo agora. |
| Telemetria de produto — §16.22–16.24 | A Persona deve fazer o contrário: desligada por padrão, opt-in explícito. |
| Triagem de problema — §19 | Só faz sentido para app open source com usuário técnico. |
| Mobile (iOS/Android) — §13.18–13.26 | Fora do v1. |
| Espelhamento de celular — §23 inteiro | Ferramenta de desenvolvimento de app. A Persona não desenvolve app. |
| Navegador embutido com perfis, cookies e importação — §22.21, §22.30–22.31 | Complexidade de navegador; o preview simples resolve o caso de ver o site do cliente. |
| Visualizadores de notebook, binário, SQLite e fonte — §21.33, §21.36–21.37 | Público técnico. |
| Editor de estilo do elemento anotado — §22.12 | Ferramenta de designer. |
| Agentes externos via MCP com escopo e pareamento — §24.23–24.25 | Fora do v1; volta quando houver API pública. |
| Serviço em background, SSH, Tailscale, LAN — §13.27, §24.4, §24.29–24.31 | A Persona é app desktop com host embutido e base Cloudflare. |

---

## Ordem de execução sugerida

**Onda A — a resposta parece viva (2–3 semanas):** itens 1, 2, 3, 4, 22. São os P0 do UX-BEYOND que ainda estão abertos e todos passam pelo mesmo lugar: o turno no host.

**Onda B — a equipe tem rosto e memória (3–4 semanas):** itens 5, 7, 10, 11, 19. Dependem do checkpoint (item 28) só o 7; o resto é UI sobre estado que já existe.

**Onda C — achar e agir (3–4 semanas):** itens 12, 13, 14, 15, 16. O 14 é pré-requisito do 15 e do 16.

**Onda D — confiança (2 semanas):** itens 17, 18, 20, 21.

**Onda E — alcance (4+ semanas):** itens 6, 8, 9, 23, 24, 26, 27, 28, 29, 30.

**Regra:** nenhum item entra sem o aceite da Muse (D-072) e sem captura claro/escuro + teste de teclado. O que for PIOR que o T3 é P0; o que for só "bom de ter" espera a onda.
