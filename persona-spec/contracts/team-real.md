# Equipe real — contrato de campos entre engine, host e telas (RASCUNHO do Keel, D-090, 04/11 22:10)

> **Status:** rascunho para DESTRAVAR as telas (Lumen, Prism, Ember, Flint, Quill, Gauge). O **Forge** (engine) e o **Anvil** (host) corrigem os NOMES em até 1 h, publicam a versão final neste mesmo arquivo e avisam por tell. Tudo atrás de `persona.flag.teamwork` no cliente e de `Config.teamwork` (desligada) no host. Nenhum texto interno de prompt aparece em campo visível (LEAK-1).

## 1. O bilhete (TEAM-1) — `HandoffNote`
```ts
interface HandoffNote {
  readonly fromPersonaId: string
  readonly toPersonaId: string
  readonly taskId: string
  readonly done: readonly string[]       // "O que já está pronto"
  readonly needed: readonly string[]     // "O que falta"
  readonly files: readonly string[]      // caminhos relativos ao projeto
  readonly decisions: readonly string[]  // "Decisões tomadas"
  readonly at: string                    // ISO
}
```
`TaskView.note?: HandoffNote` (o último) e `TaskView.path?: readonly PathStep[]` (o "Caminho do trabalho"):
```ts
interface PathStep { readonly personaId: string; readonly step: 'wrote' | 'handed' | 'delivered' | 'reviewed'; readonly at: string }
```

## 2. Quadro (TEAM-1/2/6) — `BoardCardView`
```ts
BoardCardView.handoff?: { readonly role: 'asked' | 'waiting'; readonly otherPersonaId: string }  // "Pedido por {A}" / "Esperando {B}"
BoardCardView.reviewedBy?: { readonly personaId: string; readonly at: string }                    // selo "Revisado por {R}"
```

## 3. Fio (TEAM-3/4/5/6/8) — `MessageView`
```ts
MessageView.handoff?: {
  readonly kind: 'asked' | 'delivered' | 'resumed' | 'blocked' | 'capReached' | 'groupMany'
  readonly fromPersonaId: string
  readonly toPersonaIds: readonly string[]
  readonly taskId: string
  readonly title: string        // título da tarefa, nunca id
  readonly connector?: string   // 'blocked': o conector que falta ao colega
  readonly count?: number       // 'groupMany'
}
MessageView.opinion?: {
  readonly kind: 'request' | 'reply' | 'consolidated'
  readonly requestId: string
  readonly taskId: string
  readonly attachmentIds: readonly string[]            // imagens do rascunho (TEAM-5)
  readonly mark?: 'liked' | 'suggestion' | 'attention' // Gostei / Sugestão / Ponto de atenção
  readonly round: number
  readonly maxRounds: number                           // padrão 2
  readonly before?: string; readonly after?: string    // consolidação "Antes · Depois"
  // acrescentado pelo Keel (22:15) a pedido do Flint — o Forge/Anvil confirmam os nomes:
  readonly question?: string                           // a pergunta da persona ao time (texto humano)
  readonly draft?: { readonly text?: string; readonly imageIds: readonly string[]; readonly alt?: string }  // o rascunho compartilhado (texto e/ou imagens + descrição)
  readonly cost?: { readonly estimatedTurns: number; readonly cappedAt: number }                          // custo visível ANTES (Tally): turnos estimados e teto
  readonly blindPersonaIds?: readonly string[]         // personas cujo motor NÃO lê imagem (fallback honesto: "{nome} não vê a imagem")
  readonly replierPersonaIds?: readonly string[]       // quem foi convidada a opinar
}
MessageView.review?: { readonly kind: 'reviewed' | 'returned'; readonly reviewerPersonaId: string; readonly round: number; readonly maxRounds: number }  // máx. 2 voltas
```

## 4. Reunião do dia (TEAM-7) — `MessageView.dailyBrief`
```ts
MessageView.dailyBrief?: {
  readonly day: string                       // YYYY-MM-DD
  readonly coordinatorPersonaId: string
  readonly yesterday: readonly { taskId: string; personaId: string; title: string }[]
  readonly today: readonly { taskId: string; personaId: string; title: string }[]
  readonly needsYou: { readonly count: number }
  readonly paused: boolean
  readonly routineId: string                 // para "Pausar o resumo da manhã"
}
```

## 5. Por persona (Configurações › Personas, Quill)
```ts
PersonaView.teamwork?: { readonly canAskColleagues: boolean; readonly askCapPerDay: number; readonly askedToday: number }
```
Remotes (Anvil): `setPersonaTeamwork({ personaId, canAskColleagues, askCapPerDay })`.

## 6. Regras
- Tudo humano no fio ("Bia pediu ajuda ao Teo: {título}"); o bilhete aparece no detalhe da tarefa; nada do `assignment` interno em campo visível.
- O colega sem o conector → `handoff.kind='blocked'` + ação "Liberar para {nome}" (ISO-2/HT-8).
- Revisão: ligada por padrão em projeto novo, pela Coordenação, no máx. 2 voltas.
- Opinião: custo estimado ANTES (Tally); teto de rodadas por tarefa; imagens só se o motor lê imagem (fallback honesto).

### 6b. Bom dia AGORA (Bolt, 05/11) — Remote `postDailyBriefNow({workspaceId, projectId, requestId?})` → `{outcome, messageId?, text}`
- Posta o MESMO cartão da §4 (`MessageView.dailyBrief`, autora = Coordenação, zero modelo) na hora do pedido: sem janela de horário e sem a regra "nada mudou" (pedir é motivo para ser informado). ACL de membro (como `getWhileAway`).
- `outcome`: `posted` (`messageId` = o cartão) · `already` (o do dia já existe — do ritual ou de um pedido anterior; devolve ELE, não duplica) · `nothing-to-say` (ninguém terminou ontem, ninguém ocupado, nada espera a pessoa: SEM cartão, o `text` diz) · `off` (equipe sem trabalho em equipe) · `no-coordination` · `no-channel`. A UI escreve suas palavras pelo `outcome`; `text` (pt-BR) é o reserva.
- Idempotência: sem `requestId` = o cartão do DIA (id `morning-brief:<projeto>:<dia>`, o mesmo do ritual: o agendador não posta outro depois); com `requestId` (`[A-Za-z0-9_-]{1,64}`) = um cartão EXTRA próprio (`…:ask:<requestId>`), o mesmo `requestId` devolve o mesmo cartão. Pausar "Resumo da manhã" para só o automático.
- O cartão extra não entra no "Ontem" do dia seguinte (os fatos vêm das Tarefas, não dos cartões) nem é mensagem da pessoa (autora = Coordenação, `subjectId: morning-brief`).

## 7. CORREÇÕES DO HOST (Anvil, 22:25) — valem sobre as seções acima; o resto fica como o Keel escreveu
Já no tree (com teste): `PersonaView.teamwork` **com `maxOpinionRounds`** e `setPersonaTeamwork({ personaId, canAskColleagues?, askCapPerDay?, maxOpinionRounds? })`; `PersonaView.engine`; `setPersonaCanRecruit`. Detalhe e faixas em `persona-settings-host.md`. O que muda nos nomes dos campos do fio:

- **`MessageView.handoff`** (a spec, linha 70, manda `status`, não `kind`; o modo faz parte do texto "passou para" × "pediu ajuda a"):
  ```ts
  handoff?: { mode: 'handoff' | 'help'; status: 'asked' | 'delivered' | 'resumed' | 'held' | 'blocked'
              fromPersonaId: string; toPersonaId: string      // UM colega (a opinião ao time é `opinion`)
              taskId: string; title: string                   // título humano, nunca id
              connector?: string                              // 'blocked': o conector que falta ao colega ("Liberar para {B}")
              reason?: string }
  ```
  **Saem do fio** `capReached` e `groupMany`: o teto vai só no **detalhe da Tarefa** (`TaskView.note`/`path`, sem linha no fio) e o agrupamento ("A Bia pediu ajuda a 2 colegas") é da UI, por minuto.
- **`MessageView.opinion`**: o corpo da mensagem `request` é a **pergunta**; no rascunho, `draftText?: string` (texto) e `attachmentIds[]` (imagem) + `alt?: string`; `audience: 'team' | 'some'`; `estimate?: { responses: number; cost?: string }` (só quando o Tally mede). `reply`: o corpo é a resposta (1–3 linhas) e `mark: 'liked' | 'suggestion' | 'attention' | 'nothing'` (`nothing` recolhe em "e mais {n} sem nada a acrescentar"). `consolidated`: o corpo são as 1–2 linhas e **`version?: { k: number; before: { text?: string; attachmentIds?: string[] }; after: { text?: string; attachmentIds?: string[] } }`** (para "Antes · Depois" também de imagem; o `before/after: string` do rascunho não cobre imagem). `noVision?: string[]` = personas puladas por motor sem visão (a UI escreve "e mais {n} que não veem imagens neste motor").
- **`MessageView.dailyBrief`**: fica como o Keel escreveu, **mais** `yesterdayMore: number` (o "e mais {n}" do Ontem; `yesterday[]` traz no máx. 3). `needsYou.count` substitui o `waitingCount` que o Prism perguntou. `today[]` = uma por persona ocupada. **Só sai quando há o que dizer, no máx. 1 por dia (do host)**; o texto do cartão é determinístico e **não usa IA**.
- **`BoardCardView.handoff`/`reviewedBy`, `TaskView.note`/`path`, `HandoffNote`, `MessageView.review`**: sem objeção; `review` ganha `openPoints?: number` (a 3ª volta: "{R} deixou {n} ponto(s) em aberto").
- **Revisão (Muse 22:44 + Forge 22:57 + Muse 22:58; um contrato só, o do Forge):** `TaskView` **e** `BoardCardView` ganham `reviewing?: { personaId: string; round: number }` enquanto o colega revisa e `reviewedBy?: { personaId: string; at: string; openPoints?: number }` quando termina (`openPoints` só na 3ª olhada: "{R} deixou {n} ponto(s) em aberto; o trabalho segue sem o selo"; sem revisão não há selo). **No código, lendo `handoffs.reviewing/reviewedBy`.** No fio: o PEDIDO é uma linha `handoff` com `purpose: 'review'`; o VEREDITO é `MessageView.review = { kind: 'reviewed' | 'returned'; reviewerPersonaId; authorPersonaId; taskId; round; maxRounds; openPoints?; summary? }` com **`round` = quantas VOLTAS já houve (0, 1 ou 2; `maxRounds` = 2)**: `reviewed` round 0 → "{R} aprovou"; `reviewed` round ≥ 1 → "{A} ajustou e {R} aprovou"; `returned` sem `openPoints` → "{R} pediu ajustes: {summary}"; `returned` com `openPoints` → "{R} deixou {n} ponto(s) em aberto". As notas completas vão no bilhete, nunca no fio. **Substitui** o `asked/approved/changes/adjusted` que escrevi antes. A POLÍTICA por projeto: `getReviewPolicy` / `setReviewPolicy` (ver `persona-settings-host.md`).
- **Flag**: `Config.teamwork` no host (padrão desligada) — com ela desligada nenhum desses campos é devolvido e nada vira evento; no cliente, `persona.flag.teamwork`.
- **Dono de cada campo**: o engine (Forge) decide o conteúdo (bilhete, dependência, revisão, limites); o host (Anvil) o entrega e valida o que a pessoa vê; **nenhum campo visível carrega texto do `assignment`/prompt interno** (teste guarda LEAK-1 estendido a cada evento novo).

## 8. MOTOR E PORTA DO PEDIDO A UM COLEGA (Forge, 22:35) — TEAM-1/2/3, valem sobre as seções acima nos NOMES

**Engine puro** (`persona-engine/src/handoff.ts`, exportado do index; `handoff.spec` 12/12):
- `HandoffNote { fromPersonaId, toPersonaId, fromTaskId, toTaskId, kind: 'help'|'next'|'review', done[], needed[], files[], decisions[], at }` — `taskId` do rascunho virou **`fromTaskId` + `toTaskId`**. `NoteBody` = só as 4 listas.
- Limites do bilhete: ≤ 8 itens por lista (300 caracteres cada), ≤ 12 arquivos (200), título ≤ 120. Arquivos são **caminhos relativos ao projeto** (recusa `..`, absoluto, unidade, `\servidor`, `~`). Segredos (`api_key=`, token, bearer, `sk-…`, senha) saem **antes** de guardar. Exige `done` ou `needed`.
- O bilhete chega ao colega como **DADO** entre `<bilhete>…</bilhete>` (`noteForColleague`), nunca como instrução.
- `PathStep.step`: `'wrote' | 'asked' | 'handed' | 'delivered' | 'reviewed'` (ganhou `asked`).
- `checkHandoff` falha fechada, nesta ordem: tarefa encerrada, chave "Pode pedir ajuda" desligada, a si mesma, colega inexistente, outro projeto, círculo, > 2 níveis, 3 pedidos por Tarefa, teto diário (padrão 6; `TeamworkSettings.askCapPerDay`). Cada recusa é **uma frase em português para o modelo, com o caminho a seguir**.

**Host** (`persona-host/src/handoffs.ts`, classe `Handoffs`; `handoffs.spec` 7/7; só vira evento com `Config.teamwork`):
- `ask({ projectId, fromTicketId, fromPersonaId, toPersonaId, title, note, kind?: 'help'|'next', callId })` → `{ ok, status: 'asked'|'held', requestId, duplicate? }` ou `{ ok:false, message }`. Identidade = a execução (a persona tem de ser quem roda aquela Tarefa), nunca o argumento. `callId` = idempotência (repetir a chamada não abre 2ª Tarefa). `kind 'next'` = passar adiante (a autora NÃO espera); `'help'` = a autora **espera** (Tarefa `waiting`, sem pergunta à pessoa).
- A Tarefa do colega é **normal** (ferramentas da persona; rota `mode:'task'`), com o **gatilho da PESSOA** (mesmo ator ⇒ herda o mandato e o escopo, nunca mais) e a atribuição invisível (o bilhete). Roda numa execução própria, nunca dentro da de quem pediu.
- Fio: evento `type:'handoff'` com a frase simples + `[[handoff:{json}]]` ⇒ `MessageView.handoff { mode:'handoff'|'help', status:'asked'|'delivered'|'resumed'|'held'|'blocked', fromPersonaId, toPersonaId, taskId, fromTaskId, title, reason?, connector? }` (`taskId` pode vir vazio na 1ª linha: a Tarefa do colega ainda não existe se o motor está esperando). Frases do corpo: "{A} pediu ajuda a {B}: {título}" · "{A} passou para {B}: {título}" · "{B} entregou para {A}: {título}" · "{A} pediu a {B}, que está em pausa: {título}" · "{A} pediu a {B}, mas não deu para seguir: {título}".
- A entrega acorda quem pediu (`orchestration.wakeTicket` = nova Assignment que lê a entrega como dado); se o colega falha, a linha diz `blocked` e ela é acordada para seguir sem ele. **Detalhe da Tarefa**: `handoffs.notesOf(projectId, ticketId)` (bilhete, papel `asked|asker`, status) e `handoffs.pathOf(...)` (caminho do trabalho) — o Anvil expõe em `TaskView.note/path`.
- Ganchos no orchestration (opcionais, inertes sem equipe): `handoffWait` (antes do `ready`), `ticketSettled` (depois), `wakeTicket`. A **revisão** (Tally, TEAM-6) entra pelo mesmo caminho: pedido `kind 'review'` aberto antes do `ready`.
- `TeamworkSettings.askedToday` ← `handoffs.askedToday(projectId, personaId, dia)` (ligado no host).
- ~~Pendente (Anvil): cartão "Liberar para {B}"~~ → contrato FINAL na seção 9 abaixo.

## 9. "PRECISA DE VOCÊ / LIBERAR PARA {B}" e o PEDIDO DE INICIATIVA (Anvil, 23:25) — um só cartão de Aprovações para o conector
**Um tipo de aprovação para os dois casos** (a persona precisa de um conector que ainda não pode usar): "a Nina quer usar o Drive" (iniciativa, HT-8) e "a Bia pediu ao Teo e o Teo não pode usar o Gmail" (colega, TEAM-3). Mesma ação, mesma concessão (ISO-2/HT-8).
```ts
ApprovalView.kind: 'hire' | 'vault' | 'skill' | 'attention' | 'connector'      // 'connector' é novo ('action' vem com o HT-9)
ApprovalView (kind 'connector') {
  id: string                       // o id do pedido
  title: string                    // "Liberar o {conector} para {B}"  (a UI pode reescrever com os campos abaixo)
  question: string                 // "{A} pediu a {B} {título}, mas {B} não pode usar o {conector}."  |  "{persona} quer usar o {conector}: {propósito}."
  status: 'pending' | 'approved' | 'rejected'
  personaId: string; personaName: string        // QUEM precisa do conector (B no caso do colega; a persona da iniciativa)
  connector: {                      // campo novo, só neste kind
    reason: 'colleague' | 'initiative'
    connectorName: string; cli: string; connectorId: string; access: 'read' | 'write'
    requestedByPersonaId?: string; requestedByPersonaName?: string   // 'colleague': A, quem pediu
    taskId?: string; taskTitle?: string                              // 'colleague': a Tarefa do colega que espera
    purpose?: string                                                 // 'initiative': a frase humana do porquê
    options: ('once' | 'always' | 'not-now')[]                       // 'Liberar só desta vez' · 'Sempre permitir para {B}' · 'Agora não'
  }
}
```
**A ação que o "Liberar" chama (a mesma do pedido de iniciativa):**
```ts
decideApproval({ workspaceId, projectId, id, kind: 'connector', choice: 'once' | 'always' | 'not-now', accept?: boolean }): ApprovalView
```
- `once` = a Tarefa do colega roda COM o conector, só ela (autorização por Tarefa, some quando a Tarefa acaba); `always` = concessão permanente de LEITURA para a persona (`grantConnector`; escrita só pelos botões de Configurações; pagar/apagar continuam perguntando); `not-now` = a Tarefa fica bloqueada com o motivo, sem recusa em silêncio. `accept` é derivado (`once`/`always` → true) e só vale para os kinds antigos.
- **Resposta:** o `ApprovalView` decidido + `connectorDecision?: { choice; grant?: { personaId; cli; connectorId } }` — com `always` o `grant` é o que o **Desfazer** do Toast ("Agora a Nina pode usar o {conector} sem perguntar · Desfazer") passa a `revokeConnector({ personaId, cli, connectorId })`. Sem `undoGrant` separado.
- Quem decide: o dono do workspace (ou o responsável de quem precisa); `forbidden` para os demais. Já decidido → devolve o cartão como está (idempotente).
- **No fio**, o caso do colega é a linha `handoff` com `status: 'blocked'` e `connector` (a UI escreve "{A} pediu a {B}, mas {B} não pode usar o {conector}"); o do iniciativa é `MessageView.initiativeAsk = { approvalId; personaId; personaName?; connectorName; purpose; status: 'pending' | 'decided' }`. **O texto do pedido nunca vem de conteúdo lido** (arquivo, e-mail, página): só da fala da pessoa e do título que a própria persona escreveu.
- **Só com `Config.teamwork`** (colega) / com as concessões ligadas (iniciativa).

## 10. A PRÉVIA DE AÇÃO EXTERNA (HT-9, Anvil, 00:25) — o cartão `kind: 'action'`
Uma chamada de ferramenta que enviaria um e-mail, postaria, pagaria ou apagaria fora do app é barrada pelo gate (Tally) e volta como pedido com os argumentos que USARIA. O host guarda **um cartão** em Aprovações com o conteúdo real. Código: `persona-host/src/external-actions.ts` (+ `external-actions.host.spec`, 8). **O que já funciona no host:** o cartão, a decisão, os estados, os limites, a expiração e o aviso à persona. **O que falta (outro lado):** o runner entregar o pedido do gate ao host e reabrir a Tarefa com o hash aprovado (`onActionApproved` / `approvedFor`); até lá a aprovação fica guardada e **nada é executado** (falha fechada).
```ts
ApprovalView.kind: ... | 'action'
ApprovalView (kind 'action') {
  id: string                     // opaco ("action:{tarefa}:{n}"); o hash dos argumentos nunca chega à tela
  title: string                  // "{persona} quer enviar|pagar|apagar|publicar pelo {conector}"
  status: 'pending' | 'approved' | 'rejected'
  personaId: string; personaName: string
  actionPreview: {
    actionClass: 'send' | 'pay' | 'delete' | 'post'; verb: string; connectorName: string
    to?: string; subject?: string; body?: string            // e-mail / post: o conteúdo real
    amount?: string; payee?: string; reference?: string      // pagamento
    items?: string[]; count?: number                         // apagar: o que iria (até 20)
    truncated: boolean; masked: boolean                      // a prévia está cortada / tem parte escondida: NÃO se aprova às cegas
    requestedByPerson: boolean                               // "Você pediu · {persona} confirma antes de enviar"
    status: 'pending' | 'sending' | 'sent' | 'cancelled' | 'failed' | 'adjusted'
    canRemember: boolean                                     // a caixinha só em e-mail e post
    sentTo?: string; sentAt?: string; failureReason?: string
  }
}
decideApproval({ workspaceId, projectId, id, kind: 'action', choice: 'send' | 'edit' | 'cancel', edited?: string, remember?: boolean }): ApprovalView
```
- `send` = Enviar · Pagar · Apagar: **uma** chamada, só com os argumentos exatos do cartão, uma vez. **Recusado** (`invalid-payload`) se `truncated` ou `masked`. `remember` ("Não perguntar de novo para a {persona}") só vale em e-mail/post e só desliga a caixa de **envio** daquele conector para aquela persona (`confirm.send = 'never'`, leitura e escrita); **em pagamento e apagar o host ignora**. `edit` exige `edited` (o que a pessoa quer mudar): a persona recebe como **dado** e faz um pedido novo. `cancel` avisa a persona. Pagar e apagar **sempre** pedem a prévia.
- **Limites:** no máx. **2 tentativas por Tarefa e ferramenta** (a 3ª proposta diferente é parada, não obedecida); o cartão **expira em 24 h** (fecha sozinho, a persona é avisada). Só o dono do workspace responde; já respondido = devolve como está.
- **No fio** (depois de executar): `MessageView.actionEvent = { verb, connectorName, target, subject?, undoable?, undoUntil?, activityId, content?: { to?, subject?, body?, amount?, payee?, reference?, items?, count? } }` — `content` (o mesmo da prévia) só quando o host o guardou; sem ele a UI não mostra o "Ver". `undoable` nunca para e-mail/post/pagamento. **Ainda não emitido** (vem com a execução).

## 9. R1 — a linha de ESTADO tem tipo (Bolt, 05/11 01:05; pedido do Keel/Quill, regra da Muse §0)

O host escreve linhas de estado de uma Tarefa ("Em andamento: X", o "Pronto: X" que ele mesmo redige). Elas chegam com um campo TIPADO, gravado junto do evento (antes de a linha existir; nunca lido do texto; zero regex), para que os cartões (plano, entrega) as absorvam e o fio as deixe de fora. Só com `Config.teamwork`; sem ela o campo não é entregue.

```ts
> **05/11 03:55 (Muse, tela do dia):** (a) a fala da persona ao fechar a parte vale `part_done/result` TAMBÉM com a revisão ligada (a Tarefa fica esperando o selo; antes só era tipada sem revisão); (b) o "Pronto: …" que o host escreve para a Tarefa de uma PASSAGEM ou AJUDA (origem `handoff:`, sem fala própria) é só o marcador do motor, gravado sob autor `team:passage-done` — nunca vai ao fio (o estado é a linha da passagem); a fala própria do colega continua visível.

MessageView.stateLine?: {
  readonly kind: 'task_progress' | 'part_done' | 'task_done'
  readonly ticketId: string
  readonly groupId?: string          // o pedido de que a Tarefa é PARTE: o MESMO id do cartão do plano ('split-<mensagem>', ou o da campanha). Ausente em Tarefa avulsa.
  readonly text: 'status' | 'result' // 'status' = o host escreveu a frase; 'result' = é a fala da própria persona (a entrega): os cartões a ABSORVEM, não a descartam
}
```

| Linha | `kind` | `text` |
|---|---|---|
| `exec-<ticket>-progress` "Em andamento: …" | `task_progress` | `status` |
| `coord-<ticket>-done` "Pronto: …" (frase do host) | `part_done` se tem `groupId`, senão `task_done` | `status` |
| `coord-<ticket>-done` com a fala da persona | idem | `result` |

**Nunca recebem `stateLine`** (continuam visíveis, §0.6): a pergunta da persona à pessoa ("Precisa de você: …"), a falha técnica/erro, o veredito de revisão tipado e qualquer fala que não seja a Tarefa terminando. O Anvil decide esconder/absorver pelo `stateLine`, não pelo id.

**O host também PARA de escrever o que o cartão já diz:** (1) sem "Dividi o pedido por função: …" quando há 2+ partes e o cartão do plano existe (só a nota de quem está pausada); (2) sem "Concluído: …" quando o pedido tem o cartão de entrega; (3) sem "Em andamento" quando o cartão do plano ou a passagem de trabalho (`handoff:`) já carrega o estado. O "Pronto"/a linha da persona NÃO deixam de ser gravados: são o marcador de idempotência da Tarefa e a linha onde ela pergunta (`replyToId`), por isso a leitura os esconde pelo tipo.

## 11. AS FERRAMENTAS DE EQUIPE DA PERSONA REAL (HT-0) E A LEITURA DA RODADA (Forge, 05/11 03:15)

As quatro ferramentas que uma persona de CLI viva chama: `ask_colleague`, `pass_forward`, `review_verdict` (e `ask_team_opinion`, do `opinion-host.ts`). Domínio, limites e mandato são as PORTAS do host (`handoffs.ts`); `harness-team.ts` é só a porta de entrada da CLI. Nomes na CLI: `mcp__persona__<ferramenta>`.

| Ferramenta | Argumentos (o modelo) | O que o host faz | O modelo lê |
|---|---|---|---|
| `ask_colleague` | `colleague` (nome, id ou função única), `title`, bilhete `done[]` `needed[]` `files[]` `decisions[]` | `Handoffs.ask(kind:'help')`: Tarefa do colega com o MANDATO da pessoa e o bilhete como DADO; quem pede espera; a entrega a acorda | `{ok, requestId, status, colleague, next}` — "termine o turno dizendo o que espera; não faça a parte dele" |
| `pass_forward` | idem | `Handoffs.ask(kind:'next')`: o trabalho segue; quem passou NÃO espera e entrega a sua parte | idem ("a parte de X não é sua") |
| `review_verdict` | `verdict` (`approve` \| `changes`), `points[]` (≤ 6) | só em Tarefa de REVISÃO: guarda o veredito (`screen_doc review_verdict`, 1 por volta); vale quando o revisor TERMINA o turno; vence o texto, que continua como reserva | `{ok, verdict, points, next}` |

**Identidade = a execução** (persona + Tarefa + id de chamada, do lease; `forbidden` se não for uma execução real). **ACL:** chave da equipe ligada; `canAskColleagues` e o teto diário da persona; círculo (ninguém já na cadeia), 2 níveis, 3 pedidos por Tarefa (`checkHandoff`); concessão `write` para abrir trabalho e só `read` para dar o veredito; Tarefa de INICIATIVA da persona (rotina, proposta) só com autonomia `act` (a de campanha `campaign:` é do plano da pessoa). Recusas = `{ok:false, code, message}` com o caminho a seguir (colega desconhecido lista a equipe; `ambiguous-colleague`; `needs-person` → `persona_ask`; `review-task`).

**Oferta (só quando o pedido precisa; `teamToolsFor`/`teamToolsOf` no opener):** Tarefa de revisão → SÓ `review_verdict`; senão `ask_colleague`/`pass_forward`/`ask_team_opinion` quando as palavras do pedido pedem (`peça ao Teo`, `depois o Teo faz`, `veja a opinião da equipe`) com a equipe ligada, 2+ pessoas e `canAskColleagues`; Tarefa de colega/campanha olha o assignment (que cita pessoas de propósito) e ignora nomes; pedido simples → só `persona_ask`. Um erro de oferta só significa "a ferramenta não foi oferecida".

**Prova:** `node --import tsx/esm packages/persona/persona-host/scripts/team-tools-dry.ts` (host real + `claude` REAL + gateway HT-0 + endpoint falso; 21/21: ask, pass, opinião COM imagem, pedido simples) e `persona-host/tests/harness-team.spec.ts` (14) + `team-tools-e2e.spec.ts` (Bolt, 5).

**Leitura da rodada real (TEAM-10), no banco:** `node --import tsx/esm packages/persona/persona-host/scripts/team-round-observe.ts <home | persona.db> --ceiling 14` sobre uma CÓPIA (nunca abre o banco vivo), complementar ao `evaluateTeamRound` do Probe. Diz, com problema nomeado quando falha: pedidos feitos pelo MODELO pela ferramenta (id de chamada `<assignment>:<lease>:<n>`) × feitos pelo host (`mention:` palavras, `campaign:` plano, `review:` etapa); o bilhete chegou à Tarefa do colega e NÃO está no fio; cada ajuda entregue e RETOMADA; selo só com revisão real de OUTRA persona que entregou (e se o veredito veio da ferramenta ou do texto); rodada de opinião da persona (`opinion:*`: pedido, respostas de outras, consolidação, imagem ligada ao pedido); "Bom dia" sem turno pago no seu momento; livro medido, sem a assinatura do fake, ≤ teto. `--no-tools --no-review --no-opinion --no-brief` relaxam o que a rodada não precisa mostrar. Testado em banco de CLI real (dry): `team-round-observe.spec.ts` (5).

**Codex (Forge, 05/11 04:05).** As mesmas ferramentas chegam ao Codex REAL (`mcp__persona` + nome da função) **só na CODEX_HOME isolada do produto** (a conta do produto; na home nativa da pessoa o produto não escreve e o Codex não recebe ferramenta de produto — limite honesto do transporte). Prova a seco, custo zero: `node --import tsx/esm packages/persona/persona-host/scripts/team-tools-dry.ts --engine codex` — host real + `codex` REAL + endpoint `responses` FALSO, `config.toml` da CODEX_HOME isolada apontando o provedor para o falso, **sem `auth.json` escrito ou copiado** (`PERSONA_ISOLATE_CLI_CONFIG=1`; o produto pergunta `login status` ao próprio CLI antes de abrir a sessão, o script nunca lê o arquivo): 22/22 — ask, review por ferramenta com selo (revisora só `read`), pass, opinião e pedido simples. **O Codex não lê imagem hoje**: uma rodada de opinião só com Codex roda sobre as PALAVRAS e a imagem do pedido fica para trás — o modelo é avisado ("não foi junto: ninguém desta rodada vê imagens"); imagem NOMEADA pelo modelo que ninguém vê continua recusada (`no-vision`).

**Anexos pelo NOME (Forge, 05/11 03:40).** O modelo lê anexos pelo nome, nunca pelo id: `ask_team_opinion` aceita o NOME do arquivo no lugar do id e, se o rascunho não cita imagem alguma, as imagens anexadas à mensagem que iniciou a Tarefa vão junto (a resposta ao modelo diz isso); lista vazia explícita = sem imagem (`opinion-host.ts`, dep `attachmentsOf`).

## 12. OPINIÃO COM IMAGEM: QUEM NÃO VÊ IMAGEM NÃO ENTRA POR PADRÃO; "INCLUIR SÓ PELO TEXTO" (Forge + Bolt, 05/11 04:20; decisão do Atlas 04:05, forma da Muse §(c)) — 2ª janela de host

**Regra.** Num pedido de opinião COM imagem, só vão as personas cujo motor lê imagem. As outras (hoje: Codex) NÃO são chamadas e aparecem no cartão do pedido, recolhidas ("e mais {n} que não veem imagens neste motor"). **Nunca se opina sobre uma imagem que não se viu sem dizer isso.** Já é assim para a audiência padrão e para a lista escolhida pelo modelo (o orçamento as põe em `skipped: 'no-vision'` e a frase ao modelo diz "{nome} (não vê imagens neste motor)"); o que falta é o caminho da PESSOA para incluí-las.

**Dados (aditivos em `OpinionView`, `types.ts`).** `request`: `askerPersonaId?: string` (quem pediu: o prompt do colega precisa) e `textOnlyPersonaIds?: readonly string[]` (os de `noVision` que a pessoa incluiu só pelo texto; a UI mostra o recolhido como `noVision − textOnlyPersonaIds`). `reply`: `textOnly?: true` — **sempre** presente na resposta de quem foi incluído só pelo texto; a UI põe o chip neutro (`opinion.textOnlyBadge` "Opinou só pelo texto") ao lado do nome. **O corpo NÃO leva prefixo** (a tela já põe o chip e o cliente não corta texto — Muse, 04:09): é a fala do colega, que a instrução manda começar dizendo que não viu a imagem; qualquer outra superfície (busca, aviso, Bom dia) põe o mesmo rótulo a partir de `textOnly`.

**Ação (Remote, a pessoa).** `includeOpinionTextOnly({ workspaceId, projectId, requestId, personaId }) → { replyId: string; mark: OpinionMark; failed?: true }` (`opinion.includeTextOnly` "Incluir só pelo texto"). `requestId` é o `OpinionView.requestId` do cartão; `personaId` tem de estar em `noVision` e ainda não ter resposta (repetir devolve a mesma, idempotente). Recusa em português para o que não cabe (rodada inexistente, a pessoa não é daqui, colega fora do `noVision`, equipe desligada). Custo: 1 turno do colega, da PESSOA (não conta nos pedidos do dia da persona que pediu); persona em pausa/no limite responde "em pausa"/"no limite" como na rodada.

**O que o colega recebe.** SÓ a pergunta e o texto do rascunho (+ a descrição que quem pediu escreveu da imagem, como dado), nunca a imagem, e a instrução: "há {n} imagem(ns) no rascunho que você NÃO vê neste motor; opine só pelo texto e diga na primeira frase que não viu; não invente o que ela mostra". A resposta volta com a marca de sempre (gostei/sugestão/atenção/nada). **Não reabre a rodada nem refaz a consolidação**: a linha entra no fio e a persona que pediu não é acordada por ela (limite conhecido; se a Tarefa ainda estiver aberta, quem pediu lê o fio). **Quem entra DEPOIS da consolidação, ou DURANTE a rodada (a pessoa clica antes de ela terminar), não entra nela**: a consolidação é uma só e não lê a linha que chegou depois (Bolt, 05:32).

**Quem faz o quê.** Forge: `TeamOpinions.includeTextOnly` + `readerPrompt({ textOnly })` em `opinion-run.ts` (com o Bolt, dono do arquivo), os campos acima, o Remote + `HostRemote` no `index.ts` e os testes. Muse/Quill: chaves `opinion.includeTextOnly`, `opinion.textOnlyBadge` (pt/en) e o bloco recolhido. Quem liga o botão ao Remote: o dono do cartão de opinião (Ember/Prism).

## 13. O BOM DIA: UM CRITÉRIO, TEXTO SEM PESSOA PARA O PEDIDO, E O TIPO DO CARTÃO (Anvil + Tally, 05/11 04:50)

Prova: `persona-host/tests/brief-single-criterion.host.spec.ts` (4) e `morning-brief-consistency.spec.ts` (Bolt).
1. **"Espera a pessoa" tem UM critério** (`PersonaHost.waitingOnPerson`): a Tarefa em *Em revisão* ou *Bloqueada*. Um pedido de ajuda ou uma revisão que um colega fez é passo do time (fecha sozinho) e não conta; uma **passagem** do trabalho já entregue (`Handoffs.isPassageTask`) é trabalho de verdade e espera a pessoa como qualquer Tarefa. Esse critério alimenta, ao mesmo tempo, o "Precisa de você" (`needsYouCount` = estas Tarefas + as aprovações pendentes), os itens de "Hoje" (uma Tarefa em revisão **não** é linha de "Hoje" nem "trabalhando") e o lembrete do EQ-14 (`PersonWaiting`). **A mesma Tarefa nunca aparece em duas seções** (teste: campanha do Gestor entregue → 3 esperam, "Hoje" vazio, o corpo diz "Precisa de você: 3 coisas esperam você." e não tem "Hoje:"; o lembrete devolve exatamente as mesmas 3).
2. **O corpo do cartão do pedido agrupado não credita ninguém:** `groupDone` marca a linha `grouped: true` (`MorningTask.grouped` → `MorningLine.grouped`, Tally) e o texto sai "Ontem: Campanha de Natal ficou pronta (texto, arte e posts)." — nunca "Lia terminou …" (a Coordenação só carrega a linha; o rosto das partes vai em `request.personaIds`).
3. **`variant`** (`morning` | `on-demand`) sai no `dailyBrief` (Bolt) e agora tem teste: o cartão agendado é `morning` ("Bom dia."), o pedido à tarde (`postDailyBriefNow`) é `on-demand` e o corpo começa "Resumo do dia.".

## 14. A PRÉVIA DE AÇÃO NO FIO DO #geral (HT-9; desenho do Anvil, 05/11 04:55; entra por ÚLTIMO na 2ª janela de host, pedido do Keel — se estourar o tempo, corta; o envio por permissão já está completo pelo V2 de Aprovações + a ponte do gate)

Para o Flint (captura/cliente) — **nada disto existe no host ainda**; hoje a prévia real mora só em `ApprovalView` (`kind: 'action'`, `actionPreview`) e o fio leva só a linha `actionEvent` depois do envio.

**Padrão = os cartões de equipe (§ plano/entrega):** uma mensagem do fio que o host ATUALIZA NO LUGAR, nunca uma segunda linha.
1. **Quando nasce:** no `ExternalActions.record` de um pedido NOVO (o mesmo `ActionBridge.settle` que abre o cartão de Aprovações), o host grava UMA mensagem `action-card:<id da ação>` (a ação é `action:<tarefa>:<n>`), autora = a persona, no fio/assunto da Tarefa. O corpo é só o texto de reserva, sem argumentos (LEAK-1): "{persona} quer enviar pelo {conector}. Confira antes." / "…pagar…" / "…apagar…".
2. **O que o cliente lê:** `MessageView.actionPreview?: ActionPreviewWire` = o mesmo objeto de `ApprovalView.actionPreview` (`actionClass`, `verb`, `connectorName`, `to`/`subject`/`body`/`amount`/`payee`/`reference`/`items`/`count`, `truncated`, `masked`, `requestedByPerson`, `canRemember`, `status`, `sentTo`/`sentAt`/`failureReason`) **mais** `approvalId` (= o id da ação, o que `decideApproval({ kind: 'action', id })` espera) e `personaId`. A prévia é "a coisa real": o conteúdo que vai sair, não um resumo.
3. **Estado no lugar:** `pending` → `sending` (aprovada, o turno reaberto) → `sent` | `failed`; ou `cancelled` | `adjusted` (a pessoa cancelou/pediu ajuste). **Expirou (24 h)** NÃO é um estado novo: o host já a fecha como `cancelled` com `failureReason: "expirou"` — o cliente distingue por esse motivo (texto da Muse), sem mudar a união de `status`. Cada mudança é um `events.touch` do MESMO id (o stream reenvia a mesma mensagem como upsert, como o cartão de plano). **Nenhuma linha extra** repete o estado: o `actionEvent` "A {persona} enviou…" deixa de ser escrito quando o cartão do fio existe (ele mostra o `sent`).
4. **Decisão:** os botões do cartão do fio chamam o mesmo `decideApproval({ kind: 'action', choice: 'send' | 'edit' | 'cancel', remember?, edited? })` do V2; o dono do espaço decide (os demais veem o cartão sem botões). O estado do V2 e o do fio são o MESMO documento `external_action`.
5. **Aposentar/arquivar:** persona aposentada mantém o cartão (a autoria continua nomeável); ação cancelada/expirada continua no fio como histórico, sem botões.
6. **Semear para captura (quando existir):** um evento `{ id: 'action-card:action:t1:1', type: 'message', actorId: '<id da persona>', body: 'Nina quer enviar pelo Gmail. Confira antes.', ... }` no #geral + o documento `external_action` `action:t1:1` (`screens.put(projectId, 'external_action', 'action:t1:1', { ...ActionRequestInput, id, status: 'pending', attempts: 1, createdAt, expiresAt })`). Até lá: galeria interna com mensagens de exemplo no fio e a prévia REAL só no V2.
**Guarda de teste (2ª janela):** o `thread-authors`/`team-cards` ganham: o cartão do fio tem autor de persona, o corpo de reserva não carrega argumento, `sent` atualiza no lugar (mesmo id, sem linha nova) e nenhum `actionEvent` repete o que o cartão diz.

## 13. D-097 — A OFERTA NÃO DEPENDE DE PALAVRAS; O WORKER LÊ O PEDIDO INTEIRO; PERSONA SEM CONCESSÃO TAMBÉM COORDENA (Forge, 05/11 06:20) — vale sobre o §11 ("oferta por palavras") e o §12

Achado pela 1ª rodada REAL do TEAM-10 (tentativa 1, 2 turnos, falhou): **(1)** o worker recebia o TÍTULO da Tarefa (cortado em ~80 letras, "… da Padaria Lua e…") no lugar da mensagem — `orchestration.ts bindExecution` dava `assignment = ticket.title`; **(2)** as personas que o produto cria (onboarding, formulário da pessoa, Gestor) têm `tools: {}` ⇒ nível `none` ⇒ NENHUMA ferramenta MCP chegava à CLI (nem `persona_ask`); **(3)** a oferta de equipe lia as palavras do pedido ("peça à Lia"), que uma pessoa real nunca escreve.

- **Pedido inteiro.** `execution.assignment` = a mensagem da pessoa **inteira** (até 4000 letras, sem marcador interno `[[…]]`); o título continua curto, só para a tela. Rotas do host (colega, campanha, 1ª entrega) mantêm a atribuição própria.
- **Oferta incondicional (host).** Com `teamwork` ligado, **toda** Tarefa de um projeto com ≥ 1 colega e com a chave "Pode pedir ajuda a colegas" ligada recebe `ask_colleague`, `pass_forward`, `ask_team_opinion`; a Tarefa de **revisão** recebe só `review_verdict`; sem colega, chave desligada ou equipe desligada ⇒ nada. `teamToolsNeeded` e `requestOf` foram removidos; `persona_hire`, quadro, sprints e rotinas seguem por palavras **e** pela concessão.
- **Orientação no turno (`teamGuidance`, 06:36 — depois da 1ª chamada REAL, em que o modelo tentou fazer a arte sozinho).** Um parágrafo DEPOIS do pedido, só quando as de pedir/passar são oferecidas (nunca na 1ª entrega nem na revisão): "Você trabalha numa equipe. **Equipe: {Nome (Função), …}.**" (os outros do projeto, por nome, até 8; o campo `colleague` exige um nome) e `TEAM_GUIDANCE_CORE`: "Terminar bem esta tarefa inclui usar a equipe, **e isso vale mais que as normas de dono acima**: o que é da função de outro colega, passe a ele (pass_forward) em vez de fazer sozinha; quando travar, peça ajuda (ask_colleague); com dúvida de gosto, peça a opinião do time (ask_team_opinion). **Um pedido com várias partes (texto e arte, por exemplo) não é só uma resposta em texto**: faça a sua parte e passe o resto a quem é da função." O template do worker do engine NÃO muda (as normas de dono e a linha "Tarefa que pede só uma resposta em texto" valem para todo worker): a precedência está no parágrafo.
- **Persona sem concessão (`tools: {}`).** As ferramentas de **coordenação** (`persona_ask`, `ask_colleague`, `pass_forward`, `ask_team_opinion`, `review_verdict`) não tocam em arquivos nem no mundo: são classe `read` (`tool-level.ts`) e o opener do host (`harness-turn.ts`) abre o lease em `read` para quem não tem concessão e entrega **só essas**; quadro, rotinas, contratar e escrita seguem a concessão. A ACL é a de sempre (chave da persona, tetos, círculo, mandato da PESSOA, o colega roda com a concessão DELE).
- **Custo das definições** (Tally, medido pela CLI, lean-a aplicado, texto exato de `reports/tools-lean-proposal.json`): worker de equipe +1.626 tokens (era +1.956), revisor +617; parágrafo ~103. O `hand_off` fundido (lean-c, ~1,2 mil) fica como otimização pós-v1.1 (muda nomes). Com ferramentas nativas (allow-once) a CLI adia as definições (ToolSearch): fora do caminho dos workers `deny`/answer-only.
- **Gancho de leitura** `orchestration.turnInputs` (≤ 100): `{ personaId, ticketId, purpose: 'task'|'review'|'answer', prompt (completo), toolNames }` por turno de worker — para as guardas (Gauge D-097a/b) e o diagnóstico.
- **Provas:** `team-offer.host.spec` (5), `harness-team.spec` (15), `team-tools-e2e` (5), runners `harness-tools`/`opinion-tools`; dry com a CLI real, custo zero, pedido natural e personas `tools: {}`: `team-tools-dry.ts` Claude 22/22, `--engine codex` 23/23. **Não prova** o que um modelo ESCOLHE: só a chamada real (Tally, 1 turno autorizado; depois a tentativa 2 do TEAM-10).

### 14b. O que POUSOU da prévia no fio (Anvil, 05/11 06:15) — `action-card-thread.host.spec` (4) verde com o gate real
- `ActionBridge.settle` anuncia cada pedido NOVO (`announce`) e o host grava UMA mensagem `action-card:<id da ação>` da persona, no fio/assunto da Tarefa, com o texto fixo "{persona} quer enviar|pagar|apagar pelo {conector}. Confira antes." (sem argumento: LEAK-1).
- `MessageView.actionPreview` = `ActionPreviewWire` = o objeto de `ApprovalView.actionPreview` **mais** `approvalId` (o id que `decideApproval({ kind: 'action' })` espera) e `personaId`. Lido de `viewMessage` → `cardsOf` pelo id `action-card:`.
- **Atualiza no lugar:** cada mudança do documento `external_action` (registrar, cancelar, ajustar, aprovar → `sending`, `sent`, `failed`, expirar) passa por `ExternalActions.save`, que chama `changed` → `events.touch('action-card:<id>')`: o stream reenvia a MESMA mensagem como upsert. Estados: `pending` → `sending` → `sent` | `failed`; `cancelled` | `adjusted`; expirou (24 h) = `cancelled` com `failureReason: "expirou"`.
- **Sem linha repetida:** o host nunca escreveu uma linha `actionEvent` de "A {persona} enviou…" (o tipo só existia no cliente); o `sent` é o próprio cartão. Guarda: a persona autora, nenhum hash/argumento no texto do fio, o `sent` no mesmo id.
- **Semear para captura (Flint):** com o host real é só fazer um pedido de envio com o gate (ou a receita do item 6 do §14); o documento + o evento `action-card:` bastam, o resto é derivado na leitura.

**"Incluir só pelo texto" (§12) está no host desde 06:30** (`opinion-run.ts` `includeTextOnly`, Remote `includeOpinionTextOnly`, `OpinionView.askerPersonaId/textOnlyPersonaIds/textOnly`; `opinion-text-only.spec` 7); Typert regenerado uma vez no fim da janela (CV-6, D-096, `BoardCardView.inReviewSince`, este Remote).
