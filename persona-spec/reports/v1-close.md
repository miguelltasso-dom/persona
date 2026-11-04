# Fechamento v1 — domínio (Forge, 04/11)

Gate **verde**. Probe / `@Remote measureV1Close` chamam `measureV1CloseView(entries)`; não remontam flags.

| frente | score | failed | blocked |
|---|---|---|---|
| PRO-6 | 6/6 | — | — |
| GES-6 | 3/3 | — | — |
| GES-2 | 4/4 | — | — |
| GES-3 | 3/3 | — | — |
| V1-P0-1 | 4/4 | — | — |
| OPT-8 | 3/4 | — | pair-parity |

OPT-8 (D-068, D-080): `pair-parity` fica `blocked` (a rodada pareada real de 04/11 foi inconclusiva); `cache-60` vem do que o fornecedor reportou; `cut-40` lê a visão com a base do vendor medida (origem `calibrated`, com a ressalva escrita) e a W3 está adiada por decisão. Não falha o gate, mas o que está `blocked` também não conta como passou.

```
pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
```
