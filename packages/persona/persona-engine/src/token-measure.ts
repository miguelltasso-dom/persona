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
  ticketIdsFromLedger,
  type LedgerOrigin,
  totalTokens,
  turnFromLayers,
  type TurnKind,
  type TurnLayerSizes,
  type TurnLedgerEntry,
  type UsagePanelFold,
} from '@deepseek-ai/dsh-persona-core'
import { COORD_SCENARIOS, coordPreInput, measurePreRoute } from './bench/coord-eval.ts'
import { baseAwareCuts, opt8MeasuredInputs } from './bench/opt8-faithful.ts'
import { buildOpt8Measured, type Opt8MeasuredEvidence } from './opt8-measured.ts'
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
      await shutdownCoordRunner(personaRunner, () => Promise.resolve())
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

export interface Opt8Acceptance {
  readonly passed: number
  readonly total: 4
  readonly failed: readonly string[]
  readonly blocked: readonly string[]
  /** D-068, top level for the legacy Remote: where the numbers come from and what they are compared with. */
  readonly origin: 'estimate' | 'calibrated'
  readonly baseline: 'levers-before-wiring'
  /** D-068 evidence, additive: estimate-only, one faithful pipeline, baseline `levers-before-wiring`. */
  readonly evidence: Opt8MeasuredEvidence
}

/** Kept so existing callers compile. D-068 ignores it: a live book is never compared with the historical 134 fixture. */
interface LegacyOpt8Input {
  readonly liveEntries?: readonly TurnLedgerEntry[]
  readonly successfulTicketIds?: readonly string[]
  readonly baselineTokensPerTask?: number
}

/**
 * OPT-8 goals under D-068: ONE faithful pipeline (scripted runner over the real prompt composers),
 * baseline `levers-before-wiring`, origin always `estimate`. The historical 134-token fixture does not count.
 * - idle-zero is scored on the pipeline;
 * - cache-60 is `blocked`: the provider cache is `blocked/unavailable` until a real run reports it. The scripted
 *   estimate stays in `evidence.cacheEstimate` and only FAILS the goal when it falls below 60% (a regression of ours);
 * - pair-parity is `blocked` until the paired real run exists (the old formula is gone);
 * - cut-40 is `blocked` while a lever of the full set is off (today W3, the short worker report), then `passed` only if the worse of the two days cuts
 *   ≥ 40% of the estimated cost without raising tokens, else `failed`. Projection and fixtures never pass it.
 * @param input - Ignored (see {@link LegacyOpt8Input}).
 * @returns Score; `blocked` goals do not fail the v1 gate but are not passed either.
 */
export function measureOpt8Acceptance(input?: LegacyOpt8Input): Opt8Acceptance {
  void input
  const evidence = buildOpt8Measured(opt8MeasuredInputs())
  const failed: string[] = []
  const blocked: string[] = []
  if (!evidence.idleZero) failed.push('idle-zero')
  // D-080: the provider's own report (a real run) decides cache-60 when there is one; else the scripted estimate only fails it.
  if (evidence.providerCache.status === 'measured') {
    if (evidence.providerCache.prefixHit < 0.60) failed.push('cache-60')
  } else if (evidence.cacheEstimate.some(row => row.prefixHit !== null && row.prefixHit < 0.60)) failed.push('cache-60')
  else blocked.push('cache-60')
  // The paired real run (04/11) could not settle the parity: the helper keeps it blocked with the reason.
  blocked.push('pair-parity')
  if (evidence.cut40.status === 'failed') failed.push('cut-40')
  else if (evidence.cut40.status === 'blocked') blocked.push('cut-40')
  return { passed: 4 - failed.length - blocked.length, total: 4, failed, blocked, origin: evidence.origin, baseline: evidence.baseline, evidence }
}

/** Host `@Remote measureOpt8` wire. One call; Anvil does not remount flags. */
export interface Opt8MeasureView {
  readonly passed: number
  readonly total: 4
  readonly failed: readonly string[]
  readonly blocked: readonly string[]
  readonly liveEntries: number
  readonly liveOrigin: LedgerOrigin
  /** D-068 top level: origin of the numbers and the comparison baseline. */
  readonly origin: 'estimate' | 'calibrated'
  readonly baseline: 'levers-before-wiring'
  /** D-068 evidence (additive). */
  readonly evidence: Opt8MeasuredEvidence
}

/**
 * OPT-8 score plus live book size/origin. Host `measureOpt8` returns this. The live book is reported
 * (count and origin) but does not move the goal: D-068 reads it on the faithful pipeline only.
 * @param entries - Host ledger rows (`TurnLedgerView` ≡ `TurnLedgerEntry`).
 * @returns Wire fields. `liveEntries` is `entries.length`.
 */
export function measureOpt8View(entries: readonly TurnLedgerEntry[] = []): Opt8MeasureView {
  const scored = measureOpt8Acceptance()
  return {
    ...scored,
    liveEntries: entries.length,
    liveOrigin: foldUsagePanel(entries, ticketIdsFromLedger(entries)).origin,
  }
}

function pctOf(value: number | null): string {
  return value === null ? 'n/d' : `${value >= 0 ? '+' : ''}${(value * 100).toFixed(0)}%`
}

/**
 * OPT-8 report for `persona-spec/reports/opt8-acceptance.md` (D-068).
 * @param input - Ignored (see {@link LegacyOpt8Input}).
 * @returns Markdown with origin, baseline and an honest state per goal.
 */
export function formatOpt8AcceptanceMarkdown(input?: LegacyOpt8Input): string {
  void input
  const scored = measureOpt8Acceptance()
  const ev = scored.evidence
  const sideBySide = baseAwareCuts()
  const cache = ev.cacheEstimate.map(row => `${row.engine} ${row.prefixHit === null ? 'n/d' : row.prefixHit.toFixed(2)}`).join(' · ')
  const asWiredCostCut = ev.beforeWiring.cost === 0 ? null : -(1 - ev.asWired.cost / ev.beforeWiring.cost)
  const projectionCostCut = ev.beforeWiring.cost === 0 ? null : -(1 - ev.projectionAll.cost / ev.beforeWiring.cost)
  const projectionTokens = ev.beforeWiring.tokens === 0 ? null : ev.projectionAll.tokens / ev.beforeWiring.tokens - 1
  return [
    '# OPT-8 — aceite (D-068, Tally 04/11)',
    '',
    `Score **${String(scored.passed)}/${String(scored.total)}**. Falhou: ${scored.failed.length === 0 ? '—' : scored.failed.join(', ')}. Bloqueado: ${scored.blocked.length === 0 ? '—' : scored.blocked.join(', ')}.`,
    '',
    `Origem: **${ev.origin}** (4 caracteres ≈ 1 token, preço de tabela${ev.calibration === undefined ? '' : `; calibrada com a base medida de ${String(ev.calibration.baseTokens)} tokens por requisição — ${ev.calibration.caveat}`}). Baseline: **${ev.baseline}** (o host antes de W1 e W4, no MESMO pipeline; W2 e W5 foram retiradas e a W3 fica adiada por decisão, D-080). A fixture histórica de 134 tokens/tarefa (\`${ev.historical.id}\`) **não conta** para a meta.`,
    '',
    '| meta | resultado |',
    '|---|---|',
    `| idle-zero (ociosa sem objetivo) | ${scored.failed.includes('idle-zero') ? 'falhou' : 'passou'} |`,
    `| cache ≥ 60% no prefixo | ${scored.failed.includes('cache-60') ? 'falhou' : ev.providerCache.status === 'measured' ? 'passou' : 'blocked'}: cache real do provedor \`${ev.providerCache.status}\` / \`${ev.providerCache.origin}\`${ev.providerCache.status === 'measured' ? ` (${ev.providerCache.engine}, ${ev.providerCache.prefixHit.toFixed(2)} nas chamadas quentes, reportado pelo fornecedor)` : ''}; estimativa scriptada ${cache} |`,
    `| paridade ±10% com a CLI | blocked: \`${ev.parity.reason}\` (a rodada real de 04/11 não decide: n = 1 e o agente da CLI fez de ≈ 2 a ≈ 8 requisições internas entre chamadas parecidas) |`,
    `| −40% custo estimado por tarefa, pior dos dois dias, as wired vs baseline, tokens sem subir | ${ev.cut40.status} (\`${ev.cut40.reason}\`): custo ${pctOf(ev.cut40.costCut === null ? null : -ev.cut40.costCut)}, tokens ${pctOf(ev.cut40.tokensDelta)} |`,
    '',
    `Totais das mesmas cenas: antes das ligações ${String(ev.beforeWiring.tokens)} tokens / ${String(ev.beforeWiring.cost)} µUSD · agora ${String(ev.asWired.tokens)} / ${String(ev.asWired.cost)} (custo ${pctOf(asWiredCostCut)}) · **projeção** com todas as alavancas ${String(ev.projectionAll.tokens)} / ${String(ev.projectionAll.cost)} (tokens ${pctOf(projectionTokens)}, custo ${pctOf(projectionCostCut)}). A projeção nunca passa a meta.`,
    '',
    '### A régua, lado a lado (D-080)',
    '',
    'O gate lê a coluna da direita. A da esquerda é o que o bench dizia até a rodada real; ela fica aqui para ninguém achar que a régua foi trocada: o que mudou foi um dado novo (a base do vendor por chamada), que antes estava fora por falta de medida.',
    '',
    '| dia | corte de custo só com os prompts | corte de custo com a base medida |',
    '|---|---:|---:|',
    `| rajada | ${pctOf(-sideBySide.burst.promptOnlyCutNow)} | ${pctOf(-sideBySide.burst.costCutNow)} |`,
    `| espaçado | ${pctOf(-sideBySide.spread.promptOnlyCutNow)} | ${pctOf(-sideBySide.spread.costCutNow)} |`,
    '',
    'Os dois braços (antes e depois) levam a **mesma** base; a ressalva da calibração está na linha de origem acima.',
    '',
    'Gate: `measureOpt8Acceptance` (D-068, D-080). Detalhe por cenário e dia espalhado: `opt8-faithful.md`. Rodada pareada real: `pair-real.md` (feita em 04/11).',
    '',
    '```',
    'pnpm exec tsx packages/persona/persona-engine/scripts/write-opt8-acceptance.ts',
    '```',
    '',
  ].join('\n')
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
