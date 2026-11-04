/**
 * T3-inspired limit pool (MIT © 2026 T3 Tools Inc.; see NOTICE).
 * Same account across environments counts once. Windows pool per provider.
 * Accounts sort by next refill. Missing clocks never invent a refill.
 */

/** Session / week / month / other — Codex pools by kind, others by kind:id. */
export type LimitWindowKind = 'session' | 'weekly' | 'monthly' | 'other'

/** One official window. usedPercent omitted when the vendor did not publish it. */
export interface LimitWindow {
  readonly id: string
  readonly kind: LimitWindowKind
  readonly usedPercent?: number
  readonly resetsAt?: string
}

/** Banked reset tickets when the provider exposes them. */
export interface ResetCredits {
  readonly remaining: number
  readonly nextCreditId?: string
}

/** One environment's report of one login. */
export interface LimitAccountReport {
  readonly accountId: string
  readonly provider: string
  readonly label: string
  readonly checkedAt: string
  readonly windows: readonly LimitWindow[]
  readonly email?: string
  readonly credentialFingerprint?: string
  readonly workspaceId?: string
  readonly environmentId?: string
  readonly environmentLabel?: string
  readonly resetCredits?: ResetCredits
}

/** Deduped login after merging environments. */
export interface DedupedLimitAccount {
  readonly key: string
  readonly accountId: string
  readonly provider: string
  readonly label: string
  readonly checkedAt: string
  readonly windows: readonly LimitWindow[]
  readonly environments: readonly { readonly id: string; readonly label: string }[]
  readonly resetCredits?: ResetCredits
}

/** One pooled window (mean of members; columns keep account order). */
export interface LimitPoolWindow {
  readonly id: string
  readonly kind: LimitWindowKind
  readonly remainingPercent?: number
  readonly usedPercent?: number
  readonly members: readonly {
    readonly key: string
    readonly usedPercent?: number
    readonly resetsAt?: string
  }[]
  readonly nextResetAt?: string
}

/** Per-provider pool, accounts soonest-refill first. */
export interface LimitPool {
  readonly provider: string
  readonly accounts: readonly DedupedLimitAccount[]
  readonly windows: readonly LimitPoolWindow[]
}

const KIND_ORDER: Readonly<Record<LimitWindowKind, number>> = {
  session: 0,
  weekly: 1,
  monthly: 2,
  other: 3,
}

/**
 * Identity used to collapse the same login across environments.
 * @param report - One environment report.
 */
export function accountIdentityKey(report: {
  readonly provider: string
  readonly email?: string
  readonly credentialFingerprint?: string
  readonly workspaceId?: string
}): string | null {
  const email = report.email?.trim().toLowerCase()
  const base = email !== undefined && email.length > 0
    ? `${report.provider}:${email}`
    : report.credentialFingerprint !== undefined && report.credentialFingerprint.length > 0
      ? `${report.provider}:credential:${report.credentialFingerprint}`
      : null
  if (base === null) return null
  return report.workspaceId === undefined || report.workspaceId.length === 0
    ? base
    : `${base}:${report.workspaceId}`
}

/**
 * Merge reports of the same login. Freshest checkedAt wins windows/credits.
 * @param reports - Per-environment snapshots.
 */
export function dedupeLimitAccounts(reports: readonly LimitAccountReport[]): DedupedLimitAccount[] {
  const byKey = new Map<string, DedupedLimitAccount>()
  for (const report of reports) {
    const key = accountIdentityKey(report) ?? `${report.provider}:${report.accountId}`
    const env = report.environmentId === undefined
      ? []
      : [{ id: report.environmentId, label: report.environmentLabel ?? report.environmentId }]
    const previous = byKey.get(key)
    if (previous === undefined) {
      byKey.set(key, {
        key,
        accountId: report.accountId,
        provider: report.provider,
        label: report.label,
        checkedAt: report.checkedAt,
        windows: report.windows,
        environments: env,
        ...(report.resetCredits === undefined ? {} : { resetCredits: report.resetCredits }),
      })
      continue
    }
    const fresher = Date.parse(report.checkedAt) > Date.parse(previous.checkedAt)
    const environments = [
      ...previous.environments,
      ...env.filter(candidate => !previous.environments.some(seen => seen.id === candidate.id)),
    ]
    const winner = fresher ? report : previous
    byKey.set(key, {
      key,
      accountId: winner.accountId,
      provider: previous.provider,
      label: previous.label,
      checkedAt: winner.checkedAt,
      windows: winner.windows,
      environments,
      ...(winner.resetCredits === undefined ? {} : { resetCredits: winner.resetCredits }),
    })
  }
  return [...byKey.values()]
}

/**
 * One pool per provider. Accounts ordered by next session/5h refill.
 * @param accounts - Deduped logins.
 * @param now - Clock.
 */
export function poolProviderLimits(accounts: readonly DedupedLimitAccount[], now: number): LimitPool[] {
  const byProvider = new Map<string, DedupedLimitAccount[]>()
  for (const account of accounts) {
    const list = byProvider.get(account.provider)
    if (list === undefined) byProvider.set(account.provider, [account])
    else list.push(account)
  }
  return [...byProvider].map(([provider, members]) => {
    const sorted = [...members].sort((left, right) => (
      nextRefillMs(left, now) - nextRefillMs(right, now)
      || left.label.localeCompare(right.label)
      || left.key.localeCompare(right.key)
    ))
    return { provider, accounts: sorted, windows: poolWindows(provider, sorted) }
  })
}

function nextRefillMs(account: DedupedLimitAccount, now: number): number {
  const session = account.windows.find(window => window.kind === 'session' || window.id === '5h')
  const at = resetMs(session?.resetsAt)
  return at === null || at <= now ? Number.POSITIVE_INFINITY : at
}

function resetMs(iso: string | undefined): number | null {
  if (iso === undefined) return null
  const at = Date.parse(iso)
  return Number.isFinite(at) ? at : null
}

function poolKey(provider: string, window: LimitWindow): string {
  return provider === 'codex' ? window.kind : `${window.kind}:${window.id}`
}

function poolWindows(provider: string, accounts: readonly DedupedLimitAccount[]): LimitPoolWindow[] {
  const byKey = new Map<string, { kind: LimitWindowKind; id: string; members: LimitPoolWindow['members'] }>()
  for (const account of accounts) {
    for (const window of account.windows) {
      const key = poolKey(provider, window)
      const list = byKey.get(key)
      const member = {
        key: account.key,
        ...(window.usedPercent === undefined ? {} : { usedPercent: window.usedPercent }),
        ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
      }
      if (list === undefined) {
        byKey.set(key, { kind: window.kind, id: provider === 'codex' ? key : window.id, members: [member] })
      } else {
        list.members = [...list.members, member]
      }
    }
  }
  return [...byKey.values()]
    .map((row): LimitPoolWindow => {
      const published = row.members.filter(member => member.usedPercent !== undefined)
      const used = published.length === 0
        ? undefined
        : published.reduce((sum, member) => sum + (member.usedPercent ?? 0), 0) / published.length
      const next = row.members
        .map(member => resetMs(member.resetsAt))
        .filter((at): at is number => at !== null)
        .sort((left, right) => left - right)[0]
      return {
        id: row.id,
        kind: row.kind,
        members: row.members,
        ...(used === undefined ? {} : { usedPercent: Math.round(used), remainingPercent: Math.round(100 - used) }),
        ...(next === undefined ? {} : { nextResetAt: new Date(next).toISOString() }),
      }
    })
    .sort((left, right) => KIND_ORDER[left.kind] - KIND_ORDER[right.kind])
}

/**
 * Enable "Usar reset" only when the vendor handed a credit id.
 * @param credits - Optional banked tickets.
 */
export function canUseReset(credits: ResetCredits | undefined): boolean {
  return credits !== undefined && credits.remaining > 0 && typeof credits.nextCreditId === 'string'
}

/** Result of a vendor reset redeem. Never invents a credit id. */
export type RedeemResetResult =
  | { readonly used: true; readonly creditId: string }
  | { readonly used: false; readonly why: 'unavailable' }

/**
 * Call the injected vendor redeem only when `canUseReset` is true.
 * @param credits - Banked tickets from the last official harvest.
 * @param redeem - Provider port (Claude/Codex/hub). Not invented here.
 */
export async function redeemReset(
  credits: ResetCredits | undefined,
  redeem: (creditId: string) => Promise<void>,
): Promise<RedeemResetResult> {
  if (!canUseReset(credits) || credits?.nextCreditId === undefined) return { used: false, why: 'unavailable' }
  const creditId = credits.nextCreditId
  await redeem(creditId)
  return { used: true, creditId }
}
