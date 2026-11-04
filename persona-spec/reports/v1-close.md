# Fechamento v1 — domínio (Forge, 04/11)

Gate **verde**. Probe / `@Remote measureV1Close` chamam `measureV1Close`; não remontam flags.

| frente | score | failed | blocked |
|---|---|---|---|
| PRO-6 | 6/6 | — | — |
| GES-6 | 3/3 | — | — |
| OPT-8 | 3/4 | — | cut-40 |

OPT-8 `cut-40` fica `blocked` até o livro live (Anvil passa `liveEntries`). Não falha o gate.

```
pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
```
