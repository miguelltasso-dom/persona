/**
 * OPT-9: the `estimateAsk` calibration of THIS person, read from their own measured turns (`turn_ledger`).
 * Pure: no store, no clock of its own, no model call. Contract: persona-spec/contracts/estimate-calibration.md.
 *
 * Honesty rules (they are the reason for every guard below):
 * - only `origin: 'measured'` rows count — a number a CLI reported, never one we estimated;
 * - only the SAME engine and the SAME account (a limit or speed of another account says nothing about this one);
 * - fewer than {@link MIN_CALIBRATION_SAMPLES} rows of a kind ⇒ that kind stays ABSENT ("não sei"), never a guess;
 * - time needs its own measured duration; a row without one never contributes a time (and is never given a 0);
 * - the numbers of the dev machine are not read here at all.
 */

import type { TurnKind, TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { ledgerInputTotal } from './ledger-input.ts'

/** Fewest measured turns of one kind before the host says anything about it. */
export const MIN_CALIBRATION_SAMPLES = 5
/** Newest rows read per kind. */
export const MAX_CALIBRATION_ROWS = 50
/** Oldest turn that still counts. */
export const CALIBRATION_WINDOW_DAYS = 30

/**
 * Earliest ISO instant whose turns still count at `now` (lets the caller bound the ledger read).
 * @param now - ISO instant of the estimate.
 */
export function calibrationWindowStart(now: string): string | undefined {
  const at = Date.parse(now)
  return Number.isFinite(at) ? new Date(at - CALIBRATION_WINDOW_DAYS * 86_400_000).toISOString() : undefined
}

/** Inclusive interval (same shape as the engine's `Range`). */
export interface HistoryRange {
  readonly min: number
  readonly max: number
}

/** Measured tokens of ONE call (the measured input already carries the vendor's own base prompt). */
export interface HistoryCallTokens {
  readonly input: HistoryRange
  readonly output: HistoryRange
}

/** The kinds of the ask, keyed as the engine's `AskCalibration` keys them. */
export type CalibratedKind = 'conversa' | 'execucao' | 'triagem'

const KIND_OF: Readonly<Partial<Record<TurnKind, CalibratedKind>>> = {
  reply: 'conversa',
  execution: 'execucao',
  triage: 'triagem',
}

/** How many rows stand behind each statement, so the screen can say "pelas suas últimas N conversas". */
export interface HistorySamples {
  readonly tokens: number
  readonly tempo: number
}

/** What the host hands to the engine as `calibracao` (a superset of the engine's `AskCalibration`). */
export interface HistoryCalibration {
  /** Seconds per call: P25..P75 of this person's own measured wall times. */
  readonly secondsPerCall?: { readonly [K in CalibratedKind]?: HistoryRange }
  /** Median seconds per call. */
  readonly mediana?: { readonly [K in CalibratedKind]?: number }
  /** Measured tokens per call: P25..P75, input and output. */
  readonly tokensPerCall?: { readonly [K in CalibratedKind]?: HistoryCallTokens }
  readonly samples?: { readonly [K in CalibratedKind]?: HistorySamples }
  readonly source: 'history'
}

/** Whose history counts. */
export interface CalibrationScope {
  /** The engine that will answer (`claude`, `codex`, …). */
  readonly engine: string
  /** The account that will answer; absent = the persona has no account recorded. */
  readonly accountId?: string
  /** ISO instant of the estimate (the window ends here). */
  readonly now: string
}

/**
 * Linear-interpolation quantile (the usual "type 7") of an ascending list.
 * @param sorted - Ascending, non-empty.
 * @param q - 0..1.
 */
export function quantile(sorted: readonly number[], q: number): number {
  if (sorted.length === 0) throw new Error('quantile-empty')
  const at = (sorted.length - 1) * q
  const low = Math.floor(at)
  const high = Math.ceil(at)
  const a = sorted[low] ?? 0
  const b = sorted[high] ?? a
  return a + (b - a) * (at - low)
}

function summary(values: readonly number[]): { readonly range: HistoryRange; readonly median: number } {
  const sorted = [...values].sort((a, b) => a - b)
  return {
    range: { min: quantile(sorted, 0.25), max: quantile(sorted, 0.75) },
    median: quantile(sorted, 0.5),
  }
}

const roundSeconds = (ms: number): number => Math.round(ms / 100) / 10
const roundTokens = (value: number): number => Math.round(value)

/**
 * Build the calibration of one person from their measured turns.
 * @param entries - Ledger rows of the project (any order, any kind, any engine).
 * @param scope - Engine, account and "now" the estimate is for.
 * @returns The calibration, or `undefined` when no kind has enough measured history yet.
 */
export function calibrationFromLedger(
  entries: readonly TurnLedgerEntry[],
  scope: CalibrationScope,
): HistoryCalibration | undefined {
  const now = Date.parse(scope.now)
  const earliest = Number.isFinite(now) ? now - CALIBRATION_WINDOW_DAYS * 86_400_000 : Number.NEGATIVE_INFINITY
  const byKind = new Map<CalibratedKind, TurnLedgerEntry[]>()
  for (const entry of entries) {
    const kind = KIND_OF[entry.kind]
    if (kind === undefined) continue
    if (entry.origin !== 'measured' || entry.engine !== scope.engine) continue
    if ((entry.accountId ?? '') !== (scope.accountId ?? '')) continue
    const at = Date.parse(entry.at)
    if (!Number.isFinite(at) || at < earliest || (Number.isFinite(now) && at > now)) continue
    byKind.set(kind, [...(byKind.get(kind) ?? []), entry])
  }

  const seconds: { -readonly [K in CalibratedKind]?: HistoryRange } = {}
  const median: { -readonly [K in CalibratedKind]?: number } = {}
  const tokens: { -readonly [K in CalibratedKind]?: HistoryCallTokens } = {}
  const samples: { -readonly [K in CalibratedKind]?: HistorySamples } = {}
  for (const [kind, rows] of byKind) {
    const newest = [...rows].sort((a, b) => b.at.localeCompare(a.at) || b.id.localeCompare(a.id)).slice(0, MAX_CALIBRATION_ROWS)
    const timed = newest.filter(row => row.durationMs !== undefined)
    let tokenRows = 0
    let timedRows = 0
    if (newest.length >= MIN_CALIBRATION_SAMPLES) {
      const input = summary(newest.map(ledgerInputTotal))
      const output = summary(newest.map(row => row.outputTokens))
      tokens[kind] = {
        input: { min: roundTokens(input.range.min), max: roundTokens(input.range.max) },
        output: { min: roundTokens(output.range.min), max: roundTokens(output.range.max) },
      }
      tokenRows = newest.length
    }
    if (timed.length >= MIN_CALIBRATION_SAMPLES) {
      const time = summary(timed.map(row => row.durationMs ?? 0))
      seconds[kind] = { min: roundSeconds(time.range.min), max: roundSeconds(time.range.max) }
      median[kind] = roundSeconds(time.median)
      timedRows = timed.length
    }
    if (tokenRows > 0 || timedRows > 0) samples[kind] = { tokens: tokenRows, tempo: timedRows }
  }
  if (Object.keys(samples).length === 0) return undefined
  return {
    ...(Object.keys(seconds).length === 0 ? {} : { secondsPerCall: seconds, mediana: median }),
    ...(Object.keys(tokens).length === 0 ? {} : { tokensPerCall: tokens }),
    samples,
    source: 'history',
  }
}
