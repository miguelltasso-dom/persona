/**
 * USD-1 / D-092: a SUBSCRIPTION account never shows dollars on screen; it shows the impact on the quota window and tokens/calls. US$ only for an
 * API-key account, and always as an estimate. This module is the single place that decides which form a number takes (pure, offline).
 *
 * Honesty rules:
 *  - the vendor publishes only the share USED of each window, at 1% resolution (measured 05/11, Claude Max: `seven_day` 67%, a per-model window 0%, NO 5-hour
 *    window); it does not publish the capacity in tokens. The share of the window one ask uses is therefore `tokens ÷ tokens-per-point`, and the second
 *    number exists only CALIBRATED on the person's own account ({@link calibrateQuota}); without it the answer is "not measured", never 0%;
 *  - the window is the one the vendor publishes: `5h` when there is one, otherwise the week;
 *  - `measured` is reserved for what the vendor reported (`usedPct`); our share of the window is `calibrated` at best, never `measured`;
 *  - an unknown account type shows NO money (the safe error is to hide it).
 */

import type { Range } from './estimate-ask.ts'

export type Billing = 'subscription' | 'api' | 'unknown'
export type QuotaWindowId = '5h' | 'week'

/** One window the vendor publishes right now (the official reading). */
export interface QuotaWindowReading {
  readonly id: QuotaWindowId
  /** Share of the window already used (0..100), as the vendor reports it (1% resolution). Absent when the vendor did not publish it. */
  readonly usedPercent?: number
  readonly resetsAt?: string
}

/** Tokens that move the vendor's meter by ONE point, for one window of one account, from the person's own readings. */
export interface QuotaCalibration {
  readonly window: QuotaWindowId
  readonly tokensPerPoint: Range
  /** How many reading pairs stand behind it. */
  readonly rows: number
}

/** The account that runs an ask, as the host knows it (USD-1). Absent = `unknown`: no money. */
export interface AccountInput {
  readonly billing: Billing
  /** The windows the vendor publishes now (official reading). */
  readonly janelas?: readonly QuotaWindowReading[]
  /** Tokens per point of each window, calibrated on this account (none = "cota não medida"). */
  readonly calibracoes?: readonly QuotaCalibration[]
}

/** The impact of an ask on the quota (subscription / unknown). */
export interface QuotaImpact {
  readonly window: QuotaWindowId
  /** Share of the whole window the ask uses (0..100, one decimal). `null` = "cota não medida": no calibration yet. */
  readonly pct: Range | null
  /** Official: share of the window already used. Present even when `pct` is `null`. */
  readonly usedPct?: number
  readonly remainingPct?: number
  readonly resetsAt?: string
  readonly origin: 'calibrated' | 'not-measured'
  /** Where the calibration came from and its caveat. */
  readonly basis?: string
}

/** Pairs of consecutive official readings of ONE window (same reset, no refill between) with the measured tokens spent between them. */
export interface QuotaPair {
  readonly window: QuotaWindowId
  readonly deltaPercent: number
  readonly tokens: number
}

/** Fewest usable pairs, and the smallest rise in points, before a calibration is accepted (1% resolution: a 1-point rise is ±100% error). */
export const MIN_QUOTA_PAIRS = 3
export const MIN_QUOTA_DELTA = 3

const TRUTHY = new Set(['1', 'true', 'yes'])
const set = (value: string | undefined): boolean => value !== undefined && value.trim() !== ''

/**
 * Which kind of account runs this engine.
 * @param input - The engine kind (`cli`, `dsh`, `http`), the CLI name, the process environment the CLI starts with, the plan the vendor reported for the logged account and whether a login is known.
 * @returns `api` for a DSH/HTTP engine with a key or a CLI started with an API key / cloud provider; `subscription` for a logged-in CLI account; `unknown` otherwise.
 */
export function billingOf(input: {
  readonly kind?: string
  readonly cli?: string
  readonly env?: NodeJS.ProcessEnv
  readonly plan?: string
  readonly loggedIn?: boolean
}): Billing {
  const env = input.env ?? {}
  if (input.kind === 'dsh' || input.kind === 'http' || input.kind === 'api') return 'api'
  if (input.kind !== 'cli') return 'unknown'
  if (input.cli === 'claude') {
    const cloud = ['CLAUDE_CODE_USE_BEDROCK', 'CLAUDE_CODE_USE_VERTEX', 'CLAUDE_CODE_USE_FOUNDRY'].some(name => TRUTHY.has((env[name] ?? '').toLowerCase()))
    if (set(env.ANTHROPIC_API_KEY) || cloud) return 'api'
  } else if (input.cli === 'codex') {
    if (set(env.OPENAI_API_KEY) || set(env.CODEX_API_KEY)) return 'api'
  } else {
    return 'unknown'
  }
  return set(input.plan) || input.loggedIn === true ? 'subscription' : 'unknown'
}

/**
 * The window to speak about: the 5-hour one when the vendor publishes it, otherwise the week.
 * @param windows - The windows the vendor publishes now.
 */
export function pickWindow(windows: readonly QuotaWindowReading[]): QuotaWindowReading | undefined {
  return windows.find(row => row.id === '5h') ?? windows.find(row => row.id === 'week')
}

const round1 = (value: number): number => Math.round(value * 10) / 10

/**
 * Calibrate "tokens per point" of one window from the person's own readings.
 *
 * The vendor's meter also counts the account's use OUTSIDE the Persona, and the ledger only sees the Persona's tokens, so a pair can only show FEWER tokens per
 * point than the truth, never more: the low rates are the contaminated ones. The range therefore starts at the MEDIAN and ends at the P90 (the cleanest pairs),
 * which keeps the share of the window on the cautious-but-not-inflated side.
 * @param pairs - Reading pairs (only the ones of `window` count).
 * @param window - Which window.
 * @returns The P50..P90 of tokens per point, or `undefined` while there are fewer than {@link MIN_QUOTA_PAIRS} usable pairs.
 */
export function calibrateQuota(pairs: readonly QuotaPair[], window: QuotaWindowId): QuotaCalibration | undefined {
  const rates = pairs
    .filter(pair => pair.window === window && Number.isFinite(pair.deltaPercent) && Number.isFinite(pair.tokens) && pair.deltaPercent >= MIN_QUOTA_DELTA && pair.tokens > 0)
    .map(pair => pair.tokens / pair.deltaPercent)
    .sort((a, b) => a - b)
  if (rates.length < MIN_QUOTA_PAIRS) return undefined
  const at = (q: number): number => rates[Math.min(rates.length - 1, Math.max(0, Math.round(q * (rates.length - 1))))] ?? 0
  return { window, tokensPerPoint: { min: Math.round(at(0.5)), max: Math.round(at(0.9)) }, rows: rates.length }
}

/** One official reading of one window, as the host keeps it (Rivet's trail on the stored quota). */
export interface QuotaReading {
  readonly at: string
  readonly windowId: string
  /** 0..100. */
  readonly usedPercent: number
  readonly resetsAt?: string
}

/** The vendor returns the reset clock with milliseconds that vary between reads of the same cycle: within this many ms it is the same cycle. */
export const SAME_CYCLE_MS = 2000

const sameCycle = (a: string | undefined, b: string | undefined): boolean => {
  if (a === undefined || b === undefined) return a === b
  const x = Date.parse(a)
  const y = Date.parse(b)
  return Number.isFinite(x) && Number.isFinite(y) && Math.abs(x - y) <= SAME_CYCLE_MS
}

/**
 * Reading pairs for {@link calibrateQuota}: the trail is walked in time order and a pair closes as soon as the meter rose by {@link MIN_QUOTA_DELTA} points
 * inside ONE cycle of the window (readings of different cycles are never paired, and a fall resets the start). The tokens of the pair are what the ledger
 * says were spent between the two readings.
 * @param readings - The trail of official readings (any order; windows other than `5h`/`week` are ignored).
 * @param tokensBetween - Tokens the Persona spent after `fromIso` up to and including `toIso` on this account.
 */
export function quotaPairs(readings: readonly QuotaReading[], tokensBetween: (fromIso: string, toIso: string) => number): QuotaPair[] {
  const out: QuotaPair[] = []
  for (const window of ['5h', 'week'] as const) {
    const rows = readings
      .filter(row => row.windowId === window && Number.isFinite(row.usedPercent) && Number.isFinite(Date.parse(row.at)))
      .sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
    let anchor: QuotaReading | undefined
    for (const row of rows) {
      if (anchor === undefined || !sameCycle(anchor.resetsAt, row.resetsAt) || row.usedPercent < anchor.usedPercent) {
        anchor = row
        continue
      }
      const delta = row.usedPercent - anchor.usedPercent
      if (delta < MIN_QUOTA_DELTA) continue
      const tokens = tokensBetween(anchor.at, row.at)
      if (tokens > 0) out.push({ window, deltaPercent: delta, tokens })
      anchor = row
    }
  }
  return out
}

const WINDOW_NAME: Record<QuotaWindowId, string> = { '5h': 'de 5 h', week: 'da semana' }

/**
 * The impact of `tokens` on the vendor's window.
 * @param input - The windows published now, the person's calibrations and the tokens of the ask.
 * @returns `null` when the vendor publishes no usable window; otherwise the window with `pct` (calibrated) or `null` (not measured).
 */
export function quotaImpact(input: {
  readonly windows: readonly QuotaWindowReading[]
  readonly calibrations?: readonly QuotaCalibration[]
  readonly tokens: Range | null
}): QuotaImpact | null {
  const reading = pickWindow(input.windows)
  if (reading === undefined) return null
  const used = reading.usedPercent !== undefined && Number.isFinite(reading.usedPercent) ? Math.min(100, Math.max(0, reading.usedPercent)) : undefined
  const common = {
    window: reading.id,
    ...(used === undefined ? {} : { usedPct: used, remainingPct: Math.max(0, 100 - used) }),
    ...(reading.resetsAt === undefined ? {} : { resetsAt: reading.resetsAt }),
  }
  const calibration = input.calibrations?.find(row => row.window === reading.id)
  if (calibration === undefined || input.tokens === null || calibration.tokensPerPoint.min <= 0) return { ...common, pct: null, origin: 'not-measured' }
  const pct: Range = {
    min: Math.min(100, Math.floor((input.tokens.min / calibration.tokensPerPoint.max) * 10) / 10),
    max: Math.min(100, Math.ceil((input.tokens.max / calibration.tokensPerPoint.min) * 10) / 10),
  }
  return {
    ...common,
    pct: { min: round1(pct.min), max: round1(pct.max) },
    origin: 'calibrated',
    basis: `calibrado em ${String(calibration.rows)} leituras da sua conta, contando só o seu uso na Persona: se a mesma conta é usada fora dela, o % real tende a ser menor; o fornecedor também pesa os tokens de formas diferentes, então é uma estimativa`,
  }
}

function money(micro: number): string {
  return (micro / 1_000_000).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
}

/** "≈ US$ 0,02–0,09 (estimativa)" / "menos de US$ 0,01 (estimativa)". Only for an API account. */
export function usdLine(microUsd: Range): string {
  if (microUsd.max < 10_000) return 'menos de US$ 0,01 (estimativa)'
  const low = money(microUsd.min)
  const high = money(microUsd.max)
  return low === high ? `≈ US$ ${high} (estimativa)` : `≈ US$ ${low}–${high} (estimativa)`
}

/**
 * The one line that says what an ask uses, in pt-BR, with no money unless the account is an API account.
 * @param input - The account type, the calls of the ask, the cost (read ONLY for `api`) and the quota impact (read for the rest).
 */
export function impactLine(input: { readonly billing: Billing; readonly calls: Range | null; readonly microUsd: Range | null; readonly quota: QuotaImpact | null }): string {
  const calls = input.calls
  if (calls !== null && calls.max === 0) return 'Sem chamada da sua IA'
  if (input.billing === 'api') {
    if (input.microUsd !== null) return usdLine(input.microUsd)
  } else if (input.quota !== null) {
    const name = WINDOW_NAME[input.quota.window]
    if (input.quota.pct === null) return 'cota não medida'
    if (input.quota.pct.max < 1) return `quase nada da sua janela ${name}`
    const low = Math.max(1, Math.round(input.quota.pct.min))
    const high = Math.round(input.quota.pct.max)
    return `cerca de ${low === high ? String(high) : `${String(low)}–${String(high)}`}% da sua janela ${name}`
  }
  if (calls === null) return ''
  return calls.min === calls.max ? (calls.max === 1 ? '≈ 1 chamada da sua IA' : `≈ ${String(calls.max)} chamadas da sua IA`) : `≈ ${String(calls.min)} a ${String(calls.max)} chamadas da sua IA`
}

/** The numbers of one surface (an ask, a round of opinions, a review) shaped for the account. */
export interface AccountShape {
  readonly billing: Billing
  /** List-price micro-USD, ONLY for an API account; `null` otherwise. */
  readonly microUsd: Range | null
  readonly quota: QuotaImpact | null
  readonly impacto: string
}

/**
 * The single place that decides what an ask / a round / a review shows: money only for an API account, the impact on the vendor's window for the rest.
 * @param input - The account (absent = unknown), the tokens and calls of the surface and its list-price cost.
 */
export function shapeForAccount(input: { readonly conta?: AccountInput | undefined; readonly tokens: Range | null; readonly calls: Range | null; readonly microUsd: Range | null }): AccountShape {
  const billing: Billing = input.conta?.billing ?? 'unknown'
  const quota = billing === 'api' ? null : quotaImpact({ windows: input.conta?.janelas ?? [], ...(input.conta?.calibracoes === undefined ? {} : { calibrations: input.conta.calibracoes }), tokens: input.tokens })
  const microUsd = billing === 'api' ? input.microUsd : null
  return { billing, microUsd, quota, impacto: impactLine({ billing, calls: input.calls, microUsd, quota }) }
}
