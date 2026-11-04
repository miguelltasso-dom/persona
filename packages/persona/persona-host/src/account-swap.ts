/**
 * "Na hora, com outra conta" (IV-7, 2nd slice): when a Task is stopped by the quota window and the person has another
 * logged-in account on the same engine, propose using it now instead of waiting for the reset.
 *
 * Pure: the host gathers the accounts, their quota and the waiting Tasks; this decides what to PROPOSE. Nothing is switched
 * here and nothing is switched without the person's confirmation: the policy is an explicit choice ("Explicit user choice.
 * Never inferred"), and the default policy is not one, so the answer is always a proposal. A fixed-account policy proposes
 * nothing: the person asked for that account.
 */

export type SwapPolicy = 'fixed' | 'next_on_limit' | 'round_robin' | 'ask_before_swap'

export interface SwapAccount {
  readonly id: string
  readonly label: string
  /** Logged in on this account (its own home, or the engine's probe when it uses the default home). */
  readonly loggedIn: boolean
  /** `error` rows are never offered. */
  readonly status: 'ok' | 'limit' | 'error' | 'checking'
  /**
   * What the official quota says about THIS account: `true` = a window is at 100%, `false` = windows published and none is,
   * `undefined` = the vendor published nothing for it (unknown, never assumed free).
   */
  readonly exhausted?: boolean
  readonly resetsAt?: string
}

export interface SwapWaiting {
  readonly ticketId: string
  readonly ticketTitle: string
  readonly personaId: string
  readonly personaName: string
  readonly provider: string
  /** The account the Task was running on when the window ran out; unknown → the first account. */
  readonly accountId?: string
  readonly resetAt?: string
  readonly accounts: readonly SwapAccount[]
  readonly policy: SwapPolicy
}

export interface SwapOption {
  readonly accountId: string
  readonly label: string
  /** `livre` = the quota says it has room; `desconhecida` = nothing published for it (a try, not a promise). */
  readonly quota: 'livre' | 'desconhecida'
}

export interface AccountSwapProposal {
  readonly ticketId: string
  readonly ticketTitle: string
  readonly personaId: string
  readonly personaName: string
  readonly provider: string
  readonly policy: SwapPolicy
  readonly from: { readonly accountId: string; readonly label: string }
  readonly to: SwapOption
  readonly alternatives: readonly SwapOption[]
  /** When the account that ran out resets, if the vendor said ("ou esperar até {hora}"). */
  readonly waitUntil?: string
}

/**
 * A window at 100% means the account is out; windows published and all below 100 mean it has room; no window at all means
 * unknown.
 * @param windows - The account's official windows.
 * @returns `exhausted` (undefined when unknown) and the latest reset clock among the exhausted windows.
 */
export function exhaustionOf(windows: readonly { readonly usedPercent?: number; readonly resetsAt?: string }[]): { exhausted?: boolean; resetsAt?: string } {
  const known = windows.filter(window => window.usedPercent !== undefined)
  if (known.length === 0) return {}
  const out = known.filter(window => (window.usedPercent ?? 0) >= 100)
  if (out.length === 0) return { exhausted: false }
  const clocks = out.map(window => window.resetsAt).filter((clock): clock is string => clock !== undefined).sort()
  return { exhausted: true, ...(clocks.length === 0 || out.some(window => window.resetsAt === undefined) ? {} : { resetsAt: clocks.at(-1)! }) }
}

/**
 * One proposal per waiting Task that has somewhere else to go.
 * @param waiting - Tasks stopped by the quota, with the accounts of their engine and the stored policy.
 * @returns The proposals, in the order of `waiting`.
 */
export function proposeAccountSwaps(waiting: readonly SwapWaiting[]): AccountSwapProposal[] {
  const proposals: AccountSwapProposal[] = []
  for (const row of waiting) {
    if (row.policy === 'fixed') continue
    const from = row.accounts.find(account => account.id === row.accountId) ?? row.accounts[0]
    if (from === undefined) continue
    const options = row.accounts
      .filter(account => account.id !== from.id && account.loggedIn && account.status !== 'error' && account.exhausted !== true)
      .map((account): SwapOption => ({
        accountId: account.id,
        label: account.label,
        quota: account.exhausted === false ? 'livre' : 'desconhecida',
      }))
      // a known-free account is offered before one nobody knows anything about; the person's own order breaks ties
      .sort((a, b) => Number(a.quota === 'desconhecida') - Number(b.quota === 'desconhecida'))
    const [best, ...alternatives] = options
    if (best === undefined) continue
    const waitUntil = row.resetAt ?? from.resetsAt
    proposals.push({
      ticketId: row.ticketId,
      ticketTitle: row.ticketTitle,
      personaId: row.personaId,
      personaName: row.personaName,
      provider: row.provider,
      policy: row.policy,
      from: { accountId: from.id, label: from.label },
      to: best,
      alternatives,
      ...(waitUntil === undefined ? {} : { waitUntil }),
    })
  }
  return proposals
}
