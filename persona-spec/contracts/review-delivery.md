# ReviewDelivery

Porto em `persona-engine` (`src/review`). Implementação git: `GitReviewDelivery` (binário `git` do PATH, argv, sem shell). Anvil expõe Remote; Lumen pinta o painel **Revisar**.

## Métodos

| Método | Efeito |
|---|---|
| `prepare(assignment)` | Cria worktree + branch `persona/<ticketId>` a partir da base do projeto. `confinePath`. Idempotente se o worktree já existe. |
| `summary(ticket)` | Arquivos, +/−, patch (teto de bytes, `patchTruncated`), testes citados no relato, segredos redigidos (`looksLikeCredential` → `[redacted]`). |
| `accept(ticket, mode)` | `ff` = `merge --ff-only`; `squash` = `merge --squash` + commit. Conflito: `merge --abort`, Tarefa **Bloqueado · Precisa de você**, nunca meio-merge. |
| `requestChanges(ticket, feedback)` | Nota de entrada + nova Assignment. Mandate imutável; pedido maior = Tarefa nova. |
| `discard(ticket)` | Remove worktree e a branch. Sem push. |
| `sweepOrphans()` | Na retomada: apaga worktrees `persona/*` cujo Ticket não está aberto. |

## Invariantes

- Nenhuma escrita fora do worktree (`confineWorktreeWrite` / `confinePath`).
- Sem `push` e sem remoto, salvo ação explícita do anfitrião (este porto não faz push).
- Segredo não aparece no patch do painel.
- Windows: `core.longpaths`, sem junction de escape, CRLF fica com o git do repo.

## Painel Revisar (Lumen)

Lista de arquivos, patch legível (já redigido e possivelmente truncado), ações **Aceitar** / **Pedir ajustes** / **Descartar**. Aceitar manda o `mode` da política do projeto (`ff` ou `squash`).
