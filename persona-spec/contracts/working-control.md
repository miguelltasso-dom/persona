# Contrato — Direcionar agora, fila e Parar (IV-5, host)

Dono: **Bolt** (`working-control.ts`, `message-flags.ts`; patches aditivos em `orchestration.ts`, `working-send-host.ts`, `index.ts`, `types.ts`). UI: **Flint**. Substitui a parte “sem chamador” de `working-send.md`.

## Remotes

| Remote | Efeito | Erros tipados |
|---|---|---|
| `enqueueWorkingMessage({…escopo, personaId, subjectId, text, streamKind?, ownerId?})` → `QueuedMessageView` | Balão tracejado **persistido** (sobrevive a recarregar). Guarda quem enfileirou e para qual conversa (padrão canal `geral`). | `invalid-payload` (texto em branco) |
| `listWorkingQueue({…escopo, personaId, subjectId})` → `QueuedMessageView[]` | Replay ao reabrir; cada linha traz `streamKind` e `ownerId`. | — |
| `editQueuedMessage({…, id, text})` | Troca o texto do balão. | — |
| `dropQueuedMessage({…, id})` → fila restante | “Tirar”. | `not-found` (já saiu da fila) |
| `restoreQueuedMessage({…, item})` → fila | “Desfazer” do Tirar: volta com o **mesmo id** e na posição original (ordem por `createdAt`); idempotente. | — |
| `flushWorkingQueue({…, queueItemId?})` → linhas enviadas | **Envia de verdade**, em ordem, como mensagens da pessoa (a persona responde como a um pedido normal). Com `queueItemId` manda só aquele balão (“Mandar agora”). Um balão só sai da fila depois de enviado. | `not-found` (item já enviado/retirado) |
| `steerWorkingTurn({…, personaId, subjectId, text, streamKind?, ownerId?})` → `{ mode: 'steer'\|'sent', messageId, ticketId? }` | “Direcionar agora”: grava o texto como mensagem da pessoa e, **se a persona tem turno aberto, injeta nele agora** (`Runner.deliver(…,'steer')`). Sem turno aberto vira envio normal (`mode: 'sent'`, **não é erro**). A mensagem ganha `steeredPersonaId` (o chip “Direcionou {persona}” sobrevive ao recarregar). | `invalid-payload` (texto em branco) |
| `stopTurn({…, personaId, subjectId?, ticketId?, eventId?})` → `{ stopped: 'ticket'\|'reply'\|'none', ticketId, line }` | **Parar**: cancela o turno aberto (`Runner.cancel`, fila mantida), encerra a Tarefa como parada pela pessoa (`ended.by='human'`, `outcome='stopped'`; o loop de execução não a reporta depois) e posta a linha “Parado. “…” ficou parada; a fila ficou guardada. É só pedir de novo.”. Com `eventId` cancela também uma resposta em andamento (sem Tarefa). `none` = nada rodando (**não é erro**). | — |

Guardas: `requireWrite` (guest/persona recusados); `listWorkingQueue` com `requireProject`.

## `MessageView` (novos campos, opcionais)
`steeredPersonaId` (mensagem direcionada) · `stopped: true` + `stoppedTicketId` (a linha que o Parar deixou: base de “Você parou aqui · Continuar”).

## Regras
- **Fila automática:** quando a persona fica ociosa o agendador envia a fila dela (linha de atividade “Enviei N mensagem(ns) que estavam na fila”).
- **Depois de Parar** a fila **não** sai sozinha: só com `flushWorkingQueue` (“Enviar agora”) ou depois de uma mensagem nova (`steerWorkingTurn`). Bolhas enfileiradas antes do Parar mantêm a ordem.
- **Continuar** (hoje) = mensagem nova da pessoa (`postMessage`), porque a Tarefa parada terminou e a sessão não é reaproveitada. Um “retomar com a mesma sessão” depende de consertar Tentar de novo / responder pergunta (ver `reports/bolt.md`, IV-11).
- **Fora de escopo, dito com franqueza:** *streaming* (texto aparecendo enquanto a persona escreve). O host posta só o 1º token (`partial`) e a resposta final; não há deltas do runner no fio. Precisa de callback de delta nos adaptadores (Rivet/Forge) e de upsert de mensagem com `streaming:true`.

## Prova
`tests/working-control.spec.ts` (13): fila após recarregar (banco em arquivo), Mandar agora/Enviar tudo/`not-found`, Tirar+Desfazer, steer sem/com turno aberto, Parar (Tarefa encerrada, fila mantida, linha marcada, `none`), Parar de resposta, agendador envia a fila / respeita Parar, ACL guest/persona, e **o loop de execução de verdade** com um runner que mantém o turno aberto (steer chega, Parar cancela, o loop deixa a Tarefa em paz). Processo real: `scripts/proactivity-live.ts` fase 6.
