# Assinatura nunca mostra dólar: o formato do impacto (USD-1 · D-092 · Tally, 05/11)

**Regra (D-092).** Conta de **assinatura** (Claude Pro/Max, ChatGPT…) → a pessoa vê o **impacto na cota** (que parte da janela o pedido usa) e **tokens/chamadas**; **nunca US$**. **US$ só para conta de CHAVE DE API**, rotulado estimativa. O dólar continua existindo INTERNAMENTE (relatórios técnicos, placar do Tally/Probe), nunca no que vai à tela. Este contrato é o que o host manda; o texto exato é da Muse (`design/COTA-NAO-DOLAR-SPEC.md`), as telas são do Lumen (USD-2) e do Flint (CV-8).

## O tipo de conta (`billing`)
| valor | quando | o que a tela pode mostrar |
|---|---|---|
| `'subscription'` | motor CLI logado por conta (OAuth), sem chave de API no ambiente | impacto na cota + tokens + chamadas; **nenhum** US$ |
| `'api'` | motor DSH com chave, ou CLI com chave de API/Bedrock/Vertex/Foundry no ambiente | US$ estimado (rotulado) + tokens + chamadas |
| `'unknown'` | não dá para saber (motor sem sinal de conta) | **como assinatura**: nenhum US$ (o erro seguro é esconder dinheiro, não mostrá-lo) |
Quem decide é `billingOf(motor, env, plano)` (puro, `persona-engine/src/ux/billing.ts`). Trocar de conta troca o `billing` na próxima estimativa; nada fica guardado.

## O que `EstimateAskView` (e a opinião, a revisão e a contratação) passa a ter
```ts
billing: 'subscription' | 'api' | 'unknown'
// SÓ com billing:'api'. Com assinatura/unknown vem null: nenhuma tela consegue mostrar dólar por engano.
custo: { microUsd: { min: number, max: number } } | null
// Assinatura/unknown, quando o fornecedor PUBLICA uma janela. null = nenhuma janela publicada (então só chamadas e tokens).
quota: {
  window: '5h' | 'week'            // a janela que o fornecedor publica: 5h se existir, senão a semana (a conta Max publica só a semana + uma por modelo)
  pct: { min: number, max: number } | null   // quanto do total da janela o pedido usa (0–100, 1 casa). null = "cota não medida"
  usedPct?: number                 // parte da janela JÁ usada agora, oficial (arredondada pelo fornecedor a 1%)
  remainingPct?: number            // 100 − usedPct
  resetsAt?: string                // ISO, quando a janela reinicia
  origin: 'calibrated' | 'not-measured'
  basis?: string                   // de onde veio a calibração ("5 leituras da sua conta")
} | null
// A linha pronta em pt-BR (a Muse pode trocar o texto; a regra de não ter dinheiro fica):
impacto: string
```

## Como o `pct` nasce (e por que hoje ele pode vir null)
- O fornecedor publica **só o % usado de cada janela, a 1%** (medido 05/11: Claude Max → `seven_day` 67% e `model_scoped:Fable` 0%, **sem janela de 5 h**). Não publica a capacidade em tokens.
- O `pct` de um pedido = **tokens estimados ÷ (tokens que movem 1 ponto da janela)**. O segundo número só existe **calibrado na conta da pessoa**: pares de leituras oficiais consecutivas da MESMA janela (sem reinício) com os tokens medidos do ledger entre elas, `calibrateQuota`. Exige ≥ 3 pares com variação ≥ 3 pontos cada; guarda a faixa P25–P75 de tokens/ponto.
- Sem calibração suficiente: `pct: null` + `origin: 'not-measured'` → a tela diz **"cota não medida"** e mostra chamadas/tokens. **Nunca 0%** por ausência. Medido hoje: uma primeira entrega nativa de 309 mil tokens e uma rodada de 61 mil **não mexeram** o 67% da semana (resolução de 1%): a capacidade da semana é muito maior que isso, não dá para calibrar com tão pouco movimento. Honesto > bonito.
- Ressalva que vai no `basis`: o fornecedor pesa os tokens de formas diferentes (leitura de cache é mais barata, saída mais cara); o % é uma **estimativa calibrada**, nunca "medida".
- Se a janela é a da semana, o texto diz "da sua janela da semana", nunca "5 h". Se o fornecedor não publicar janela nenhuma: `quota: null`.

## Rótulos (origin)
`estimate` = nosso cálculo; `calibrated` = calibrado nos números da própria conta (histórico) ou da janela oficial; `measured` só para campo que o fornecedor reportou (`usedPct` é do fornecedor: oficial). US$ sempre estimativa.

## A mesma regra nas outras superfícies
- **Estimar um pedido** (`estimateAsk`): `billing`, `custo` (só api), `quota`, `impacto`.
- **Rodada de opinião** (`opinionBudget`): o `cost` do orçamento perde o `microUsd` fora da conta de API e ganha o mesmo par `billing`/`quota`; o rodapé do cartão ("≈ n respostas · cerca de x% da janela") sai do `footer`.
- **Revisão** (`reviewCost`): idem; o `rotulo` já diz "usa ≈ 1 tarefa curta a mais da sua cota".
- **Contratação**: "≈ n tarefas médias por mês" (já é assim); US$/mês só com api e só se o host medir.
- **Relatórios técnicos** (placar D-068, pareado, token-gate, `reports/*`): continuam em US$ de LISTA como referência interna, com o rótulo "referência de preço de lista, não a cobrança"; não vão à tela.

## Interno (não vai à tela)
`estimateAskReference(input)` devolve `{ screen, referenciaMicroUsd }`: o mesmo resultado da tela + o US$ de lista, para relatório/teste. A tela usa só `estimateAsk`.

## Aceite (testes)
1. Assinatura (e unknown): o objeto que vai à UI **não tem** `microUsd` em lugar nenhum, e nenhum texto dele contém "US$", "$" ou "custo".
2. Chave de API: `custo.microUsd` presente, `impacto` "≈ US$ x–y" rotulado estimativa.
3. Trocar de conta (assinatura → api → assinatura) troca a forma, sem estado preso.
4. Janela só da semana → `window:'week'` e texto "da semana"; janela 5h + semana → `'5h'`; nenhuma janela → `quota: null`.
5. Sem calibração → `pct: null` e "cota não medida" (nunca 0%); com calibração → faixa em % com `calibrated`.

*Quem usa o quê:* Lumen (USD-2) lê `billing`/`quota`/`impacto`; Muse (USD-3) escreve o texto sobre eles; Flint (CV-8) o chip e o rodapé da opinião.

## Estado (05/11 02:05)
**No ar:** `persona-engine/src/ux/billing.ts` (`billingOf`, `quotaImpact`, `calibrateQuota`, `shapeForAccount`, `impactLine`), `estimateAsk` / `budgetOpinionRound` / `reviewCost` com `conta`, o host (`EstimateAskView` com `billing`/`quota`/`impacto`; `OpinionTool` com a conta do asker). Testes: `persona-engine/tests/usd-subscription.spec.ts` (26), `persona-host/tests/usd-subscription.host.spec.ts` (6), `opinion-host.spec.ts` (3 novos).

**Ainda vazio, de propósito:** a calibração da cota. O host guarda só a ÚLTIMA leitura oficial por conta, então não há pares de leituras para `calibrateQuota` e o `pct` vem `null` ("cota não medida") até haver histórico de leituras com variação de ≥ 3 pontos. O que falta (Rivet/Anvil): guardar um rastro curto de (hora, `usedPercent` por janela) a cada leitura oficial e somar os tokens do ledger entre duas leituras. Até lá a tela mostra chamadas e o % USADO oficial da janela, nunca um % inventado.
