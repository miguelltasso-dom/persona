# Rodada pareada em modo seco (scriptado, sem CLI) — Tally

Prova do harness: plano, tetos, ciclo de vida e relatório. **Nenhum número abaixo é de CLI real.**

Chamadas: 9 (teto 20).

| braço | passo | passagem | prompt estimado | entrada | saída | cache lido | cache gravado | pronto | ms |
|---|---|---|---:|---:|---:|---:|---:|---|---:|
| cli_direct | direct | cold | 23 | 100 | 10 | 0 | 0 | não | 1 |
| persona | triage | cold | 538 | 100 | 10 | 0 | 0 | — | 0 |
| persona | execution | cold | 311 | 100 | 10 | 0 | 0 | não | 0 |
| persona_lean | execution | cold | 339 | 100 | 10 | 0 | 0 | não | 0 |
| cli_direct | direct | warm | 23 | 100 | 10 | 0 | 0 | não | 1 |
| persona | triage | warm | 38 | 100 | 10 | 0 | 0 | — | 0 |
| persona | execution | warm | 311 | 100 | 10 | 0 | 0 | não | 0 |
| persona_lean | execution | warm | 339 | 100 | 10 | 0 | 0 | não | 0 |
| persona | ttl_probe | after_gap | 38 | 100 | 10 | 0 | 0 | — | 0 |

- Base do vendor estimada (entrada da chamada direta − prompt estimado): 77.
- Razão entrada real ÷ estimada nas chamadas da Persona: 0.33 (o estimador assume 4 caracteres por token).
- Cache sobreviveu a 6 min: não (TTL ≤ 5 min).
- W3 (relato curto): saída real ÷ saída do worker normal = 1.00; os dois cumpriram o critério de pronto: não.
