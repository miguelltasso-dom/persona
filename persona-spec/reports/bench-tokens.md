# Tokens por cenário — linha de base (OPT-1, Forge + Rivet, 04/11)

Aceite do PLAN OPT-1. Contagem **fiel do runner scriptado** (`persona-engine` `runTokenScenario` / `formatTokensBaselineMarkdown`). Detalhe e painel: `tokens-baseline.md`. JSON do gate: `persona-spec/baselines/token-scenarios.json`.

Referência do aceite = CLI direta (paridade ±10%), não um harness antigo. Overhead (triagem / Bibliotecário / Vigia / iniciativa) entra no livro à parte. Rodada vendor opt-in `PERSONA_PAIR_REAL=1`, cap 1, `start`→fold→`cancel`, `dispose` no `finally`. CLI real continua congelada.

## Cenários de referência (scripted)

| cenário | tokens | chamadas | cache hit | origem |
|---|---:|---:|---:|---|
| geral-simple | 99 | 2 | 0.50 | scripted |
| multi-review | 148 | 3 | 0.67 | scripted |
| idle-routines | 0 | 0 | 0.00 | scripted — equipe ociosa sem objetivo |
| initiative-30 | 0 | 0 | 0.00 | scripted — lote sem modelo |
| padaria-lua | 155 | 3 | 0.67 | scripted |

Painel Uso (`foldUsagePanel`): origem **estimate**, tokens/tarefa 134.0, cache hit **0.63** (≥ 60% no prefixo scripted).

## Benchmark pareado (mesma CLI/modelo, fake)

| tarefa | CLI in+out | Persona in+out | Δ | veredito |
|---|---:|---:|---:|---|
| simple-ask | 48 | 51 | 0.063 | parity |
| multi-review | 51 | 54 | 0.059 | parity |
| research-summary | 52 | 55 | 0.058 | parity |
| code-fix | 53 | 56 | 0.057 | parity |

## Vendor / Rivet

Cache hit de vendor só quando `cacheReadTokens` existe. Ausência ≠ 0%. `usagePortKind` mapeia execution→exec, evaluation→eval. Sessão aquecida = Rivet (`sessionPoolKey`).

OPT-8 −40% tokens/tarefa vs esta linha: **ainda não** (só depois da integração). Idle e iniciativa-30 já são 0 chamadas.
