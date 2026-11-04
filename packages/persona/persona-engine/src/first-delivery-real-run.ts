/** Pure validation of persisted first-delivery usage and the shared real-run budget. */
import { sumLayers, type TurnKind, type TurnLayerSizes, type TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { FIRST_DELIVERY_MAX_PAID_TURNS, verifyFirstDeliveryRun,
  type FirstDeliveryRunEvidence, type FirstDeliveryRunFailure, type FirstDeliveryRunResult } from './first-delivery-run.ts'

/** Authorization ceiling across the entire D-069 run, including failed attempts. */
export const FIRST_DELIVERY_REAL_TURN_CAP: number = 3
/** A failed attempt does not authorize an unbounded retry loop, even when it spent no turn. */
export const FIRST_DELIVERY_REAL_ATTEMPT_CAP: number = 3

/** Raw persisted values are decoded here; observation fields come from the existing acceptance collector. */
export interface RealFirstDeliveryRunInput {
  readonly observation: Omit<FirstDeliveryRunEvidence, 'entries'>
  /** Complete canonical TurnLedgerEntry rows, including all failed and coordination calls. */
  readonly ledger: unknown
  /** Entire authorization history, including this attempt; each settled row must have paidTurns. */
  readonly attempts: unknown
  /** One-based index of the current, last attempt. */
  readonly currentAttempt: number
}

/** Stable failures without persisted payloads or local filenames. */
export type RealFirstDeliveryRunFailure = FirstDeliveryRunFailure
  | 'ledger-corrupt' | 'attempt-history-corrupt' | 'attempt-count-budget'
  | 'attempt-turn-budget' | 'total-paid-turn-budget' | 'attempt-ledger-mismatch'

/** Missing or invalid usage remains unknown rather than being reported as zero. */
export interface RealFirstDeliveryRunResult {
  readonly passed: boolean
  readonly failed: readonly RealFirstDeliveryRunFailure[]
  readonly run: FirstDeliveryRunResult | null
  readonly ledgerValid: boolean
  readonly attemptsValid: boolean
  readonly paidTurnsTotal: number | null
  readonly executionTurns: number | null
  readonly triageTurns: number | null
  /** The canonical ledger has no inject kind; an inject row fails decoding. */
  readonly injectTurns: 0 | null
}

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}
function array(value: unknown): value is readonly unknown[] { return Array.isArray(value) }
function count(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 }
function identity(value: unknown): value is string { return typeof value === 'string' && value.trim() !== '' }
function optionalIdentity(value: unknown): value is string | undefined { return value === undefined || identity(value) }
function isoAt(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}T(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d(?:\.\d+)?)?(?:Z|[+-](?:[01]\d|2[0-3]):[0-5]\d)$/u.test(value)) return false
  const date = value.slice(0, 10)
  const midnight = Date.parse(`${date}T00:00:00Z`)
  return Number.isFinite(midnight) && new Date(midnight).toISOString().slice(0, 10) === date && Number.isFinite(Date.parse(value))
}
function kind(value: unknown): TurnKind | undefined {
  switch (value) {
    case 'triage': case 'reply': case 'execution': case 'initiative': case 'librarian': case 'watchdog': case 'evaluation': return value
    default: return undefined // Persisted unknown kinds, including inject, cannot establish a valid run.
  }
}
function layers(value: unknown): TurnLayerSizes | undefined {
  if (!object(value) || !count(value.system) || !count(value.tools) || !count(value.required)
    || !count(value.subject) || !count(value.recall) || !count(value.message)) return undefined
  return { system: value.system, tools: value.tools, required: value.required,
    subject: value.subject, recall: value.recall, message: value.message }
}
function readLedger(value: unknown): TurnLedgerEntry[] | undefined {
  if (!array(value)) return undefined
  const rows: TurnLedgerEntry[] = []
  const ids = new Set<string>()
  for (const row of value) {
    if (!object(row) || !identity(row.id) || !identity(row.personaId) || !identity(row.engine)
      || !count(row.inputTokens) || !count(row.outputTokens) || !count(row.cacheReadTokens) || !count(row.cacheWriteTokens)
      || !identity(row.at) || !isoAt(row.at)
      || !optionalIdentity(row.ticketId) || !optionalIdentity(row.accountId)
      || (row.origin !== undefined && row.origin !== 'measured' && row.origin !== 'estimate')) return undefined
    const turnKind = kind(row.kind)
    const turnLayers = layers(row.layers)
    if (turnKind === undefined || turnLayers === undefined || sumLayers(turnLayers) > row.inputTokens || ids.has(row.id)) return undefined
    ids.add(row.id)
    rows.push({ id: row.id, personaId: row.personaId, engine: row.engine, kind: turnKind,
      inputTokens: row.inputTokens, outputTokens: row.outputTokens, cacheReadTokens: row.cacheReadTokens,
      cacheWriteTokens: row.cacheWriteTokens, layers: turnLayers, at: row.at,
      ...(row.ticketId === undefined ? {} : { ticketId: row.ticketId }),
      ...(row.accountId === undefined ? {} : { accountId: row.accountId }),
      ...(row.origin === undefined ? {} : { origin: row.origin }) })
  }
  return rows
}
function readAttempts(value: unknown): number[] | undefined {
  if (!array(value)) return undefined
  const turns: number[] = []
  for (const attempt of value) {
    if (!object(attempt) || !count(attempt.paidTurns)) return undefined
    turns.push(attempt.paidTurns)
  }
  return Number.isSafeInteger(turns.reduce((sum, paid) => sum + paid, 0)) ? turns : undefined
}

/**
 * Validate one real acceptance run after shutdown without reading files or starting a runner.
 * Unknown/corrupt rows and unsettled attempt counts fail closed. Exactly one execution, zero
 * other turns and at most three paid turns across all attempts are required. This validates
 * supplied persisted observations; the runner owns pre-turn enforcement and durable reservation.
 * @param input - Current full usage ledger, entire settled attempt history and app observations.
 * @returns Acceptance failures and counts, with unknown values retained as null.
 */
export function verifyRealFirstDeliveryRun(input: RealFirstDeliveryRunInput): RealFirstDeliveryRunResult {
  const ledger = readLedger(input.ledger)
  const attempts = readAttempts(input.attempts)
  const failed: RealFirstDeliveryRunFailure[] = []
  const run = ledger === undefined ? null : verifyFirstDeliveryRun({ ...input.observation, entries: ledger })
  if (ledger === undefined) failed.push('ledger-corrupt')
  else if (run !== null) failed.push(...run.failed)
  const paidTurnsTotal = attempts === undefined ? null : attempts.reduce((sum, paid) => sum + paid, 0)
  if (attempts === undefined) failed.push('attempt-history-corrupt')
  else {
    if (attempts.length > FIRST_DELIVERY_REAL_ATTEMPT_CAP) failed.push('attempt-count-budget')
    if (attempts.some(paid => paid > FIRST_DELIVERY_MAX_PAID_TURNS)) failed.push('attempt-turn-budget')
    if (paidTurnsTotal !== null && paidTurnsTotal > FIRST_DELIVERY_REAL_TURN_CAP) failed.push('total-paid-turn-budget')
    if (!Number.isSafeInteger(input.currentAttempt) || input.currentAttempt < 1 || input.currentAttempt !== attempts.length
      || (ledger !== undefined && attempts[input.currentAttempt - 1] !== ledger.length)) failed.push('attempt-ledger-mismatch')
  }
  return { passed: failed.length === 0, failed, run, ledgerValid: ledger !== undefined, attemptsValid: attempts !== undefined,
    paidTurnsTotal, executionTurns: ledger?.filter(row => row.kind === 'execution').length ?? null,
    triageTurns: ledger?.filter(row => row.kind === 'triage').length ?? null, injectTurns: ledger === undefined ? null : 0 }
}
