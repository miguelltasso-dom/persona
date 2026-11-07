# Contrato — as personas operam o harness (HT-1: inventário e proposta)

Donos: **Forge + Bolt** (HT-1). Decisão: D-084 (`.maestri/tmp/atlas-d084.txt`). Spec visual: `design/PERSONA-POWERS-SPEC.md` (§4 atividade, §7 contratação). Rascunho do **Bolt 04/11 20:15** — as seções 2-D (rotinas), 2-F (contratar) e a revisão do todo são do **Forge**; tudo aqui foi conferido no código (comandos no fim).

## 1. O que existe hoje (fatos)

### 1-A. Ferramentas MCP de produto, no lado do runner (`persona-runners/src/mcp`)
| Ferramenta | Arquivo / contrato | Nível |
|---|---|---|
| `persona_report`, `persona_recall`, `persona_ask` | `persona-tools.ts` | write / read / write |
| `brain_search`, `brain_read`, `brain_propose` | `brain-tools.ts` · `brain-mcp.md` | read / read / write |
| `gestor_hire`, `gestor_allocate`, `gestor_reorganize`, `gestor_assemble` | `gestor-tools.ts` · `gestor-mcp.md` | write |
| `persona_browser_open/read/act`, `persona_computer_screenshot/click/type` | `acting-tools.ts` | read / write |
| `persona_telegram_send`, `persona_email_send` | `sources/outbound-tools.ts` | write (saída → pede aprovação) |

O **gateway por turno** (`createMcpGateway`, `gateway.ts`) já dá: token por turno, lista de permitidos, aprovação para chamada sensível (`outbound_message`, `browser_act`, `write_outside_worktree`, `credentials`…) e **identidade = o turno, nunca o argumento** (`personaId`/`ticketId` forjados são recusados). Níveis `none | read | write` por persona (`tool-level.ts`): o que está acima do nível nem é anunciado.

### 1-B. **GAP-0 (o mais importante): nenhuma dessas ferramentas chega a uma CLI viva**
- `createMcpGateway` e `servePersonaMcpTools` só têm consumidor em **testes** (busca em `packages/`, `apps/`, `scripts/`).
- `StartTurnInput` (`contract.ts`) **não carrega ferramentas nem `mcpServers`**; `claude.ts` e `codex.ts` anunciam `mcpTools: 'available'`, mas `oar/session.ts` só rotula `tools: 'mcp'`; o Cursor recusa (`cursor.ts`).
- Hoje o que o worker faz no produto vem do **protocolo de texto** (`persona-engine/src/parse/model-output.ts`) e das ferramentas nativas da CLI. Ou seja: `persona_report/ask/recall`, `brain_*` e `gestor_*` existem como definição e teste, **não como capacidade do produto**.
- Consequência: HT-2..HT-6 ("as personas operam o harness pelas ferramentas da Persona") dependem de um **HT-0: transporte** que ninguém tem no PLAN: (1) campo de ferramentas no `StartTurnInput` e o adaptador OAR servindo-as (`serveMcpTools`) — **Rivet**; (2) o host abrir o turno no gateway, com portas reais — **Bolt/Anvil** (`HarnessPorts`, abaixo); (3) a prova: uma CLI de verdade chamando uma ferramenta e o host executando com ACL.

### 1-C. A superfície do host que já faz o trabalho (Remotes; 315 no total)
- **Quadros e sprints:** `getProjectBoard`, `listBoards`, `moveTicket`, `listSprints`, `createSprint`, `planSprint`, `startSprint`, `updateSprint`, `deleteSprint`, `closeSprint`, `sprintSummary`, `createWorkflowFromTemplate`, `updateWorkflow`, `proposeWorkflow`…
- **Rotinas (IV-9, Forge):** `createRoutine`, `updateRoutine`, `deleteRoutine`, `listRoutines`, `pauseRoutine`, `scheduleRoutine`…
- **Canais e assuntos:** `listChannels`, `createChannel`, `createDm`, `listConversationSubjects`, `createConversationSubject`, `renameConversationSubject`, `archiveConversationSubject`, `moveMessageToSubject`, `getSubjectSummary`.
- **Arquivos do projeto:** `listFiles`, `statFile`, `readFile` (somente leitura); a escrita acontece no rascunho do worker (SW: Aplicar/Desfazer).
- **Memória:** `proposeMemory`/`approveMemory`/`forgetMemory`, `putBrainPage`/`getBrainPage`/`searchBrainPages`/`restoreBrainPage`, permissões do cérebro (`grantBrainPermission`…).
- **Contratar:** `proposeHire` (cartão em Aprovações), `decideApproval`, `proposeGestorHire`/`approveGestorPlan` (planos do Gestor), `createPersona` (campo `canRecruit`).

### 1-D. Como o host decide "quem pode"
- Todo Remote usa `requireWrite`/`sessionCan` com o **membro da sessão**; **persona não é ator de Remote** (a guarda recusa). Logo as ferramentas **não podem** chamar os Remotes: precisam de **portas internas** com a identidade da persona.
- Base da regra "persona nunca com mais acesso que quem a criou": `Persona.createdBy` (existe) + `ToolLevel` da persona + `systemRoles`. Autonomia por persona: `asked | propose | act` (`getAutonomy`).

## 2. Catálogo proposto (nomes estáveis) × o que falta

Legenda **Existe**: ✔ já há função no host · ◐ há, mas falta uma parte · ✘ falta. **Desfaz**: o inverso (RPC) quando existe.

### 2-A. Quadros (dono: Bolt + Forge · HT-2)
| Verbo | Delega para | Existe | ACL | Desfaz |
|---|---|---|---|---|
| `board_card_move` `{ticketId, columnId}` | `BoardsHost.moveTicket` | ✔ | escrita no projeto; respeita FLOW-1 (`delivery_pending` recusa Concluído) | `board_card_move` de volta à coluna anterior (o verbo guarda `before`) |
| `board_card_create` `{title, columnId?, ownerPersonaId?}` | — | ✘ | idem | arquivar o cartão |
| `board_card_update` `{ticketId, fields}` | `updateWorkflow`/campos do cartão | ◐ | idem | restaura os campos (`before`) |

> **Pergunta aberta (Forge, engine):** hoje um cartão **é** um Ticket criado por uma mensagem e já nasce em andamento. Criar "cartão sem iniciar" (Aguardando) precisa de um estado de Ticket sem Assignment rodando — não existe como ação. Sem isso o gatilho HT-3 só serve a cartões que já existem (parados, falhos, parados pela pessoa).

### 2-B. Sprints (Bolt + Forge · HT-2)
`sprint_create` → `createSprint` ✔ (desfaz: `deleteSprint`) · `sprint_plan` → `planSprint` ✔ (desfaz: replanejar com `before`) · `sprint_start` → `startSprint` ✔ (**sem** desfazer) · `sprint_close` → `closeSprint` ✔ (**sem** desfazer; devolve `sprintSummary`).

### 2-C. Canais e assuntos (Bolt + Anvil CV-6 · HT-5)
`channel_create` → `createChannel` ✔ (desfaz: **arquivar**, nunca apagar — CV-6, `team-channels.md`) · `subject_create` → `createConversationSubject` ✔ (desfaz: `archiveConversationSubject`) · `subject_rename` → `renameConversationSubject` ✔ (desfaz: renomear de volta) · `message_move_to_subject` → `moveMessageToSubject` ✔ (desfaz: mover de volta).

### 2-D. Rotinas (Forge · HT-4) — *seção do Forge, só o resumo do que vi*
Revisado e completado pelo Forge (04/11 20:25). O trabalho de domínio já existe: `persona-host/src/routine-remotes.ts` tem as validações PURAS (nome, pedido, horário, fuso, silêncio, dono) e o par rotina + `routine_spec` (o quê/quem que o agendador lê); `contracts/routine-remotes.md` é o contrato. O que falta é só a **porta interna com a identidade da persona** (os Remotes exigem membro da sessão).

| Verbo da persona | Entrada | Delega para | Existe | Desfaz |
|---|---|---|---|---|
| `routine_list` | `{}` | `listRoutines` (leitura do projeto) | ✔ | — |
| `routine_create` | `{ name, prompt, schedule, ownerPersonaId?, timeZone?, silence? }` | `check*` de `routine-remotes.ts` + `routines.create` + `writeRoutineSpec` | ◐ porta | `deleteRoutine` do id novo (seguro: a rotina acabou de nascer) |
| `routine_update` | `{ id, name?, prompt?, ownerPersonaId?, schedule?, timeZone?, catchUp?, silence? }` | idem `updateRoutine` | ◐ porta | `routine_update` com o `before` (nome, pedido, dono, horário…); um horário novo cancela as ocorrências enfileiradas e o agendador recria no ciclo seguinte |
| `routine_pause` | `{ id, paused }` | `setPaused` | ◐ porta | o contrário (`paused` oposto); a retomada não repete execuções perdidas |

- **Sem cron para a persona.** `schedule` é o preset estruturado `{ frequency: 'daily' \| 'weekdays' \| 'weekly' \| 'monthly' \| 'hourly', time?, days?, monthDay?, everyHours? }` → `buildRrule` (erro de preset = frase para o modelo). Assim a UI de Rotinas (Ember) sempre lê de volta o horário em palavras.
- **Fora da 1ª entrega:** `routine_delete` (destrutivo; D-084 diz criar, editar e pausar) e qualquer toque nas rotinas `initiative:<persona>` (da própria equipe: só pausam, e a pessoa decide).
- **ACL (regra do §3 aplicada):** a persona cria rotinas com ELA como dona e edita/pausa só as suas; a **Coordenação** também as sem dono; rotina de outra persona só quando a pessoa pediu isso explicitamente (pedido citando a outra). A rotina roda como a dona, com as ferramentas e o ACL dela: criar uma rotina nunca dá a ninguém mais acesso do que já tem.
- **Pedido da pessoa × iniciativa (verificável):** `person-request` quando o Ticket do turno nasceu de uma mensagem HUMANA (`ticket.origin.triggerId` de autor humano); `persona-initiative` quando nasceu do agendador (`team:initiative`, `routine:*`) ou de proposta aceita sem pedido da rotina. Em iniciativa: `asked` = recusa; `propose` = **vira proposta** (cartão do P1-9 com o efeito “criar a rotina”, ver HT-4b) ; `act` = cria e mostra com Desfazer.
- **Orçamento (cada rotina gasta turno de modelo):** no máximo **3 rotinas criadas por persona por dia** e **12 ativas por persona**; intervalo mínimo 1 h (o `buildRrule` não aceita menos); `catchUp` padrão `skip`. Acima: erro `limit` com a frase “Já criei as rotinas de hoje; deixe para amanhã ou peça à pessoa.”.
- **Atividade:** `verb: routine_create | routine_update | routine_pause`, `target: { kind: 'routine', id, title: <nome> }`, `before/after` = `humanSchedule` / “Pausada” / dono; `undoable: true` nos três (acima); `undo: { remote: 'deleteRoutine' | 'updateRoutine' | 'pauseRoutine', request }`.
- **Dependência nova (HT-4b):** o cartão de proposta do P1-9 hoje só cria Ticket ao Aceitar; para “Posso criar a rotina X?” ele precisa de um **efeito** além de Ticket (`effect: 'ticket' \| 'routine'`) — pequeno no engine (`TaskProposalDraft.effect`) e no host (`decideTaskProposal`); faço junto com o HT-4.

### 2-E. Arquivos do projeto e memória (Bolt + Forge · HT-5)
- **Arquivos:** `project_file_list/stat/read` → `listFiles/statFile/readFile` ✔ (só leitura; desfaz não se aplica). A escrita segue pelo rascunho do worker; **não** criar ferramenta de escrita em paralelo.
- **Memória:** `brain_search/brain_read/brain_propose` ✔ **como definição** (GAP-0) e `memory_propose` → `proposeMemory` ✔ (rascunho; desfaz: `forgetMemory`). Regra de hoje: propor, nunca gravar direto onde a regra exige aceite.

### 2-F. Contratar (Forge + Anvil + Muse · HT-6) — *seção do Forge*
Revisado e completado pelo Forge (04/11 20:25). **O que já existe (conferido):**
- **Regra de domínio** (`persona-core/src/domain/rules.ts`, `personaPropose`): só contrata quem tem `canRecruit` e é do mesmo workspace; recusa segredo no spec; `assertProposalWithinCreatorAccess` = a persona nova **nunca tem mais acesso** (ferramentas, skills, limites) que a que contratou; `ProposalPolicy = 'approval' \| 'auto'` (`auto` aprova só depois da MESMA checagem). Já é a regra “nunca mais que quem a criou”.
- **Host** (`persona-host/src/screens.ts`): `proposeHire` grava o cartão em Aprovações com `policy: 'approval'` FIXO (nome e rosto únicos, sem “Por quê” inventado: A-4); `decideApproval(kind:'hire')` → `decideHire` cria a persona (`id: hire:<proposta>`, `createdBy` = quem contratou) e inicializa. **Não há** caminho `auto` ligado.
- **Dois caminhos de ferramenta que não se falam:** `gestor_hire` (`GestorPorts.hire({personaId, summary})`, texto livre → plano do Gestor → aprovar → aplicar, sem porta real: GAP-0) e o Remote `proposeHire` (estruturado, para a UI).
- **`canRecruit`:** existe na persona e no `createPersona`; **não achei Remote só para a pessoa ligar/desligar depois** (“Quem pode contratar” em Equipe) — a confirmar com o Anvil.
- **Desfazer a contratação:** existe `pausePersona`/`resumePersona`, mas pausada ela continua na equipe; **não existe aposentar/arquivar persona**.

**Proposta (HT-6):**
| Verbo | Entrada | Delega para | Estado | Desfaz |
|---|---|---|---|---|
| `persona_hire` | `{ name, title, description, reason? }` | porta interna sobre a mesma lógica de `proposeHire`, com `creatorPersonaId = run.personaId` | ◐ porta | proposta pendente: **Cancelar** o cartão; contratação direta: `persona_retire` (abaixo) |
| `persona_retire` *(só desfaz; a persona não o chama)* | `{ personaId }` | **novo**: aposentar = some da Equipe, guarda histórico, libera nome e rosto (`retiredAt` no store) | ✘ | — (reverter = `resumePersona`) |

- **Quem pode:** `canRecruit` (a pessoa escolhe em Equipe) — quem não tem a flag recebe `forbidden` com a frase “Você não contrata pessoas; peça à Coordenação ou à pessoa.”. Fica um **interruptor novo e separado**, desligado por padrão: **“Contratar direto”** por recrutadora (D-084: “exceto se a pessoa permitir contratar direto”) → `policy: 'auto'` (o core já suporta) e `decideHire` roda na hora; sem ele, SEMPRE o cartão de contratação em Aprovações.
- **Ferramenta única para o 1-a-1:** `persona_hire` (estruturada, valida pelo core). `gestor_hire` fica para o **plano de equipe** do Gestor (várias pessoas / realocação). Unificar o transporte é o HT-0.
- **Pedido × iniciativa:** pedido da pessoa (“contrate alguém para X”) autoriza o verbo naquele pedido; iniciativa própria só com `canRecruit` e modo `propose`/`act` — em `propose` vira o cartão de contratação (que já é uma proposta), em `act` SEM “contratar direto” continua sendo cartão (nunca contrata sozinha sem a flag). `asked` = recusa.
- **Orçamento:** no máximo **2 cartões de contratação abertos** por recrutadora; com “contratar direto”, no máximo **2 contratações por dia** e a equipe tem **teto de 12 pessoas por projeto** (erro `limit`: “A equipe já está no tamanho máximo.”).
- **Atividade:** `verb: persona_hire`, `target: { kind: 'persona', id, title: <nome da nova> }`, `after: 'Aguardando a sua aprovação' \| 'Contratada'`; `undoable: true` para o cartão pendente e para a direta (via `persona_retire`).
- **Falta (donos):** porta interna + `persona_retire` + o interruptor “Contratar direto” e o de `canRecruit` depois de criada — Anvil (store/Remotes) e Forge (regra); texto e cartão — Muse (§7 da spec).

## 3. Regras comuns das portas do host (`HarnessPorts`, proposta)
1. **Identidade** = a persona do turno (`run.personaId`), projeto = o do turno. Argumento nunca troca isso (já é a regra do gateway).
2. **ACL** = `persona.tools` ∩ o que **quem criou** a persona (`createdBy`) pode ∩ escopo do projeto. Nunca mais que o criador.
3. **Autonomia (D-084)** — pedido da pessoa vs iniciativa da persona: o **pedido explícito** (mensagem da pessoa no fio, autor verificado — guardrail do HT-8) autoriza o verbo pedido; **iniciativa própria** obedece à autonomia: `asked` = nenhuma ação sem pedido · `propose` = vira proposta (P1-9) · `act` = executa e mostra com Desfazer quando der.
4. **Erros tipados**, nunca texto livre: `forbidden`, `not-found`, `invalid`, `conflict` (ex.: `delivery_pending`), `limit` (orçamento). A persona **sempre** recebe uma resposta e a pessoa **sempre** vê uma linha (D-079).
5. **Idempotência:** repetir o mesmo `requestId` não repete a ação.

## 4. O evento de atividade (resposta ao pedido do Ember)
Estende `TurnActivityEvent` (`contracts/activity.md`) com os campos abaixo (opcionais; ausentes nos eventos antigos). A UI escreve as palavras; o host manda dados.

| Campo | Conteúdo |
|---|---|
| `verb` | nome estável do catálogo (`board_card_move`, `sprint_create`, `routine_pause`…) |
| `target` | `{ kind: 'card' \| 'sprint' \| 'routine' \| 'channel' \| 'subject' \| 'memory' \| 'persona', id, title }` — **título legível**, não só id |
| `before` / `after` | valores curtos legíveis (ex.: coluna "A fazer" → "Fazendo"); ausentes em criação/remoção |
| `initiator` | `'person-request'` (com `requestId` = id da mensagem que pediu) ou `'persona-initiative'` |
| `status` | `done \| failed \| running \| waiting` (falha não conta como feito) |
| `undoable` | `true` só quando há inverso seguro **agora** |
| `undo` | `{ remote, request }` — o RPC que a UI chama (idempotente; devolve `not-found` se já desfeito) |
| `at` | instante |

O Desfazer só aparece quando `undoable === true` (regra da Muse). Verbos **sem** desfazer: `sprint_start`, `sprint_close`, qualquer ação externa irreversível (email, post, pagamento — esses seguem HT-9).

## 5. Prioridade proposta
1. **HT-3 primeiro** (Bolt): "a PESSOA move o cartão para Fazendo → a persona dona começa". **Não depende do HT-0**: é o Remote `moveTicket` já existente + um disparo no host (só quando quem move é a pessoa; a persona nunca dispara em laço). Entrega sozinha o "você moveu e a Nina começou" que a Muse desenhou (`harness.started`).
2. **HT-0 transporte** (Rivet + Bolt/Anvil) — sem ele, HT-2/4/5/6 como *ferramentas* não existem; pode-se entregar antes as **portas** (`HarnessPorts`) e testá-las direto, e só depois ligar ao gateway.
3. HT-2 (quadros/sprints) → HT-5 (canais/assuntos/arquivos/memória) → HT-4 (rotinas, fino) → HT-6 (contratar).

## 6. Como conferi (reproduzível)
`grep -rn "createMcpGateway\|servePersonaMcpTools\|serveMcpTools" packages apps scripts` (só testes e o próprio pacote) · `StartTurnInput` em `persona-runners/src/contract.ts` (sem campo de ferramentas) · `oar/session.ts:54` · `oar/cursor.ts:19` · lista de Remotes por área extraída de `persona-host/src/index.ts` (315 `@Remote`).

## 7. Resposta do Forge (engine) à pergunta aberta de 2-A — “cartão sem iniciar”
Não precisa de estado novo no modelo, e nem de mudança no engine para o HT-3:
- Um Ticket cujo **último Assignment está `pending`** já é, por `ticketStage`, `working/queued` = categoria `todo` (“A fazer”). `Tickets.addInput` já **inicia** um Assignment pendente quando chega um Input (`tickets.ts`, ramo `latest?.state === 'pending'`).
- O que existe de fato é a CRIAÇÃO: um Ticket só nasce de um accept (`Tickets.create`), que sempre chama `executor.start`. Para “criar o cartão e deixar em A fazer”: o **host segura o `executor.start`** daquele Ticket (flag `card_hold:<ticketId>` no `screen_doc`; é o adaptador `Executor` do host que decide lançar). Nada do engine muda.
- **HT-3 (a PESSOA move para Fazendo):** `moveToColumn` → `applyCategoryToTicket('doing')` já marca o último Assignment como `running`. Um Ticket com Assignment `running` que ninguém executa é exatamente o que o agendador já recolhe (`driveTicket`, “a ticket nobody is executing”): basta o host, depois do `moveTicket` feito pela pessoa, soltar a flag e chamar `orchestration.driveTicket(projectId, ticketId)`. Só quando quem move é a pessoa; a persona nunca dispara em laço.
- Se preferirem uma API explícita no engine em vez da flag no host, eu acrescento `Engine.startTicket(ticketId)` (≈10 linhas + teste: inicia o Assignment pendente, recusa Ticket encerrado ou esperando a pessoa). Hoje não é necessária.

## 8. HT-3 ENTREGUE (Bolt, 04/11 20:25): "a PESSOA move o cartão para Fazendo → a persona dona começa"

Confirmado com o Forge (§7): **sem mudança no engine**. `applyCategoryToTicket(…, 'doing')` só marca o Assignment como `running`; o host passa a **realmente** iniciar o trabalho.
- **Onde:** Remote `moveTicket` (caminho da PESSOA: persona não é ator de Remote). Se o cartão resultante é da categoria `doing`, chama `Orchestration.startFromBoard(projectId, ticketId, { deliveryPending })`, que usa o mesmo `driveTicket` do agendador. As ferramentas das personas (HT-2) chamam `boards.moveTicket` **direto** e nunca passam por aqui: uma persona movendo cartão **não** dispara a si mesma (sem laço).
- **Resultado tipado** `MessageView.harness = { verb:'board_card_move', outcome:'started'|'held', reason?:'paused'|'silence'|'delivery_pending'|'no_owner', ticketId, title, persona? }` na linha `coord-board-<ticket>-<instante>` (corpo já legível; a UI escreve as palavras). `started`: "Nina começou “X” porque você moveu para Fazendo." (chave `harness.started` da Muse). `held` + `reason`: persona **pausada** (começa quando voltar) · **fora do horário** (começa quando o horário voltar) · **entrega pendente** (FLOW-1: o resultado ainda espera Aplicar/Descartar; não recomeça por cima) · **sem dona** (a Coordenação avisa). Já com turno aberto: nada a anunciar (não inicia duas vezes).
- **Prova:** `tests/board-start.spec.ts` (8): parado→Fazendo inicia e a persona de fato roda · outra coluna não inicia · turno aberto não duplica · pausada/fora do horário/sem dona/entrega pendente dizem por quê · movimento direto no quadro (persona) não dispara.
- **Não é HT-2:** criar cartão "para depois" (flag `card_hold`, §7 do Forge) e as ferramentas de quadro seguem no HT-2.

### 8-b. HT-3 fica atrás de FLAG (decisão do Keel, D-086, 04/11 20:25)
`Config.startOnBoardMove` / `Orchestration.startOnBoardMove` — **DESLIGADA por padrão** (o HT-* é v1.1). Desligada, o caminho antigo continua: o cartão movido fica "rodando" e o agendador o pega em ~30 s (`stranded`). Ligada, vale tudo do §8. Teste dos dois lados em `tests/board-start.spec.ts` (9: flag off = nada novo; flag on = o novo). O texto final dos motivos `held` é o da Muse (PERSONA-POWERS-SPEC): "{nome} está em pausa…", "…quando acabar o silêncio de {nome} (às 07:00)", "{nome} ainda espera você decidir a entrega anterior…", "…ainda não tem responsável. Escolha uma persona para começar." (`harness.until` = a hora do silêncio).

### 8-c. HT-3 diz a verdade (Bolt, 07/11) — achado do Probe no E2E-V11

**Bug:** mover para Fazendo um cartão que JÁ TINHA DADO O TURNO dele (entregue, falho, perguntou, parado) postava `started` e nada rodava. `applyCategoryToTicket('doing')` vira a MESMA Assignment para `running` (e reescreve o report `ready`→`progress`); o host nunca roda a mesma Assignment duas vezes (a linha `coord-<ticket>-done` é a marca e o runner guarda o request id `launch:<assignment>`), e o agendador também pula o cartão por causa dessa linha. Resultado: a linha mentia e o cartão virava fantasma (Fazendo, sem worker, com a entrega esperando perdida).

**Regra (só host; sem motivo novo, sem texto novo, sem mudança de cliente):**

| Antes de mover para uma coluna `doing` | O que acontece |
|---|---|
| Entrega ESPERANDO Aplicar/Descartar (FLOW-1: report `ready` ou conflito **e** projeto com pasta) | NÃO é um movimento: nada é gravado (ticket, assento); o cartão continua onde a entrega espera, com `deliveryPending: true`; a linha do fio é `held` + `reason: 'delivery_pending'` (o texto da Muse que já existia). A ferramenta de uma persona recebe a recusa `delivery_pending`, como para Concluído. |
| Turno já dado (linha `done` da Assignment atual) ou Tarefa encerrada (Parar, Concluído): entregue **sem pasta**, falho, perguntou | "Continue": Assignment NOVA (`Engine.resumeTicket`, com a nota "Movi este cartão para Fazendo…" no prompt) e o worker roda de verdade; a linha `started` é verdadeira. Persona em pausa/silêncio ⇒ `held` (`paused`/`silence`) **e** a Assignment nova já existe (o agendador começa quando liberar; antes o cartão ficava fantasma). |
| Parado/pendente (sem linha done) | como antes. |

**Detalhes:** `BoardsHost.moveTicketWith` devolve `{ view, toCategory, deliveryWaiting, reopened }`; o Remote `moveTicket` dispara pela coluna DESTINO (`toCategory === 'doing'`), não pela categoria do estágio depois; `rt.started.add(ticket.id)` antes do `resumeTicket` (o Executor do host só enfileira o 1º `start` de cada Tarefa por runtime, e um `start` enfileirado marca a nota como entregue antes de o prompt ser montado). **Provas:** `tests/board-start.spec.ts` 15 (9 antigos + 6 novos, VERMELHOS no código antigo: `.maestri/tmp/bolt-fix/ht3-red.log`); `check-pkg persona-host` OK; regressão dirigida 165/165.

## 9. HT-2 ENTREGUE como PORTAS do host (Bolt, 04/11 21:15) — ainda não exposto como ferramenta (falta o transporte, HT-0)
`persona-host/src/harness-boards.ts` (`BoardPorts`), mesmo padrão do `RoutinePorts` do Forge: identidade da persona vem do run (`HarnessIdentity`, nunca de argumento), idempotência por `callId`, recusa tipada (`forbidden | not-found | invalid | limit | conflict`), atividade com `verb`, `target {id, título}`, `before/after`, `initiator`, `requestId`, `undoable` e `undo {remote, request}` (§4).
| Verbo | Delega para | Quem pode | Desfaz |
|---|---|---|---|
| `board_card_move {ticketId, columnId}` | `BoardsHost.moveTicket` (regras do fluxo valem igual: WIP é aviso, `delivery_pending` recusa Concluído → `conflict`) | pedido da pessoa: qualquer cartão · iniciativa: só `act`, e só cartão **dela** (ou sem dona, se for a Coordenação) | `moveTicket` de volta à coluna anterior |
| `sprint_create {name, objective, startsAt?, endsAt?}` | `createSprint` | pedido: qualquer persona · iniciativa: `act` e só Coordenação/Gestor; **2 por dia** | `deleteSprint` |
| `sprint_plan {sprintId, ticketIds}` | `planSprint` (cartões têm de existir; sprint encerrado → `conflict`) | idem | `planSprint` com o conjunto anterior |
| `sprint_start {sprintId}` | `startSprint` (só planejado → ativo; liga a meta do time) | idem | **não tem** |
| `sprint_close {sprintId, leftover}` | `closeSprint` (confirmada) | idem | **não tem** |
| leitura: `read`, `sprints` | `getProjectBoard`, `listSprints` | qualquer persona do projeto | — |
- **Mover não inicia:** uma persona movendo um cartão para "Fazendo" **não** dispara o HT-3 (que é só a mover da PESSOA); sem laço.
- **Falta (HT-2b):** `board_card_create` ("cartão para depois"): precisa segurar o Ticket antes de iniciar (`card_hold`, §7 do Forge).
- **Prova:** `tests/harness-boards.spec.ts` (8): mover pelo pedido + o Desfazer que a UI rodaria · persona movendo não inicia nada · autonomia (`asked`/`propose` recusam; `act` só o cartão dela; outro cartão e cartão sem dona recusados; pedido da pessoa vale) · cartão/coluna inexistentes e persona de fora · mesma chamada duas vezes = uma ação · sprints (pedido × iniciativa, teto diário, Desfazer) · planejar/iniciar/encerrar com conflitos · leitura sem efeito colateral. `check-pkg persona-host` OK.

## 10. HT-5 — avaliação do que cabe como porta e o que não (Bolt, 04/11 21:20, conferido no código)
- **Arquivos do projeto:** **não construir ferramenta de produto.** `listFiles/statFile/readFile` são só leitura sobre a pasta do projeto e a CLI do worker já lê o próprio worktree com as ferramentas nativas; uma ferramenta paralela duplicaria o acesso sem ganho (e a escrita segue pelo rascunho SW: Aplicar/Desfazer). Se um dia for preciso (persona sem CLI, só DSH), a porta é fina: os mesmos `listProjectFiles/statProjectFile/readProjectFile` com a raiz do projeto.
- **Assuntos (`subject_create/rename/archive`) e canais (`channel_create`):** a regra vive dentro dos Remotes de `index.ts` (cores únicas por conversa em `createConversationSubject`, `topics.rename/archive`, `createChannel`) e os Remotes passam pela guarda do ator da sessão (persona não é ator). Uma porta honesta precisa **extrair a regra para uma função comum** que o Remote e a porta chamem — mexida no código do Anvil (wave2/topics) e, para canais, o CV-6 dele (canal arquivado, canal automático nunca apagado). **Proposta:** o Anvil extrai `topics`/`channels` em funções puras na entrega do CV-6; eu escrevo as portas por cima (≈2 h).
- **Memória (`memory_propose`, `brain_*`):** o segundo cérebro já tem modelo de permissão por persona (`grantBrainPermission`, `useBrainPermission`, trilha em `brain-permission-trail.md`) e as definições `brain_search/read/propose` no lado do runner, com portas esperando o host (`BrainPorts`). A porta do host é do **Anvil/Forge** (ACL do cérebro); `proposeMemory` do host só grava rascunho (a pessoa aprova). Não duplico.
- **Resumo:** do HT-5, só **assuntos/canais** é meu e depende da extração do Anvil; arquivos **não se faz**; memória **é do Anvil/Forge**.

## 11. HT-0 — o desenho do lado do host (proposta, para o Rivet e o Keel)
1. **`HarnessPorts`** (host): um objeto que agrega `BoardPorts` (HT-2), `RoutinePorts` (HT-4, Forge), as portas de ask estruturado do Forge e, depois, assuntos/canais — todas recebem `HarnessIdentity` montada **pelo host a partir do run** (persona, projeto, `callId` do pedido da ferramenta, `initiator`/`requestId` conforme o Ticket nasceu de mensagem da pessoa, `autonomy` da persona). Argumento da ferramenta nunca troca identidade (regra do gateway).
2. **Definição das ferramentas** (`harness_*`, no padrão de `brain-tools.ts`) em `persona-runners/src/mcp/harness-tools.ts` — **arquivo do Rivet**; as portas entram como `HarnessMcpPorts` opcionais (sem porta, "<tool> unavailable"). Níveis: leitura = `read`, ações = `write`; sensíveis seguem o gateway.
3. **Abertura do turno:** hoje ninguém chama `gateway.openTurn(...)`. O host abre o turno no gateway quando a Tarefa começa (`runLaunched`), guarda o `lease` e entrega o `url/token` ao adaptador; fecha ao fim do turno (`closeTurn`).
4. **Transporte até a CLI viva** (Rivet): campo de ferramentas em `StartTurnInput` + o adaptador OAR servindo-as (`serveMcpTools`) no Claude e no Codex.
5. **Prova (a combinar):** (a) em processo, sem CLI: `gateway.call(token, 'board_card_move', …)` → porta do host → quadro, com ACL e atividade; (b) com CLI real, uma chamada de ferramenta de verdade (depende do passo 4).

## 12. HT-0 — a metade do host e a ferramenta ENTREGUES; prova em processo verde (Bolt, 04/11 21:30). Falta ligar à CLI viva.
- **Ferramentas** (`persona-runners/src/mcp/harness-tools.ts`, no padrão do `brain-tools.ts`): `board_list`, `board_card_move`, `sprint_list|create|plan|start|close`, `routine_list|create|update|pause`. Só anuncia o que o host ligou (`HarnessMcpPorts.tools`); UMA porta `call()` recebe `{tool, run, args, callId}`; `personaId/assignmentId/workspaceId/projectId` dos argumentos são **descartados** (a identidade é a do run; `ticketId` fica porque nomeia o cartão); `callId` novo por chamada **e por concessão** (nonce da lease) — assim só um retry da MESMA chamada bate no cache de idempotência. As leituras entram em `READ` (`tool-level.ts`); `createMcpGateway({ harness })`.
- **Host** (`harness-ports.ts`, `harness-dispatch.ts`, `harness-boards.ts`): `HarnessPorts.identityOf(run, callId)` monta persona/projeto/`initiator`/`requestId`/`autonomy` a partir do **run** (Ticket iniciado por mensagem de membro do workspace = `person-request`; iniciado pelo agendador — ids `initiative:`/`routine-run:`/`plan:` ou autor que não é membro — = `persona-initiative`; run falso = sem identidade); `harnessMcpPorts(harness, { onActivity })` despacha cada ferramenta, valida os argumentos e responde ao modelo com JSON curto: `{ok:true,…,undoable}` ou recusa tipada `{ok:false, code, message}`; toda mudança chama `onActivity` (aqui o Anvil/HT-7 grava com o Desfazer). `PersonaHost.harness` guarda as portas (quadros/sprints + rotinas do Forge).
- **Prova em processo, sem CLI** (`tests/harness-gateway.spec.ts`, 7): ferramentas anunciadas por nível · o pedido da pessoa move o cartão no quadro real + atividade com o Desfazer que a UI roda · autonomia `asked` recusa (nada move), `act` move só o cartão dela · persona falsa em argumento não vira outra e run falso é recusado · argumentos errados não fazem nada · sprint completo (criar→planejar→iniciar→encerrar; iniciar/encerrar dizem que não desfazem) · rotinas (criar/listar/pausar e o teto diário). + `harness-ports.spec` 5, `harness-boards.spec` 8, runners `harness-tools.spec` 6.
- **Falta (HT-0 (3)/(4)):** o host criar o gateway com as `PersonaToolHooks` reais e passar `toolsFor` ao `createOarSessionRunner` (Rivet fecha a prova com o Claude real), **atrás de flag desligada** e anunciando só o necessário por Tarefa (custo de tokens de cada definição); o Codex vem depois do Claude.

## 13. HT-0 (3) LIGADO no host, atrás de `Config.productTools` (DESLIGADA) — Bolt, 04/11 21:50
- **Caminho:** `resolveFor` (só Tarefa em CLI; nunca conversa nem answer-only) → `HostRunnerRequest.productTools` (o *opener*) → `resolveHostRunner` → `createOarSessionRunner({ toolsFor })` (API do Rivet, `contracts/ht0-transport.md`; Claude provado com a CLI real) → a cada turno entregue o host abre a concessão do gateway (`openTurnTools`) com `run = { personaId, ticketId, assignmentId }` e fecha ao fim/cancelar.
- **Só o necessário por Tarefa (alinhado ao HT-10):** `harnessToolsNeeded(texto do pedido)` decide quais definições valem os tokens — quadro/cartão/coluna → `board_*`; sprint → `sprint_*`; rotina/"todo dia"/"toda semana"/agendar → `routine_*`; **sem palavra, nenhuma ferramenta** (e a concessão nem abre). Um erro de heurística só faz a ferramenta não ser oferecida (a persona diz que não pode), nunca uma ação errada. O gateway anuncia só as ferramentas de harness (as `persona_*` ficam de fora até alguém ligar os hooks reais). O teto da concessão é o nível `tools` da persona (`none` ⇒ nada).
- **Atividade:** cada mudança grava `harness_activity` (screen_doc, `{personaId, verb, target, before/after, initiator, requestId, undoable, undo, at}`) até o HT-7 do Anvil trocar pelo feed.
- **Prova:** `harness-turn.spec` 5 (as palavras → ferramentas; a Tarefa do quadro recebe SÓ `board_*` e a chamada move o cartão real; Tarefa simples = nada; nível `none` = nada; o pedido do runner leva o opener só com a flag e só em Tarefa) + `harness-gateway` 7 + `harness-ports` 5 + `harness-boards` 8 + runners `harness-tools` 6. Suíte do host verde fora de specs novos de outros donos.
- **Falta (só a CLI):** um turno REAL de uma persona (conta logada) chamando `mcp__persona__board_card_move` ponta a ponta no host — gasta cota real: só com OK do Atlas; o Rivet já provou a CLI listando e chamando a ferramenta com endpoint de teste (spike 5/5, zero custo).

### 2-F · HT-6 — FEITO no host (Bolt, 05/11 00:40), atrás de `Config.productTools`
`persona_hire` `{ name, title, description, reason? }` (nível `write`): só quem a pessoa autorizou (`canRecruit`; senão "Você não contrata pessoas; peça à Coordenação ou à pessoa."). **Sempre o CARTÃO em Aprovações** (o mesmo A-4: nome e rosto únicos, sem "por quê" inventado), exceto se a pessoa ligou **"Contratar direto"** para aquela persona (`setPersonaHireDirect`, desligado por padrão, só para quem pode contratar; `PersonaView.hireDirect` só com as ferramentas ligadas) — e mesmo assim só a pedido da pessoa ou sob `act`. Iniciativa própria: `asked` nunca contrata, `propose` deixa o cartão. A contratada nasce SEM ferramentas, habilidades nem limites (nunca mais acesso que quem contratou). Tetos: 2 cartões abertos por recrutadora, 2 contratações diretas por dia, 12 pessoas por projeto. A mesma chamada duas vezes = um cartão e uma atividade. Atividade: `persona_hire` / `Aguardando a sua aprovação` (desfaz = recusar o cartão) ou `Contratada` (**não desfazível: ainda não existe "aposentar" no store**; `persona_retire` fica para o Anvil). Código: `harness-hiring.ts`, `hire-direct.ts`, `harness-dispatch.ts`. Provas: `harness-hiring.spec` 15, processo real fase 13.

> Atualização 05/11 01:50 (HT-6): com o `persona_retire` do Anvil (Remote `retirePersona`, store v23), a contratação DIRETA é desfazível: `undoable: true`, `undo: { remote: 'retirePersona', request: { workspaceId, projectId, personaId } }` (a aposentada sai da equipe e do roteamento; histórico e nome nas mensagens antigas ficam). O cartão pendente continua desfeito por recusa (`decideApproval`).
