# Contrato — estimativa do pedido antes de enviar (`estimateAsk`)

Tally, 04/11. Pedido do Atlas (UX-BEYOND-T3 A-6 / P1-12). Função pura e testada; falta só o **Remote** e a **tela**.

## O que existe

- `packages/persona/persona-engine/src/ux/estimate-ask.ts`, exportada pelo engine (`estimateAsk` e os tipos `EstimateAskInput`, `EstimateAskResult`, `AskCalibration`…).
- Testes: `persona-engine/tests/estimate-ask.spec.ts` (14: "não sei", rotas, tokens/custo em faixa, tempo só medido, rótulos) e `persona-host/tests/estimate-ask-host.spec.ts` (2: **a estimativa e o host concordam** — para 9 linhas, o número de chamadas que ela dá é o número de entregas que o host faz e ela diz se vira Ticket ou conversa; mais o caso "ok" depois de pergunta aberta).

## Regras de honestidade (valem para qualquer tela)

1. **Chamadas são exatas** (o roteamento do host é determinístico): `chamadas.min === chamadas.max`. Hoje: pergunta = 1 (nível barato); pedido de trabalho = 1 (modelo da pessoa; sem triagem desde D-073); 1ª entrega do passo 5 = 1; cortesia sem nada pendente = **0** (a persona reage, D-075); comando `/pausar` `/retomar`, duplicado, injeção, fora de escopo = 0.
2. **Tokens e custo são faixas**, e **não incluem a base do vendor** (o prompt de sistema e o esquema de ferramentas que toda chamada de CLI leva) enquanto não houver calibração medida: `baseDoVendorIncluida: false`. O custo é em micro-USD a preço de tabela; uma pessoa em assinatura não paga isso em dinheiro, então **a tela decide se mostra**; o número útil para ela é a cota (ver `footer-pill.md`).
3. **Tempo é `null` até existir medida** (A-6: "só com número medido"). Nunca se escreve "~1 min" sem `tempo`. A medida vem da rodada pareada real (D-070): o Tally grava `persona-spec/baselines/pair-real-calibration.json` quando ela rodar e o host passa o conteúdo como `calibracao`.
4. **`origin`**: `estimate` (padrão), `calibrated` (com calibração medida), `unknown` ("não sei"). Nunca `measured`: essa palavra é só para campo que o vendor reportou.
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

## Calibração (depois da rodada pareada)

`AskCalibration = { vendorBaseTokens?, tokenizerRatio?, secondsPerCall?: { conversa?, execucao?, triagem? } }`, tudo medido: base = entrada da chamada direta menos o nosso prompt; razão = entrada real ÷ estimada; tempo = `durationMs` por chamada. Campo que a CLI não reportou **fica ausente** (nunca 0). Com calibração, `tokens` inclui a base por chamada e `origin` vira `calibrated`.
