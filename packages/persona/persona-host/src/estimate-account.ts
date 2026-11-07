/**
 * USD-1 / D-092: which kind of account will run the ask the person is about to send, and which windows the vendor publishes for it right now.
 * `estimateAsk` (engine) shapes its numbers with that: a subscription account sees the impact on its quota window and never a dollar; only an API
 * account sees US$ (persona-spec/contracts/usd-subscription.md). Pure: the host hands over what it already knows.
 */

import type { TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'
import { billingOf, calibrateQuota, quotaPairs, type EstimateAskInput, type QuotaCalibration, type QuotaReading, type QuotaWindowId, type QuotaWindowReading } from '@deepseek-ai/dsh-persona-engine'
import type { StoredOfficialQuota } from '@deepseek-ai/dsh-persona-store'
import { ledgerInputTotal } from './ledger-input.ts'

export type EstimateAccount = NonNullable<EstimateAskInput['conta']>

const WINDOWS: ReadonlySet<string> = new Set<QuotaWindowId>(['5h', 'week'])

/** The trail of official readings the store keeps on a quota row (`readings`, Rivet). Read structurally: an older row, or a store that has none yet, gives []. */
function readingsOf(row: StoredOfficialQuota): QuotaReading[] {
  const raw = (row as { readonly readings?: unknown }).readings
  if (!Array.isArray(raw)) return []
  return raw.filter((item): item is QuotaReading => {
    if (typeof item !== 'object' || item === null) return false
    const r = item as Record<string, unknown>
    return typeof r.at === 'string' && typeof r.windowId === 'string' && typeof r.usedPercent === 'number' && (r.resetsAt === undefined || typeof r.resetsAt === 'string')
  })
}

/**
 * Tokens the Persona spent on THIS engine and account in (from, to]: the measured rows of the ledger, total input (the cache is part of it) + output (what the meter weighs, as a
 * count). Only measured rows count: a number a CLI reported, never one we estimated.
 */
export function ledgerTokensBetween(entries: readonly TurnLedgerEntry[], scope: { readonly engine: string; readonly accountId?: string }): (fromIso: string, toIso: string) => number {
  return (fromIso, toIso) => {
    const from = Date.parse(fromIso)
    const to = Date.parse(toIso)
    let total = 0
    for (const entry of entries) {
      if (entry.origin !== 'measured' || entry.engine !== scope.engine || (entry.accountId ?? '') !== (scope.accountId ?? '')) continue
      const at = Date.parse(entry.at)
      if (!Number.isFinite(at) || at <= from || at > to) continue
      total += ledgerInputTotal(entry) + entry.outputTokens
    }
    return total
  }
}

/**
 * @param input - The runner kind of the persona, the CLI the estimate is for, the CLI the person is logged into, the environment the CLI starts with,
 *   the official quota rows the host holds and the account the persona uses now.
 * @returns The account type and the official windows of THAT account (only the 5-hour and the week: a window scoped to one model is not the account's).
 */
export function accountForEstimate(input: {
  readonly specKind?: string
  readonly cli: string
  readonly loggedCli?: string
  readonly env: NodeJS.ProcessEnv
  readonly quotas: readonly StoredOfficialQuota[]
  readonly accountId?: string
  /** The ledger of the project: with the trail of readings it calibrates tokens → share of the window. Absent = "cota não medida". */
  readonly ledger?: readonly TurnLedgerEntry[]
}): EstimateAccount {
  const rows = input.quotas.filter(row => row.provider === input.cli)
  const wanted = input.accountId === undefined || input.accountId === '' ? undefined : rows.find(row => row.accountId === input.accountId)
  const row = wanted ?? rows[0]
  const billing = input.specKind === 'dsh'
    ? 'api'
    : billingOf({
      kind: 'cli', cli: input.cli, env: input.env,
      ...(row?.detail === undefined || row.detail === '' ? {} : { plan: row.detail }),
      loggedIn: input.loggedCli !== undefined && input.loggedCli === input.cli,
    })
  if (billing === 'api' || row === undefined) return { billing }
  const janelas: QuotaWindowReading[] = row.windows
    .filter(window => window.origin === 'official' && WINDOWS.has(window.id))
    .map(window => ({
      id: window.id as QuotaWindowId,
      ...(window.usedPercent === undefined ? {} : { usedPercent: window.usedPercent }),
      ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
    }))
  if (janelas.length === 0) return { billing }
  const between = ledgerTokensBetween(input.ledger ?? [], { engine: input.cli, ...(input.accountId === undefined ? {} : { accountId: input.accountId }) })
  const pairs = quotaPairs(readingsOf(row), between)
  const calibracoes: QuotaCalibration[] = (['5h', 'week'] as const).flatMap((window) => {
    const found = calibrateQuota(pairs, window)
    return found === undefined ? [] : [found]
  })
  return calibracoes.length === 0 ? { billing, janelas } : { billing, janelas, calibracoes }
}
