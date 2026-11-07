# OPT-8b — leitura do resultado (Tally, 05/11 00:41)

Rodada feita nos termos pré-registrados (`opt8b-prereg.md` + Adendos 1 e 2), liberada pelo Atlas (00:28): **15 chamadas** no haiku (CLI 2.1.318), **todas em `answer-only`** (provado para a versão antes da 1ª chamada), ledger absoluto fresco com exatamente **15 turnos**, trava `real`, teto 40 (nenhuma substituição foi necessária), sem ferramenta nem conector, nenhuma repetição. Brutos de cada tentativa em `pair-real-b.json`; o veredito é o da função `evaluatePairRealB` (21 testes escritos antes do dado), em `pair-real-b.md`.

## Veredito: NÃO HÁ PARIDADE (a Persona gasta MAIS)

| | direta (fria / quente) | execução da Persona (fria / quente) | razão |
|---|---|---|---|
| **entrada total (métrica primária)** | **3.023 / 3.023** | **3.487 / 3.487** | **1,153 / 1,153** (faixa [0,90; 1,10]) |
| dispersão (máx−mín ÷ mediana) | 0 / 0 | 0 / 0 | ≤ 0,50 nas quatro células |
| critério de pronto nas 3 | sim / sim | sim / sim | |

As duas razões ficam fora da faixa **no mesmo sentido** e com dispersão zero: a regra pré-registrada diz "não há paridade". Não é ruído: a entrada é determinística (3.023 e 3.487 em todas as repetições) e a diferença é **+464 tokens** por chamada, que é o prompt do worker da Persona (identidade, normas do dono, o pedido). `pair-parity` do placar D-068 **continua `blocked`**.

## O que a regra não pergunta, mas importa (secundárias)

- **A saída da Persona é 40% a 57% maior:** mediana 1.096 (fria) e 1.236 (quente) contra 782 e 789 da direta. O formato do relatório do worker faz a persona escrever mais. Como a saída pesa mais que a entrada, o custo equivalente (preço de lista, **só referência técnica**, ver D-092) vai de ≈ 4,2 mil µUSD (direta) a ≈ 5,8 mil (fria, ×1,38) e ≈ 6,5 mil (quente, ×1,54).
- **A triagem custa 3.058 de entrada + 345 de saída** por chamada: é o que o `skipTriage` economiza em cada pedido de trabalho.
- **Tudo é cache lido:** em todas as 15 chamadas o cache lido é a entrada inteira menos 2 tokens (3.021 de 3.023; 3.485 de 3.487): o prefixo do ambiente isolado fica quente entre chamadas (TTL de 5 min), então "fria" e "quente" não diferem no total, só no tempo. A célula "após intervalo" não foi pedida nesta rodada.
- **O chão do `answer-only`:** 3.023 tokens para um pedido direto de ~25 palavras (no nativo desta máquina a mesma chamada carregaria centenas de milhares).

## O caminho curto até a paridade (se o Atlas quiser fechar o `pair-parity`)

Para a entrada entrar na faixa basta a Persona perder **162 tokens** do prompt do worker (3.487 → ≤ 3.325 = 1,10 × 3.023); para a razão ficar em 1,00 seriam 464. A alavanca da saída (o relatório curto, W3) está **adiada** desde o D-080; ela é a que mais mexe no custo (a saída é 40–57% maior). Nada disso foi aplicado: é decisão do Keel/Atlas, e qualquer corte do prompt passa pelo gate de qualidade (critério de pronto).

## Cota (D-092): o que esta rodada tirou da janela

Leitura da cota oficial antes (03:29Z) e depois (03:31Z) da rodada (≈ 48 mil tokens de entrada + 12,5 mil de saída): a janela **semanal** ficou em **67% antes e depois**. Granularidade do vendor: 1%, então um gasto desta ordem **não aparece**: o impacto é **menor que 1% da semana**. Esta conta (Claude Max) **não publica janela de 5 horas**: a resposta traz só a semanal (`seven_day`) e a "por modelo" (`model_scoped:Fable`, 0%). Ver `contracts/usd-subscription.md`.

## Limites

Um modelo (haiku), uma versão da CLI (2.1.318), uma tarefa, `answer-only`, 3 repetições por célula, entrada determinística. O resultado vale para "o prompt do worker da Persona, hoje, contra o texto direto" e não para tarefas com ferramentas (onde o chão nativo é de centenas de milhares de tokens e o modo `needed` é que mexe: passo B, ainda desligado).
