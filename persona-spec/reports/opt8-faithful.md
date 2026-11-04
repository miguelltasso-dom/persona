# OPT-8 — aceite no runner fiel (Tally, 04/11)

Estimativa offline (`origin: estimate`); zero CLI real. Fonte: `persona-engine/src/bench/{token-faithful,opt8-faithful}.ts`.

| meta | resultado |
|---|---|
| zero chamadas com equipe ociosa sem objetivo | passou (idle-routines e initiative-30 = 0) |
| ≥ 60% de cache no prefixo (motores que reportam) | passou — claude 1.00 · codex 1.00 · opencode n/d · cursor n/d |
| −40% **tokens** por tarefa (pior dos dois dias, host antes das ligações → todas as alavancas) | NÃO atingido (-40%) |
| −40% **custo estimado** por tarefa (pior dos dois dias, host antes das ligações → todas as alavancas) | passou (rajada -54% · espalhado -59%) — W1 e W4 já estão ligadas; falta a W3 (desligada até a rodada real); a triagem sem retorno lido (skipTriage, D-073) e a cortesia com reação (D-075) já estão ligadas, ver `token-wiring.md` |

## Ingênuo → host antes das ligações → host agora → todas as alavancas

Δ: antes das ligações → todas / ingênuo → todas. "Antes das ligações" é o host das 13:30 (recall cortado pela cabeça, triagem no runner da executora); "agora" tem W1 e W4.

| cenário | tokens (ingênuo → antes → agora → todas) | Δ tokens | custo µUSD (ingênuo → antes → agora → todas) | Δ custo |
|---|---|---|---|---|
| geral-simple | 983 → 989 → 501 → 501 | -49% / -49% | 2510 → 802 → 656 → 656 | -18% / -74% |
| multi-review | 2960 → 1398 → 785 → 733 | -48% / -75% | 11555 → 7470 → 4766 → 3356 | -55% / -71% |
| padaria-lua | 2164 → 1224 → 396 → 369 | -70% / -83% | 9499 → 5737 → 2419 → 1710 | -70% / -82% |
| dia-padaria | 8617 → 5585 → 3431 → 3352 | -40% / -61% | 22806 → 12184 → 7806 → 5591 | -54% / -75% |
| dia-espacado | 8617 → 6585 → 3431 → 3352 | -49% / -61% | 36680 → 19662 → 10166 → 8047 | -59% / -78% |

## O dia espaçado (cache de 5 min e sessão de 10 min expiram entre as mensagens)

Mesmo dia de 7 mensagens, host de agora: em rajada (1 min entre linhas) × espalhado (30 min). O TTL do cache do provedor é parâmetro (5 min é o padrão do cache efêmero; 60 min é o cache estendido) — **a medir** no vendor.

| cenário | TTL do cache | tokens | custo µUSD | prefixo em cache |
|---|---:|---:|---:|---:|
| dia-padaria | 5 min (escrita ×1.25) | 3431 | 7806 | 1.00 |
| dia-padaria | 60 min (escrita ×2) | 3431 | 10028 | 1.00 |
| dia-espacado | 5 min (escrita ×1.25) | 3431 | 10166 | 0.00 |
| dia-espacado | 60 min (escrita ×2) | 3431 | 13926 | 0.00 |

Leitura: num time que escreve ao longo do dia, o cache de 5 min não pega (o prefixo é regravado a cada mensagem) e a sessão aquecida de 10 min também expira — o prompt de coordenação (~500 tokens) volta em toda triagem. A meta de ≥ 60% de cache no prefixo só vale em uso contínuo ou com cache estendido. Nesse regime o que pesa é o **tamanho do prefixo** (persona, coordenação, ferramentas) e o **número de chamadas**.

## O que falta para os −40% de custo (fila 2 do Atlas)

Corte de custo estimado contra o host antes das ligações (D-068), na rajada / no dia espaçado; a coluna de tokens é o corte de tokens. As linhas depois da triagem são medidas SOBRE o host de agora (com a triagem pulada). Tudo é estimativa (`origin: estimate`); nada abaixo conta como ligado a menos que o status diga `wired`.

| alavanca | status | quem liga | custo (rajada / espaçado) | tokens (rajada / espaçado) | chamadas | risco para a pessoa |
|---|---|---|---|---|---:|---|
| W1 + W4 (no host desde as 14h) | wired | Tally/Anvil | -22% / -27% | +0% / +0% | 11 | nenhum novo |
| (d) sem a chamada de triagem (D-073, ligada) | wired | Anvil (orchestration.ts runLaunched), ligada pelo Tally | -34% / -40% | -17% / -29% | 8 | se um dia as ferramentas MCP forem ligadas aos adapters, religar a triagem (flag skipTriage) |
| (e) cortesia ("valeu!", "ok") com reação da persona, sem modelo (D-075, ligada) | wired | Anvil (orchestration.ts ingest), ligada pelo Tally | -36% / -48% | -39% / -48% | 6 | a persona reage com um sticker em vez de escrever; nunca engole um "ok" que responde pergunta pendente; cortesia + pedido = trabalho (flag courtesyNoModel) |
| (b) cache de 1 h (ENABLE_PROMPT_CACHING_1H) | only-api-key | Rivet (ambiente do spawn da CLI) | -18% / -29% | -39% / -48% | 6 | sem ganho nos prompts da Persona (escrita 2× > desconto de leitura); o ganho está na base do vendor, que os dois braços levam; só com chave de API (Bedrock/Vertex/Foundry): a assinatura (OAuth) fica fora |
| (a) W3: relato curto do executor (todas as alavancas) | off-until-real-run | Rivet (runners) + Anvil (flag no host) | -54% / -59% | -40% / -49% | 6 | relato curto demais perde o critério de pronto — a rodada pareada mede |

- **(b) cache que sobrevive ao dia espaçado.** A Claude Code só expõe TTL de 1 h por `ENABLE_PROMPT_CACHING_1H` com chave de API (Bedrock/Vertex/Foundry); sessões de assinatura (OAuth) ficam de fora, e há relato de que a variável não vale no Windows. Com a escrita a 2× o desconto de leitura não paga nos prompts da Persona (linha acima). O que o 1 h compra é a **base do vendor**: com 12 000 tokens de base, reescrevê-la após cada intervalo custa 41400 µUSD por mensagem (≈ 29× o custo dos prompts da Persona numa mensagem), contra leitura a 10%. Isso pesa nos dois braços e **a rodada pareada mede a base**; não entra na conta do −40% (que exclui a base).
- **Manter aquecido (keep-alive) está recusado.** Um ping a cada 5 min custa menos que reescrever (base 12 000, intervalo de 30 min: 18075 contra 41400 µUSD; com prefixo de 1 000 tokens: 1575 contra 3450), mas cada ping é uma chamada de modelo: gasta a cota da assinatura e quebra "zero chamadas com a equipe ociosa". Só se aceitaria dentro de uma tarefa em andamento, e aí a sessão aquecida (10 min) já cobre.
- **(c) modelo menor por tarefa.** Teto, não alavanca: se **todos** os turnos do executor fossem para o nível barato, o custo cairia -52% (rajada) / -47% (espaçado) a partir do host de agora; o executor é 79% / 71% do custo. A pergunta curta, o resumo curto e a triagem já vão para o nível barato (W1 e talk). O resto depende de quantas tarefas do executor são simples; a qualidade só se prova num modelo real (o roteiro do bench repete o que o prompt traz, então marcaria 1,00 de qualquer jeito).
- **(d) menos releituras da base.** A alavanca real foi a triagem sem retorno lido (`skipTriage`, ligada em D-073): 9 → 6 chamadas por dia, e cada chamada relê a base do vendor. Não existe turno de avaliação no host (o relatório antigo o modelava; foi retirado), e a revisão é uma segunda mensagem ao Bento, não um estágio que dê para fundir.
- **(e) cortesia sem chamada de modelo (D-075, ligada).** O pré-roteador classifica "valeu!" e "ok" como cortesia (`react`, sem modelo), mas o host ainda rodava `finishReply` e pagava **uma chamada de conversa no nível barato** por cortesia (sonda no host em 04/11: oi, obrigado, valeu! e ok = 1 entrega cada); o bench antigo contava essa linha como grátis. Agora a persona **reage** com um sticker (coração para agradecimento, joinha para o resto) sem modelo e sem Ticket, salvo quando há algo pendente dela para a pessoa no fio (Attention do Ticket ou a última linha dela termina em "?") ou quando a cortesia vem junto de um pedido. Flag `courtesyNoModel` (Anvil, `orchestration.ts`).

## Pareado CLI direta × Persona (mesma CLI/modelo)

A base do vendor (system prompt + esquema de ferramentas que **cada chamada de CLI** leva) não é mensurável offline: está como parâmetro (0 = só o que a Persona acrescenta; 12 000 = ordem de grandeza suposta, **a medir**). A CLI direta recebe a evidência colada na mensagem (o que a Persona já lembra). Regime de **dia corrente** (a tarefa não é a primeira do dia: prefixo e sessões quentes nos dois braços). Tokens = entrada (com cache) + saída; "novos" = entrada fora do cache + saída; custo = ponderado por cache, mesmo modelo nos dois braços.

| tarefa | base | chamadas CLI / Persona | tokens CLI / Persona | tokens novos CLI / Persona | custo µUSD CLI / Persona |
|---|---:|---|---|---|---|
| simple-ask | 0 | 1 / 1 | 32 / 501 (+1466%) | 32 / 9 (-72%) | 192 / 271 (+41%) |
| multi-review | 0 | 1 / 2 | 93 / 785 (+744%) | 93 / 164 (+76%) | 1047 / 2624 (+151%) |
| research-summary | 0 | 1 / 1 | 62 / 396 (+539%) | 62 / 84 (+35%) | 594 / 1342 (+126%) |
| simple-ask | 12000 | 1 / 1 | 12032 / 12501 (+4%) | 32 / 9 (-72%) | 3792 / 3871 (+2%) |
| multi-review | 12000 | 1 / 2 | 12093 / 24785 (+105%) | 93 / 164 (+76%) | 4647 / 9824 (+111%) |
| research-summary | 12000 | 1 / 1 | 12062 / 12396 (+3%) | 62 / 84 (+35%) | 4194 / 4942 (+18%) |

Leitura (o que este quadro prova e o que não prova):

- Tarefa de **uma** chamada (simple-ask, base 12 000): tokens +4%, tokens novos -72%, custo +2% — dentro da paridade ±10%.
- Tarefa de **várias** chamadas (multi-review): cada chamada da Persona relê a base do vendor (10% do preço, mas conta no total de tokens). Com base 12 000 o custo fica +111% sobre a CLI direta **tratada como uma chamada**. Isso é um piso para a CLI direta: um agente de CLI faz vários passos internos por tarefa e cada passo também relê a base, então a lacuna real é menor; **só uma rodada pareada com CLI real decide** (PERSONA_PAIR_REAL=1, liberação do Atlas).
- O que a Persona controla é o **número de chamadas por tarefa** e o que cada uma carrega: pré-roteador (courtesy sem modelo), primeira entrega em um turno, triagem barata (e o host já trata mensagens seguidas no mesmo canal como follow-ups da Tarefa viva, sem nova triagem). O "+5,7–6,3%" do relato anterior vinha de uma fórmula (`armTokens`), não de prompts reais; este quadro o substitui.

`cut-40` real (livro vivo `measured`) continua dependendo de uma rodada com CLI real, que só o Atlas libera (`PERSONA_PAIR_REAL=1`).

```
node --import tsx/esm packages/persona/persona-engine/scripts/write-opt8-faithful.ts
```
