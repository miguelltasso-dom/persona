/**
 * OPT-8 on the faithful runner: the −40% goal, the cache goal, idle-zero and the paired
 * "CLI direct × Persona" comparison, with the vendor base context (system prompt + tool
 * schema every CLI call carries) as an EXPLICIT parameter. The base is not measurable offline;
 * it is varied, never hidden. Every number is an estimate (origin `estimate`).
 */

import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import {
  LEVERS_AS_WIRED,
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
  readonly allTokens: number
  readonly naiveCost: number
  readonly todayCost: number
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
  'burst-geral',
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
    const today = runFaithfulScenario(scenario, LEVERS_AS_WIRED)
    const all = runFaithfulScenario(scenario, LEVERS_OPTIMIZED)
    return {
      scenario,
      naiveTokens: naive.totalTokens,
      todayTokens: today.totalTokens,
      allTokens: all.totalTokens,
      naiveCost: naive.costMicroUsd,
      todayCost: today.costMicroUsd,
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
    for (const cacheTtlMin of [5, 60]) {
      const report = runFaithfulScenario(scenario, LEVERS_AS_WIRED, { cacheTtlMin })
      rows.push({ scenario, cacheTtlMin, tokens: report.totalTokens, costMicroUsd: report.costMicroUsd, prefixHit: report.prefixHitRate })
    }
  }
  return rows
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
  { task: 'simple-ask', scenario: 'geral-simple', prompt: 'Qual o horário do standup?', evidence: 'A equipe tem standup às 10h no canal #geral, todos os dias úteis.' },
  { task: 'multi-review', scenario: 'multi-review', prompt: 'Implemente o filtro de pedidos e peça revisão.', evidence: 'Critério: filtro por data e status funcionando, com teste e revisão.' },
  { task: 'research-summary', scenario: 'padaria-lua', prompt: 'Cardápio de sábado e encomenda da Ana.', evidence: 'Ana: 40 pães de fermentação natural e 1 bolo de fubá, retirada às 9h.' },
]

/** Same model on both arms (the paired spec): no cheap routing on the Persona arm. */
const SAME_MODEL: LeverSet = { ...LEVERS_OPTIMIZED, talkOnCheap: false, supportOnCheap: false }

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
    `| ${row.scenario} | ${String(row.naiveTokens)} → ${String(row.todayTokens)} → ${String(row.allTokens)} | ${pct(-row.tokenCutVsToday)} / ${pct(-row.tokenCutVsNaive)} | ${String(row.naiveCost)} → ${String(row.todayCost)} → ${String(row.allCost)} | ${pct(-row.costCutVsToday)} / ${pct(-row.costCutVsNaive)} |`)
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
    `| −40% **tokens** por tarefa (pior dos dois dias, hoje → todas as alavancas) | ${result.cutTokens40 ? 'passou' : 'NÃO atingido'} (${pct(-result.dayTokenCut)}) |`,
    `| −40% **custo estimado** por tarefa (pior dos dois dias, hoje → todas as alavancas) | ${result.cutCost40 ? 'passou' : 'NÃO atingido'} (rajada ${pct(-result.burstDayCostCut)} · espalhado ${pct(-result.spreadDayCostCut)}; no limite no dia espalhado) — depende das alavancas W1–W3 do contrato \`token-wiring.md\` ligadas |`,
    '',
    '## Antes → hoje → todas as alavancas',
    '',
    'Colunas de Δ: hoje→todas / ingênuo→todas.',
    '',
    '| cenário | tokens (ingênuo → hoje → todas) | Δ tokens | custo µUSD (ingênuo → hoje → todas) | Δ custo |',
    '|---|---|---|---|---|',
    ...rows,
    '',
    '## O dia espaçado (cache de 5 min e sessão de 10 min expiram entre as mensagens)',
    '',
    'Mesmo dia de 7 mensagens, host de hoje: em rajada (1 min entre linhas) × espalhado (30 min). O TTL do cache do provedor é parâmetro (5 min é o padrão do cache efêmero; 60 min é o cache estendido) — **a medir** no vendor.',
    '',
    '| cenário | TTL do cache | tokens | custo µUSD | prefixo em cache |',
    '|---|---:|---:|---:|---:|',
    ...ttlSensitivity().map(row => `| ${row.scenario} | ${String(row.cacheTtlMin)} min | ${String(row.tokens)} | ${String(row.costMicroUsd)} | ${row.prefixHit.toFixed(2)} |`),
    '',
    'Leitura: num time que escreve ao longo do dia, o cache de 5 min não pega (o prefixo é regravado a cada mensagem) e a sessão aquecida de 10 min também expira — o prompt de coordenação (~500 tokens) volta em toda triagem. A meta de ≥ 60% de cache no prefixo só vale em uso contínuo ou com cache estendido. Nesse regime o que pesa é o **tamanho do prefixo** (persona, coordenação, ferramentas) e o **número de chamadas**.',
    '',
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
    '- O que a Persona controla é o **número de chamadas por tarefa** e o que cada uma carrega: pré-roteador (courtesy sem modelo), rajada em lote (4 → 1), primeira entrega em um turno, triagem barata. O "+5,7–6,3%" do relato anterior vinha de uma fórmula (`armTokens`), não de prompts reais; este quadro o substitui.',
    '',
    '`cut-40` real (livro vivo `measured`) continua dependendo de uma rodada com CLI real, que só o Atlas libera (`PERSONA_PAIR_REAL=1`).',
    '',
    '```',
    'node --import tsx/esm packages/persona/persona-engine/scripts/write-opt8-faithful.ts',
    '```',
    '',
  ].join('\n')
}
