# OPT-8 — aceite (D-068, Tally 04/11)

Score **1/4**. Falhou: —. Bloqueado: cache-60, pair-parity, cut-40.

Origem: **estimate** (offline, 4 caracteres ≈ 1 token, preço de tabela). Baseline: **levers-before-wiring** (o host antes de W1 e W4, no MESMO pipeline; W2 e W5 foram retiradas e a W3 fica desligada até a rodada real). A fixture histórica de 134 tokens/tarefa (`historical-134-fixture`) **não conta** para a meta.

| meta | resultado |
|---|---|
| idle-zero (ociosa sem objetivo) | passou |
| cache ≥ 60% no prefixo | blocked: cache real do provedor `blocked` / `unavailable`; estimativa scriptada claude 1.00 · codex 1.00 · opencode n/d · cursor n/d (só evidência, não passa a meta) |
| paridade ±10% com a CLI | blocked: `requires-paired-real-run` (a fórmula antiga saiu do aceite) |
| −40% custo estimado por tarefa, pior dos dois dias, as wired vs baseline, tokens sem subir | blocked (`wiring-incomplete`): custo -36%, tokens -39% |

Totais das mesmas cenas: antes das ligações 15781 tokens / 45855 µUSD · agora 8544 / 25813 (custo -44%) · **projeção** com todas as alavancas 8307 / 19360 (tokens -47%, custo -58%). A projeção nunca passa a meta.

Gate: `measureOpt8Acceptance` (D-068). Detalhe por cenário e dia espalhado: `opt8-faithful.md`. Rodada pareada real: `scripts/pair-real.ts` (trava `real`).

```
pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
```
