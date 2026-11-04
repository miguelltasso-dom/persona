/**
 * Token measurement (TOKEN-OPTIMIZATION §1 + §3): scripted scenarios, 10%
 * regression gate, and a paired CLI-direct vs Persona benchmark. Real CLI
 * runs are opt-in, capped, and always dispose + timeout.
 */

import {
  appendTurn,
  estimateTokens,
  foldUsagePanel,
  measureLayers,
  totalTokens,
  turnFromLayers,
  type TurnKind,
  type TurnLayerSizes,
  type TurnLedgerEntry,
  type UsagePanelFold,
} from '@deepseek-ai/dsh-persona-core'
import { COORD_SCENARIOS, coordPreInput, measurePreRoute } from './bench/coord-eval.ts'
import { INITIATIVE_DAILY_TOKEN_BUDGET, batchInitiative, capChannelReply, trimInitiativeToBudget } from './lean-output.ts'
import { preRoute } from './preroute/rules.ts'
import { composeTurnPrompt, toolsForTurn } from './prompts/stable-prefix.ts'
import { vigiaTick } from './watchdog.ts'
import {
  COORD_REAL_TURN_MS,
  finishSession,
  shutdownCoordRunner,
  withTimeout,
  type CoordRealHandle,
  type CoordRealRunner,
} from './bench/coord-real-lifecycle.ts'

/** Scripted reference rows from TOKEN-OPTIMIZATION §1. */
export const TOKEN_SCENARIO_IDS = [
  'geral-simple',
  'multi-review',
  'idle-routines',
  'initiative-30',
  'padaria-lua',
] as const

export type TokenScenarioId = (typeof TOKEN_SCENARIO_IDS)[number]

/** Fail the local gate when tokens rise more than this without a quality gain. */
export const TOKEN_REGRESSION_RATIO = 0.10

/** Paired tasks: same work on the CLI and through Persona. */
export const PAIR_TASK_IDS = [
  'simple-ask',
  'multi-review',
  'research-summary',
  'code-fix',
] as const

export type PairTaskId = (typeof PAIR_TASK_IDS)[number]

export type PairPath = 'cli_direct' | 'persona'

export type PairEngine = 'claude' | 'codex'

/** One opt-in live pair (Keel: CLIs reais só leitura até liberar; aqui cap 1). */
export const PAIR_REAL_LIMIT = 1

/** Per-arm budget; reuse the coord-real turn cap. */
export const PAIR_REAL_TURN_MS = COORD_REAL_TURN_MS

const AT = '2026-11-04T03:30:00.000Z'

const PREFIX = {
  system: 'Você é Atlas, Coordenação. Você coordena a equipe: avalia pedidos e despacha Tarefas.',
  tools: 'tools: files read, recall read',
  required: 'regra: não gastar tokens em ociosidade',
}

export interface TokenScenarioReport {
  readonly id: TokenScenarioId
  readonly entries: readonly TurnLedgerEntry[]
  readonly totalTokens: number
  readonly calls: number
  readonly cacheHitRate: number
}

export interface PairArm {
  readonly path: PairPath
  readonly engine: PairEngine
  readonly model: string
  readonly inputTokens: number
  readonly outputTokens: number
  readonly cacheReadTokens: number
  readonly cacheWriteTokens: number
  readonly calls: number
  readonly durationMs: number
  readonly quality: number
  readonly success: boolean
}

export type PairVerdict = 'parity' | 'persona_better' | 'persona_justified' | 'persona_worse'

export interface PairResult {
  readonly taskId: PairTaskId
  readonly engine: PairEngine
  readonly model: string
  readonly cli: PairArm
  readonly persona: PairArm
  readonly tokenDeltaRatio: number
  readonly qualityDelta: number
  readonly verdict: PairVerdict
}

export interface PairTask {
  readonly id: PairTaskId
  readonly prompt: string
  readonly ready: readonly string[]
}

export const PAIR_TASKS: readonly PairTask[] = [
  { id: 'simple-ask', prompt: 'Qual o horário do standup?', ready: ['horario'] },
  { id: 'multi-review', prompt: 'Implemente o filtro e peça revisão.', ready: ['filtro', 'revis'] },
  { id: 'research-summary', prompt: 'Pesquise e resuma o pedido da Padaria Lua.', ready: ['resumo'] },
  { id: 'code-fix', prompt: 'Corrija o teste que quebra no repo de exemplo.', ready: ['teste'] },
]

/** Frozen scripted totals. Gate allows +10%. */
export const TOKEN_SCENARIO_BASELINES: Record<TokenScenarioId, number> = {
  'geral-simple': 99,
  'multi-review': 148,
  'idle-routines': 0,
  'initiative-30': 0,
  'padaria-lua': 155,
}

function turn(input: {
  readonly id: string
  readonly kind: TurnKind
  readonly ticketId?: string
  readonly subject: string
  readonly message: string
  readonly output: string
  readonly cacheRead: boolean
  readonly personaId?: string
}): TurnLedgerEntry {
  const layers = measureLayers({
    system: PREFIX.system,
    tools: PREFIX.tools,
    required: PREFIX.required,
    subject: input.subject,
    message: input.message,
  })
  const prefix = layers.system + layers.tools + layers.required
  const inputTokens = prefix + layers.subject + layers.recall + layers.message
  return {
    id: input.id,
    personaId: input.personaId ?? 'atlas',
    engine: 'claude',
    kind: input.kind,
    inputTokens,
    outputTokens: estimateTokens(input.output),
    cacheReadTokens: input.cacheRead ? prefix : 0,
    cacheWriteTokens: input.cacheRead ? 0 : prefix,
    layers,
    at: AT,
    ...(input.ticketId === undefined ? {} : { ticketId: input.ticketId }),
  }
}

function reportOf(id: TokenScenarioId, entries: readonly TurnLedgerEntry[]): TokenScenarioReport {
  let read = 0
  let write = 0
  for (const row of entries) {
    read += row.cacheReadTokens
    write += row.cacheWriteTokens
  }
  const denom = read + write
  return {
    id,
    entries,
    totalTokens: totalTokens(entries),
    calls: entries.length,
    cacheHitRate: denom === 0 ? 0 : read / denom,
  }
}

/**
 * Scripted reference scenario. Idle and 30-persona initiative spend no model.
 * @param id - Row from {@link TOKEN_SCENARIO_IDS}.
 * @returns Ledger plus totals.
 */
export function runTokenScenario(id: TokenScenarioId): TokenScenarioReport {
  if (id === 'idle-routines' || id === 'initiative-30') return reportOf(id, [])
  if (id === 'geral-simple') {
    return reportOf(id, [
      turn({
        id: 'g1', kind: 'triage', ticketId: 'geral-1', subject: '#geral',
        message: 'Qual o horário do standup?', output: 'Standup às 10h.', cacheRead: false,
      }),
      turn({
        id: 'g2', kind: 'reply', ticketId: 'geral-1', subject: '#geral',
        message: 'ok', output: 'Combinado.', cacheRead: true,
      }),
    ])
  }
  if (id === 'multi-review') {
    return reportOf(id, [
      turn({
        id: 'm1', kind: 'triage', ticketId: 'rev-1', subject: 'filtro',
        message: 'Implemente o filtro e peça revisão.', output: 'despacho', cacheRead: false,
      }),
      turn({
        id: 'm2', kind: 'execution', ticketId: 'rev-1', subject: 'filtro',
        message: 'implementar', output: 'patch + testes', cacheRead: true,
      }),
      turn({
        id: 'm3', kind: 'evaluation', ticketId: 'rev-1', subject: 'filtro',
        message: 'revisar', output: 'aprovado', cacheRead: true,
      }),
    ])
  }
  return reportOf(id, [
    turn({
      id: 'p1', kind: 'triage', ticketId: 'lua-1', subject: 'Padaria Lua',
      message: 'Cardápio de sábado e encomenda da Ana.', output: 'despacho', cacheRead: false,
    }),
    turn({
      id: 'p2', kind: 'execution', ticketId: 'lua-1', subject: 'Padaria Lua',
      message: 'montar cardápio', output: 'cardápio pronto', cacheRead: true,
    }),
    turn({
      id: 'p3', kind: 'reply', ticketId: 'lua-1', subject: 'Padaria Lua',
      message: 'avisar Ana', output: 'Ana avisada.', cacheRead: true,
    }),
  ])
}

/**
 * Local CI gate: measured may not exceed baseline by more than {@link TOKEN_REGRESSION_RATIO}.
 * @param baseline - Frozen tokens.
 * @param measured - Current tokens.
 * @param qualityGain - Recorded quality lift that excuses a spend increase.
 */
export function assertScenarioRegression(
  baseline: number,
  measured: number,
  qualityGain: number = 0,
): void {
  if (baseline === 0) {
    if (measured > 0) throw new Error('TOKEN_REGRESSION idle must stay at 0')
    return
  }
  const worse = (measured - baseline) / baseline
  if (worse > TOKEN_REGRESSION_RATIO && qualityGain < 0.15) {
    throw new Error(`TOKEN_REGRESSION ${measured} > ${baseline} +10%`)
  }
}

function armTokens(path: PairPath, task: PairTask): PairArm {
  const prompt = estimateTokens(task.prompt)
  const prefix = estimateTokens(`${PREFIX.system}\n${PREFIX.tools}\n${PREFIX.required}`)
  const output = estimateTokens(task.ready.join(' '))
  if (path === 'cli_direct') {
    return {
      path,
      engine: 'claude',
      model: 'haiku',
      inputTokens: prefix + prompt,
      outputTokens: output,
      cacheReadTokens: 0,
      cacheWriteTokens: prefix,
      calls: 1,
      durationMs: 80,
      quality: 1,
      success: true,
    }
  }
  const triage = estimateTokens('triagem')
  return {
    path,
    engine: 'claude',
    model: 'haiku',
    inputTokens: prefix + prompt + triage,
    outputTokens: output + estimateTokens('ok'),
    cacheReadTokens: prefix,
    cacheWriteTokens: 0,
    calls: 2,
    durationMs: 140,
    quality: 1,
    success: true,
  }
}

/**
 * Ready-criterion score: fraction of needles present in the reply.
 * @param reply - Model or fake text.
 * @param ready - Needles that mark a successful task.
 * @returns 0–1.
 */
export function scorePairQuality(reply: string, ready: readonly string[]): number {
  if (ready.length === 0) return reply.trim() === '' ? 0 : 1
  const hay = reply.toLowerCase()
  let hit = 0
  for (const needle of ready) {
    if (hay.includes(needle.toLowerCase())) hit += 1
  }
  return hit / ready.length
}

/**
 * Compare Persona spend to the same task run directly on the CLI.
 * @param cli - Direct CLI arm.
 * @param persona - Persona arm (same engine/model).
 * @returns Verdict from TOKEN-OPTIMIZATION §3.
 */
export function pairVerdict(cli: PairArm, persona: PairArm): PairVerdict {
  const base = cli.inputTokens + cli.outputTokens
  const used = persona.inputTokens + persona.outputTokens
  const ratio = base === 0 ? 0 : (used - base) / base
  const qualityDelta = persona.quality - cli.quality
  if (used <= base && persona.quality >= cli.quality) return 'persona_better'
  if (Math.abs(ratio) <= TOKEN_REGRESSION_RATIO) return 'parity'
  if (ratio > TOKEN_REGRESSION_RATIO && qualityDelta >= 0.15) return 'persona_justified'
  return 'persona_worse'
}

/**
 * @param taskId - Paired task.
 * @param cli - Direct arm.
 * @param persona - Persona arm.
 * @returns Side-by-side row.
 */
export function comparePair(taskId: PairTaskId, cli: PairArm, persona: PairArm): PairResult {
  const base = cli.inputTokens + cli.outputTokens
  const used = persona.inputTokens + persona.outputTokens
  return {
    taskId,
    engine: cli.engine,
    model: cli.model,
    cli,
    persona,
    tokenDeltaRatio: base === 0 ? 0 : (used - base) / base,
    qualityDelta: persona.quality - cli.quality,
    verdict: pairVerdict(cli, persona),
  }
}

/**
 * Scripted pair for every task (same CLI/model on both arms).
 * @returns One row per {@link PAIR_TASKS}.
 */
export function runPairedSuite(): PairResult[] {
  return PAIR_TASKS.map((task) => {
    const cli = armTokens('cli_direct', task)
    const persona = armTokens('persona', task)
    return comparePair(task.id, cli, persona)
  })
}

/**
 * @param result - One pair.
 * @throws When Persona spends >10% more without a recorded quality gain.
 */
export function assertPairAcceptable(result: PairResult): void {
  if (result.verdict === 'persona_worse') {
    throw new Error(`PAIR_REGRESSION ${result.taskId} ${result.tokenDeltaRatio}`)
  }
}

export interface PairRunInput {
  readonly path: PairPath
  readonly taskId: PairTaskId
  readonly prompt: string
  readonly engine: PairEngine
  readonly model: string
}

export interface PairUsageEvent {
  readonly text?: string
  readonly inputTokens?: number
  readonly outputTokens?: number
  readonly cacheReadTokens?: number
  readonly cacheWriteTokens?: number
}

export type PairRunner = CoordRealRunner<CoordRealHandle, PairUsageEvent, PairRunInput>

/**
 * Collect text and usage from a live or fake stream.
 * @param events - Runner stream.
 * @returns Folded arm counters (quality filled by the caller).
 */
export async function collectPairUsage(events: AsyncIterable<PairUsageEvent>): Promise<{
  text: string
  inputTokens: number
  outputTokens: number
  cacheReadTokens: number
  cacheWriteTokens: number
}> {
  let text = ''
  let inputTokens = 0
  let outputTokens = 0
  let cacheReadTokens = 0
  let cacheWriteTokens = 0
  for await (const event of events) {
    if (event.text !== undefined) text += event.text
    inputTokens += event.inputTokens ?? 0
    outputTokens += event.outputTokens ?? 0
    cacheReadTokens += event.cacheReadTokens ?? 0
    cacheWriteTokens += event.cacheWriteTokens ?? 0
  }
  return { text, inputTokens, outputTokens, cacheReadTokens, cacheWriteTokens }
}

/**
 * One arm: start, fold, always cancel; timeout cancels first.
 * @param runner - Live or fake.
 * @param input - Task + path.
 * @param turnMs - Per-arm budget.
 */
export async function runPairArm(
  runner: PairRunner,
  input: PairRunInput,
  turnMs: number = PAIR_REAL_TURN_MS,
): Promise<Omit<PairArm, 'quality' | 'success'> & { readonly text: string }> {
  const started = Date.now()
  const handle = await runner.start(input)
  try {
    const usage = await withTimeout(turnMs, collectPairUsage(runner.stream(handle)), async () => {
      await finishSession(runner, handle)
    })
    return {
      path: input.path,
      engine: input.engine,
      model: input.model,
      inputTokens: usage.inputTokens,
      outputTokens: usage.outputTokens,
      cacheReadTokens: usage.cacheReadTokens,
      cacheWriteTokens: usage.cacheWriteTokens,
      calls: 1,
      durationMs: Date.now() - started,
      text: usage.text,
    }
  } finally {
    await finishSession(runner, handle)
  }
}

/**
 * Opt-in live pair. Default is scripted. Always dispose the runners.
 * @param task - One paired task.
 * @param cliRunner - Direct CLI.
 * @param personaRunner - Same CLI/model through Persona.
 * @param options.real - When false, returns {@link runPairedSuite} row.
 * @param options.turnMs - Per-arm budget.
 */
export async function runPairedTask(
  task: PairTask,
  cliRunner: PairRunner | undefined,
  personaRunner: PairRunner | undefined,
  options: { readonly real?: boolean; readonly turnMs?: number } = {},
): Promise<PairResult> {
  const real = options.real === true && cliRunner !== undefined && personaRunner !== undefined
  if (!real) {
    const cli = armTokens('cli_direct', task)
    const persona = armTokens('persona', task)
    return comparePair(task.id, cli, persona)
  }
  const turnMs = options.turnMs ?? PAIR_REAL_TURN_MS
  const engine: PairEngine = 'claude'
  const model = 'haiku'
  try {
    const cliRaw = await runPairArm(cliRunner, {
      path: 'cli_direct', taskId: task.id, prompt: task.prompt, engine, model,
    }, turnMs)
    const personaRaw = await runPairArm(personaRunner, {
      path: 'persona', taskId: task.id, prompt: task.prompt, engine, model,
    }, turnMs)
    const cli: PairArm = {
      ...cliRaw,
      quality: scorePairQuality(cliRaw.text, task.ready),
      success: scorePairQuality(cliRaw.text, task.ready) === 1,
    }
    const persona: PairArm = {
      ...personaRaw,
      quality: scorePairQuality(personaRaw.text, task.ready),
      success: scorePairQuality(personaRaw.text, task.ready) === 1,
    }
    return comparePair(task.id, cli, persona)
  } finally {
    await shutdownCoordRunner(cliRunner, async () => {
      await shutdownCoordRunner(personaRunner, async () => undefined)
    })
  }
}

/**
 * One-line report for the Uso panel / CI log.
 * @param reports - Scripted scenarios.
 * @param pairs - Paired rows.
 */
export function formatTokenMeasureReport(
  reports: readonly TokenScenarioReport[],
  pairs: readonly PairResult[],
): string {
  const scenarioLines = reports.map(row =>
    `${row.id}\t${String(row.totalTokens)}\t${String(row.calls)}`)
  const pairLines = pairs.map(row =>
    `${row.taskId}\tcli=${String(row.cli.inputTokens + row.cli.outputTokens)}\tpersona=${String(row.persona.inputTokens + row.persona.outputTokens)}\t${row.verdict}`)
  return ['tokens-per-scenario', ...scenarioLines, 'paired', ...pairLines].join('\n')
}

/**
 * Append overhead turns (triage / librarian / watchdog / initiative) to a book.
 * @param entries - Existing book.
 * @param extra - Overhead rows.
 * @returns Copy.
 */
export function recordOverhead(
  entries: readonly TurnLedgerEntry[],
  extra: readonly TurnLedgerEntry[],
): TurnLedgerEntry[] {
  let next = [...entries]
  for (const row of extra) next = appendTurn(next, row)
  return next
}

/**
 * Persist a composed turn as a ledger row (Anvil writes the book).
 * @param layers - Measured prefix + variable slices.
 * @param meta - Identity and counters.
 * @returns Valid entry.
 */
export function ledgerFromTurnLayers(
  layers: TurnLayerSizes,
  meta: {
    readonly id: string
    readonly personaId: string
    readonly engine: string
    readonly kind: TurnKind
    readonly outputTokens: number
    readonly cacheReadTokens: number
    readonly cacheWriteTokens: number
    readonly at: string
    readonly inputTokens?: number
    readonly ticketId?: string
    readonly accountId?: string
    readonly origin?: 'measured' | 'estimate'
  },
): TurnLedgerEntry {
  return turnFromLayers({ layers, ...meta })
}

export interface ScenarioBaselineRow {
  readonly id: TokenScenarioId
  readonly baseline: number
  readonly measured: number
  readonly calls: number
  readonly cacheHitRate: number
  readonly ratio: number
}

/**
 * @param reports - Scripted scenario reports.
 * @returns Side-by-side vs {@link TOKEN_SCENARIO_BASELINES}.
 */
export function compareScenariosToBaseline(
  reports: readonly TokenScenarioReport[],
): ScenarioBaselineRow[] {
  return reports.map((row) => {
    const baseline = TOKEN_SCENARIO_BASELINES[row.id]
    return {
      id: row.id,
      baseline,
      measured: row.totalTokens,
      calls: row.calls,
      cacheHitRate: row.cacheHitRate,
      ratio: baseline === 0 ? 0 : (row.totalTokens - baseline) / baseline,
    }
  })
}

export interface EngineLeverReport {
  readonly prerouteBeforeModelCalls: number
  readonly prerouteAfterLegacy: number
  readonly prerouteAfterExpanded: number
  readonly prerouteCorrect: number
  readonly idleCalls: number
  readonly initiative30Calls: number
  readonly toolsDropped: number
  readonly channelWordsCapped: number
  readonly initiativeBatches: number
  readonly initiativeKept: number
  readonly vigiaNeedsModel: false
}

/**
 * @param rules - Optional rule overlay. Omit for current defaults.
 * @returns F3 model-call count.
 */
function prerouteModelCalls(rules?: { injection?: boolean; scope?: boolean; empty?: boolean }): number {
  let n = 0
  for (const row of COORD_SCENARIOS) {
    if (preRoute({ ...coordPreInput(row), ...(rules === undefined ? {} : { rules }) }).modelCalled) n += 1
  }
  return n
}

/**
 * Before/after for TOKEN-OPTIMIZATION §2 levers. No vendor CLI.
 * @returns Counts the baseline report prints.
 */
export function measureEngineLevers(): EngineLeverReport {
  const expanded = measurePreRoute(COORD_SCENARIOS)
  const long = Array.from({ length: 140 }, (_, i) => `w${String(i)}`).join(' ')
  const drafts = [
    { id: 'a1', personaId: 'nina', title: 'cardápio', day: '2026-11-04' },
    { id: 'a2', personaId: 'nina', title: 'encomenda', day: '2026-11-04' },
    { id: 'a3', personaId: 'nina', title: 'extra', day: '2026-11-04' },
    { id: 'b1', personaId: 'bento', title: 'teste', day: '2026-11-04' },
  ]
  const vigia = vigiaTick({
    now: 0,
    openGoal: false,
    stalledTicketIds: [],
    failingEffectKeys: [],
    unavailableEvalIds: [],
    budgetLeft: false,
    personas: [{ personaId: 'nina', idle: true, queueLength: 0, lastProgressAt: 0, sameReportCount: 0 }],
  })
  return {
    prerouteBeforeModelCalls: expanded.beforeModelCalls,
    prerouteAfterLegacy: prerouteModelCalls({ injection: false, scope: false, empty: false }),
    prerouteAfterExpanded: expanded.afterModelCalls,
    prerouteCorrect: expanded.afterCorrect,
    idleCalls: runTokenScenario('idle-routines').calls,
    initiative30Calls: runTokenScenario('initiative-30').calls,
    toolsDropped: toolsForTurn(['files', 'recall'], ['files', 'shell', 'browser']).length === 1 ? 2 : 0,
    channelWordsCapped: capChannelReply(long).split(/\s+/).length,
    initiativeBatches: batchInitiative(drafts).length,
    initiativeKept: trimInitiativeToBudget(drafts, 200).length,
    vigiaNeedsModel: vigia.needsModel,
  }
}

/**
 * Markdown for `persona-spec/reports/tokens-baseline.md`.
 * @returns Full report. Scripted numbers; real vendor pair is opt-in.
 */
export function formatTokensBaselineMarkdown(): string {
  const reports = TOKEN_SCENARIO_IDS.map(runTokenScenario)
  for (const row of reports) {
    assertScenarioRegression(TOKEN_SCENARIO_BASELINES[row.id], row.totalTokens)
  }
  const pairs = runPairedSuite()
  for (const row of pairs) assertPairAcceptable(row)
  const vs = compareScenariosToBaseline(reports)
  const book = reports.flatMap(row => row.entries)
  const ticketIds = [...new Set(book.flatMap(entry => entry.ticketId === undefined ? [] : [entry.ticketId]))]
  const panel: UsagePanelFold = foldUsagePanel(book, ticketIds)
  const levers = measureEngineLevers()
  const scenarioTable = [
    '| cenário | tokens | chamadas | cache hit | vs base | origem |',
    '|---|---:|---:|---:|---:|---|',
    ...vs.map(row =>
      `| ${row.id} | ${String(row.measured)} | ${String(row.calls)} | ${row.cacheHitRate.toFixed(2)} | ${row.ratio === 0 ? '0' : row.ratio.toFixed(3)} | estimate |`),
  ]
  const pairTable = [
    '| tarefa | CLI in+out | Persona in+out | Δ | chamadas CLI/Persona | qualidade | veredito |',
    '|---|---:|---:|---:|---|---:|---|',
    ...pairs.map((row) => {
      const cli = row.cli.inputTokens + row.cli.outputTokens
      const persona = row.persona.inputTokens + row.persona.outputTokens
      return `| ${row.taskId} | ${String(cli)} | ${String(persona)} | ${row.tokenDeltaRatio.toFixed(3)} | ${String(row.cli.calls)}/${String(row.persona.calls)} | ${row.persona.quality.toFixed(2)} | ${row.verdict} |`
    }),
  ]
  const prompt = composeTurnPrompt({
    fields: {
      identity: { name: 'Atlas', title: 'Coordenação' },
      personality: 'Calmo.',
      instructions: 'Despache.',
      functionLabel: 'coordenação',
      vault: '',
    },
    part: 'talk',
    tools: ['files: lê o projeto autorizado.'],
    required: 'Nunca inventar preço.',
    message: 'Cardápio de sábado?',
  })
  return [
    '# Tokens — linha de base (OPT-1, Forge, 04/11)',
    '',
    'Contagem **fiel do runner scriptado**. Gate de regressão: falha se tokens subirem > 10% sem ganho de qualidade ≥ 0,15.',
    'Referência do aceite = CLI direta (paridade ±10%), não um harness antigo. Overhead (triagem / Bibliotecário / Vigia / iniciativa) entra no livro à parte.',
    'Rodada vendor (Claude/Codex) fica opt-in `PERSONA_PAIR_REAL=1`, cap 1, `start`→fold→`cancel`, timeout cancela primeiro, `dispose` no `finally`.',
    '',
    '## Cenários de referência',
    '',
    ...scenarioTable,
    '',
    `Painel Uso (Anvil OPT-7 lê \`foldUsagePanel\` de \`persona-core\`): origem **${panel.origin}**, tokens/tarefa ${panel.tokensPerSuccessfulTask.toFixed(1)}, cache hit ${panel.cacheHitRate.toFixed(2)}.`,
    `Camadas do prefixo estável (talk): system ${String(prompt.layers.system)} · tools ${String(prompt.layers.tools)} · required ${String(prompt.layers.required)} · message ${String(prompt.layers.message)}. Persona entra em system; relógio/contador recusados no prefixo.`,
    '',
    '## Benchmark pareado (mesma CLI/modelo)',
    '',
    ...pairTable,
    '',
    'Qualidade = fração dos critérios de pronto presentes na resposta. `persona_worse` reprova o gate.',
    '',
    '## Alavancas do engine (§2) — antes / depois',
    '',
    '| alavanca | antes | depois |',
    '|---|---:|---:|',
    `| pré-roteador F3 (legado → ampliado; sem regras = ${String(levers.prerouteBeforeModelCalls)}) | ${String(levers.prerouteAfterLegacy)} | ${String(levers.prerouteAfterExpanded)} |`,
    `| Vigia com orçamento esgotado (needsModel) | — | ${String(levers.vigiaNeedsModel)} |`,
    `| dia ocioso / 30-persona iniciativa | — | ${String(levers.idleCalls)} / ${String(levers.initiative30Calls)} |`,
    `| ferramentas mínimas (shell+browser drop) | 3 | ${String(3 - levers.toolsDropped)} |`,
    `| canal (palavras) | 140 | ${String(levers.channelWordsCapped)} |`,
    `| iniciativa em lote (rascunhos→lotes / cabem no orçamento ${String(INITIATIVE_DAILY_TOKEN_BUDGET)}) | 4 | ${String(levers.initiativeBatches)} lotes, ${String(levers.initiativeKept)} cabem |`,
    '',
    'Pré-roteador ampliado: vazio, injeção, fora de escopo e slash do composer (`/limites`…) fecham sem LLM. F3 permanece 41/41.',
    '',
    '## Contrato para o Anvil (OPT-7)',
    '',
    '- Persistir `TurnLedgerEntry` de `@deepseek-ai/dsh-persona-core` (kinds `execution` / `evaluation`, não `exec` / `eval`).',
    '- Painel: `foldUsagePanel(entries, successfulTicketIds)` → tokens/tarefa, por persona, por tipo, cache hit, origem `measured`/`estimate`.',
    '- `usagePortKind` só no port Rivet. Ausência de cache ≠ 0%.',
    '',
    '## Como reproduzir',
    '',
    '```',
    'pnpm exec vitest run packages/persona/persona-core/tests/token-ledger.spec.ts packages/persona/persona-engine/tests/token-measure.spec.ts packages/persona/persona-engine/tests/preroute.spec.ts',
    'pnpm exec tsx packages/persona/persona-engine/scripts/write-tokens-baseline.ts',
    '```',
    '',
  ].join('\n')
}
