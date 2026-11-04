# Contrato — atividade agrupada (T3 §9)

Dono do fold: **Forge** (`persona-core` `groupTurnActivity`, `persona-engine` `activityFromReport` / `foldTurnActivity`).
Persistência + RPC: **Anvil** (`listTurnActivity`).
UI: **Muse** `ActivityGroup` + **Prism** no fio.

## Evento

`TurnActivityEvent`: persona, assunto (`threadId`), `kind` (`command | file | hire | message | read | check`), `title`, `status` (`done | failed | running | waiting`), `at`.

Literais iguais aos do primitivo Muse. **Falha não conta como feito.** `waiting` / `running` = grupo inacabado (não é "terminou").

## Fold

`groupTurnActivity` → um grupo por persona+assunto: mutações primeiro, no máximo 2 kinds no resumo + `moreCount`, `failedCount` à parte, `unfinished`.

Rajada do Router (OPT-6): `batchRouterBurst` — um lote por assunto para a próxima Eval.

## RPC

`listTurnActivity({ subjectId, personaId? })` → `ActivityGroupFold[]`. Sem eventos ≠ 0% de sucesso.

Wire (Anvil, após a janela): `ListTurnActivityRequest { workspaceId, subjectId, personaId? }` → `ActivityGroupFold[]`. Persistência: eventos do turno no store do projeto; fold é `groupTurnActivity` no host, sem kinds novos.
