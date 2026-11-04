# OPT-8 — aceite no runner fiel (Tally, 04/11)

Estimativa offline (`origin: estimate`); zero CLI real. Fonte: `persona-engine/src/bench/{token-faithful,opt8-faithful}.ts`.

| meta | resultado |
|---|---|
| zero chamadas com equipe ociosa sem objetivo | passou (idle-routines e initiative-30 = 0) |
| ≥ 60% de cache no prefixo (motores que reportam) | passou — claude 1.00 · codex 1.00 · opencode n/d · cursor n/d |
| −40% **tokens** por tarefa (pior dos dois dias, hoje → todas as alavancas) | NÃO atingido (-12%) |
| −40% **custo estimado** por tarefa (pior dos dois dias, hoje → todas as alavancas) | passou (rajada -42% · espalhado -40%; no limite no dia espalhado) — depende das alavancas W1–W3 do contrato `token-wiring.md` ligadas |

## Antes → hoje → todas as alavancas

Colunas de Δ: hoje→todas / ingênuo→todas.

| cenário | tokens (ingênuo → hoje → todas) | Δ tokens | custo µUSD (ingênuo → hoje → todas) | Δ custo |
|---|---|---|---|---|
| geral-simple | 983 → 501 → 501 | +0% / -49% | 2510 → 656 → 656 | +0% / -74% |
| multi-review | 2016 → 1905 → 1485 | -22% / -26% | 9439 → 9023 → 4648 | -48% / -51% |
| padaria-lua | 3033 → 2938 → 2528 | -14% / -17% | 13072 → 10433 → 5833 | -44% / -55% |
| dia-padaria | 8542 → 6593 → 5763 | -13% / -33% | 21905 → 15736 → 9135 | -42% / -58% |
| burst-geral | 2750 → 704 → 572 | -19% / -79% | 4007 → 3168 → 767 | -76% / -81% |
| dia-espacado | 8542 → 7093 → 6263 | -12% / -27% | 36364 → 22437 → 13462 | -40% / -63% |

## O dia espaçado (cache de 5 min e sessão de 10 min expiram entre as mensagens)

Mesmo dia de 7 mensagens, host de hoje: em rajada (1 min entre linhas) × espalhado (30 min). O TTL do cache do provedor é parâmetro (5 min é o padrão do cache efêmero; 60 min é o cache estendido) — **a medir** no vendor.

| cenário | TTL do cache | tokens | custo µUSD | prefixo em cache |
|---|---:|---:|---:|---:|
| dia-padaria | 5 min | 6593 | 15736 | 1.00 |
| dia-padaria | 60 min | 6593 | 15736 | 1.00 |
| dia-espacado | 5 min | 7093 | 22437 | 0.00 |
| dia-espacado | 60 min | 7093 | 20236 | 1.00 |

Leitura: num time que escreve ao longo do dia, o cache de 5 min não pega (o prefixo é regravado a cada mensagem) e a sessão aquecida de 10 min também expira — o prompt de coordenação (~500 tokens) volta em toda triagem. A meta de ≥ 60% de cache no prefixo só vale em uso contínuo ou com cache estendido. Nesse regime o que pesa é o **tamanho do prefixo** (persona, coordenação, ferramentas) e o **número de chamadas**.

## Pareado CLI direta × Persona (mesma CLI/modelo)

A base do vendor (system prompt + esquema de ferramentas que **cada chamada de CLI** leva) não é mensurável offline: está como parâmetro (0 = só o que a Persona acrescenta; 12 000 = ordem de grandeza suposta, **a medir**). A CLI direta recebe a evidência colada na mensagem (o que a Persona já lembra). Regime de **dia corrente** (a tarefa não é a primeira do dia: prefixo e sessões quentes nos dois braços). Tokens = entrada (com cache) + saída; "novos" = entrada fora do cache + saída; custo = ponderado por cache, mesmo modelo nos dois braços.

| tarefa | base | chamadas CLI / Persona | tokens CLI / Persona | tokens novos CLI / Persona | custo µUSD CLI / Persona |
|---|---:|---|---|---|---|
| simple-ask | 0 | 1 / 1 | 32 / 501 (+1466%) | 32 / 9 (-72%) | 192 / 271 (+41%) |
| multi-review | 0 | 1 / 3 | 71 / 985 (+1287%) | 71 / 94 (+32%) | 717 / 1195 (+67%) |
| research-summary | 0 | 1 / 3 | 50 / 2028 (+3956%) | 50 / 383 (+666%) | 414 / 2763 (+567%) |
| simple-ask | 12000 | 1 / 1 | 12032 / 12501 (+4%) | 32 / 9 (-72%) | 3792 / 3871 (+2%) |
| multi-review | 12000 | 1 / 3 | 12071 / 36985 (+206%) | 71 / 94 (+32%) | 4317 / 11995 (+178%) |
| research-summary | 12000 | 1 / 3 | 12050 / 38028 (+216%) | 50 / 383 (+666%) | 4014 / 13563 (+238%) |

Leitura (o que este quadro prova e o que não prova):

- Tarefa de **uma** chamada (simple-ask, base 12 000): tokens +4%, tokens novos -72%, custo +2% — dentro da paridade ±10%.
- Tarefa de **várias** chamadas (multi-review, research-summary): cada chamada da Persona relê a base do vendor (10% do preço, mas conta no total de tokens). Com base 12 000 o custo fica +178% / +238% sobre a CLI direta **tratada como uma chamada**. Isso é um piso para a CLI direta: um agente de CLI faz vários passos internos por tarefa e cada passo também relê a base, então a lacuna real é menor; **só uma rodada pareada com CLI real decide** (PERSONA_PAIR_REAL=1, liberação do Atlas).
- O que a Persona controla é o **número de chamadas por tarefa** e o que cada uma carrega: pré-roteador (courtesy sem modelo), rajada em lote (4 → 1), primeira entrega em um turno, triagem barata. O "+5,7–6,3%" do relato anterior vinha de uma fórmula (`armTokens`), não de prompts reais; este quadro o substitui.

`cut-40` real (livro vivo `measured`) continua dependendo de uma rodada com CLI real, que só o Atlas libera (`PERSONA_PAIR_REAL=1`).

```
node --import tsx/esm packages/persona/persona-engine/scripts/write-opt8-faithful.ts
```
