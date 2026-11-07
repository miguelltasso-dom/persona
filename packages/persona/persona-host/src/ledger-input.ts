/**
 * The input of one ledger row as a TOTAL, shared by the estimate that learns from the person's own history (`estimate-calibration.ts`) and by the quota calibration (`estimate-account.ts`).
 * The ledger books `inputTokens` as the TOTAL input and the cache read and written are PARTS of it (the OAR adapter reports it that way; measured 07/11: 16 180 = 11 046 read + 5 130 written
 * + 4 uncached; 05/11: 5 246 = 2 319 + 2 925 + 2): adding the cache again counts it twice. A total is never below its own cached part; if it is, the row comes from a source that books the
 * uncached input alone (an older or estimated row) and the cache counters are added. The same guard as the Probe's `persona-e2e/src/ledger-evidence.ts` and the engine's `pair-real.ts`.
 */

import type { TurnLedgerEntry } from '@deepseek-ai/dsh-persona-core'

/**
 * @param row - One ledger row (counters only).
 * @returns The input of the call, the cache counted once.
 */
export function ledgerInputTotal(row: Pick<TurnLedgerEntry, 'inputTokens' | 'cacheReadTokens' | 'cacheWriteTokens'>): number {
  const cached = row.cacheReadTokens + row.cacheWriteTokens
  return row.inputTokens >= cached ? row.inputTokens : row.inputTokens + cached
}
