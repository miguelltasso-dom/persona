/**
 * The watchdog of the REAL team round: the app's own limiter (`PERSONA_REAL_TURN_CAP`) is the first line, this is the second — read from the run's `turn_ledger` every
 * 1.5 s by the harness, which kills the host the moment it says stop. Two reasons to stop: more paid turns than the cap, or a turn that weighs like the NATIVE mode
 * (D-085: ~309 mil tokens of input per call against ~3–6 mil in answer-only), which would turn a short round into millions of tokens. Pure.
 */
import type { LedgerEvidence, LedgerRow } from './ledger-evidence.ts'

/**
 * Limits of the watchdog (Tally's measured numbers, 05/11): in answer-only a request weighs 5–12 mil input tokens and a whole GOOD turn (a worker with 5–6 tool calls sums
 * every request) 50–60 mil; the NATIVE mode weighs ~309 mil. So: a hard stop for one turn at 100 mil, a hard stop for the round at 260 mil, warnings from 40 mil / 150 mil, and —
 * the precise signal — every turn of a REAL round must say it ran `answer-only` or `needed` (`turn_ledger.env_mode`).
 *
 * The numbers are PRICE-WEIGHTED since attempt 3 (Keel/Atlas 07/11): the ledger's `input` INCLUDES the cache parts, and a good 10-turn round that reads its cache again and again
 * summed 329 mil of raw input (258 mil of them cache READS, billed at a tenth) — the old raw 260 mil stop killed a productive round at its 10th turn. A call is now weighed as the
 * provider bills it: fresh input ×1, cache read ×0.1, cache write ×1.25 (`priceWeightedInput`). A native call (a ~309 mil cache WRITE) still weighs ~386 mil, far above every limit.
 */
export const HEAVY_TURN_INPUT_TOKENS = 100_000
export const ROUND_INPUT_ABORT_TOKENS = 260_000
export const TURN_INPUT_WARN_TOKENS = 40_000
export const ROUND_INPUT_WARN_TOKENS = 150_000

/**
 * @param row - One measured turn of the ledger (`input` already includes `cacheRead` and `cacheWrite`).
 * @returns The input of that turn weighed as it is billed: fresh ×1 + cache read ×0.1 + cache write ×1.25.
 */
export function priceWeightedInput(row: Pick<LedgerRow, 'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>): number {
  const read = Math.max(0, row.cacheReadTokens)
  const write = Math.max(0, row.cacheWriteTokens)
  const fresh = Math.max(0, row.inputTokens - read - write)
  return fresh + 0.1 * read + 1.25 * write
}

export interface GuardOptions {
  /** REAL round: a `native` turn, or one that does not say its mode, stops the host. */
  readonly requireEnvMode?: boolean
}

/** @returns Why the host must be killed now, or `undefined` while the round is inside its limits. */
export function ledgerGuard(ledger: LedgerEvidence | undefined, cap: number, options: GuardOptions = {}): string | undefined {
  if (ledger === undefined) return undefined
  if (ledger.turns > cap) return `ledger shows ${String(ledger.turns)} paid turn(s), above the cap of ${String(cap)}: host killed`
  if (options.requireEnvMode === true) {
    const native = ledger.rows.find(row => row.envMode === 'native')
    if (native !== undefined) return `a ${native.kind} turn ran in NATIVE mode (the person's own tools and connectors loaded), not answer-only; host killed`
    // A turn that does NOT say its mode is a WARNING (see `ledgerWarnings`), not a kill: killing on silence could waste the only attempt on a kind of call that simply does not
    // book the column; a native turn that stays silent is still caught by its weight below.
  }
  const heavy = ledger.rows.find(row => priceWeightedInput(row) > HEAVY_TURN_INPUT_TOKENS)
  if (heavy !== undefined) return `a ${heavy.kind} turn weighed ${String(Math.round(priceWeightedInput(heavy)))} price-weighted input tokens (raw ${String(heavy.inputTokens)}; > ${String(HEAVY_TURN_INPUT_TOKENS)}): it looks like the NATIVE mode, not answer-only; host killed`
  const total = ledger.rows.reduce((sum, row) => sum + priceWeightedInput(row), 0)
  if (total > ROUND_INPUT_ABORT_TOKENS) return `the round already spent ${String(Math.round(total))} price-weighted input tokens (> ${String(ROUND_INPUT_ABORT_TOKENS)}): host killed`
  return undefined
}

/** Non-fatal warnings for the proof (a heavy-ish turn, or a round trending above the estimate). */
export function ledgerWarnings(ledger: LedgerEvidence | undefined, options: GuardOptions = {}): string[] {
  if (ledger === undefined) return []
  const warnings: string[] = options.requireEnvMode === true
    ? ledger.rows.filter(row => row.envMode === null || row.envMode === undefined).map(row => `a ${row.kind} turn did not report its environment mode (answer-only unproven for it)`)
    : []
  warnings.push(...ledger.rows.filter(row => priceWeightedInput(row) > TURN_INPUT_WARN_TOKENS).map(row => `a ${row.kind} turn weighed ${String(Math.round(priceWeightedInput(row)))} price-weighted input tokens (raw ${String(row.inputTokens)}; > ${String(TURN_INPUT_WARN_TOKENS)})`))
  const total = ledger.rows.reduce((sum, row) => sum + priceWeightedInput(row), 0)
  if (total > ROUND_INPUT_WARN_TOKENS) warnings.push(`the round spent ${String(Math.round(total))} price-weighted input tokens (> ${String(ROUND_INPUT_WARN_TOKENS)})`)
  return warnings
}

interface GateRecord { readonly ok?: unknown }
const recordOk = (table: unknown, key: string): boolean => (table !== null && typeof table === 'object' ? (table as Record<string, GateRecord | undefined>)[key]?.ok === true : false)

/**
 * "Isolation proven before" (Atlas): the product applies answer-only / needed only to a CLI version it PROVED (dry probes, persisted in the isolation gate); otherwise the call
 * runs NATIVE (~309 mil tokens). So before any paid turn the gate file must hold the verdict of THIS `claude` version for both modes and the parity of THIS model and THIS state
 * of the person's settings. Pure: the caller reads the file, the version (`claude --version`, no turn) and the settings fingerprint.
 * @returns What is not proven, empty when the isolated launch is proven for this combination.
 */
export function isolationProofProblems(gate: unknown, version: string, fingerprint: string, modelArg: string): string[] {
  if (gate === undefined || gate === null || typeof gate !== 'object') return ['no isolation gate file: nothing was proven for this CLI (a call would run native)']
  const file = gate as { verdicts?: unknown; parity?: unknown }
  const problems: string[] = []
  // D-096 (Tally): the prewarm proves only the mode IN FORCE (`answer-only` before the 2nd host window, `needed` after it — the default flips), so a fresh gate file may hold just one.
  // Isolated is what matters: either proof is enough, none is not (every turn is then checked by its `env_mode`, and `native` kills the host).
  if (!recordOk(file.verdicts, `${version}|answer-only`) && !recordOk(file.verdicts, `${version}|needed`)) problems.push(`no isolated launch (answer-only or needed) is proven for ${version}: a call would run native`)
  if (!recordOk(file.parity, `${version}|${modelArg === '' ? 'default' : modelArg}|${fingerprint}`)) problems.push(`model parity is not proven for ${version}, model ${modelArg} and the current state of the settings (fingerprint ${fingerprint})`)
  return problems
}
