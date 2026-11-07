# OPT-8b — 2ª rodada pareada REAL: veredito pela regra pré-registrada

**Veredito: NÃO HÁ PARIDADE.**
- as duas razões estão fora de [0,90; 1,10] no mesmo sentido (a Persona gasta MAIS), com dispersão ≤ 0,50

Chamadas feitas: 15 (teto 40). Modos efetivos vistos: answer-only.

| célula | n | mediana (entrada total) | mín | máx | dispersão | pronto nas 3 | mediana saída |
|---|---|---|---|---|---|---|---|
| direct-cold | 3 | 1.023 | 1.023 | 1.023 | 0 | sim | 50 |
| direct-warm | 3 | 1.023 | 1.023 | 1.023 | 0 | sim | 50 |
| persona-cold | 3 | 1.311 | 1.311 | 1.311 | 0 | sim | 50 |
| persona-warm | 3 | 1.311 | 1.311 | 1.311 | 0 | sim | 50 |
| triage-warm | 3 | 1.038 | 1.038 | 1.038 | 0 | — | 50 |

Razão de paridade = mediana(execução da Persona) ÷ mediana(direta): **fria 1,282** (128,2%) · **quente 1,282** (128,2%); faixa [0,9; 1,1].
Triagem quente (o que o `skipTriage` economiza): mediana 1.038 tokens de entrada por chamada.

Placar D-068: `pair-parity` continua `blocked`.
