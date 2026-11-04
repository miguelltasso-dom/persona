# Contrato — o texto aparece enquanto a persona escreve (streaming, P0)

Dono: **Bolt** (host). Consumidor: **Flint** (balão que cresce, “Você parou aqui · Continuar”). Os deltas já vinham dos adaptadores OAR (`RunEvent` `delta` + `partial` cumulativo, `persona-runners/src/oar/adapter.ts`); o host só usava o 1º token. Nenhuma mudança foi necessária em `persona-runners`.

## O que o cliente vê

- **A resposta em andamento é UMA mensagem**: id `coord-<idDaMensagemDaPessoa>-reply`, `type: 'partial'`, `MessageView.streaming: true`, `editedAt: ''` (não é “editada”). O `body` é o texto **cumulativo** até agora (no máximo 100 palavras, igual à resposta final).
- `followMessages` reenvia **a mesma mensagem como `upsert`** a cada crescimento (no máx. 1 escrita a cada ~120 ms; a última sempre vai). Use `message.id` como `key` e **não reanime a entrada** a cada upsert.
- Ao terminar, **o mesmo id** vira a resposta final: `streaming` some, `type` vira `runner` (ou `message`), `body` = texto final. O final pode diferir do parcial (voz/corte de 100 palavras): **substitua** o texto; o host não marca a diferença. Um markdown parcial (bloco de código sem fence de fechamento) é normal durante o streaming.
- Reentrega do final é **idempotente** (a mensagem já assentada não reabre; um pedaço tardio é ignorado). Não existe mais a mensagem `coord-<id>-token` (1º token) — era duplicata.
- Falha antes de qualquer texto: nenhum balão parcial; o erro de sempre (`runError`).

## Parar a resposta

`stopTurn({ …escopo, personaId, eventId })` com o `id` da mensagem da pessoa → `{ stopped: 'reply', ticketId: '', line: '' }`:
cancela o turno de conversa (`runner.cancel`) e a resposta **assenta com o que já foi escrito**, `type: 'runner'`, `MessageView.stopped: true` no próprio balão (base do “Você parou aqui · Continuar”; sem linha extra). Se nada foi escrito ainda, a resposta é “Resposta cancelada.”. **Continuar** = nova mensagem da pessoa (`postMessage`). O estado do botão Parar durante a resposta é a presença de uma mensagem com `streaming: true` (`eventId` = `replyToId`/id da mensagem da pessoa à qual ela responde: `coord-<eventId>-reply`).

## Fora (honesto)
- Streaming do texto das **Tarefas** (a linha “Pronto: …” é um resumo curto; o progresso é a linha “Em andamento”).
- Times remotos: a mensagem em andamento **não** é sincronizada; sai uma vez, quando assenta.

## Prova
`tests/streaming.spec.ts` (8): ReplyStream (throttle, escrita final, parada), `tapTurn` e **`resolveHostRunner` → sessão OAR → tap → sink** com um turno roteirizado (sem modelo), a mensagem que cresce com `followMessages` (upserts do mesmo id), final idempotente, Parar no meio (texto mantido, `stopped`), Parar antes da 1ª palavra; store `events.spec` (`updatePartial`/`settlePartial`/`subscribeChanges`). Processo real: `scripts/proactivity-live.ts` fase 7 (5 upserts de UMA mensagem com corpos crescentes; Parar mantém “Vou explicar em três passos: primeiro”).
