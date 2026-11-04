/**
 * Readable account labels for Uso e limites. Never publish `default`.
 */

const PLAN_LABEL: Readonly<Record<string, string>> = {
  max: 'Claude Max',
  pro: 'Claude Pro',
  chatgpt: 'ChatGPT',
  plus: 'ChatGPT Plus',
  logged_in: 'ChatGPT',
}

/**
 * Human label for a connected seat. Email local-part or plan beats `default`.
 * @param input - Identity the host already knows (no secrets).
 */
export function readableAccountLabel(input: {
  readonly provider: string
  readonly label?: string
  readonly accountId?: string
  readonly email?: string
  readonly plan?: string
}): string {
  const email = input.email?.trim()
  if (email !== undefined && email.length > 0) {
    const at = email.indexOf('@')
    return at > 0 ? email.slice(0, at) : email
  }
  const planKey = input.plan?.trim().toLowerCase()
  if (planKey !== undefined && planKey.length > 0) {
    return PLAN_LABEL[planKey] ?? input.plan!.trim()
  }
  const label = input.label?.trim()
  if (label !== undefined && label.length > 0 && label !== 'default') return label
  const accountId = input.accountId?.trim()
  if (
    accountId !== undefined
    && accountId.length > 0
    && accountId !== 'default'
    && accountId !== input.provider
  ) {
    return accountId
  }
  if (input.provider === 'claude') return 'Claude'
  if (input.provider === 'codex') return 'ChatGPT'
  return input.provider
}

/** Finished-read UI state. Never `checking` after officialQuota returns. */
export type QuotaUiState = 'ready' | 'limit' | 'unavailable' | 'timeout'

/**
 * Map a finished official read onto the account row. Timeout is not "Conferindo…".
 * @param quota - Parser / officialQuota result.
 */
export function quotaUiState(quota: {
  readonly origin: string
  readonly detail?: string
  readonly windows: readonly { readonly origin: string; readonly usedPercent?: number }[]
}): QuotaUiState {
  if ((quota.detail ?? '').includes('timeout')) return 'timeout'
  if (quota.origin === 'unavailable') return 'unavailable'
  const used = quota.windows
    .filter(window => window.origin === 'official')
    .map(window => window.usedPercent)
    .filter((pct): pct is number => pct !== undefined)
  if (used.some(pct => pct >= 100)) return 'limit'
  if (quota.windows.some(window => window.origin === 'official')) return 'ready'
  return 'unavailable'
}
