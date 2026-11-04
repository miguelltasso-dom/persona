# Contrato — atividade agrupada (T3 §9)

Dono do fold: **Forge** (`persona-core` `groupTurnActivity`, `persona-engine` `activityFromReport` / `recordTurnActivity` / `foldTurnActivity`).
Persistência + RPC: **Anvil** (`listTurnActivity`).
UI: **Muse** `ActivityGroup` + **Prism** no fio.

## Evento

`TurnActivityEvent`: persona, assunto (`threadId`), `kind` (`command | file | hire | message | read | check`), `title`, `status` (`done | failed | running | waiting`), `at`.

Literais iguais aos do primitivo Muse. **Falha não conta como feito.** `waiting` / `running` = grupo inacabado (não é "terminou").

## Fold

`groupTurnActivity` → um grupo por persona+assunto: mutações primeiro, no máximo 2 kinds no resumo + `moreCount`, `failedCount` à parte, `unfinished`.

Rajada do Router (OPT-6): `batchRouterBurst` — um lote por assunto para a próxima Eval.

## RPC

`listTurnActivity({ subjectId, personaId? })` → `ActivityGroupFold[]` ou `foldTurnActivityBook` (`folds` + `successRate`). Sem eventos ≠ 0% de sucesso: `activitySuccessRate([])` / só `waiting|running` = `null`.

Loop: `Engine.report` emite `assignment.reported` (`personaId` = mandate actor, `threadId` = canal ou origin). Host:

```
emit: withTurnActivityEmit(row => this.recordTurnActivity({ workspaceId, projectId, ...row }))
```

`ProjectRuntime` hoje cria o Engine **sem** `emit` — Anvil acrescenta essa linha. Sem ela o fold fica vazio.

Wire (Anvil): `listTurnActivity({ workspaceId, projectId, subjectId, personaId? })` → `ActivityGroupView[]`. `recordTurnActivity` grava o evento. Fold = `foldTurnActivity` (Forge). Sem eventos = `[]`, não 0%.
