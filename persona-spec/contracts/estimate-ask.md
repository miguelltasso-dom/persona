# Contrato — estimativa do pedido antes de enviar (`estimateAsk`)

Tally, 04/11. Pedido do Atlas (UX-BEYOND-T3 A-6 / P1-12). Função pura e testada; falta só o **Remote** e a **tela**.

## O que existe

- `packages/persona/persona-engine/src/ux/estimate-ask.ts`, exportada pelo engine (`estimateAsk` e os tipos `EstimateAskInput`, `EstimateAskResult`, `AskCalibration`…).
- Testes: `persona-engine/tests/estimate-ask.spec.ts` (14: "não sei", rotas, tokens/custo em faixa, tempo só medido, rótulos) e `persona-host/tests/estimate-ask-host.spec.ts` (2: **a estimativa e o host concordam** — para 9 linhas, o número de chamadas que ela dá é o número de entregas que o host faz e ela diz se vira Ticket ou conversa; mais o caso "ok" depois de pergunta aberta).

## Regras de honestidade (valem para qualquer tela)

1. **Chamadas são exatas** (o roteamento do host é determinístico): `chamadas.min === chamadas.max`. Hoje: pergunta = 1 (nível barato); pedido de trabalho = 1 (modelo da pessoa; sem triagem desde D-073); 1ª entrega do passo 5 = 1; cortesia sem nada pendente = **0** (a persona reage, D-075); comando `/pausar` `/retomar`, duplicado, injeção, fora de escopo = 0.
2. **Tokens e custo são faixas**, e **não incluem a base do vendor** (o prompt de sistema e o esquema de ferramentas que toda chamada de CLI leva) enquanto não houver calibração medida: `baseDoVendorIncluida: false`. O custo é em micro-USD a preço de tabela; uma pessoa em assinatura não paga isso em dinheiro, então **a tela decide se mostra**; o número útil para ela é a cota (ver `footer-pill.md`).
3. **Tempo é `null` até existir medida** (A-6: "só com número medido"). Nunca se escreve "~1 min" sem `tempo`. A medida vem do **histórico da própria pessoa** (OPT-9, D-080 c: `turn_ledger` medido, mesmo motor e mesma conta; ver `estimate-calibration.md`). `persona-spec/baselines/pair-real-calibration.json` é a referência de UMA máquina de desenvolvimento (Haiku, 1 rodada): **o host nunca a lê** (teste em `persona-host/tests/estimate-history-tokens.spec.ts`).
4. **`origin`**: `estimate` (padrão), `calibrated` (com calibração medida), `unknown` ("não sei"). Nunca `measured`: essa palavra é só para campo que o vendor reportou. Quando `calibrated`, **`fonte`** diz de onde veio: `historico` (as conversas medidas da própria pessoa; vem junto `amostras` = nº de linhas por trás do `motivo`) ou `referencia-dev` (referência de uma máquina de desenvolvimento; só scripts e testes, nunca o host). Sem calibração, `fonte` e `amostras` ficam ausentes.
5. **"Não sei"** quando não dá: texto vazio (`Escreva o pedido para estimar`) ou nenhuma IA conectada (`Conecte uma IA para estimar`). Nada de número chutado.

## O que a tela mostra

Uma linha, discreta, abaixo do composer (`rotulo` pronto, pt-BR) e no passo 5:

| situação | `rotulo` | `tipo` |
|---|---|---|
| pergunta / conversa | `1 chamada da sua IA` | `conversa` |
| pedido de trabalho | `1 chamada da sua IA` | `trabalho` |
| trabalho com triagem religada (flag `skipTriage` desligada) | `2 chamadas da sua IA` | `trabalho` |
| cortesia ("valeu!") | `Sem chamada da sua IA` | `sem-chamada` |
| com tempo medido | `~1 min · 1 chamada da sua IA` / `de 1 a 5 min · …` / `menos de 1 min · …` | — |
| sem IA conectada | `Conecte uma IA para estimar` (levar a Conexões) | `nao-sei` |
| campo vazio | nada (esconde a linha) | `nao-sei` |

`motivo` é uma frase curta para o tooltip ("um pedido de trabalho: vira uma tarefa para a equipe"; "uma cortesia: a persona só reage, sem chamar a IA"). A **forma visual é da Muse**; o Prism/Flint ligam; nada aqui define tipografia ou cor.

## O Remote (PRONTO, D-076): `estimateAsk`

`persona-host/src/index.ts` `@Remote estimateAsk(request: EstimateAskRequest): EstimateAskView` (tipos em `types.ts`). Local e síncrono: **nenhum modelo é chamado** (teste: 0 runners resolvidos).

```ts
EstimateAskRequest = { workspaceId, projectId, texto, streamKind: 'channel' | 'dm', ownerId, primeiraEntrega? }
EstimateAskView    = { tipo, chamadas, detalhe, tokens, baseDoVendorIncluida, custo, tempo, origin, rotulo, motivo }  // ver acima
```

O host resolve sozinho: a **persona** (o par da DM, ou a coordenação do canal), o **motor** (a CLI da persona; senão a CLI logada; senão "nenhuma IA conectada" → "não sei"), as chaves do host (`skipTriage`, `courtesyNoModel`) e a pergunta aberta (`orchestration.pendingFromPersonaIn(projectId, streamId)`: Attention de um Ticket do fio ou última linha da persona terminando em "?"). O cliente só manda o texto e onde está.

Prova: `persona-host/tests/estimate-ask-remote.spec.ts` (5: local e sem modelo; passo 5 sem triagem mesmo com a triagem religada; "ok" reação × conversa por fio; "não sei" sem IA ou campo vazio; a DM usa a persona da DM) e `estimate-ask-host.spec.ts` (a estimativa = entregas reais).

**Para Prism/Flint (depois da forma da Muse):** chamar com debounce de ~400 ms enquanto a pessoa digita; mostrar `rotulo` numa linha abaixo do composer (e ao lado do "Pedir agora" no passo 5, com `primeiraEntrega: true`); `motivo` no tooltip; esconder a linha com o campo vazio; `tipo: 'nao-sei'` + "Conecte uma IA para estimar" leva a Conexões. O cliente precisa acrescentar `estimateAsk` na sua interface do Remote (`persona-screens-remote.ts` e equivalentes).

## Imagens na mensagem (custo MEDIDO)

`EstimateAskInput.imagens?: [{ size?: {width,height} }]` (opcional, aditivo): a mensagem leva imagens (TEAM-5). O custo é o **medido** em 2 chamadas reais no haiku (`reports/image-cost-real.md`): uma imagem 1500×1000 acrescentou **2.018 tokens** de entrada e foi cobrada como escrita de cache (1,25×). As imagens (no máximo 4) entram na chamada que RECEBE a mensagem (a resposta numa conversa; a execução num pedido de trabalho, não a triagem), em `tokens` e `custo`, e o resultado ganha `imagens: { count, tokens: {min,max}, origin: 'calibrated'|'estimate', basis? }`: `calibrated` com a base escrita quando todos os tamanhos são conhecidos (ressalva: uma medição), `estimate` e largo (150–3.300) quando algum tamanho não é. Uma mensagem sem chamada (cortesia) ignora as imagens. O Remote do host ainda não passa `imagens` (Anvil: o tamanho vem de `imageSizeOf` nos primeiros 64 KB do anexo).

## Calibração (OPT-9: o histórico da própria pessoa)

`AskCalibration` (`persona-engine/src/ux/estimate-ask.ts`):

| campo | quem manda | uso |
|---|---|---|
| `source: 'history'` | o host (só ele) | liga o caminho do histórico; sem ele, `tokensPerCall`/`mediana`/`samples` **não são lidos** |
| `tokensPerCall.{conversa,execucao,triagem}` = `{input: Range, output: Range}` | o host, P25..P75 das chamadas medidas | **substitui** "nossa estimativa + base" daquele tipo: a entrada medida já traz a base do vendor, então não se soma base nem razão |
| `secondsPerCall` (P25..P75) + `mediana` | o host, só linhas com `duration_ms` | `tempo.segundos` e `tempo.mediana`; o rótulo se centra na mediana e a faixa limita (`de 1 a 5 min` se larga) |
| `samples.{tipo}.{tokens,tempo}` | o host | **exigidos**: cada afirmação só vale com **≥ 5** linhas (`MIN_HISTORY_SAMPLES`); abaixo disso, ou sem a contagem, o engine **ignora** a afirmação e volta para a estimativa (um host que esquecer de contar não nos faz alegar histórico) |
| `vendorBaseTokens`, `tokenizerRatio` | **só dev** (scripts/testes) | ignorados quando `source = 'history'`; usados, e rotulados `fonte: 'referencia-dev'` ("números de referência de desenvolvimento (uma máquina), não do seu histórico"), quando não há `source` |

Regras do engine:
- `tokens` de uma chamada com histórico = entrada medida + saída medida (P25 a P75 somados); sem histórico = estimativa (+ base de dev, se houver). Num pedido com mais de uma chamada (triagem ligada), cada chamada usa o que tem; `baseDoVendorIncluida` só é `true` se **todas** carregam a base.
- `tempo` exige medida para **todas** as chamadas do pedido; senão fica `null` e o rótulo não escreve minutos.
- `custo` no caminho do histórico vai de um **piso** (tudo a preço de cache lido, ×0,1) a um **teto** (tudo a preço de cache gravado, ×1,25), porque o livro guarda a entrada medida em um número só (fresca + cache lido + cache gravado). É largo de propósito: nunca uma cifra única inventada.
- `motivo` cita a base: "pelas suas últimas {n} {conversas|tarefas|triagens}, {a resposta|a tarefa|a triagem} levou de {a} a {b} {s|min}" (n = linhas **com duração**), ou, sem tempo, "…cada chamada usou de {a} a {b} mil tokens" (n = linhas com tokens). A forma final é da Muse. Se o histórico sustenta só outra chamada do pedido, o motivo diz "parte dos números vem do seu histórico medido", sem citar contagem que não está por trás dele.
- `origin: calibrated` só quando algum campo usado veio da calibração; `fonte: 'historico'` quando é a da pessoa.

Limites conhecidos: o tamanho da mensagem não entra no caminho do histórico (a mediana é de mensagens típicas; uma de 1 500 tokens soma ~4% sobre uma base de ~40 mil, dentro da faixa P25..P75); as linhas de `execution` refletem o contador da sessão da CLI, que soma as requisições internas do agente: é exatamente o que a pessoa gastou, então a estimativa de trabalho sobe para onde o uso real está (ver OPT-10).

## D-092 / USD-1: a assinatura não tem dólar (05/11)
O resultado de `estimateAsk` (e o `EstimateAskView` do host) passou a ter `billing` (`'subscription' | 'api' | 'unknown'`), `quota` (o impacto na janela que o fornecedor publica: `'5h'` se existir, senão `'week'`; `pct: null` = "cota não medida", nunca 0%) e `impacto` (a linha pronta em pt-BR). **`custo` só vem com `billing: 'api'`**; com assinatura ou conta desconhecida é `null` (nenhuma tela consegue mostrar dólar por engano). O host decide o tipo de conta com `accountForEstimate` (`persona-host/src/estimate-account.ts`): CLI com chave de API/Bedrock/Vertex/Foundry no ambiente = `api`; CLI logada (plano reportado ou login conhecido) = `subscription`; sem sinal = `unknown`. O US$ de lista segue existindo para relatório técnico em `estimateAskReference`. Formato completo e regras: `contracts/usd-subscription.md`.
