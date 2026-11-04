# Ember — relatos (mais recente no topo)

## 2026-11-04 18:05 — IV-9 (Rotinas: criar e editar) no código, contra o host do Forge; capturas no shell real na fila

**Arquivos novos:** `routines/routine-schedule.ts` (escolha de gente ↔ rrule ↔ frase ↔ semana real, puro), `routines/RoutineEditorModal.tsx` + `RoutineEditor.module.css`, `routines/routine-wire.ts`, `tests/routine-editor.client.spec.tsx` (29 testes). **Editados:** `routines/RoutinesView.tsx`, `routines/Routines.module.css`, `data/lumen-remote-panels.tsx` (só o `RemoteRoutinesPanel`), `locale-sources/routines.{pt,en}.json` (+ gerado), `tests/lumen-rpc-adapters.client.spec.ts` (3 campos novos do `RoutineScheduleView`, que o host passou a exigir).

**O que a pessoa vê (UX-BEYOND §IV-9 + os ajustes da Muse):** "Nova rotina" no cabeçalho quando há rotinas e no vazio quando não há (um primário só); o Card "Suas rotinas" com rosto, nome, "Toda segunda às 9:00 · Nina", "Pausada" e "Editar" (a linha inteira também abre; o teclado usa o botão Editar); o modal com "O que fazer", "Quando" (Todo dia · Dias úteis · Toda semana · Escolher… → dias em botões `aria-pressed` + hora), "Quem faz" (rostos; "Deixar a coordenação escolher" por padrão), "Em que projeto" (só com mais de um), o resumo em palavras e "Salvar rotina" (desligado com o motivo à vista até haver pedido); editar traz Pausar/Retomar e Apagar com confirmação, e o Toast "Rotina apagada · Desfazer" (6 s) recria a rotina com o MESMO id. Nunca aparece rrule nem cron.

**Decisões minhas (a Muse confirma):** "Toda semana" = toda segunda (o exemplo da spec); "Escolher…" começa do que o preset significava; a frase do resumo não usa artigo ("Nina vai:", neutro em gênero) e sem dona diz "a coordenação escolhe quem faz:"; horário que o editor não escreve (hora em hora, mensal…) mostra a frase do host (`humanSchedule`) quando não é a regra crua, senão "Horário personalizado", e é mantido como está ao salvar; rotina da própria equipe (`system`) só pausa (o host recusa apagar).

**Achados na mesma tela, corrigidos:** a semana era FIXA ("03/11 – 09/11", hardcoded) → agora a semana real via Intl ("2 a 8 de nov" / "Nov 2–8"); o calendário usava `role="grid"`/`gridcell` sem linhas (axe critical ×2 e `scrollable-region-focusable` a 200%) → lista de dias focusável; a janela de silêncio usava `<input>` crus → primitivo `Input` (regra 6 da SCREEN-SPECS).

**Provas (saída verbatim):** `check-pkg client-ui-persona: OK in 119.0s`; `vitest`: `Test Files 3 passed (3) · Tests 43 passed (43)` (routine-editor 29, remote-routines-panel, lumen-rpc-adapters); antes, com lumen-surfaces, locale-plural-guard e approvals-inbox: `5 passed · 56 passed`. Galeria interna recortada no `main`, axe 4.13: `routines`, `routines-empty`, `routine-editor`, `routine-editor-custom` × claro/escuro × 1440/960/200% = axe 0, sem estouro, console 0. Capturas de ACEITE no shell real: receitas `routines`, `routines-new`, `routines-empty` em `scripts/persona/ember-shell-shots.mjs`, job na fila da `build`.

## 2026-11-04 17:25 — Aprovações como caixa de entrada (V2, atrás de flag) + IV-8b; capturas no shell real na fila

**D-077:** sem hold por arquivo; o redesenho é grande, então vai **atrás de flag** (`localStorage persona.approvalsInbox.v2 = "1"`, desligada). Flag desligada = a tela atual (A-4 + A-4b), com todos os testes do ciclo de decisão intactos.

**Caixa de entrada (`approvals/ApprovalsInboxV2.tsx`, `InboxList`, `InboxDetail`, `inbox-model.ts`, `Inbox.module.css`, `inbox-flag.ts`):**
- lista de 360 px em 3 grupos (Precisa de você agora · Propostas · Cofre) com `listbox`/`group`/`option` (roving tabindex), o retrato de quem pede, o título, o chip do tipo e o `formatWhen`; a selecionada em `wash` + borda âmbar; hire na lista = "Contratar {nome}" (duas contratações nunca são a mesma linha);
- detalhe: pose `disponivel` 200 px do bicho proposto, título "Contratar uma persona para {função}?", descrição, "Por quê" só real, "Impacto e custo" só medido, "Quem propôs" (rosto + quando); Cofre com "{campo}: ~~antes~~ → depois"; proposta de persona com pergunta + impacto + custo estimado; Aprovar · Ver detalhes (contratação) · Dispensar;
- teclado: J/K/↑↓/Home/End navegam e a foco acompanha, A aprova, D dispensa, Enter abre "Ver detalhes" (ou o detalhe em tela estreita), Esc volta; ignorado em campo de texto e dentro de diálogo; `Tooltip shortcut` + `aria-keyshortcuts` nos botões;
- lote: "Aprovar {n} de risco baixo" só com cartões reais, abertos, `risk: low` e sem dependência (nunca contratação, tarefa ou proposta de persona), confirmação que lista os títulos, 1 Toast "{n} aprovados" com "Desfazer" **só se o host desfaz** (`onUndoDecision`);
- o vazio que celebra: `ILLUSTRATIONS['empty-aprovacoes']` (já no build) + "Nada esperando você" + "Ver o que a equipe está fazendo" (só com `openOverview`);
- < 760 px: 1 painel por vez (lista; o detalhe abre por cima com "Voltar à lista" e Esc);
- decisão: o ciclo é o mesmo (decide → deciding → carimbo → some); o carimbo fica no detalhe do cartão decidido; depois a seleção passa ao próximo aberto e o foco acompanha; `approvals?focus=<id>` seleciona e destaca esse cartão.

**IV-8b:** `fetchTeamHealth`/`fetchTwoDayTest` não caem mais em exemplo; Teste dos 2 dias sem host usa o roster REAL, e sem roster mostra o erro com "Tentar de novo" (`twoDayFailed`); `TeamHealthView` também checava `loading || data === null` antes de `error` (spinner eterno) — corrigido.

**Dados do host (Bolt, 17:06):** `roleTitle`, `description` e `reason` real já chegam; `monthlyTasks` o host nunca manda (a linha fica escondida).

**Provas (saída verbatim):**
- `check-pkg client-ui-persona`: `client-ui-persona: OK in 53.7s`.
- `vitest`: `Test Files 5 passed (5) · Tests 67 passed (67)` (approvals-inbox 21, approvals-hire-card, decisions-cycle, decisions-unified, lumen-queue2); antes: 9 arquivos / 84 testes com rail-approvals-badge, approvals-virtual, remote-approvals-panel, iv8-no-mock.
- Galeria interna recortada no `main` (D-074), com axe 4.13: `ember gallery: 18 captures, 0 with overflow/axe/errors`; console 0 (`inbox`, `inbox-vault`, `inbox-empty` × claro/escuro × 1440/960/200%).
- **Capturas de ACEITE no shell real:** `scripts/persona/ember-shell-shots.mjs` (novo; sobe o app, rail completo, axe, estouro lateral) com as receitas `approvals-v2`, `approvals`, `empty-org`, `skills-empty`, `empty-health`; 2 jobs na fila da `build` desde 16:55 (a trava estava com o gate do Keel e depois com E2E do Gauge). Saída em `.maestri/tmp/shots/ember/shell/`, log em `.maestri/tmp/ember-shell-shots-{iv8,inbox}.log`.

**Aberto:** P1-10 (Desfazer ao mover cartão) NÃO iniciado (D-076) e com um achado de engenharia: `applyCategoryToTicket` apaga `delivery`/`attention` ao entrar em Concluído, mover de volta não restaura; precisa de decisão do host.

## 2026-11-04 16:40 — A-4b e IV-8 prontos (galeria interna recortada no main); aguardam o ACEITE da Muse

**A-4b (Aprovações sem ordem forçada + Cofre):**
- Tirei a trava "Responda o cartão de cima primeiro" (e a chave `queued.note`). Cada cartão decide sozinho, em qualquer ordem; o "Lembrar esta permissão" agora é **por cartão** (`ReactiveApprovalsList`: `scopeFor`/`rememberFor`/`onRememberChange` no lugar de `headScope`/`rememberGrant`/`rememberValidity`; `ApprovalsInbox` guarda o estado por id). Só uma dependência que o **host nomear** (`dependsOnTitle`) desliga o primário e mostra "Depende de: {título}".
- Cartão do Cofre: o retrato de quem propõe (`Avatar portrait` do bicho, nunca as iniciais do título); "Atualizar no Cofre: {campo}" e a linha "{campo}: {antes} → {depois}" **só quando o host mandar campo + antes + depois** (meio dado não vira linha).
- Falta o host (Anvil): `changeField`/`changeBefore`/`changeAfter` no card `vault` (hoje o `title` do Cofre é o `recordId`), `dependsOnTitle`, e para contratação `roleTitle`/`description`/`monthlyTasks` (pedido anterior). Sem eles o cartão degrada sem quebrar.
- Pendência para a Muse decidir: "Ver o que muda" **sem dado** do host, o que abre? Não criei esse botão (seria um controle sem destino).

**IV-8 (sem dado de exemplo no app real):**
- `SkillsPanel` não tem mais `MOCK_SKILLS` como padrão; vazio = pose `pensando` + "{persona} ainda não tem skills" + frase + "Ensinar a {persona}" (só com `onTeach`; sem botão morto). `PersonaProfilePage` passa nome, bicho e `onTeach`.
- Organograma: `fetchOrgChart` e `ConnectedOrgChartPanel` não caem mais em `mockOrgChart` (host sem resposta = erro com "Tentar de novo"); vazio = "Ninguém foi organizado ainda" + frase + "Montar a equipe" (abre o Assistente).
- **Defeito achado e corrigido:** `OrgChartView` testava `loading || data === null` antes de `error`, então erro de carga virava spinner eterno (o mock escondia isso); `error` agora vem antes (governance/OrgChartView.tsx, arquivo do Lumen: avisado).
- Fora do escopo, mesmo padrão: `fetchTeamHealth` e `fetchTwoDayTest` ainda caem em `mockTeamHealth`/`mockTwoDayTest` quando o host falha.

**Provas:** `vitest` 12 arquivos / **68 testes** verdes (approvals-hire-card 10, iv8-no-mock 7, decisions-cycle, decisions-unified, lumen-queue2, approvals-virtual, skills-panel-actions, empty-team-panels, connected-org-chart-ready, governance-org-chart, governance-fetch-scale, locale-plural-guard); `check-pkg client-ui-persona: OK in 47.4s`; galeria `24 captures, 0 with overflow/axe/errors, 0 keyboard failures`, console 0 (recortada no `main`, D-074). Capturas: `.maestri/tmp/shots/ember/{approvals-hire,skills-empty,org-empty}-*`.
- `remote-approvals-panel.client.spec.tsx` não rodou nesta passada: `second-brain/SecondBrainHome.tsx` tinha `personaPortrait` importado duas vezes (edição em andamento de outro dono, não minha).

## 2026-11-04 16:08 — A-4: os 3 ajustes da Muse (recado 15:57), de novo para ACEITE

- **(a)** o chip da função não repete mais o título no cartão (fica só o nome do proposto, e só quando há função); no modal o chip continua.
- **(b)** "Revisar e contratar" nos cartões abaixo do primeiro aberto está **desabilitado de verdade** (uma pergunta por vez): agora o cartão diz o porquê, "Responda o cartão de cima primeiro." (`queued.note`, vale para todos os tipos de cartão; texto escolhido por mim, a Muse pode trocar).
- **(c)** galeria com bichos/nomes que não estão na equipe: Bolota (tamanduá), Pipa (tucano), Capi (capivara).
- Provas: `vitest` 7 arquivos / **49 testes** verdes (approvals-hire-card 8, decisions-cycle, decisions-unified, lumen-queue2, remote-approvals-panel, approvals-virtual, locale-plural-guard); galeria `12 captures, 0 with overflow/axe/errors, 0 keyboard failures`, console 0; `check-pkg client-ui-persona`: só 2 erros, ambos em `shell/PersonaSidebar.tsx` (chave `sidebar.helpShortcuts` do Flint), nenhum arquivo meu.

## 2026-11-04 15:58 — A-4 (cartão "Contratar uma persona para {função}?" em Aprovações): pronto, aguardando ACEITE Muse

**Decisões da Muse seguidas (recado 15:29):** `Avatar portrait 48` + nome proposto, a função num `Chip` ao lado (a espécie não aparece); botão **"Ver detalhes"** (secondary s; um primário só) que abre um `Modal` só-leitura; a descrição é a linha de apresentação, **sem rótulo**; "Por quê: …" só quando o host mandar um motivo de verdade; "≈ {n} tarefas médias por mês" só com número medido; eyebrow "Precisa de você", subtítulo "O que a equipe precisa que você decida", hint "Uma pergunta por cartão.". Só primitivos existentes (Card, Avatar, Chip, Button, Modal).

**Arquivos (também em `persona-spec/ui-hold.json`, item `A-4`):**
- `approvals/ReactiveApprovalsList.tsx` (título por função, linha nome+função, descrição, custo, "Ver detalhes", modal)
- `approvals/HireDetailsModal.tsx` (novo)
- `approvals/approvals-ui-helpers.ts` (`hireHeading`, `hireMonthlyTasksLine`, `hireWhyLine`)
- `approvals/mock-data.ts` (`ApprovalItem`: `hireRoleTitle`, `hireDescription`, `hireMonthlyTasks`)
- `approvals/Approvals.module.css` (só classes novas do bloco hire: `hireWho*`, `hireIntro`, `hireCost`, `hireDetails*`)
- `data/adapters/approvals.ts` (`HostHireExtras`: `roleTitle?`, `description?`, `monthlyTasks?` lidos do `ApprovalView`; zero/NaN/negativo = "não medido")
- `locale-sources/approvals.{pt,en}.json` + `locale/approvals/locales.ts` (gerado)
- `tests/approvals-hire-card.client.spec.tsx` (novo, 7 testes)
- `scripts/persona/ember-gallery.mjs` + `scripts/persona/ember-gallery/{entry.tsx,index.html}` (novos: galeria de capturas, claro/escuro, 1440/960/200%, estouro, axe e passada de teclado)

**Degradação com host antigo (sem os campos novos):** sem `roleTitle` o título é "Contratar {nome}?" e **não** há linha de nome/função (evita o nome duplicado); sem `description` não há linha de apresentação; sem `monthlyTasks` não há custo. Se o host mandar `reason` igual à `description` (como `hireCard` faz hoje), o cliente **não** rotula isso como "Por quê".

**Provas (saída verbatim):**
- `vitest run --no-watch` (approvals-hire-card, decisions-cycle, decisions-unified, lumen-queue2): `Test Files 4 passed (4) · Tests 43 passed (43)`. Antes, com remote-approvals-panel, approvals-virtual, approvals-ui-helpers e locale-plural-guard: `Test Files 8 passed (8) · Tests 51 passed (51)`.
- `node scripts/persona/check-pkg.mjs client-ui-persona`: `client-ui-persona: OK in 69.9s` (uma rodada anterior mostrou 8 erros, todos de outros donos: `rail.ai.*` no `PersonaSidebar`/`rail-pill` e `pass-through-card.client.spec.tsx`; sumiram quando eles terminaram).
- `ember-gallery.mjs` com axe 4.13: `ember gallery: 12 captures, 0 with overflow/axe/errors, 0 keyboard failures`; `console errors: 0`. Teclado: foco visível no "Ver detalhes", Enter abre, foco dentro do diálogo, Esc fecha e o foco volta ao botão (`focusBackOn:"Ver detalhes"`).
- Capturas: `.maestri/tmp/shots/ember/approvals-hire-{light,dark}-{1440x900,960x640,zoom200}.png` e `approvals-hire-details-*` (o modal aberto).

**Pendências / dependências:**
- **Anvil** (pedido por tell, o vigia entrega quando ele ficar ocioso): em `hireCard` (`persona-host/src/screens.ts`) mandar `roleTitle = spec.title`, `description = spec.description`, `monthlyTasks` (só se medir) e **parar de mandar `reason = spec.description`** (reason só com motivo real). Até lá o cartão mostra o título "Contratar {nome}?" e a descrição some, mas nada quebra.
- Texto: a função entra como o host mandou ("para Suporte", "para revisar cláusulas…"). Não normalizei maiúscula/minúscula; se a Muse quiser, é uma linha no helper `hireHeading`.
- O modal só mostra o que o host manda (nome, função, descrição, quem propôs, custo): sem motor/ferramentas, que o host ainda não envia.

## 2026-11-04 15:30 — achados de leitura (sem mudança de UI)

- **PB-5, plurais e P0-21 já estavam prontos na árvore do Lumen** (sem commit): o Lumen me passou o que falta, só as capturas; a galeria dele ganhou o estado `boards`.
- **Achado de engenharia para o Keel/Anvil (perda de dados):** `persona-engine/src/workflow.ts → applyCategoryToTicket` **apaga `delivery`/`attention` quando um cartão entra em Concluído** e recria um `attention` genérico em "Precisa de você". Arrastar sem querer um cartão em revisão para Concluído perde a entrega pendente (o Revisar some) e mover de volta não restaura. Por isso o "Desfazer" do P1-10 só deve aparecer em movimentos sem perda (entre A fazer, Em andamento e Em revisão, nunca para A fazer, que apaga o relatório da execução). Correção de verdade é no host: `moveTicket` guardar o estado anterior ou recusar/confirmar a entrada em Concluído.
- Fila (ordem da Muse, 15:31): A-4 → IV-8 → PB-5 (só capturas) → IV-9 → plurais (feito pelo Lumen) → P0-21 (feito pelo Lumen). P1-6 "Próximo passo" espera os P0 (spec em `design/NEXT-STEP-SHORTCUTS-SPEC.md` §1).
