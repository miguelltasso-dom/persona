# Linha de base de tokens — 04/11/2026 (OPT-1)

Medição scriptada em `persona-engine` (`runTokenScenario` + `runPairedSuite`). Estimador: 4 caracteres ≈ 1 token. Referência de aceite (TOKEN-OPTIMIZATION §3, revisada): **uso direto da CLI** nas mesmas tarefas, paridade ±10% (ou um pouco mais só com qualidade claramente melhor).

Gate: `assertScenarioRegression` falha se tokens do cenário subirem > 10% sem ganho de qualidade ≥ 0,15. Idle e iniciativa sem objetivo devem permanecer em 0 chamadas.

## Cenários de referência (Persona)

| Cenário | Tokens (in+out) | Chamadas | Notas |
|---|---:|---:|---|
| pedido simples no #geral | 99 | 2 | triagem + resposta; 2º turno lê cache do prefixo |
| tarefa multi-etapa com revisão | 148 | 3 | triagem + execução + avaliação |
| dia ocioso com rotinas | 0 | 0 | sem objetivo aberto → sem IA |
| 30 personas com iniciativa | 0 | 0 | lote sem modelo (regras) |
| dogfood Padaria Lua | 155 | 3 | triagem + execução + resposta |

Total scriptado da linha de base: **402** tokens nos três cenários que chamam modelo; **0** nos dois ociosos.

## Benchmark pareado (mesma CLI/modelo)

Braço `cli_direct` vs `persona` (Claude haiku scriptado). Overhead da Persona = 1 chamada de triagem.

| Tarefa | CLI direta | Persona | Δ | Veredito |
|---|---:|---:|---:|---|
| simple-ask | 48 | 51 | +6,3% | parity |
| multi-review | 51 | 54 | +5,9% | parity |
| research-summary | 52 | 55 | +5,8% | parity |
| code-fix | 53 | 56 | +5,7% | parity |

Qualidade scriptada = 1,0 nos dois braços (critério de pronto). Execução real: `runPairedTask(..., { real: true })`, cap 1, dispose + timeout. CI local não gasta cota.

## Como rerodar

```
pnpm exec vitest run packages/persona/persona-engine/tests/token-measure.spec.ts
```

O teste trava os totais acima e o gate de +10%.
