/**
 * Paired REAL run plan (OPT-8, Atlas 04/11): the same task sent (a) straight to the CLI and (b) as the
 * prompts Persona builds for it (coordination triage, then the worker on the ticket title), plus (c) the same
 * worker with the short-report rule (W3) switched on, same CLI and model, to calibrate what the faithful
 * runner only estimates: the 4-chars-per-token ratio, the vendor base context every call carries, the real
 * cache TTL, and whether W3 shortens the answer without losing the ready criterion.
 *
 * This module is pure: it builds the plan from the bench prompts and folds a runner's events. It never
 * imports a CLI. The entry script decides dry (scripted runner, default) or real
 * (`PERSONA_PAIR_REAL=1` + `PERSONA_REAL_E2E=1`, inside the `real` lock). Cap: 20 calls, 5 min per call.
 */

import { isAbsolute } from 'node:path'
import { estimateTokens } from '@deepseek-ai/dsh-persona-core'
import type { AskCalibration } from '../ux/estimate-ask.ts'
import { COORD_REAL_TURN_MS, finishSession, withTimeout, type CoordRealHandle } from './coord-real-lifecycle.ts'
import { LEVERS_AS_WIRED, runFaithfulScenario, type FaithfulReport, type LeverSet } from './token-faithful.ts'

/** Calls the Atlas allowed for the whole pair (Atlas 13:32 / D-070). */
export const PAIR_REAL_CALL_CAP = 20

/** Per-call budget the Atlas allowed (5 min). */
export const PAIR_REAL_SIDE_MS = 5 * 60_000

/** Wait before the cache TTL probe: just past the 5 min ephemeral TTL. */
export const PAIR_REAL_TTL_PROBE_GAP_MS = 6 * 60_000

/**
 * Everything a REAL run needs before it may start a single paid turn (D-070 + D-069). Throws with the first thing missing.
 *  - the explicit flags (`PERSONA_PAIR_REAL=1`, `PERSONA_REAL_E2E=1`) and the `real` lock (FIFO, one real run at a time);
 *  - Rivet's turn limiter ON as a second, independent guard: `PERSONA_REAL_TURN_CAP` an integer within the 20-call cap and
 *    `PERSONA_REAL_TURN_LEDGER` an absolute path. The limiter counts BEFORE the CLI starts and fails closed, so even a bug in this
 *    harness cannot spend more than the cap.
 * @param env - The process environment.
 * @returns The cap and the ledger path in force.
 */
export function assertRealRunGuards(env: Readonly<Record<string, string | undefined>>): { readonly cap: number; readonly ledger: string } {
  if (env.PERSONA_PAIR_REAL !== '1') throw new Error('real mode needs PERSONA_PAIR_REAL=1')
  if (env.PERSONA_REAL_E2E !== '1') throw new Error('real mode needs PERSONA_REAL_E2E=1')
  if (env.PERSONA_LOCK !== 'real') throw new Error('real mode must run inside: with-lock.mjs "<nome> real" --lock real -- <cmd>')
  const raw = env.PERSONA_REAL_TURN_CAP
  if (raw === undefined || !/^[1-9][0-9]{0,2}$/u.test(raw)) throw new Error('real mode needs PERSONA_REAL_TURN_CAP set to an integer (the limiter is the second guard)')
  const cap = Number(raw)
  if (cap > PAIR_REAL_CALL_CAP) throw new Error(`PERSONA_REAL_TURN_CAP ${raw} is over the ${String(PAIR_REAL_CALL_CAP)}-call cap Atlas allowed`)
  const ledger = env.PERSONA_REAL_TURN_LEDGER
  if (ledger === undefined || ledger === '' || !isAbsolute(ledger)) throw new Error('real mode needs PERSONA_REAL_TURN_LEDGER as an absolute path')
  return { cap, ledger }
}

export type PairRealArm = 'cli_direct' | 'persona' | 'persona_lean'
export type PairRealStep = 'direct' | 'triage' | 'execution' | 'ttl_probe'
export type PairRealPass = 'cold' | 'warm' | 'after_gap'

export interface PairRealCall {
  readonly arm: PairRealArm
  readonly step: PairRealStep
  readonly pass: PairRealPass
  readonly prompt: string
}

export interface PairRealPlan {
  readonly task: string
  readonly cli: 'claude'
  readonly model: 'haiku'
  readonly calls: readonly PairRealCall[]
  /** Calls in total, for the cap check. */
  readonly callCount: number
  /** The ready criterion: words a good answer must contain (lower case). */
  readonly needles: readonly string[]
}

/** The task: one ask a person would make, with the evidence a person would paste to the CLI. */
export const PAIR_REAL_TASK = {
  prompt: 'Implemente o filtro de pedidos.',
  evidence: 'Critério: filtro por data e status funcionando, com teste.',
  needles: ['filtro'],
} as const

/**
 * Same model on both arms: no cheap routing, so only the prompt design differs. The triage call stays in the plan
 * even though the host skips it since D-073: its real tokens are what `skipTriage` saves, so the run measures them.
 */
function sameModel(levers: LeverSet): LeverSet {
  return { ...levers, talkOnCheap: false, supportOnCheap: false, skipTriage: false }
}

function firstPrompt(report: FaithfulReport, kind: 'triage' | 'execution'): string {
  return report.turns.find(turn => turn.entry.kind === kind)?.prompt ?? ''
}

/**
 * The calls of one pair: cold pass, warm pass (same prompts again), and a TTL probe after a gap.
 * The Persona arm is the host as wired; the lean arm only adds the W3 rule to the worker prompt.
 * @param levers - How Persona is wired at the time of the run (default: the host today).
 * @returns Plan with `callCount` ≤ {@link PAIR_REAL_CALL_CAP}.
 */
export function buildPairRealPlan(levers: LeverSet = LEVERS_AS_WIRED): PairRealPlan {
  const base = sameModel(levers)
  const cold = runFaithfulScenario('multi-review', base)
  const warm = runFaithfulScenario('multi-review', base, { warm: true })
  const leanCold = runFaithfulScenario('multi-review', { ...base, leanReports: true })
  const leanWarm = runFaithfulScenario('multi-review', { ...base, leanReports: true }, { warm: true })
  const direct = `${PAIR_REAL_TASK.prompt}\n${PAIR_REAL_TASK.evidence}`
  const calls: PairRealCall[] = []
  const pass = (which: 'cold' | 'warm', plain: FaithfulReport, lean: FaithfulReport): void => {
    calls.push({ arm: 'cli_direct', step: 'direct', pass: which, prompt: direct })
    calls.push({ arm: 'persona', step: 'triage', pass: which, prompt: firstPrompt(plain, 'triage') })
    calls.push({ arm: 'persona', step: 'execution', pass: which, prompt: firstPrompt(plain, 'execution') })
    calls.push({ arm: 'persona_lean', step: 'execution', pass: which, prompt: firstPrompt(lean, 'execution') })
  }
  pass('cold', cold, leanCold)
  pass('warm', warm, leanWarm)
  calls.push({ arm: 'persona', step: 'ttl_probe', pass: 'after_gap', prompt: firstPrompt(warm, 'triage') })
  if (calls.length > PAIR_REAL_CALL_CAP) throw new Error(`PAIR_REAL_PLAN_OVER_CAP ${String(calls.length)}`)
  return { task: PAIR_REAL_TASK.prompt, cli: 'claude', model: 'haiku', calls, callCount: calls.length, needles: PAIR_REAL_TASK.needles }
}

/** What a runner stream may carry (structural: the entry script passes real `RunEvent`s). */
export interface PairRealEvent {
  readonly type: string
  readonly text?: string
  readonly usage?: {
    readonly inputTokens: number
    readonly outputTokens: number
    readonly cacheReadTokens?: number
    readonly cacheWriteTokens?: number
  }
  readonly report?: { readonly summary?: string }
}

export interface PairRealRunner<H extends CoordRealHandle = CoordRealHandle> {
  start(input: { readonly prompt: string; readonly step: PairRealStep }): Promise<H>
  stream(handle: H): AsyncIterable<PairRealEvent>
  cancel(handle: H): Promise<void>
  dispose?(): Promise<void>
}

export interface PairRealResult {
  readonly arm: PairRealArm
  readonly step: PairRealStep
  readonly pass: PairRealPass
  /** Our 4-chars estimate of the prompt, to calibrate against the vendor's count. */
  readonly estimatedPromptTokens: number
  /** Raw vendor counters; `undefined` when the adapter reported none (absence ≠ 0). */
  readonly inputTokens: number | undefined
  readonly outputTokens: number | undefined
  readonly cacheReadTokens: number | undefined
  readonly cacheWriteTokens: number | undefined
  readonly text: string
  readonly durationMs: number
  /** Ready criterion on the answer (only the steps that answer the task); undefined elsewhere. */
  readonly ready: boolean | undefined
}

/**
 * Fold one stream: text from deltas (or the ended summary), usage from the last usage event
 * (adapters report cumulative totals).
 * @param events - Runner stream.
 */
export async function foldPairRealEvents(events: AsyncIterable<PairRealEvent>): Promise<{
  readonly text: string
  readonly usage: PairRealEvent['usage'] | undefined
}> {
  let text = ''
  let summary = ''
  let usage: PairRealEvent['usage'] | undefined
  for await (const event of events) {
    if (event.type === 'delta' && event.text !== undefined) text += event.text
    if (event.type === 'usage' && event.usage !== undefined) usage = event.usage
    if (event.type === 'ended' && event.report?.summary !== undefined) summary = event.report.summary
  }
  return { text: text === '' ? summary : text, usage }
}

export interface RunPairRealOptions {
  /** Per-call budget (default 45 s, the coord-real cap; the real entry passes 5 min). */
  readonly turnMs?: number
  /** Sleep before the TTL probe. Tests pass a no-op. */
  readonly sleep?: (ms: number) => Promise<void>
  readonly gapMs?: number
  /** Called after each call (progress line). */
  readonly onCall?: (result: PairRealResult, index: number, total: number) => void
}

function readyOf(step: PairRealStep, text: string, needles: readonly string[]): boolean | undefined {
  if (step !== 'direct' && step !== 'execution') return undefined
  const lower = text.toLowerCase()
  return needles.every(needle => lower.includes(needle.toLowerCase()))
}

/**
 * Run the plan one call at a time. Every call: start → fold → always cancel; a timeout cancels first;
 * the runner is disposed once at the end (also on error).
 * @param runner - Dry (scripted) or real runner.
 * @param plan - From {@link buildPairRealPlan}.
 */
export async function runPairReal(
  runner: PairRealRunner,
  plan: PairRealPlan,
  options: RunPairRealOptions = {},
): Promise<PairRealResult[]> {
  if (plan.callCount > PAIR_REAL_CALL_CAP) throw new Error(`PAIR_REAL_OVER_CAP ${String(plan.callCount)}`)
  const sleep = options.sleep ?? (async (ms: number) => { await new Promise<void>((resolve) => { setTimeout(resolve, ms) }) })
  const turnMs = options.turnMs ?? COORD_REAL_TURN_MS
  const results: PairRealResult[] = []
  try {
    for (const [index, call] of plan.calls.entries()) {
      if (call.pass === 'after_gap') await sleep(options.gapMs ?? PAIR_REAL_TTL_PROBE_GAP_MS)
      const started = Date.now()
      const handle = await runner.start({ prompt: call.prompt, step: call.step })
      let folded: Awaited<ReturnType<typeof foldPairRealEvents>>
      try {
        folded = await withTimeout(turnMs, foldPairRealEvents(runner.stream(handle)), async () => {
          await finishSession(runner, handle)
        })
      } finally {
        await finishSession(runner, handle)
      }
      const result: PairRealResult = {
        arm: call.arm,
        step: call.step,
        pass: call.pass,
        estimatedPromptTokens: estimateTokens(call.prompt),
        inputTokens: folded.usage?.inputTokens,
        outputTokens: folded.usage?.outputTokens,
        cacheReadTokens: folded.usage?.cacheReadTokens,
        cacheWriteTokens: folded.usage?.cacheWriteTokens,
        text: folded.text,
        durationMs: Date.now() - started,
        ready: readyOf(call.step, folded.text, plan.needles),
      }
      results.push(result)
      options.onCall?.(result, index + 1, plan.callCount)
    }
    return results
  } finally {
    if (runner.dispose !== undefined) {
      try {
        await runner.dispose()
      } catch (error) {
        void error
      }
    }
  }
}

export interface PairRealSummary {
  readonly calls: number
  /** Vendor input per call minus our estimate of the prompt: the base the CLI adds (null if unreported). */
  readonly vendorBaseEstimate: number | null
  /** Real input ÷ our estimate, over the Persona calls (null if unreported). */
  readonly tokenizerRatio: number | null
  /** True/false when the probe after the gap read cache; null when not reported or not run. */
  readonly cacheSurvivedGap: boolean | null
  /** W3: real output of the short-report worker ÷ the plain worker, cold pass (null if unreported). */
  readonly leanOutputRatio: number | null
  /** The same on the warm pass (null if unreported). */
  readonly leanOutputRatioWarm: number | null
  /** W3: both workers met the ready criterion (null when a call is missing). */
  readonly leanReadyHeld: boolean | null
}

/**
 * Total prompt tokens of a row. The OAR adapter reports `inputTokens` as the TOTAL, with the cache read and write as parts of it
 * (measured 04/11: 305 652 in, 299 762 read, 5 888 written, 2 uncached). A total can never be below its own cached part; if it is,
 * the adapter reported the uncached input alone and the cache counters are added.
 * @param row - One call.
 */
export function inputOf(row: PairRealResult): number | undefined {
  if (row.inputTokens === undefined) return undefined
  const cached = (row.cacheReadTokens ?? 0) + (row.cacheWriteTokens ?? 0)
  return row.inputTokens >= cached ? row.inputTokens : row.inputTokens + cached
}

/**
 * What the run measured, in the shape `estimateAsk` takes (`AskCalibration`). Only what the CLI reported: a missing counter
 * leaves the field out, never 0. Time comes from the pair rows; base and ratio only from `base` (single-request calls). `conversa` is not measured by this run (no talk call), so no time is given for it.
 * @param results - Output of {@link runPairReal}.
 */
export function calibrationFrom(results: readonly PairRealResult[], base?: { readonly vendorBaseTokens?: number; readonly tokenizerRatio?: number }): AskCalibration {
  const range = (rows: readonly PairRealResult[]): { readonly min: number; readonly max: number } | undefined => {
    const seconds = rows.map(row => row.durationMs / 1000).filter(value => Number.isFinite(value) && value > 0)
    if (seconds.length === 0) return undefined
    return { min: Math.round(Math.min(...seconds) * 10) / 10, max: Math.round(Math.max(...seconds) * 10) / 10 }
  }
  const execucao = range(results.filter(row => row.arm === 'persona' && row.step === 'execution'))
  const triagem = range(results.filter(row => row.arm === 'persona' && row.step === 'triage'))
  return {
    // The pair totals are the whole CLI session (all its inner requests), so they say nothing about ONE request: the base and the
    // tokenizer ratio come only from the single-request calls (pair-real-base.ts) when the caller has them.
    ...(base?.vendorBaseTokens === undefined ? {} : { vendorBaseTokens: Math.round(base.vendorBaseTokens) }),
    ...(base?.tokenizerRatio === undefined ? {} : { tokenizerRatio: Math.round(base.tokenizerRatio * 1000) / 1000 }),
    ...(execucao === undefined && triagem === undefined ? {} : {
      secondsPerCall: { ...(execucao === undefined ? {} : { execucao }), ...(triagem === undefined ? {} : { triagem }) },
    }),
  }
}

/**
 * What the run calibrates. Input is read as uncached + cache read + cache write; if an adapter
 * reports `inputTokens` as the total already, `vendorBaseEstimate` is then a lower bound — the
 * raw counters stay in the table so the reader can tell.
 * @param results - Output of {@link runPairReal}.
 */
export function summarizePairReal(results: readonly PairRealResult[]): PairRealSummary {
  const direct = results.find(row => row.step === 'direct' && row.pass === 'cold')
  const directInput = direct === undefined ? undefined : inputOf(direct)
  const vendorBase = direct === undefined || directInput === undefined ? null : Math.max(0, directInput - direct.estimatedPromptTokens)
  const persona = results.filter(row => row.arm !== 'cli_direct' && row.step !== 'ttl_probe')
  // Real input = vendor base + our prompt × ratio, so the base comes OFF before the ratio (it is ~100× the Persona prompt).
  const sums = persona.reduce((acc, row) => {
    const input = inputOf(row)
    return input === undefined || vendorBase === null ? acc : { real: acc.real + Math.max(0, input - vendorBase), est: acc.est + row.estimatedPromptTokens }
  }, { real: 0, est: 0 })
  const probe = results.find(row => row.step === 'ttl_probe')
  const plain = results.find(row => row.arm === 'persona' && row.step === 'execution' && row.pass === 'cold')
  const lean = results.find(row => row.arm === 'persona_lean' && row.step === 'execution' && row.pass === 'cold')
  const plainWarm = results.find(row => row.arm === 'persona' && row.step === 'execution' && row.pass === 'warm')
  const leanWarm = results.find(row => row.arm === 'persona_lean' && row.step === 'execution' && row.pass === 'warm')
  const warmRatio = plainWarm?.outputTokens === undefined || leanWarm?.outputTokens === undefined || plainWarm.outputTokens === 0
    ? null
    : leanWarm.outputTokens / plainWarm.outputTokens
  const ratio = plain?.outputTokens === undefined || lean?.outputTokens === undefined || plain.outputTokens === 0
    ? null
    : lean.outputTokens / plain.outputTokens
  return {
    calls: results.length,
    vendorBaseEstimate: vendorBase,
    tokenizerRatio: sums.est === 0 ? null : sums.real / sums.est,
    cacheSurvivedGap: probe === undefined || probe.cacheReadTokens === undefined ? null : probe.cacheReadTokens > 0,
    leanOutputRatio: ratio,
    leanOutputRatioWarm: warmRatio,
    leanReadyHeld: plain?.ready === undefined || lean?.ready === undefined ? null : plain.ready && lean.ready,
  }
}

function cell(value: number | undefined): string {
  return value === undefined ? 'n/d' : String(value)
}

/**
 * Markdown for `persona-spec/reports/pair-real.md`.
 * @param results - Rows.
 * @param mode - `dry` (scripted, proves the harness) or `real`.
 */
export function formatPairRealMarkdown(results: readonly PairRealResult[], mode: 'dry' | 'real'): string {
  const summary = summarizePairReal(results)
  const lean = summary.leanOutputRatio === null ? 'n/d' : summary.leanOutputRatio.toFixed(2)
  const held = summary.leanReadyHeld === null ? 'n/d' : summary.leanReadyHeld ? 'sim' : 'não'
  return [
    `# Rodada pareada ${mode === 'real' ? 'REAL' : 'em modo seco (scriptado, sem CLI)'} — Tally`,
    '',
    mode === 'dry'
      ? 'Prova do harness: plano, tetos, ciclo de vida e relatório. **Nenhum número abaixo é de CLI real.**'
      : 'Claude haiku nos dois lados, mesma tarefa. Contadores brutos do vendor; ausência = n/d (nunca 0).',
    '',
    `Chamadas: ${String(summary.calls)} (teto ${String(PAIR_REAL_CALL_CAP)}).`,
    '',
    '| braço | passo | passagem | prompt estimado | entrada | saída | cache lido | cache gravado | pronto | ms |',
    '|---|---|---|---:|---:|---:|---:|---:|---|---:|',
    ...results.map(row => `| ${row.arm} | ${row.step} | ${row.pass} | ${String(row.estimatedPromptTokens)} | ${cell(row.inputTokens)} | ${cell(row.outputTokens)} | ${cell(row.cacheReadTokens)} | ${cell(row.cacheWriteTokens)} | ${row.ready === undefined ? '—' : row.ready ? 'sim' : 'não'} | ${String(row.durationMs)} |`),
    '',
    `- Entrada TOTAL da chamada direta fria: ${summary.vendorBaseEstimate === null ? 'n/d' : String(summary.vendorBaseEstimate)} tokens (a soma de todas as requisições internas da CLI naquela chamada; o contador do adaptador é da sessão inteira, não o tamanho de um prompt).`,
    `- Cache sobreviveu a ${String(Math.round(PAIR_REAL_TTL_PROBE_GAP_MS / 60_000))} min: ${summary.cacheSurvivedGap === null ? 'n/d' : summary.cacheSurvivedGap ? 'sim (TTL > 5 min)' : 'não (TTL ≤ 5 min)'}.`,
    `- W3 (relato curto): saída real ÷ saída do worker normal = ${lean} (fria) e ${summary.leanOutputRatioWarm === null ? 'n/d' : summary.leanOutputRatioWarm.toFixed(2)} (quente); os dois cumpriram o critério de pronto: ${held}.`,
    '',
  ].join('\n')
}
