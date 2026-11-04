/**
 * Map detectConnections officialQuota onto Anvil `putQuota` rows.
 * Leaf helper — host persist stays Anvil after JANELA ENCERRADA.
 */

/** Window Anvil stores. */
export interface OfficialQuotaPutWindow {
  readonly id: string
  readonly origin: string
  readonly usedPercent?: number
  readonly windowMinutes?: number
  readonly resetsAt?: string
}

/** One `usage.putQuota` row. */
export interface OfficialQuotaPutRow {
  readonly provider: string
  readonly origin: string
  readonly windows: readonly OfficialQuotaPutWindow[]
  readonly accountId: string
  readonly accountLabel: string
  readonly detail?: string
}

const PLAN_LABEL: Readonly<Record<string, string>> = {
  max: 'Claude Max',
  pro: 'Claude Pro',
  chatgpt: 'ChatGPT',
  plus: 'ChatGPT Plus',
}

/**
 * Seat label. Never `default`.
 * @param provider - CLI id.
 * @param detail - Vendor plan.
 */
export function quotaPutLabel(provider: string, detail?: string): string {
  const plan = PLAN_LABEL[detail?.trim().toLowerCase() ?? '']
  if (plan !== undefined) return plan
  if (provider === 'claude') return 'Claude'
  if (provider === 'codex') return 'ChatGPT'
  return provider
}

/** Probe card that may already carry officialQuota. */
export interface OfficialQuotaSnap {
  readonly id: string
  readonly officialQuota?: {
    readonly provider: string
    readonly origin: string
    readonly windows: readonly OfficialQuotaPutWindow[]
    readonly detail?: string
  }
}

/**
 * Build putQuota rows from probe cards that already have officialQuota.
 * @param snaps - detectConnections cards.
 */
export function officialQuotaPuts(snaps: readonly OfficialQuotaSnap[]): readonly OfficialQuotaPutRow[] {
  const rows: OfficialQuotaPutRow[] = []
  for (const snap of snaps) {
    const quota = snap.officialQuota
    if (quota === undefined) continue
    rows.push({
      provider: quota.provider,
      origin: quota.origin,
      windows: quota.windows,
      accountId: snap.id,
      accountLabel: quotaPutLabel(quota.provider, quota.detail),
      ...(quota.detail === undefined ? {} : { detail: quota.detail }),
    })
  }
  return rows
}
