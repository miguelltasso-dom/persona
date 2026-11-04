/**
 * T3 harvest → host `putProviderLimitReports`. Official quota only; absence ≠ 0%.
 */

import { readableAccountLabel } from './account-label.ts'
import type { OfficialQuota, UsageOrigin, UsageWindow } from './types.ts'
import type { LimitAccountReport, LimitWindow, LimitWindowKind, ResetCredits } from './limit-pool.ts'

/** Account metadata the host already knows (no secrets). */
export interface HarvestAccount {
  readonly accountId: string
  readonly provider: string
  readonly label: string
  readonly email?: string
  readonly credentialFingerprint?: string
  readonly workspaceId?: string
  readonly environmentId?: string
  readonly environmentLabel?: string
  readonly resetCredits?: ResetCredits
}

/**
 * Map a vendor window id onto session/weekly/monthly.
 * @param window - Official quota window.
 */
export function limitWindowKindOf(window: UsageWindow): LimitWindowKind {
  if (/5h|five|session/iu.test(window.id) || window.windowMinutes === 300) return 'session'
  if (/week|semana|7d/iu.test(window.id) || window.windowMinutes === 10_080) return 'weekly'
  if (/month|mês|30d/iu.test(window.id) || window.windowMinutes === 43_200) return 'monthly'
  return 'other'
}

/**
 * One official snapshot → one harvest report (Anvil `LimitAccountReportView`).
 * @param account - Label, identity, environment.
 * @param quota - Official or unavailable.
 * @param checkedAt - ISO clock of this read.
 */
export function reportFromOfficialQuota(
  account: HarvestAccount,
  quota: OfficialQuota,
  checkedAt: string,
): LimitAccountReport {
  const windows: LimitWindow[] = quota.windows.flatMap((window) => {
    if (window.origin !== 'official') return []
    const kind = limitWindowKindOf(window)
    return [{
      id: window.id,
      kind,
      ...(window.usedPercent === undefined ? {} : { usedPercent: window.usedPercent }),
      ...(window.resetsAt === undefined ? {} : { resetsAt: window.resetsAt }),
    }]
  })
  return {
    accountId: account.accountId,
    provider: account.provider,
    label: readableAccountLabel({
      provider: account.provider,
      label: account.label,
      accountId: account.accountId,
      ...(account.email === undefined ? {} : { email: account.email }),
      ...(quota.detail === undefined ? {} : { plan: quota.detail }),
    }),
    checkedAt,
    windows,
    ...(account.email === undefined ? {} : { email: account.email }),
    ...(account.credentialFingerprint === undefined ? {} : { credentialFingerprint: account.credentialFingerprint }),
    ...(account.workspaceId === undefined ? {} : { workspaceId: account.workspaceId }),
    ...(account.environmentId === undefined ? {} : { environmentId: account.environmentId }),
    ...(account.environmentLabel === undefined ? {} : { environmentLabel: account.environmentLabel }),
    ...(account.resetCredits === undefined ? {} : { resetCredits: account.resetCredits }),
  }
}

/**
 * Read official quota per account and build the `putProviderLimitReports` payload.
 * @param accounts - Isolated logins (no secrets).
 * @param readQuota - `officialQuota` bound to that account.
 * @param now - ISO clock.
 */
export async function harvestLimitReports(
  accounts: readonly HarvestAccount[],
  readQuota: (account: HarvestAccount) => Promise<OfficialQuota>,
  now: () => string,
): Promise<readonly LimitAccountReport[]> {
  const checkedAt = now()
  const reports: LimitAccountReport[] = []
  for (const account of accounts) {
    const quota = await readQuota(account)
    reports.push(reportFromOfficialQuota(account, quota, checkedAt))
  }
  return reports
}

/** Probe card that may already carry officialQuota. */
export interface OfficialQuotaSnapCard {
  readonly id: string
  readonly officialQuota?: OfficialQuota
}

/** One `usage.putQuota` row for Anvil. */
export interface OfficialQuotaPutRow {
  readonly provider: string
  readonly origin: UsageOrigin
  readonly windows: readonly UsageWindow[]
  readonly accountId: string
  readonly accountLabel: string
  readonly detail?: string
}

const KNOWN_PLAN = new Set(['max', 'pro', 'chatgpt', 'plus', 'logged_in'])

/**
 * Build putQuota rows from detectConnections cards that already have officialQuota.
 * @param snaps - Probe cards.
 */
export function officialQuotaPuts(snaps: readonly OfficialQuotaSnapCard[]): readonly OfficialQuotaPutRow[] {
  const rows: OfficialQuotaPutRow[] = []
  for (const snap of snaps) {
    const quota = snap.officialQuota
    if (quota === undefined) continue
    const planKey = quota.detail?.trim().toLowerCase()
    rows.push({
      provider: quota.provider,
      origin: quota.origin,
      windows: quota.windows,
      accountId: snap.id,
      accountLabel: readableAccountLabel({
        provider: quota.provider,
        ...(snap.id !== quota.provider && snap.id !== 'default' ? { accountId: snap.id } : {}),
        ...(planKey !== undefined && KNOWN_PLAN.has(planKey) ? { plan: planKey } : {}),
      }),
      ...(quota.detail === undefined ? {} : { detail: quota.detail }),
    })
  }
  return rows
}

/**
 * Write putQuota rows. Anvil persists; this is the host one-liner.
 * @param put - `usage.putQuota` bound to a project (or a test array push).
 * @param snaps - detectConnections cards.
 * @returns Rows that were written.
 */
export function persistOfficialQuotaPuts(
  put: (row: OfficialQuotaPutRow) => void,
  snaps: readonly OfficialQuotaSnapCard[],
): readonly OfficialQuotaPutRow[] {
  const rows = officialQuotaPuts(snaps)
  for (const row of rows) put(row)
  return rows
}
