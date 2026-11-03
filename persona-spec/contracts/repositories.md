# Contrato `Repositories`

Dono do port: Forge (`persona-engine`). Implementação SQLite: Anvil (`persona-store`). Suíte compartilhada: `packages/persona/persona-engine/tests/contract`.

## Semântica

Uma instância de `Repositories` é o estado durável do **engine Super-agent para um projeto**. D-038: o tenant é o projeto (`projectId`), não o workspace. O Engine não recebe `projectId` em cada método: a instância já está ligada ao projeto.

Métodos são **síncronos**. `atomic(work)` envolve uma unidade de trabalho:

- commit persiste todas as escritas do callback;
- throw faz rollback (nada do callback vaza para `get`/`list`);
- `atomic` aninhado é um savepoint: o rollback interno não commita o externo; o rollback externo descarta o interno.

`afterCommit(action)`:

- fora de transação: corre **na hora**;
- dentro de `atomic`: corre só depois do commit da transação **mais externa**;
- se o `atomic` der rollback, os hooks enfileirados **não correm**;
- erro num hook após commit **não desfaz** o commit (a implementação reporta; memória usa o `report` do construtor).

`afterCommit` é para follow-up em memória (acordar executor, flush de fila). Efeito durável que precisa sobreviver a crash é Outbox/Effects (P3a/P4a), não este hook.

## Superfícies

| Coleção | Identidade | Notas |
|---|---|---|
| `triggers` | `Trigger.id` | `save` é upsert. `disposition` é estado separado do Trigger imutável. |
| `threads` | `Thread.key` | `list()` todos; `active()` = `pending.length > 0` ou `evaluating` definido. |
| `tickets` | `Ticket.id` | `list()` **mais novo primeiro** (última `save` no topo na memória). `open()` = sem `ended`. `active()` = `undelivered.length > 0` ou último assignment `pending`/`running`. |
| `decisions` | `Decision.id` | `byThread(key)` filtra por `threadKey`. |

`get` devolve **clone**. Mutar o objeto devolvido não altera o store. `save` clona na entrada.

## Fábrica e suíte

```ts
import { defineRepositoryContract } from '@deepseek-ai/dsh-persona-engine/tests/contract/repositories.contract.ts'

defineRepositoryContract(projectId => openSqliteRepositories(projectId, db))
```

Aceite memória: `pnpm exec vitest run packages/persona/persona-engine` — `core-engine.spec` 113 + `stage.spec` + contrato ≥20, todos verdes.

Aceite SQLite (Anvil): a mesma `defineRepositoryContract` contra o store, mais isolamento por `project_id` na mesma base.

## O que este port não é

Produto (workspace, member, persona, canal, Cofre) é outro repositório, dono Anvil. O engine não lê o Cofre daqui: o host monta `compileContext` e chama o Engine.
