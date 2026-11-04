# Rodada pareada em modo seco (scriptado, sem CLI) — Tally

Prova do harness: plano, tetos, ciclo de vida e relatório. **Nenhum número abaixo é de CLI real.**

Chamadas: 9 (teto 20).

| braço | passo | passagem | prompt estimado | entrada | saída | cache lido | cache gravado | ms |
|---|---|---|---:|---:|---:|---:|---:|---:|
| cli_direct | direct | cold | 29 | 100 | 10 | 0 | 0 | 1 |
| persona | triage | cold | 542 | 100 | 10 | 0 | 0 | 0 |
| persona | execution | cold | 792 | 100 | 10 | 0 | 0 | 0 |
| persona | evaluation | cold | 379 | 100 | 10 | 0 | 0 | 0 |
| cli_direct | direct | warm | 29 | 100 | 10 | 0 | 0 | 1 |
| persona | triage | warm | 42 | 100 | 10 | 0 | 0 | 0 |
| persona | execution | warm | 792 | 100 | 10 | 0 | 0 | 0 |
| persona | evaluation | warm | 379 | 100 | 10 | 0 | 0 | 0 |
| persona | ttl_probe | after_gap | 42 | 100 | 10 | 0 | 0 | 0 |

- Base do vendor estimada (entrada da chamada direta − prompt estimado): 71.
- Razão entrada real ÷ estimada nas chamadas da Persona: 0.21 (o estimador assume 4 caracteres por token).
- Cache sobreviveu a 6 min: não (TTL ≤ 5 min).
