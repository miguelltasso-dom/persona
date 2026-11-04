# Entrega pendente (FLOW-1 / FLOW-1b) — o que é, o que NÃO é

Dono: Forge (engine, `persona-engine/src/workflow.ts`) · host: Anvil (`boards.ts`, `discardReview`) · UI: Lumen (Quadros, Revisar).

## Duas coisas com o mesmo nome — não confundir

| | `Ticket.delivery` (engine) | Rascunho do Revisar (“entrega pendente”) |
| --- | --- | --- |
| O que é | a **última tentativa falha de entregar um Input ao worker** (`{error, at}`); some quando uma entrega dá certo | o resultado que o worker reportou e que espera **Aplicar ou Descartar** (worktree/rascunho privado) |
| Estágio do engine | `person/delivery` (“Tentar de novo”) | `person/review` (report `ready`) ou `blocked` por conflito no Aplicar |
| Quem lê | `canRetry`, `retryTicket` | `hasPendingDelivery(ticket)` |
| Vira `BoardCardView.deliveryPending`? | **Não** | **Sim** |

`BoardCardView.deliveryPending` e o erro `delivery_pending` falam SEMPRE do rascunho do Revisar. A UI não deve inferir isso de `Ticket.delivery`, nem da coluna.

## Regra (engine)

`hasPendingDelivery(ticket)`: o Ticket está aberto e **ou** o último assignment reportou `ready`, **ou** o Aplicar falhou por conflito (report `blocked` + pergunta que começa com `REVIEW_CONFLICT_QUESTION`, “Não deu para integrar a Tarefa.”). Encerrado, ou com um assignment mais novo trabalhando, não é pendente.

`moveToColumn`/`applyCategoryToTicket` com destino da categoria `done` e entrega pendente lançam `WorkflowError('delivery_pending')` (`columnId`, `ticketId`) **sem escrever nada** (Ticket, attention e posição intactos). Outras categorias não tocam em nada que já existia. `MoveOptions.deliveryPending` deixa o host afirmar o contrário (`false` = projeto sem pasta, não há rascunho; `true` = força a recusa).

## Saídas da entrega pendente

- **Aplicar** (`acceptReview`): `completeReview` encerra o Ticket.
- **Descartar** (`discardReview`, decisão do Keel 04/11 18:05): apaga o rascunho **e encerra o Ticket** com `engine.stopTicket(ticketId, 'discarded')` (`ended = {by:'human', outcome:'stopped', reason:'discarded'}`). `stopTicket` é idempotente e só toca naquele Ticket. Depois disso o cartão está em estágio terminal, sem entrega pendente, e não reaparece no Revisar.
- **Pedir ajustes** (`requestChanges`): nova rodada; o último assignment deixa de ser `ready`, então deixa de ser pendente até um novo `ready`.

## Prova

`persona-engine/tests/workflow.spec.ts` (FLOW-1/1b, 6 casos) · `persona-engine/tests/review-delivery.spec.ts` (“Descartar encerra só aquele Ticket”, com git de verdade e dois rascunhos) · `persona-host/tests/review.spec.ts` (FLOW-1 e FLOW-1b pelo Remote `moveTicket`).
