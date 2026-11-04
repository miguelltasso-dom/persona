/**
 * OPT-8 on the faithful runner: the −40% goal, the cache goal, idle-zero and the paired
 * "CLI direct × Persona" comparison, with the vendor base context (system prompt + tool
 * schema every CLI call carries) as an EXPLICIT parameter. The base is not measurable offline;
 * it is varied, never hidden. Every number is an estimate (origin `estimate`).
 */

import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import {
  CACHE_WRITE_FACTOR_1H,
  LEVERS_AS_WIRED,
  LEVERS_BEFORE_WIRING,
  LEVERS_LEGACY,
  LEVERS_OPTIMIZED,
  TIER_PRICE,
  runFaithfulScenario,
  type FaithfulReport,
  type FaithfulScenarioId,
  type LeverSet,
} from './token-faithful.ts'
import { engineCacheTable } from './token-gate.ts'

/** Cache read costs 10% of an input token (list price shape). */
const CACHE_READ_FACTOR = 0.1

export interface CutRow {
  readonly scenario: FaithfulScenarioId
  readonly naiveTokens: number
  readonly todayTokens: number
  /** The host now, after W1 and W4. */
  readonly nowTokens: number
  readonly allTokens: number
  readonly naiveCost: number
  readonly todayCost: number
  readonly nowCost: number
  readonly allCost: number
  /** 1 − all/today. Positive = saving. */
  readonly tokenCutVsToday: number
  readonly costCutVsToday: number
  readonly tokenCutVsNaive: number
  readonly costCutVsNaive: number
}

/** Scenarios that spend a model (idle ones are covered by idle-zero). */
export const CUT_SCENARIOS: readonly FaithfulScenarioId[] = [
  'geral-simple',
  'multi-review',
  'padaria-lua',
  'dia-padaria',
  'dia-espacado',
]

function cut(before: number, after: number): number {
  return before === 0 ? 0 : 1 - after / before
}

/**
 * Before/after per scenario: naive harness → host today → every lever.
 * @returns One row per {@link CUT_SCENARIOS}.
 */
export function cutRows(): CutRow[] {
  return CUT_SCENARIOS.map((scenario) => {
    const naive = runFaithfulScenario(scenario, LEVERS_LEGACY)
    const today = runFaithfulScenario(scenario, LEVERS_BEFORE_WIRING)
    const now = runFaithfulScenario(scenario, LEVERS_AS_WIRED)
    const all = runFaithfulScenario(scenario, LEVERS_OPTIMIZED)
    return {
      scenario,
      naiveTokens: naive.totalTokens,
      todayTokens: today.totalTokens,
      nowTokens: now.totalTokens,
      allTokens: all.totalTokens,
      naiveCost: naive.costMicroUsd,
      todayCost: today.costMicroUsd,
      nowCost: now.costMicroUsd,
      allCost: all.costMicroUsd,
      tokenCutVsToday: cut(today.totalTokens, all.totalTokens),
      costCutVsToday: cut(today.costMicroUsd, all.costMicroUsd),
      tokenCutVsNaive: cut(naive.totalTokens, all.totalTokens),
      costCutVsNaive: cut(naive.costMicroUsd, all.costMicroUsd),
    }
  })
}

export interface TtlRow {
  readonly scenario: FaithfulScenarioId
  readonly cacheTtlMin: number
  /** Cache write price × input price: 1.25 for the 5 min cache, 2 for the 1 h cache. */
  readonly writeFactor: number
  readonly tokens: number
  readonly costMicroUsd: number
  readonly prefixHit: number
}

/**
 * The same day with the provider cache TTL varied: how much the burst shape was flattering us.
 * @returns Rows for the burst day (1 min between lines) and the spread day (30 min), TTL 5 and 60.
 */
export function ttlSensitivity(): TtlRow[] {
  const rows: TtlRow[] = []
  for (const scenario of ['dia-padaria', 'dia-espacado'] as const) {
    for (const [cacheTtlMin, writeFactor] of [[5, 1.25], [60, CACHE_WRITE_FACTOR_1H]] as const) {
      const report = runFaithfulScenario(scenario, LEVERS_AS_WIRED, { cacheTtlMin, cacheWriteFactor: writeFactor })
      rows.push({ scenario, cacheTtlMin, writeFactor, tokens: report.totalTokens, costMicroUsd: report.costMicroUsd, prefixHit: report.prefixHitRate })
    }
  }
  return rows
}

/** Why a lever is or is not counted. */
export type LeverStatus = 'wired' | 'off-until-real-run' | 'needs-product-decision' | 'only-api-key' | 'rejected' | 'projection'

export interface LeverCandidate {
  readonly id: string
  readonly label: string
  readonly status: LeverStatus
  /** Who edits the file that would wire it. */
  readonly owner: string
  /** What can go wrong for the person. */
  readonly risk: string
  /** Cost and tokens cut vs the host before the wirings, on the two days. */
  readonly burstCostCut: number
  readonly spreadCostCut: number
  readonly burstTokenCut: number
  readonly spreadTokenCut: number
  readonly calls: number
  readonly quality: boolean
}

function dayCuts(levers: LeverSet, options: Parameters<typeof runFaithfulScenario>[2] = {}): Pick<LeverCandidate, 'burstCostCut' | 'spreadCostCut' | 'burstTokenCut' | 'spreadTokenCut' | 'calls' | 'quality'> {
  const burstBase = runFaithfulScenario('dia-padaria', LEVERS_BEFORE_WIRING)
  const spreadBase = runFaithfulScenario('dia-espacado', LEVERS_BEFORE_WIRING)
  const burst = runFaithfulScenario('dia-padaria', levers, options)
  const spread = runFaithfulScenario('dia-espacado', levers, options)
  return {
    burstCostCut: cut(burstBase.costMicroUsd, burst.costMicroUsd),
    spreadCostCut: cut(spreadBase.costMicroUsd, spread.costMicroUsd),
    burstTokenCut: cut(burstBase.totalTokens, burst.totalTokens),
    spreadTokenCut: cut(spreadBase.totalTokens, spread.totalTokens),
    calls: burst.calls,
    quality: burst.quality.score >= 1 && spread.quality.score >= 1,
  }
}

/**
 * The levers still open against the −40% cost goal, each measured on the same two days vs the host
 * before the wirings (D-068). Statuses say which ones can honestly be counted: every row is an
 * ESTIMATE; W3 stays "projeção" until the real paired run, and the 1 h cache only exists for API-key CLIs.
 * Rows after `skip-triage` are measured ON TOP of the host as it is now (skipTriage on).
 * @returns One row per candidate, in the order the Atlas asked (a → d).
 */
export function leverCandidates(): LeverCandidate[] {
  const oneHour = { cacheTtlMin: 60, cacheWriteFactor: CACHE_WRITE_FACTOR_1H }
  return [
    { id: 'w1-w4', label: 'W1 + W4 (no host desde as 14h)', status: 'wired', owner: 'Tally/Anvil', risk: 'nenhum novo', ...dayCuts({ ...LEVERS_AS_WIRED, skipTriage: false, courtesyNoModel: false }) },
    { id: 'skip-triage', label: '(d) sem a chamada de triagem (D-073, ligada)', status: 'wired', owner: 'Anvil (orchestration.ts runLaunched), ligada pelo Tally', risk: 'se um dia as ferramentas MCP forem ligadas aos adapters, religar a triagem (flag skipTriage)', ...dayCuts({ ...LEVERS_AS_WIRED, courtesyNoModel: false }) },
    { id: 'courtesy-free', label: '(e) cortesia ("valeu!", "ok") com reação da persona, sem modelo (D-075, ligada)', status: 'wired', owner: 'Anvil (orchestration.ts ingest), ligada pelo Tally', risk: 'a persona reage com um sticker em vez de escrever; nunca engole um "ok" que responde pergunta pendente; cortesia + pedido = trabalho (flag courtesyNoModel)', ...dayCuts(LEVERS_AS_WIRED) },
    { id: 'cache-1h', label: '(b) cache de 1 h (ENABLE_PROMPT_CACHING_1H)', status: 'only-api-key', owner: 'Rivet (ambiente do spawn da CLI)', risk: 'sem ganho nos prompts da Persona (escrita 2× > desconto de leitura); o ganho está na base do vendor, que os dois braços levam; só com chave de API (Bedrock/Vertex/Foundry): a assinatura (OAuth) fica fora', ...dayCuts(LEVERS_AS_WIRED, oneHour) },
    { id: 'w3', label: '(a) W3: relato curto do executor (todas as alavancas)', status: 'off-until-real-run', owner: 'Rivet (runners) + Anvil (flag no host)', risk: 'relato curto demais perde o critério de pronto — a rodada pareada mede', ...dayCuts(LEVERS_OPTIMIZED) },
  ]
}

/**
 * Cost of keeping a cache warm with a ping every TTL against letting it expire and rewriting it.
 * Cheaper in micro-USD does NOT make it allowed: every ping is a model call (it spends subscription quota
 * and breaks "zero calls with an idle team"), so the verdict names the calls it adds.
 * @param input - Tokens the warm prefix holds (vendor base included), the gap between messages and the TTL.
 */
export function keepWarmEconomics(input: { readonly prefixTokens: number; readonly gapMin: number; readonly ttlMin: number }): {
  readonly pings: number
  readonly keepWarmMicroUsd: number
  readonly rewriteMicroUsd: number
  readonly cheaperInMoney: boolean
  readonly callsAdded: number
} {
  const price = TIER_PRICE.persona
  const pings = Math.max(0, Math.ceil(input.gapMin / input.ttlMin) - 1)
  // A ping reads the prefix (0.1×) and answers one short token; the next real message then reads it too.
  const keepWarmMicroUsd = pings * (input.prefixTokens * price.input * CACHE_READ_FACTOR + price.output)
  // Without pings the next message rewrites the prefix (write 1.25×) instead of reading it (0.1×).
  const rewriteMicroUsd = pings === 0 ? 0 : input.prefixTokens * price.input * (1.25 - CACHE_READ_FACTOR)
  return { pings, keepWarmMicroUsd: Math.round(keepWarmMicroUsd), rewriteMicroUsd: Math.round(rewriteMicroUsd), cheaperInMoney: pings > 0 && keepWarmMicroUsd < rewriteMicroUsd, callsAdded: pings }
}

/** Upper bound for "smaller model on every worker turn": the execution turns of the day at the cheap tier price (1/3). NOT a lever until the rule is measured on a real model. */
export function executionOnCheapBound(day: 'dia-padaria' | 'dia-espacado'): { readonly saving: number; readonly executionShare: number } {
  const report = runFaithfulScenario(day, LEVERS_AS_WIRED)
  const execution = report.turns.filter(turn => turn.entry.kind === 'execution').reduce((sum, turn) => sum + turn.costMicroUsd, 0)
  const ratio = TIER_PRICE.cheap.input / TIER_PRICE.persona.input
  return { saving: execution * (1 - ratio) / report.costMicroUsd, executionShare: execution / report.costMicroUsd }
}

export interface PairedFaithfulRow {
  readonly task: 'simple-ask' | 'multi-review' | 'research-summary'
  readonly vendorBaseTokens: number
  readonly cliCalls: number
  readonly personaCalls: number
  /** Ledger convention: input (cache reads included) + output. */
  readonly cliTokens: number
  readonly personaTokens: number
  /** Input not served from cache + output. */
  readonly cliFresh: number
  readonly personaFresh: number
  /** Cache-weighted cost in micro-USD, same model on both arms. */
  readonly cliCost: number
  readonly personaCost: number
  readonly tokenDelta: number
  readonly freshDelta: number
  readonly costDelta: number
}

interface PairTask {
  readonly task: PairedFaithfulRow['task']
  readonly scenario: FaithfulScenarioId
  readonly prompt: string
  /** What a person would have to paste to the CLI for it to know what Persona already remembers. */
  readonly evidence: string
}

const PAIR_TASKS: readonly PairTask[] = [
  { task: 'simple-ask', scenario: 'geral-question', prompt: 'Qual o horário do standup?', evidence: 'A equipe tem standup às 10h no canal #geral, todos os dias úteis.' },
  { task: 'multi-review', scenario: 'multi-review', prompt: 'Implemente o filtro de pedidos e peça revisão.', evidence: 'Critério: filtro por data e status funcionando, com teste e revisão.' },
  { task: 'research-summary', scenario: 'padaria-lua', prompt: 'Cardápio de sábado e encomenda da Ana.', evidence: 'Ana: 40 pães de fermentação natural e 1 bolo de fubá, retirada às 9h.' },
]

/** Same model on both arms (the paired spec): the host as wired today, no cheap routing on the Persona arm. */
const SAME_MODEL: LeverSet = { ...LEVERS_AS_WIRED, talkOnCheap: false, supportOnCheap: false }

function personaCostWithBase(report: FaithfulReport, base: number): number {
  const price = TIER_PRICE.persona
  let cost = 0
  for (const turn of report.turns) {
    // The vendor base rides in every CLI call; after the first call of the day it is a cache read.
    cost += turn.costMicroUsd + base * price.input * CACHE_READ_FACTOR
  }
  return Math.round(cost)
}

/**
 * Paired comparison with a vendor base context `base` on every CLI call (cache read in steady state).
 * @param base - Tokens of the vendor system prompt + tool schema (NOT measurable offline).
 * @returns One row per task. Deltas are Persona ÷ CLI − 1.
 */
export function pairedFaithful(base: number): PairedFaithfulRow[] {
  return PAIR_TASKS.map((item) => {
    const persona = runFaithfulScenario(item.scenario, SAME_MODEL, { warm: true })
    const out = estimateTokens(persona.finalText)
    const directInput = base + estimateTokens(item.prompt) + estimateTokens(item.evidence)
    const price = TIER_PRICE.persona
    const cliTokens = directInput + out
    const cliFresh = (directInput - base) + out
    const cliCost = Math.round((directInput - base) * price.input + base * price.input * CACHE_READ_FACTOR + out * price.output)
    const personaTokens = persona.totalTokens + base * persona.calls
    const personaFresh = persona.freshTokens
    const personaCost = personaCostWithBase(persona, base)
    return {
      task: item.task,
      vendorBaseTokens: base,
      cliCalls: 1,
      personaCalls: persona.calls,
      cliTokens,
      personaTokens,
      cliFresh,
      personaFresh,
      cliCost,
      personaCost,
      tokenDelta: personaTokens / cliTokens - 1,
      freshDelta: personaFresh / cliFresh - 1,
      costDelta: personaCost / cliCost - 1,
    }
  })
}

export interface CacheEngineRow {
  readonly engine: string
  readonly prefixHit: number | undefined
}

export interface Opt8Faithful {
  readonly idleZero: boolean
  readonly cacheEngines: readonly CacheEngineRow[]
  readonly cache60: boolean
  readonly cuts: readonly CutRow[]
  /** The −40% goal is read on the WORSE of the two days (burst and spread), so a flattering shape cannot pass it. */
  readonly dayTokenCut: number
  readonly dayCostCut: number
  readonly burstDayCostCut: number
  readonly spreadDayCostCut: number
  readonly cutTokens40: boolean
  readonly cutCost40: boolean
}

/**
 * OPT-8 goals on the faithful runner.
 * @returns Pass/fail per goal; the −40% is split into tokens and estimated cost.
 */
export function measureOpt8Faithful(): Opt8Faithful {
  const idle = runFaithfulScenario('idle-routines').calls === 0 && runFaithfulScenario('initiative-30').calls === 0
  const engines = engineCacheTable()
  const cuts = cutRows()
  const burst = cuts.find(row => row.scenario === 'dia-padaria')
  const spread = cuts.find(row => row.scenario === 'dia-espacado')
  const dayTokenCut = Math.min(burst?.tokenCutVsToday ?? 0, spread?.tokenCutVsToday ?? 0)
  const dayCostCut = Math.min(burst?.costCutVsToday ?? 0, spread?.costCutVsToday ?? 0)
  return {
    idleZero: idle,
    cacheEngines: engines.map(row => ({ engine: row.engine, prefixHit: row.reported ? row.optimizedPrefixHit : undefined })),
    cache60: engines.filter(row => row.reported).every(row => row.optimizedPrefixHit >= 0.6),
    cuts,
    dayTokenCut,
    dayCostCut,
    burstDayCostCut: burst?.costCutVsToday ?? 0,
    spreadDayCostCut: spread?.costCutVsToday ?? 0,
    cutTokens40: dayTokenCut >= 0.4,
    cutCost40: dayCostCut >= 0.4,
  }
}

function pct(value: number): string {
  return `${value >= 0 ? '+' : ''}${String(Math.round(value * 100))}%`
}

/**
 * Markdown for `persona-spec/reports/opt8-faithful.md`.
 * @returns Report text (pt-BR).
 */
export function formatOpt8FaithfulMarkdown(): string {
  const result = measureOpt8Faithful()
  const rows = result.cuts.map(row =>
    `| ${row.scenario} | ${String(row.naiveTokens)} → ${String(row.todayTokens)} → ${String(row.nowTokens)} → ${String(row.allTokens)} | ${pct(-row.tokenCutVsToday)} / ${pct(-row.tokenCutVsNaive)} | ${String(row.naiveCost)} → ${String(row.todayCost)} → ${String(row.nowCost)} → ${String(row.allCost)} | ${pct(-row.costCutVsToday)} / ${pct(-row.costCutVsNaive)} |`)
  const bases = [0, 12_000]
  const big = pairedFaithful(12_000)
  const one = big.find(row => row.task === 'simple-ask')
  const many = big.filter(row => row.personaCalls > 1)
  const manyCost = many.map(row => pct(row.costDelta)).join(' / ')
  const pairs = bases.flatMap(base => pairedFaithful(base).map(row =>
    `| ${row.task} | ${String(base)} | ${String(row.cliCalls)} / ${String(row.personaCalls)} | ${String(row.cliTokens)} / ${String(row.personaTokens)} (${pct(row.tokenDelta)}) | ${String(row.cliFresh)} / ${String(row.personaFresh)} (${pct(row.freshDelta)}) | ${String(row.cliCost)} / ${String(row.personaCost)} (${pct(row.costDelta)}) |`))
  return [
    '# OPT-8 — aceite no runner fiel (Tally, 04/11)',
    '',
    'Estimativa offline (`origin: estimate`); zero CLI real. Fonte: `persona-engine/src/bench/{token-faithful,opt8-faithful}.ts`.',
    '',
    '| meta | resultado |',
    '|---|---|',
    `| zero chamadas com equipe ociosa sem objetivo | ${result.idleZero ? 'passou (idle-routines e initiative-30 = 0)' : 'FALHOU'} |`,
    `| ≥ 60% de cache no prefixo (motores que reportam) | ${result.cache60 ? 'passou' : 'FALHOU'} — ${result.cacheEngines.map(row => `${row.engine} ${row.prefixHit === undefined ? 'n/d' : row.prefixHit.toFixed(2)}`).join(' · ')} |`,
    `| −40% **tokens** por tarefa (pior dos dois dias, host antes das ligações → todas as alavancas) | ${result.cutTokens40 ? 'passou' : 'NÃO atingido'} (${pct(-result.dayTokenCut)}) |`,
    `| −40% **custo estimado** por tarefa (pior dos dois dias, host antes das ligações → todas as alavancas) | ${result.cutCost40 ? 'passou' : 'NÃO atingido'} (rajada ${pct(-result.burstDayCostCut)} · espalhado ${pct(-result.spreadDayCostCut)}) — W1 e W4 já estão ligadas; falta a W3 (desligada até a rodada real); a triagem sem retorno lido (skipTriage, D-073) e a cortesia com reação (D-075) já estão ligadas, ver \`token-wiring.md\` |`,
    '',
    '## Ingênuo → host antes das ligações → host agora → todas as alavancas',
    '',
    'Δ: antes das ligações → todas / ingênuo → todas. "Antes das ligações" é o host das 13:30 (recall cortado pela cabeça, triagem no runner da executora); "agora" tem W1 e W4.',
    '',
    '| cenário | tokens (ingênuo → antes → agora → todas) | Δ tokens | custo µUSD (ingênuo → antes → agora → todas) | Δ custo |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '## O dia espaçado (cache de 5 min e sessão de 10 min expiram entre as mensagens)',
    '',
    'Mesmo dia de 7 mensagens, host de agora: em rajada (1 min entre linhas) × espalhado (30 min). O TTL do cache do provedor é parâmetro (5 min é o padrão do cache efêmero; 60 min é o cache estendido) — **a medir** no vendor.',
    '',
    '| cenário | TTL do cache | tokens | custo µUSD | prefixo em cache |',
    '|---|---:|---:|---:|---:|',
    ...ttlSensitivity().map(row => `| ${row.scenario} | ${String(row.cacheTtlMin)} min (escrita ×${String(row.writeFactor)}) | ${String(row.tokens)} | ${String(row.costMicroUsd)} | ${row.prefixHit.toFixed(2)} |`),
    '',
    'Leitura: num time que escreve ao longo do dia, o cache de 5 min não pega (o prefixo é regravado a cada mensagem) e a sessão aquecida de 10 min também expira — o prompt de coordenação (~500 tokens) volta em toda triagem. A meta de ≥ 60% de cache no prefixo só vale em uso contínuo ou com cache estendido. Nesse regime o que pesa é o **tamanho do prefixo** (persona, coordenação, ferramentas) e o **número de chamadas**.',
    '',
    ...formatLeverSection(),
    '## Pareado CLI direta × Persona (mesma CLI/modelo)',
    '',
    'A base do vendor (system prompt + esquema de ferramentas que **cada chamada de CLI** leva) não é mensurável offline: está como parâmetro (0 = só o que a Persona acrescenta; 12 000 = ordem de grandeza suposta, **a medir**). A CLI direta recebe a evidência colada na mensagem (o que a Persona já lembra). Regime de **dia corrente** (a tarefa não é a primeira do dia: prefixo e sessões quentes nos dois braços). Tokens = entrada (com cache) + saída; "novos" = entrada fora do cache + saída; custo = ponderado por cache, mesmo modelo nos dois braços.',
    '',
    '| tarefa | base | chamadas CLI / Persona | tokens CLI / Persona | tokens novos CLI / Persona | custo µUSD CLI / Persona |',
    '|---|---:|---|---|---|---|',
    ...pairs,
    '',
    'Leitura (o que este quadro prova e o que não prova):',
    '',
    `- Tarefa de **uma** chamada (simple-ask, base 12 000): tokens ${pct(one?.tokenDelta ?? 0)}, tokens novos ${pct(one?.freshDelta ?? 0)}, custo ${pct(one?.costDelta ?? 0)} — ${Math.abs(one?.costDelta ?? 1) <= 0.1 && Math.abs(one?.tokenDelta ?? 1) <= 0.1 ? 'dentro' : 'FORA'} da paridade ±10%.`,
    `- Tarefa de **várias** chamadas (${many.map(row => row.task).join(', ')}): cada chamada da Persona relê a base do vendor (10% do preço, mas conta no total de tokens). Com base 12 000 o custo fica ${manyCost} sobre a CLI direta **tratada como uma chamada**. Isso é um piso para a CLI direta: um agente de CLI faz vários passos internos por tarefa e cada passo também relê a base, então a lacuna real é menor; **só uma rodada pareada com CLI real decide** (PERSONA_PAIR_REAL=1, liberação do Atlas).`,
    '- O que a Persona controla é o **número de chamadas por tarefa** e o que cada uma carrega: pré-roteador (courtesy sem modelo), primeira entrega em um turno, triagem barata (e o host já trata mensagens seguidas no mesmo canal como follow-ups da Tarefa viva, sem nova triagem). O "+5,7–6,3%" do relato anterior vinha de uma fórmula (`armTokens`), não de prompts reais; este quadro o substitui.',
    '',
    '`cut-40` real (livro vivo `measured`) continua dependendo de uma rodada com CLI real, que só o Atlas libera (`PERSONA_PAIR_REAL=1`).',
    '',
    '```',
    'node --import tsx/esm packages/persona/persona-engine/scripts/write-opt8-faithful.ts',
    '```',
    '',
  ].join('\n')
}

function formatLeverSection(): string[] {
  const rows = leverCandidates().map(row =>
    '| ' + row.label + ' | ' + row.status + ' | ' + row.owner + ' | ' + pct(-row.burstCostCut) + ' / ' + pct(-row.spreadCostCut) + ' | ' + pct(-row.burstTokenCut) + ' / ' + pct(-row.spreadTokenCut) + ' | ' + String(row.calls) + ' | ' + row.risk + ' |')
  const burst = executionOnCheapBound('dia-padaria')
  const spread = executionOnCheapBound('dia-espacado')
  const warm = keepWarmEconomics({ prefixTokens: 12_000, gapMin: 30, ttlMin: 5 })
  const bare = keepWarmEconomics({ prefixTokens: 1000, gapMin: 30, ttlMin: 5 })
  // The spread day has 7 messages: what the Persona prompts cost per message.
  const perMessage = runFaithfulScenario('dia-espacado', LEVERS_AS_WIRED).costMicroUsd / 7
  return [
    '## O que falta para os −40% de custo (fila 2 do Atlas)',
    '',
    'Corte de custo estimado contra o host antes das ligações (D-068), na rajada / no dia espaçado; a coluna de tokens é o corte de tokens. As linhas depois da triagem são medidas SOBRE o host de agora (com a triagem pulada). Tudo é estimativa (`origin: estimate`); nada abaixo conta como ligado a menos que o status diga `wired`.',
    '',
    '| alavanca | status | quem liga | custo (rajada / espaçado) | tokens (rajada / espaçado) | chamadas | risco para a pessoa |',
    '|---|---|---|---|---|---:|---|',
    ...rows,
    '',
    '- **(b) cache que sobrevive ao dia espaçado.** A Claude Code só expõe TTL de 1 h por `ENABLE_PROMPT_CACHING_1H` com chave de API (Bedrock/Vertex/Foundry); sessões de assinatura (OAuth) ficam de fora, e há relato de que a variável não vale no Windows. Com a escrita a 2× o desconto de leitura não paga nos prompts da Persona (linha acima). O que o 1 h compra é a **base do vendor**: com 12 000 tokens de base, reescrevê-la após cada intervalo custa ' + String(warm.rewriteMicroUsd) + ' µUSD por mensagem (≈ ' + String(Math.round(warm.rewriteMicroUsd / perMessage)) + '× o custo dos prompts da Persona numa mensagem), contra leitura a 10%. Isso pesa nos dois braços e **a rodada pareada mede a base**; não entra na conta do −40% (que exclui a base).',
    '- **Manter aquecido (keep-alive) está recusado.** Um ping a cada 5 min custa menos que reescrever (base 12 000, intervalo de 30 min: ' + String(warm.keepWarmMicroUsd) + ' contra ' + String(warm.rewriteMicroUsd) + ' µUSD; com prefixo de 1 000 tokens: ' + String(bare.keepWarmMicroUsd) + ' contra ' + String(bare.rewriteMicroUsd) + '), mas cada ping é uma chamada de modelo: gasta a cota da assinatura e quebra "zero chamadas com a equipe ociosa". Só se aceitaria dentro de uma tarefa em andamento, e aí a sessão aquecida (10 min) já cobre.',
    '- **(c) modelo menor por tarefa.** Teto, não alavanca: se **todos** os turnos do executor fossem para o nível barato, o custo cairia ' + pct(-burst.saving) + ' (rajada) / ' + pct(-spread.saving) + ' (espaçado) a partir do host de agora; o executor é ' + String(Math.round(burst.executionShare * 100)) + '% / ' + String(Math.round(spread.executionShare * 100)) + '% do custo. A pergunta curta, o resumo curto e a triagem já vão para o nível barato (W1 e talk). O resto depende de quantas tarefas do executor são simples; a qualidade só se prova num modelo real (o roteiro do bench repete o que o prompt traz, então marcaria 1,00 de qualquer jeito).',
    '- **(d) menos releituras da base.** A alavanca real foi a triagem sem retorno lido (`skipTriage`, ligada em D-073): 9 → 6 chamadas por dia, e cada chamada relê a base do vendor. Não existe turno de avaliação no host (o relatório antigo o modelava; foi retirado), e a revisão é uma segunda mensagem ao Bento, não um estágio que dê para fundir.',
    '- **(e) cortesia sem chamada de modelo (D-075, ligada).** O pré-roteador classifica "valeu!" e "ok" como cortesia (`react`, sem modelo), mas o host ainda rodava `finishReply` e pagava **uma chamada de conversa no nível barato** por cortesia (sonda no host em 04/11: oi, obrigado, valeu! e ok = 1 entrega cada); o bench antigo contava essa linha como grátis. Agora a persona **reage** com um sticker (coração para agradecimento, joinha para o resto) sem modelo e sem Ticket, salvo quando há algo pendente dela para a pessoa no fio (Attention do Ticket ou a última linha dela termina em "?") ou quando a cortesia vem junto de um pedido. Flag `courtesyNoModel` (Anvil, `orchestration.ts`).',
    '',
  ]
}

/** True only when every lever the host runs equals the full set (W1–W5 all on). Numbers alone cannot say this. */
export function allLeversWired(): boolean {
  return (Object.keys(LEVERS_OPTIMIZED) as (keyof LeverSet)[]).every(key => LEVERS_AS_WIRED[key] === LEVERS_OPTIMIZED[key])
}

function qualityHeld(levers: LeverSet): boolean {
  return CUT_SCENARIOS.every(id => runFaithfulScenario(id, levers).quality.score >= 1)
}

/** What the D-068 helper (`src/opt8-measured.ts`, Forge) is fed: rows, wiring truth and quality per bucket. */
export interface Opt8MeasuredInputs {
  readonly rows: readonly CutRow[]
  readonly allLeversWired: boolean
  readonly quality: {
    readonly beforeWiring: boolean
    readonly asWired: boolean
    readonly projectionAll: boolean
  }
  readonly idleZero: boolean
  readonly cacheEngines: readonly CacheEngineRow[]
}

/**
 * Inputs for the D-068 facade, all from the one faithful pipeline.
 * @returns Rows (before / as wired / all levers), the wiring flag, quality per bucket, idle and cache.
 */
export function opt8MeasuredInputs(): Opt8MeasuredInputs {
  const measured = measureOpt8Faithful()
  return {
    rows: measured.cuts,
    allLeversWired: allLeversWired(),
    quality: {
      beforeWiring: qualityHeld(LEVERS_BEFORE_WIRING),
      asWired: qualityHeld(LEVERS_AS_WIRED),
      projectionAll: qualityHeld(LEVERS_OPTIMIZED),
    },
    idleZero: measured.idleZero,
    cacheEngines: measured.cacheEngines,
  }
}
