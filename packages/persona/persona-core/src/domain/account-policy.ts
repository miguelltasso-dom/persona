/**
 * Several accounts per provider (WAVE2 §3). Policy is always explicit.
 */

import { DomainError } from './schemas.ts'
import type { ConnectionKind } from './connection.ts'
import type { HandoffEvidence } from './handoff.ts'

export type AccountEngine = ConnectionKind | 'gemini' | 'grok' | 'openrouter'

export type AccountRotationPolicy = 'fixed' | 'next_on_limit' | 'split_balance' | 'ask'

/** Host / Lumen names (persona-host `RunnerSwapPolicy`). */
export type RunnerSwapPolicy = 'fixed' | 'next_on_limit' | 'round_robin' | 'ask_before_swap'

/**
 * Map the Remote enum onto the domain policy.
 * @param policy - Domain or host name.
 * @returns Canonical domain policy.
 */
export function normalizeAccountPolicy(policy: AccountRotationPolicy | RunnerSwapPolicy): AccountRotationPolicy {
  if (policy === 'round_robin') return 'split_balance'
  if (policy === 'ask_before_swap') return 'ask'
  return policy
}

export interface ProviderAccount {
  readonly id: string
  readonly engine: AccountEngine
  readonly label: string
  readonly isolatedHome: string
  readonly atLimit: boolean
  readonly remainingQuota: number
}

export interface AccountPolicy {
  readonly scope: 'persona' | 'workspace'
  readonly ownerId: string
  readonly policy: AccountRotationPolicy
  readonly preferredEngines: readonly AccountEngine[]
  readonly pinnedAccountId?: string
}

export type AccountDecision =
  | { readonly kind: 'use'; readonly accountId: string; readonly reason: 'pinned' | 'current' | 'next' | 'balance' }
  | { readonly kind: 'stop'; readonly accountId: string; readonly reason: 'fixed_at_limit' | 'engine_refused' }
  | { readonly kind: 'ask'; readonly fromAccountId: string; readonly toAccountId: string }
  | {
    readonly kind: 'handoff'
    readonly fromAccountId: string
    readonly toAccountId: string
    readonly fromEngine: AccountEngine
    readonly toEngine: AccountEngine
  }

export interface EngineSwitchHandoff {
  readonly kind: 'engine_switch'
  readonly personaId: string
  readonly ticketId: string
  readonly fromEngine: AccountEngine
  readonly toEngine: AccountEngine
  readonly fromAccountId: string
  readonly toAccountId: string
  readonly objective: string
  readonly evidence: readonly HandoffEvidence[]
  readonly nextAction: string
}

function sameEngine(accounts: readonly ProviderAccount[], current: ProviderAccount): ProviderAccount[] {
  return accounts.filter(row => row.engine === current.engine)
}

function accepted(policy: AccountPolicy, engine: AccountEngine): boolean {
  return policy.preferredEngines.includes(engine)
}

/**
 * Two seats never share a login dir (WAVE2 §3 / W2-4).
 * @param accounts - Provider seats (secrets never live here).
 */
export function assertIsolatedHomes(accounts: readonly ProviderAccount[]): void {
  const seen = new Map<string, string>()
  for (const row of accounts) {
    if (row.isolatedHome.trim() === '') {
      throw new DomainError('INVALID_ACCOUNT_POLICY', 'EMPTY_HOME')
    }
    const prev = seen.get(row.isolatedHome)
    if (prev !== undefined && prev !== row.id) {
      throw new DomainError('INVALID_ACCOUNT_POLICY', 'SHARED_HOME')
    }
    seen.set(row.isolatedHome, row.id)
  }
}

/**
 * Pick the next account. Never silent: ask / stop / use / handoff.
 * @param input - Policy, current account, and the person's accounts.
 * @returns Explicit decision (never a silent fallback).
 */
export function pickAccount(input: {
  readonly policy: AccountPolicy | (Omit<AccountPolicy, 'policy'> & { readonly policy: AccountRotationPolicy | RunnerSwapPolicy })
  readonly accounts: readonly ProviderAccount[]
  readonly currentAccountId: string
}): AccountDecision {
  assertIsolatedHomes(input.accounts)
  const policy: AccountPolicy = { ...input.policy, policy: normalizeAccountPolicy(input.policy.policy) }
  const current = input.accounts.find(row => row.id === input.currentAccountId)
  if (current === undefined) throw new DomainError('INVALID_ACCOUNT_POLICY', 'UNKNOWN_ACCOUNT')
  if (!accepted(policy, current.engine)) {
    return { kind: 'stop', accountId: current.id, reason: 'engine_refused' }
  }
  const pinned = policy.pinnedAccountId === undefined
    ? undefined
    : input.accounts.find(row => row.id === policy.pinnedAccountId)
  if (policy.policy === 'fixed' || pinned !== undefined) {
    const hold = pinned ?? current
    if (hold.atLimit) return { kind: 'stop', accountId: hold.id, reason: 'fixed_at_limit' }
    return { kind: 'use', accountId: hold.id, reason: pinned === undefined ? 'current' : 'pinned' }
  }
  if (!current.atLimit && policy.policy !== 'split_balance') {
    return { kind: 'use', accountId: current.id, reason: 'current' }
  }
  const pool = sameEngine(input.accounts, current).filter(row => !row.atLimit && accepted(policy, row.engine))
  const otherEngines = input.accounts.filter(row =>
    !row.atLimit && row.engine !== current.engine && accepted(policy, row.engine))
  const ranked = (policy.policy === 'split_balance'
    ? [...input.accounts.filter(row => !row.atLimit && accepted(policy, row.engine))]
      .sort((a, b) => b.remainingQuota - a.remainingQuota || a.id.localeCompare(b.id))
    : [...pool, ...otherEngines])
  const best = ranked[0]
  if (best === undefined) {
    if (current.atLimit) return { kind: 'stop', accountId: current.id, reason: 'fixed_at_limit' }
    return { kind: 'use', accountId: current.id, reason: 'current' }
  }
  if (best.id === current.id) return { kind: 'use', accountId: current.id, reason: 'current' }
  const next = best
  if (policy.policy === 'ask') {
    return { kind: 'ask', fromAccountId: current.id, toAccountId: next.id }
  }
  if (next.engine !== current.engine) {
    return {
      kind: 'handoff',
      fromAccountId: current.id,
      toAccountId: next.id,
      fromEngine: current.engine,
      toEngine: next.engine,
    }
  }
  return {
    kind: 'use',
    accountId: next.id,
    reason: policy.policy === 'split_balance' ? 'balance' : 'next',
  }
}

/**
 * Activity line. Never a secret, never an account id.
 * @param personaName - Display name.
 * @param account - Account now in use.
 * @param until - Optional local time label (already formatted).
 * @returns Activity body for the timeline.
 */
export function accountSwitchActivity(
  personaName: string,
  account: ProviderAccount,
  until?: string,
): { readonly body: string } {
  const when = until === undefined || until.trim() === '' ? '' : ` até ${until.trim()}`
  return { body: `${personaName} passou para ${engineLabel(account.engine)} · ${account.label}${when}` }
}

/**
 * @param engine - Account engine.
 * @returns Display name of the engine.
 */
export function engineLabel(engine: AccountEngine): string {
  if (engine === 'dsh') return 'Harness DeepSeek'
  if (engine === 'claude') return 'Claude'
  if (engine === 'codex') return 'Codex'
  if (engine === 'cursor') return 'Cursor'
  if (engine === 'opencode') return 'OpenCode'
  if (engine === 'gemini') return 'Gemini'
  if (engine === 'grok') return 'Grok'
  return 'OpenRouter'
}

/**
 * Session restart when the engine changes (same persona, Chain of Recall).
 * @param input - Switch already decided by {@link pickAccount}.
 * @returns Handoff object for the new session.
 */
export function engineSwitchHandoff(input: {
  readonly personaId: string
  readonly ticketId: string
  readonly from: ProviderAccount
  readonly to: ProviderAccount
  readonly evidence?: readonly HandoffEvidence[]
}): EngineSwitchHandoff {
  if (input.from.engine === input.to.engine) {
    throw new DomainError('INVALID_ACCOUNT_POLICY', 'SAME_ENGINE')
  }
  if (input.to.atLimit) throw new DomainError('INVALID_ACCOUNT_POLICY', 'TARGET_AT_LIMIT')
  return {
    kind: 'engine_switch',
    personaId: input.personaId,
    ticketId: input.ticketId,
    fromEngine: input.from.engine,
    toEngine: input.to.engine,
    fromAccountId: input.from.id,
    toAccountId: input.to.id,
    objective: `Continuar no ${engineLabel(input.to.engine)} · ${input.to.label}`,
    evidence: input.evidence === undefined ? [] : [...input.evidence],
    nextAction: 'Retomar a Tarefa na nova sessão com o resumo do assunto ativo.',
  }
}

/**
 * "Perguntar" vira Precisa de você — never silent, never a secret.
 * @param from - Account at the limit or losing the balance.
 * @param to - Candidate next account.
 * @returns Card title and body for the person.
 */
export function accountAskNeedsYou(from: ProviderAccount, to: ProviderAccount): {
  readonly kind: 'account_swap'
  readonly title: string
  readonly body: string
} {
  return {
    kind: 'account_swap',
    title: 'Trocar de conta?',
    body: `Passar de ${engineLabel(from.engine)} · ${from.label} para ${engineLabel(to.engine)} · ${to.label}?`,
  }
}
