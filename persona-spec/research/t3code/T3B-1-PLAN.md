# T3B-1 — Parar de verdade: plano de execução (Zinc, 11/11)

Decisão que manda: **D-102** (turno vivo de verdade). Donos: **Bolt** na cirurgia do `oar/session.ts` (streaming, `whenIdle`, `steer`); **Zinc** nos T3B-1..4 do host, sob revisão do Bolt. Este plano cobre o T3B-1 e a fronteira com a cirurgia do Bolt.

## O que “Parar de verdade” precisa entregar

1. O turno aberto termina **na hora**: o runner cancela, o CLI não fica órfão e a árvore de processos morre.
2. O que a persona já escreveu **não some**: a bolha `coord-<id>-reply` mantém o texto parcial e ganha `stopped: true`; nenhum “Pronto”/run-error é postado depois.
3. O `Assignment` do turno **não fica `running`**: o Ticket pode ficar aberto para Tentar de novo, mas o slot do worker está encerrado.
4. Reiniciar o host **não reexecuta** o turno parado.
5. A fila tracejada continua guardada; só sai com “Enviar agora” ou mensagem nova.

## Estado em 11/11 (host-side já verde)

- `persona-engine/src/core/tickets.ts`: `endRunningAssignment(ticketId, reason)` (público; encerra o Assignment em execução, mantém o Ticket).
- `persona-engine/src/core/engine.ts`: `endAssignment(ticketId, reason)`.
- `persona-host/src/orchestration.ts`: o run loop encerra o Assignment em `failed` e no turno sem report; o `catch` do `driveTicket` encerra em erro de turno; `blocked` **não** encerra (a resposta da pessoa retoma o mesmo Assignment).
- `persona-runners/src/oar/adapter.ts`: `cancel` descarta a sessão quente (`dropWarm`/`dispose`) e esquece o run; o próximo turno abre sessão nova.
- Testes: `persona-host/tests/stop-hard.spec.ts` (4/4: Assignment encerrado, reply em streaming mantém texto+`stopped`, reinício não reexecuta, CLI morto sem report encerra o Assignment) e `persona-runners/tests/oar-runners.spec.ts` (+1: dispose no cancel). Rodada dirigida: 33/33.

## O que falta (Bolt, `oar/session.ts` — D-102)

- **`whenIdle` real**: hoje retorna sem aguardar; deve ser uma Promise resolvida pelo evento `idle`/`ended` do turno (e rejeitada em erro/login).
- **`steer` honesto**: com turno aberto, injetar no turno (`session.steer`) ou cancelar limpo e retomar a **mesma** `sessionId` com o novo direcionamento; nunca `turn.start()` sobre a sessão quente nem fechar o toolset do turno em voo (`adapter.ts:662-667`).
- **Streaming real das Tarefas**: o `deliver` consome `turn.stream(handle)` e repassa `delta`/`partial` ao `ReplyStream` do host (orçamento de payload do T3B-4), em vez de engolir o stream até `ended`.
- **Árvore de processos**: `session.abort()` e, se o processo não morrer em 1,5 s, `taskkill /T /F` no Windows (`kill(-pid)` no POSIX) — o `dispose` do adapter sozinho mata o CLI, não os filhos.

## Fronteira com o T3B-4 (orçamento de stream)

O `ReplyStream` já coalesce escritas por `throttleMs`; o T3B-4 define o teto por bytes do frame e o snapshot+delta na reconexão. O streaming real do Bolt precisa chamar o mesmo sink (`emitRunnerPartial`) e respeitar o teto; o host não muda de contrato.

## Testes a manter/expandir

- `stop-hard.spec.ts` (host): os 4 casos atuais + um caso de `steer` durante o turno que não perde o texto e não duplica a entrega.
- `oar-runners.spec.ts`: dispose no cancel (feito) + `whenIdle` que só resolve no `idle` + `steer` que não abre um segundo `turn.start`.
- Processo real: um CLI scriptado que ignora o abort e dorme; `stopTurn` deve matar a árvore em ≤1,5 s (teste marcado, sem IA real).
- Reinício: o `stop-hard` cobre o host; o teste do Bolt cobre a sessão.

## Riscos

- Matar a sessão quente perde o aquecimento do CLI; o próximo turno paga o spawn. É o preço de “Parar”; medir o custo no instalado.
- `blocked` com pergunta **não** encerra o Assignment (a resposta o retoma); só `failed`/sem-report encerram.
- `taskkill /T /F` no Windows pode falhar se o processo já saiu; tratar como sucesso idempotente.
- O `keepInbox` do runner preserva o texto enfileirado no host; a sessão descartada não perde a fila da pessoa.
