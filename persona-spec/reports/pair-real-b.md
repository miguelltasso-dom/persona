# OPT-8b — 2ª rodada pareada REAL: veredito pela regra pré-registrada

**Veredito: NÃO HÁ PARIDADE.**
- as duas razões estão fora de [0,90; 1,10] no mesmo sentido (a Persona gasta MAIS), com dispersão ≤ 0,50

Chamadas feitas: 15 (teto 40). Modos efetivos vistos: answer-only.

| célula | n | mediana (entrada total) | mín | máx | dispersão | pronto nas 3 | mediana saída |
|---|---|---|---|---|---|---|---|
| direct-cold | 3 | 3.022 | 3.022 | 3.022 | 0 | sim | 721 |
| direct-warm | 3 | 3.022 | 3.022 | 3.022 | 0 | sim | 834 |
| persona-cold | 3 | 3.340 | 3.340 | 3.340 | 0 | sim | 828 |
| persona-warm | 3 | 3.340 | 3.340 | 3.340 | 0 | sim | 908 |
| triage-warm | 3 | 3.057 | 3.057 | 3.057 | 0 | — | 488 |

Razão de paridade = mediana(execução da Persona) ÷ mediana(direta): **fria 1,105** (110,5%) · **quente 1,105** (110,5%); faixa [0,9; 1,1].
Triagem quente (o que o `skipTriage` economiza): mediana 3.057 tokens de entrada por chamada.

Placar D-068: `pair-parity` continua `blocked`.

## Fecho (D-094, Atlas)

A banda não se muda depois do dado (D-068). **`pair-parity`: não atingido por 0,005 (1,105 × 1,10).** O custo absoluto é ~99% menor que o da CLI nativa (308.902 → 3.340 tokens de entrada por chamada); os +10% vêm do prompt do worker, que carrega o contexto da persona que a chamada direta não tem. OPT-8 = 3/4; não bloqueia a v1.1. A rodada anterior (3.487 → razão 1,153) ficou em `pair-real-b-r1-opt8b.md`. Cota: semana 70% → 70% (não mensurável, ~58,6 mil tokens). Nenhuma nova chamada real.
