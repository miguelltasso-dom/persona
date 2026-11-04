# Fechamento v1 — domínio (Forge, 04/11)

Gate **verde**. Probe / `@Remote measureV1Close` chamam `measureV1CloseView(entries)`; não remontam flags.

| frente | score | failed | blocked |
|---|---|---|---|
| PRO-6 | 6/6 | — | — |
| GES-6 | 3/3 | — | — |
| GES-2 | 4/4 | — | — |
| GES-3 | 3/3 | — | — |
| V1-P0-1 | 4/4 | — | — |
| OPT-8 | 1/4 | — | cache-60, pair-parity, cut-40 |

OPT-8 (D-068): `pair-parity` fica `blocked` até a rodada pareada real e `cut-40` fica `blocked` enquanto o conjunto completo de alavancas não estiver ligado (hoje falta a W3, relato curto do worker, desligada até a rodada real); só fica verde com ≥ 40% de custo estimado no pipeline fiel. Não falha o gate, mas também não conta como passou.

```
pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
```
