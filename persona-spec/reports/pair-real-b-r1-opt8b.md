# OPT-8b — 2ª rodada pareada REAL: veredito pela regra pré-registrada

**Veredito: NÃO HÁ PARIDADE.**
- as duas razões estão fora de [0,90; 1,10] no mesmo sentido (a Persona gasta MAIS), com dispersão ≤ 0,50

Chamadas feitas: 15 (teto 40). Modos efetivos vistos: answer-only.

| célula | n | mediana (entrada total) | mín | máx | dispersão | pronto nas 3 | mediana saída |
|---|---|---|---|---|---|---|---|
| direct-cold | 3 | 3.023 | 3.023 | 3.023 | 0 | sim | 782 |
| direct-warm | 3 | 3.023 | 3.023 | 3.023 | 0 | sim | 789 |
| persona-cold | 3 | 3.487 | 3.487 | 3.487 | 0 | sim | 1.096 |
| persona-warm | 3 | 3.487 | 3.487 | 3.487 | 0 | sim | 1.236 |
| triage-warm | 3 | 3.058 | 3.058 | 3.058 | 0 | — | 345 |

Razão de paridade = mediana(execução da Persona) ÷ mediana(direta): **fria 1,153** (115,3%) · **quente 1,153** (115,3%); faixa [0,9; 1,1].
Triagem quente (o que o `skipTriage` economiza): mediana 3.058 tokens de entrada por chamada.

Placar D-068: `pair-parity` continua `blocked`.
