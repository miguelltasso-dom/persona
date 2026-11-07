# TEAM-10 — leitura de custo e cota da rodada real (tentativa 3, NÚMEROS POR TURNO)

> **Correção (07/11, Tally):** a primeira leitura desta tentativa dizia "329 mil de entrada, 10 chamadas, acima da faixa". Estava ERRADA em dobro: o livro gravava, a cada turno, o uso ACUMULADO da sessão quente da CLI (a sessão de uma persona é reusada entre Tarefas), então o 2º turno de uma sessão repetia o 1º, o 3º os dois… Os 4 transcritos da CLI (`homes/real-attempt-3-*/projects/…`) provam: a soma das requisições de cada sessão é exatamente a linha acumulada do livro. O adaptador foi corrigido (o turno é o acumulado de agora menos o de quando o turno começou). Abaixo, cada turno com o seu número REAL.

**Rodada (Probe, 14:59:59 → 15:02:29, 149 s, LIB 6 `7bd08b15`):** 10 turnos em 4 sessões (Bia, Téo, Lia ×2). **Entrada total REAL 176.494** (cache lido 141.666 + gravado 34.792 + 36 sem cache; o livro dizia 329.293), **saída REAL 15.410** (o livro dizia 31.218), maior turno 23.178 (nenhum acima de 40 mil). **Dentro da faixa registrada antes (59.433–217.462, esperado 120.000)** e abaixo do guarda de 260.000: o veredito `overbudget` do Probe foi FALSO (efeito do acumulado). Em peso de preço (cache lido ×0,1, gravado ×1,25): ~57.693 "tokens de entrada equivalentes". **Cota da semana (medidor oficial): 9% → 9%** (minhas leituras 15:00:19 e 15:03:00; conta compartilhada com os demais agentes). O que a rodada provou: plano por função, bilhete entregue, `pass_forward` e `ask_colleague` por escolha do modelo, revisão com selo; opinião do time e "Bom dia" sem chamada paga não rodaram (a rodada foi cortada pelo guarda inflado).

| # | quem | Tarefa | sessão | entrada (turno) | cache lido | cache gravado | saída | (o livro dizia) |
|--:|---|---|---|--:|--:|--:|--:|--:|
| 1 | Bia | 81d2c9 | fe66b88c | 15.708 | 11.213 | 4.491 | 1.289 | 15.708 |
| 2 | Téo | 363ff1 | 9c69d4f5 | 16.320 | 11.215 | 5.101 | 2.114 | 16.320 |
| 3 | Téo | 8bb1d1 | 9c69d4f5 | 22.352 | 19.738 | 2.610 | 1.528 | 38.672 |
| 4 | Lia | b35ab0 | 31f57e7e | 13.133 | 9.312 | 3.817 | 789 | 13.133 |
| 5 | Lia | d0bcc0 | b4902b19 | 16.308 | 11.140 | 5.164 | 2.179 | 16.308 |
| 6 | Bia | 45fcde | fe66b88c | 21.452 | 18.355 | 3.093 | 1.892 | 37.160 |
| 7 | Lia | d0bcc0 | b4902b19 | 23.178 | 20.161 | 3.013 | 1.423 | 39.486 |
| 8 | Téo | 363ff1 | 9c69d4f5 | 13.986 | 11.619 | 2.365 | 2.153 | 52.658 |
| 9 | Lia | 1d2696 | 31f57e7e | 16.726 | 14.929 | 1.793 | 689 | 29.859 |
| 10 | Téo | 363ff1 | 9c69d4f5 | 17.331 | 13.984 | 3.345 | 1.354 | 69.989 |
