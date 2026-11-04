# Remotes de Rotinas (IV-9) e entrega pendente (FLOW-1)

Dono: Forge (contrato e engine) · host em `persona-host/src/routine-remotes.ts` + `@Remote` em `index.ts` · UI: Ember (`RemoteRoutinesPanel`).

## Rotinas: criar, editar, apagar sem cron para a pessoa

Uma Rotina são duas linhas: a `routine` do store (quando) e o documento `routine_spec` (o quê e quem), que o agendador lê quando a Rotina vence (`proactivity-scheduler.ts`, `ROUTINE_SPEC_KIND`). Sem `prompt` o agendador usa “Faça a rotina “nome” agora e relate com evidência.”; sem dono, a Coordenação decide.

| Remote | Entrada | Saída | Regras |
| --- | --- | --- | --- |
| `createRoutine` | `{workspaceId, projectId, id, name, rrule, timeZone, catchUp, silenceStart, silenceEnd, prompt?, ownerPersonaId?}` | `RoutineView` | escrita no projeto; nada é gravado se algo é inválido; id repetido = `conflict`; aceita o id de uma rotina apagada (Desfazer) |
| `updateRoutine` | `{workspaceId, projectId, id, name?, prompt?, ownerPersonaId?, rrule?, timeZone?, catchUp?, silenceStart?, silenceEnd?}` | `RoutineView` | ausente = não muda; `ownerPersonaId:''` devolve à Coordenação; `silenceStart/End:''` limpa a janela (os dois juntos); novo `rrule`/`timeZone` cancela as ocorrências já enfileiradas; tudo é validado antes de gravar |
| `deleteRoutine` | `{workspaceId, projectId, id}` | `true` | apaga a rotina, as execuções, o `routine_spec` e a cobrança/delegação de governança; rotinas `initiative:<persona>` (da própria equipe) não se apagam, só se pausam |
| `pauseRoutine` | `{workspaceId, projectId, id, paused}` | `RoutineView` | agora exige escrita e que a rotina seja do projeto |
| `listRoutines` / `listRoutineSchedule` | `{workspaceId, projectId}` | `RoutineView[]` / `RoutineScheduleView[]` | trazem `prompt`, `ownerPersonaId?`, `humanSchedule` (“De segunda a sexta, às 9h”), `nextRunAt` (ISO; `''` se pausada) e `system?: true` nas rotinas da equipe |

Erros: `RemoteFault('invalid-payload')` com uma frase em pt-BR (nome vazio ou > 120, pedido vazio ou > 2000, horário fora do subconjunto de `parseRrule`, fuso inexistente, silêncio incompleto ou fora de `HH:MM`, catch-up inválido, dono que não é do projeto); `not-found` para rotina de outro projeto ou inexistente; `conflict` para id repetido.

Formatos de `rrule` que a UI monta (`buildRrule`): `FREQ=DAILY;BYHOUR=9;BYMINUTE=0` · `FREQ=DAILY;BYDAY=MO,TU,WE,TH,FR;…` · `FREQ=WEEKLY;BYDAY=MO,WE;…` · `FREQ=MONTHLY;BYMONTHDAY=1;…` · `FREQ=HOURLY;INTERVAL=n`. Qualquer outro é lido (parseRrule) e exibido como “Horário personalizado”, somente leitura.

Desfazer da UI: guardar o `RoutineScheduleView` antes de apagar e recriar com `createRoutine` usando o MESMO id e todos os campos (`timeZone`, `catchUp`, `silenceStart/End`, `prompt`, `ownerPersonaId`).

Prova: `persona-host/tests/routine-remotes.spec.ts` (9) — inclui a rotina criada pelo Remote vencendo no agendador real e virando um Ticket para a dona uma única vez.

## Entrega pendente (FLOW-1 / FLOW-1b)

Arrastar para Concluído apagava `delivery`/`attention` e encerrava a Tarefa, e o rascunho do Revisar virava órfão. Agora:

- `hasPendingDelivery(ticket)` (engine, `workflow.ts`): Ticket aberto cujo último assignment reportou `ready`, **ou** cuja Aplicar falhou por conflito (report `blocked` + pergunta que começa com `REVIEW_CONFLICT_QUESTION`, “Não deu para integrar a Tarefa.”). `Ticket.delivery` NÃO entra: ele só registra falha de entrega de um Input ao worker.
- `moveToColumn` / `applyCategoryToTicket` recusam a categoria `done` com `WorkflowError('delivery_pending')` (`columnId`, `ticketId`), sem escrever nada; as demais categorias não tocam em `delivery`.
- `MoveOptions.deliveryPending` (opcional): o host passa `false` quando sabe que não há rascunho (projeto sem pasta); `true` força a recusa.
- Host (Anvil): `BoardRemoteError('delivery_pending')` + `BoardCardView.deliveryPending`.

Decisão do Keel (04/11 18:05): Descartar encerra o Ticket (`engine.stopTicket(id, 'discarded')`, no `discardReview` do host). Detalhes e a distinção entre `Ticket.delivery` e o rascunho do Revisar em `delivery-pending.md`.
