# Contrato — calibração do `estimateAsk` pelo histórico da própria pessoa (OPT-9, D-080 c)

Anvil + Tally, 04/11. Dono do host/store: Anvil. Dono de `estimate-ask.ts`: Tally. Pedido do Atlas (P1).

## Regra

O `estimateAsk` calibra com o que **esta pessoa já gastou neste computador**, lido do `turn_ledger`. Os números da máquina de dev
(`persona-spec/baselines/pair-real-calibration.json`) **nunca** são o padrão do host: só referência de desenvolvimento, rotulada.
Sem histórico suficiente o campo fica **ausente** e a estimativa diz "não sei" (tempo) ou cai na estimativa sem base (tokens).
Nada é inventado; `origin: 'calibrated'` só quando houver pelo menos um campo vindo do histórico.

## O que o ledger tem hoje (verificado no código, 04/11)

| dado | no `turn_ledger`? | observação |
|---|---|---|
| tokens medidos (entrada, saída, cache) por turno | sim (`origin='measured'`) | a CLI reportou |
| motor e conta (`engine`, `account_id`) | sim | `account_id` pode ser nulo |
| tipo do turno (`kind`: reply, execution, triage…) | sim | |
| **duração do turno** | **NÃO** | falta coluna; **precisa ser gravada** (abaixo) |
| camadas do nosso prompt (`layer_*`) | colunas existem, mas o host grava `EMPTY_LAYERS` (zeros) | por isso `vendorBaseTokens = entrada − nosso prompt` **não** é calculável do histórico hoje |

Consequência: a base do vendor **não** é derivada por subtração. Em vez dela, o host entrega o que foi **medido por chamada** (a entrada
medida já inclui a base do vendor), por tipo, motor e conta.

## Cadeia de mudanças (quem faz o quê)

1. **Store (Anvil)** — migração v20: `turn_ledger.duration_ms INTEGER NULL (>= 0)`; `TurnLedgerRepos.put/list` leem e gravam `durationMs?`.
2. **Core (Forge)** — `TurnLedgerEntry.durationMs?: number` (opcional; `assertTurnEntry` aceita ausente e exige inteiro ≥ 0 quando presente).
3. **Runners (Rivet)** — `MeasuredUsage.durationMs?: number`: em `withUsageMeter` (usage-meter.ts), `ended.at − started.at` do mesmo turno
   (ms, inteiro, ≥ 0). Ausente quando o turno não emitiu `started`. Nunca 0 inventado.
4. **Host (Bolt, 1 linha, em orchestration.ts `usage.record` → `recordLedger`)** — repassar `...(entry.durationMs === undefined ? {} : { durationMs: entry.durationMs })`.
   Até lá, o host grava duração só quando ela chega; linhas antigas ficam sem duração (nunca preenchidas depois).
5. **Host (Anvil)** — `calibration.ts`: `calibrationFromLedger(entries, scope)` + o `estimateAsk` passa `calibracao` ao engine.
6. **Engine (Tally)** — `AskCalibration` ganha `tokensPerCall` (abaixo) e `samples`; `estimateAsk` usa `tokensPerCall` no lugar de "estimativa + base" quando existir.

## Como o host calcula

- **Escopo da amostra:** linhas `origin='measured'` do **mesmo projeto**, mesmo **motor**; se o motor/conta atual tem `account_id`, só da **mesma conta**
  (linha sem conta conta para a conta atual só se a persona não tem conta fixa). Janela: últimas **50** linhas por tipo e no máximo **30 dias**.
- **Mínimo de amostras:** **5** por tipo. Menos que isso, o campo daquele tipo fica ausente (a pessoa ainda "não tem histórico").
- **Mediana e faixa:** mediana (`mediana`) e quartis (faixa = P25..P75, para não ser refém de um turno atípico). Interpolação linear entre vizinhos.
- **Tipos:** `reply` → `conversa`; `execution` → `execucao`; `triage` → `triagem`. Outros tipos (initiative, librarian, watchdog, evaluation) não calibram o pedido.
- **Tempo** (`secondsPerCall`): só linhas com `duration_ms`; segundos, com a mesma `Range` do engine; `mediana` junto.
- **Tokens** (`tokensPerCall`): entrada medida = `inputTokens + cacheReadTokens + cacheWriteTokens`; saída = `outputTokens`; faixa P25..P75 por tipo.

```ts
interface AskCalibration {            // engine (Tally) — campos antigos mantidos
  readonly vendorBaseTokens?: number  // NÃO preenchido pelo host (sem camadas medidas); só a pareada de dev
  readonly tokenizerRatio?: number    // idem
  readonly secondsPerCall?: { conversa?: Range; execucao?: Range; triagem?: Range }
  // NOVOS (OPT-9):
  readonly mediana?: { conversa?: number; execucao?: number; triagem?: number }          // segundos
  readonly tokensPerCall?: { conversa?: CallTokens; execucao?: CallTokens; triagem?: CallTokens }
  readonly samples?: { conversa?: Samples; execucao?: Samples; triagem?: Samples }       // linhas por afirmação
  readonly source?: 'history' | 'dev-reference'                                          // host só manda 'history'
}
interface CallTokens { readonly input: Range; readonly output: Range }                   // por chamada, medidos
interface Samples { readonly tokens: number; readonly tempo: number }                     // tokens: linhas medidas; tempo: linhas COM duração (0 = sem tempo)
```

## Honestidade (valem para a tela)

1. `origin` vira `calibrated` e o `motivo` cita a base: "pelas suas últimas {n} conversas, a resposta levou de {a} a {b}" (a forma é da Muse).
2. Sem amostra mínima: tempo `null`, `origin` não muda para `calibrated` por causa desse tipo, e o rótulo não escreve minutos.
3. Histórico de **outro motor ou outra conta** não serve: trocar de conta recomeça a amostra daquela conta.
4. Nenhuma linha é editada ou preenchida depois; duração ausente fica ausente.
5. Privacidade: só números (tokens, ms, tipo, motor, conta). Nenhum texto de prompt entra na calibração.

## Estado (Anvil, 04/11)

Feito e provado: store v20 (`duration_ms`, linhas antigas intactas), `persona-host/src/estimate-calibration.ts` (funções puras), Remote `estimateAsk` passando `calibracao` (só leitura; conta = `active_account` gravada, nunca `seatForPersona`, que tem efeitos), `TurnLedgerView.durationMs?`. O engine já consome `secondsPerCall` (tempo medido → `origin: calibrated`); `tokensPerCall`/`mediana`/`samples` aguardam o Tally.
**Dependem de outros donos para os dados chegarem ao ledger:** Rivet (`MeasuredUsage.durationMs` em `withUsageMeter`) e Bolt (1 linha em `orchestration.ts` repassando-o). Até lá o ledger só tem tokens, e o tempo continua "não sei".

**Engine (Tally, 04/11) — FEITO.** `estimateAsk` consome `source`, `tokensPerCall`, `mediana`, `samples` como na tabela de `estimate-ask.md`: histórico só com `source: 'history'` e ≥ 5 linhas declaradas por afirmação; `vendorBaseTokens`/`tokenizerRatio` ignorados nesse caminho; `fonte` (`historico` | `referencia-dev`), `amostras` e `tempo.mediana` no resultado; `motivo` cita n. **Pedido ao Anvil:** espelhar `fonte?`, `amostras?` e `tempo.mediana?` em `EstimateAskView` (`persona-host/src/types.ts`; hoje o Remote devolve o objeto do engine e os campos passam em tempo de execução, mas o tipo do cliente não os vê).

## Prova

- store: `tests/ledger.spec.ts` (duração grava/lê/aceita ausente; migração v19→v20 preserva linhas).
- host: `tests/estimate-calibration.spec.ts` (mínimo de 5; mediana/quartis; filtro por motor e conta; janela de 30 dias; sem histórico = ausente;
  `estimateAsk` do host recebe a calibração e **zero runners** são resolvidos).
- engine: `persona-engine/tests/estimate-ask.spec.ts` (27: caminho do histórico, piso de 5 amostras, sem contagem = ignora, sem `source` = não é histórico, base de dev nunca misturada, mediana centra o rótulo, faixa de custo piso/teto, só uma das chamadas com histórico).
- host de ponta a ponta: `persona-host/tests/estimate-history-tokens.spec.ts` (5: conversa pelas linhas `reply`, trabalho pelas linhas `execution` sem vazar as de conversa, tokens sem duração = tempo "não sei", 4 linhas = estimativa e 5 = histórico, e a guarda de que nada do host/engine lê `pair-real-calibration.json`).
