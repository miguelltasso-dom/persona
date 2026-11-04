# OPT-8 — aceite (D-068, Tally 04/11)

Score **3/4**. Falhou: —. Bloqueado: pair-parity.

Origem: **calibrated** (4 caracteres ≈ 1 token, preço de tabela; calibrada com a base medida de 40977 tokens por requisição — 1 máquina, Haiku, 1 rodada real; o contador é o total da sessão da CLI (a base é a de UMA requisição, não conta as requisições internas do agente); preço de lista; os dois braços (antes e depois) levam a MESMA base). Baseline: **levers-before-wiring** (o host antes de W1 e W4, no MESMO pipeline; W2 e W5 foram retiradas e a W3 fica adiada por decisão, D-080). A fixture histórica de 134 tokens/tarefa (`historical-134-fixture`) **não conta** para a meta.

| meta | resultado |
|---|---|
| idle-zero (ociosa sem objetivo) | passou |
| cache ≥ 60% no prefixo | passou: cache real do provedor `measured` / `measured` (claude, 0.97 nas chamadas quentes, reportado pelo fornecedor); estimativa scriptada claude 1.00 · codex 1.00 · opencode n/d · cursor n/d |
| paridade ±10% com a CLI | blocked: `paired-run-inconclusive` (a rodada real de 04/11 não decide: n = 1 e o agente da CLI fez de ≈ 2 a ≈ 8 requisições internas entre chamadas parecidas) |
| −40% custo estimado por tarefa, pior dos dois dias, as wired vs baseline, tokens sem subir | passed (`goal-met`): custo -48%, tokens -45% |

Totais das mesmas cenas: antes das ligações 1245091 tokens / 2026888 µUSD · agora 664176 / 1046346 (custo -48%) · **projeção** com todas as alavancas 663939 / 1039893 (tokens -47%, custo -49%). A projeção nunca passa a meta.

### A régua, lado a lado (D-080)

O gate lê a coluna da direita. A da esquerda é o que o bench dizia até a rodada real; ela fica aqui para ninguém achar que a régua foi trocada: o que mudou foi um dado novo (a base do vendor por chamada), que antes estava fora por falta de medida.

| dia | corte de custo só com os prompts | corte de custo com a base medida |
|---|---:|---:|
| rajada | -36% | -48% |
| espaçado | -48% | -48% |

Os dois braços (antes e depois) levam a **mesma** base; a ressalva da calibração está na linha de origem acima.

Gate: `measureOpt8Acceptance` (D-068, D-080). Detalhe por cenário e dia espalhado: `opt8-faithful.md`. Rodada pareada real: `pair-real.md` (feita em 04/11).

```
pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts
```
