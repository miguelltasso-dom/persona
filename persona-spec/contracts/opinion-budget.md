# TEAM-4 — o orçamento da rodada de opinião (`budgetOpinionRound`)

Tally, 04/11 22:25. Para o Anvil (ferramenta `ask_team_opinion`), o Bolt (fan-out iniciado pela persona), o Forge (consolidação/pedido no engine) e o Flint (rodapé e linhas do cartão). Código: `persona-engine/src/ux/{opinion-budget,image-tokens}.ts`, exportado do `persona-engine`. Provas: `opinion-budget.spec` (27) + `image-tokens.spec` (9). Puro e offline, como o `estimateAsk`. Transporte da imagem: `contracts/team-images.md`.

## Quem chama e quando

A ferramenta `ask_team_opinion` chama `budgetOpinionRound` **antes de qualquer fan-out** (o lado host está pronto: `contracts/opinion-host.md`, `persona-host/src/opinion-host.ts`; o motor da rodada é o `TeamOpinions.run` do Bolt). O resultado manda:

| `decision` | O que o host faz |
|---|---|
| `ask` | roda o fan-out do CV-8 só para `asked` (Bolt), com `draft.images` indo ao runner (TEAM-5); depois a persona consolida (1 chamada) |
| `propose` | "Sugere e espera": a persona mostra `proposta` à pessoa ("Posso pedir a opinião da equipe sobre {tema}? ≈ {n} respostas"); só roda se a pessoa aceitar |
| `stop` | **nenhuma chamada**. `stop` diz o porquê (`rounds-cap`, `daily-cap`, `nobody`, `no-vision`, `draft-empty`) e `motivo` é a linha honesta para o detalhe da Tarefa. A ferramenta devolve isso à persona como resultado normal (não erro): ela segue com o que tem |

## Entrada

```ts
budgetOpinionRound({
  question, draft: { text?, images?: [{ size?: {width,height} }] },
  asker: { id, name?, title?, personality?, instructions?, autonomy: 'suggest' | 'act', asksToday? },
  readers: [{ id, name?, ..., motor: { cli, connected, readsImages }, paused?, atLimit?, level? }],   // a audiência JÁ resolvida pelo host (equipe menos quem pede)
  roundsUsed,                                              // rodadas JÁ usadas nesta Tarefa (0 na 1ª); o host conta
  policy?: { roundsCap?, dailyCap?, maxReplies? },
  calibracao?,                                             // o histórico MEDIDO da pessoa, como no estimateAsk
})
```

- **Contadores são do host (Anvil/store):** `roundsUsed` por Tarefa e `asksToday` por persona. Repetir o MESMO pedido (retry) não soma rodada: quem incrementa é o host, **depois** de o fan-out começar. Aqui não há estado escondido.
- `readsImages` vem de `runner.capabilities().images === 'available'` (hoje só Claude).
- Tamanho da imagem: `imageSizeOf(primeiros 64 KB do arquivo)` (PNG, GIF, WebP, JPEG; sem biblioteca) → `size`. Sem tamanho, a faixa do custo da imagem fica larga (150–1.600 tokens), nunca um número inventado.

## Regras (todas testadas)

1. **Teto de rodadas por Tarefa:** padrão **2**, a pessoa ajusta **1 a 3** (Configurações › Personas); qualquer valor fora disso é cortado. `roundsUsed ≥ teto` ⇒ `stop: rounds-cap` (`opinion.roundsCap`), seja qual for o número que chegue: um contador errado ou hostil não reabre a Tarefa. A rodada seguinte nunca é pedida por este módulo.
2. **Teto diário por persona:** padrão **6** pedidos a colegas, 1 a 20. Um pedido de opinião conta **uma** vez (não por colega). Ao chegar: `stop: daily-cap`, sem linha no fio, só no detalhe ("{A} não pediu ajuda: chegou ao limite de pedidos de hoje").
3. **Ninguém é pulado em silêncio:** `skipped` lista cada colega não chamado com o motivo: `paused`, `at-limit` (cota do motor), `unavailable` (motor não conectado), `no-vision` (rascunho com imagem e motor que não lê imagem; o Flint usa `opinion.noVision` + "Trocar o motor"), `over-limit` (plateia maior que `maxReplies`, padrão 6, o corte é dito). Quem pede nunca responde ao próprio pedido.
4. **Só quando vale:** rascunho vazio ⇒ `draft-empty`; ninguém para responder ⇒ `nobody` (ou `no-vision` se a imagem foi o único motivo); nunca uma chamada à toa.
5. **Chamadas EXATAS:** uma resposta por colega chamado + **uma** consolidação pela persona que pediu (no modelo dela). Tokens e custo em **faixa**.
6. **Origem:** `estimate` até o histórico MEDIDO da pessoa sustentar a estimativa (`calibrated`, com `MIN_HISTORY_SAMPLES` = 5 linhas por tipo de chamada, como no `estimateAsk`). Nunca `measured`.
7. **Rodapé do cartão** (`rodape`): sempre "≈ {n} respostas"; o custo só entra quando **todas** as chamadas da rodada têm número medido do histórico (EQUIPE-REAL-SPEC: "o rodapé sai só quando o Tally mede"). Os tokens do Claude CLI carregam ~31–38 mil tokens de base por chamada; a faixa NÃO os inclui até haver calibração (`baseDoVendorIncluida: false`). Por isso a estimativa de agora é um piso honesto e não deve ser mostrada como o custo.

## Exemplo calculado (3 colegas Claude, rascunho de texto + 1 imagem 1500×1000, 1ª rodada, `act`)

`decision: ask · round 1 de 2 · rodape: "≈ 3 respostas" · chamadas 4 (3 + consolidação) · tokens 9.098–13.554 (a imagem sozinha: 7.264–8.880 = 1.816–2.220 por chamada, 4 chamadas) · custo 17.694–30.204 micro-USD (≈ US$ 0,018–0,030) · origin: estimate; imagens.origin: calibrated`. O mesmo pedido só com texto: tokens 1.834–4.674, micro-USD 4.074–13.554. A imagem SOZINHA custa mais que o resto da rodada, e é esse tipo de número que o teto de rodadas contém.

## O custo da imagem é MEDIDO (uma medição real)

**2 chamadas reais no haiku (Atlas, 04/11 22:40; `reports/image-cost-real.md`):** a MESMA chamada sem e com uma imagem 1500×1000 foi de 3.031 para 5.049 tokens de entrada: **a imagem custou 2.018 tokens**, e entrou como ESCRITA de cache (cobrada a 1,25× o preço de entrada nessa chamada; nas seguintes da mesma sessão vem do cache a 0,1×). A persona descreveu a imagem corretamente. O código agora usa a regra do vendor (largura × altura ÷ 750, só com o limite de 1568 px no lado maior; **sem** o corte de 1,15 MP nem o teto de 1.600 que eu tinha suposto e que a medição desmentiu) escalada pelo fator medido (2.018 ÷ 2.000): 1500×1000 ⇒ 1.816–2.220 (a faixa cobre a medida). A parte da imagem sai `calibrated` com a base escrita (`imagens.basis`), com a ressalva de **uma** medição (um tamanho, o haiku, a CLI 2.1.318, um PNG de faixas); tamanho desconhecido continua `estimate` e largo (150–3.300). O resto da rodada continua `estimate`. A base do vendor de uma chamada de conversa em `answer-only` medida foi ~3 mil tokens (já dentro das faixas do histórico quando houver). A sessão quente guarda a imagem: um colega que já a viu a paga de novo nos pedidos seguintes da mesma sessão (cache lido). O tempo de uma rodada continua sem medida.

## D-092 / USD-1: a mesma regra na rodada de opinião (05/11)
`budgetOpinionRound` aceita `conta` (a conta de quem pede). O `cost` do orçamento: `microUsd` **só com API** (senão `null`), `referenciaMicroUsd` = o US$ de lista INTERNO (o limite "pedir confirmação acima de X" do host e relatório; nunca numa tela), mais `billing`, `quota` e `impacto`. O `rodape` continua "≈ n respostas · de x a y tokens" (só com os turnos medidos da própria pessoa) e acrescenta, no MESMO critério, "cerca de p% da sua janela …" (assinatura, só com a % calibrada) ou "≈ US$ … (estimativa)" (API). O host passa `accountOf` (a conta do asker) e a recusa de rodada grande diz "passa do que a pessoa aceita usar", sem "custo".
