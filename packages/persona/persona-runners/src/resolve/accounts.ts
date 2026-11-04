/**
 * WAVE2 §3 — pick which isolated provider account to run.
 * Forge owns the stored policy; Rivet executes it at the limit (W2-4 / W2-5).
 */

/** Same tags as host `RunnerSwapPolicy` (Anvil types.ts). */
export type AccountPolicyKind = 'fixed' | 'next_on_limit' | 'round_robin' | 'ask_before_swap'
export type AccountPolicyScope = 'persona' | 'workspace'

/** One login the person connected. Secrets never live here. */
export interface ProviderAccount {
  readonly id: string
  readonly provider: string
  readonly label: string
  readonly configDir: string
}

/** Official (or unavailable) quota for one account. Missing percent is omitted. */
export interface AccountQuota {
  readonly accountId: string
  readonly exhausted: boolean
  readonly remainingPercent?: number
  readonly resetsAt?: string
}

/** Explicit user choice. Never inferred. */
export interface AccountPolicy {
  readonly kind: AccountPolicyKind
  readonly scope: AccountPolicyScope
  /** Preference order; same engine only. */
  readonly accountIds: readonly string[]
}

export type AccountPick =
  | { readonly action: 'use'; readonly accountId: string }
  | {
    readonly action: 'switch'
    readonly from: string
    readonly to: string
    readonly until?: string
    readonly activity: string
  }
  | { readonly action: 'ask'; readonly accountId: string }
  | { readonly action: 'stop'; readonly accountId: string; readonly notice: string }

export interface PickAccountInput {
  readonly accounts: readonly ProviderAccount[]
  readonly policy: AccountPolicy
  readonly quotas: readonly AccountQuota[]
  readonly currentId?: string
  readonly personaName?: string
  /** Last used account id (split rotate). */
  readonly lastId?: string
}

const STOP_FIXED = 'Esta conta chegou ao limite. A política é uma conta fixa — nada foi trocado.'
const ASK_FIXED = 'Precisa de você: esta conta chegou ao limite. Confirme antes de trocar.'

/**
 * Execute the stored policy. Same-engine accounts only; unknown ids are ignored.
 * @param input - Accounts, explicit policy, per-account quotas.
 */
export function pickProviderAccount(input: PickAccountInput): AccountPick {
  const byId = new Map(input.accounts.map(account => [account.id, account]))
  const ordered = input.policy.accountIds
    .map(id => byId.get(id))
    .filter((account): account is ProviderAccount => account !== undefined)
  if (ordered.length === 0) {
    const first = input.accounts[0]
    if (first === undefined) {
      return { action: 'stop', accountId: '', notice: 'Nenhuma conta conectada neste motor.' }
    }
    return { action: 'use', accountId: first.id }
  }
  const current = (input.currentId !== undefined ? byId.get(input.currentId) : undefined) ?? ordered[0]!
  const quotaOf = (id: string): AccountQuota | undefined => input.quotas.find(row => row.accountId === id)
  const currentQuota = quotaOf(current.id)
  if (currentQuota === undefined || !currentQuota.exhausted) {
    return { action: 'use', accountId: current.id }
  }
  if (input.policy.kind === 'fixed') {
    return { action: 'stop', accountId: current.id, notice: STOP_FIXED }
  }
  if (input.policy.kind === 'ask_before_swap') {
    return { action: 'ask', accountId: current.id }
  }
  const next = input.policy.kind === 'round_robin'
    ? pickSplit(ordered, input.quotas, input.lastId ?? current.id)
    : ordered.find(account => account.id !== current.id && quotaOf(account.id)?.exhausted !== true)
  if (next === undefined) {
    return { action: 'stop', accountId: current.id, notice: STOP_FIXED }
  }
  return {
    action: 'switch',
    from: current.id,
    to: next.id,
    ...(quotaOf(next.id)?.resetsAt === undefined ? {} : { until: quotaOf(next.id)!.resetsAt }),
    activity: formatAccountSwitch({
      personaName: input.personaName ?? 'Persona',
      provider: next.provider,
      label: next.label,
      ...(quotaOf(next.id)?.resetsAt === undefined ? {} : { until: quotaOf(next.id)!.resetsAt }),
    }),
  }
}

/**
 * Activity line for a switch (WAVE2 §3).
 * @param input - Persona, provider, label, optional reset clock.
 */
export function formatAccountSwitch(input: {
  personaName: string
  provider: string
  label: string
  until?: string
}): string {
  const engine = humanizeEngine(input.provider)
  const until = input.until === undefined ? '' : ` até ${clockOf(input.until)}`
  return `${input.personaName} passou para ${engine} · ${input.label}${until}`
}

/**
 * Honest pt-BR for Precisa de você when policy is "perguntar".
 * @param account - Exhausted account.
 */
export function accountAskNotice(account: ProviderAccount): string {
  return `${ASK_FIXED} Conta ${account.label} (${humanizeEngine(account.provider)}).`
}

function pickSplit(
  ordered: readonly ProviderAccount[],
  quotas: readonly AccountQuota[],
  lastId: string,
): ProviderAccount | undefined {
  const open = ordered.filter((account) => {
    const quota = quotas.find(row => row.accountId === account.id)
    return quota?.exhausted !== true
  })
  if (open.length === 0) return undefined
  const scored = [...open].sort((left, right) => remainingOf(quotas, right.id) - remainingOf(quotas, left.id))
  const best = scored[0]!
  const bestRemain = remainingOf(quotas, best.id)
  const tied = scored.filter(account => remainingOf(quotas, account.id) === bestRemain)
  if (tied.length === 1) return best
  const idx = tied.findIndex(account => account.id === lastId)
  return tied[(idx + 1) % tied.length]
}

function remainingOf(quotas: readonly AccountQuota[], accountId: string): number {
  const quota = quotas.find(row => row.accountId === accountId)
  return quota?.remainingPercent ?? Number.NEGATIVE_INFINITY
}

function humanizeEngine(provider: string): string {
  switch (provider) {
    case 'claude': return 'Claude'
    case 'codex': return 'Codex'
    case 'cursor': return 'Cursor'
    case 'opencode':
    case 'opencode-go': return 'OpenCode'
    case 'gemini': return 'Gemini'
    case 'grok': return 'Grok'
    case 'dsh': return 'DeepSeek'
    case 'openrouter': return 'OpenRouter'
    default: return provider
  }
}

function clockOf(iso: string): string {
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return iso
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
