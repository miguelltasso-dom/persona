# OPT-8 — aceite (Forge, 04/11)

Score **3/4**. Falhou: —. Bloqueado: cut-40.

| meta | resultado |
|---|---|
| idle-zero (ociosa sem objetivo) | passou |
| cache ≥ 60% | passou (0.63) |
| paridade CLI ±10% | passou |
| −40% tokens/tarefa vs linha de base (134.0) | blocked (sem livro live) |

Livro live: **ausente** — `cut-40` em `blocked`. Anvil passa `liveEntries` (+ ticket ids, ou `ticketIdsFromLedger`).

Gate: `measureOpt8Acceptance`. Host `@Remote measureOpt8` deve passar o livro persistido, não só contar linhas.

```
pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
```
