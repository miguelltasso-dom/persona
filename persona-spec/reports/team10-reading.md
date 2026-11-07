# TEAM-10 — leitura de custo e cota da rodada real

> **Correção (07/11, Tally):** a leitura de 05/11 trazia "entrada total 20.784, maior chamada 10.490": o cache foi somado POR CIMA, mas o `input_tokens` do livro já é o TOTAL (5.246 = 2.319 lidos + 2.925 gravados + 2). Os números abaixo são os corretos (10.394 / 5.246 / soma 11.684); a cota (82% → 83%) não mudou. O texto antigo ficou em `.maestri/tmp/tally/inputof-fix/team10-reading.before-fix.md`.

**Leitura para a pessoa:** A rodada da equipe fez 2 chamadas ao modelo e colocou cerca de 10 mil tokens de entrada (a maior chamada: 5 mil) e 1 mil de saída. Mas foi uma rodada incompleta (parou depois de 2 chamadas: a Bia recebeu o pedido cortado no título, pediu mais informações e o trabalho não chegou a passar para as outras pessoas): a faixa prevista (59 mil a 217 mil) vale para a rodada inteira, de cerca de 11 chamadas; o número acima é só o que ela chegou a gastar. Cota da semana: 82% antes, 83% depois: 1 ponto no medidor oficial (outros usos da conta no mesmo intervalo também contam).

Chamadas: 2 · entrada total 10.394 (o cache lido e o gravado são parte dela) · saída 1.290 · soma 11.684 · maior entrada de uma chamada 5.246.
Orçamento a seco: below (faixa 59.433–217.462, esperado 120.000).
Modos: answer-only 2; nativo sem motivo: 0; nativo por conector não alcançado: 0; estimadas: 0.

| tipo | chamadas | tokens |
|---|---|---|
| execution | 2 | 11.684 |

Cota (leitura oficial):
- week: 82% → 83% (+1)

