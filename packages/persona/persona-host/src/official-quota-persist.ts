/**
 * Rivet `OfficialQuotaPutRow` → store row (account + short refill history).
 */

import {
  type StoredOfficialQuota,
  type UsageStore,
} from '@deepseek-ai/dsh-persona-store'
import {
  persistOfficialQuotaPuts,
  type OfficialQuotaPutRow,
  type OfficialQuotaSnapCard,
} from '@deepseek-ai/dsh-persona-usage'

/**
 * Map one Rivet put onto the store row. `putQuota` appends the refill trail.
 * @param row - `persistOfficialQuotaPuts` item.
 */
export function storedQuotaFromPut(row: OfficialQuotaPutRow): StoredOfficialQuota {
  return {
    provider: row.provider,
    origin: row.origin,
    windows: row.windows,
    accountId: row.accountId,
    accountLabel: row.accountLabel,
    ...(row.detail === undefined ? {} : { detail: row.detail }),
  }
}

/**
 * Write probe snaps into one project's quota pool.
 * @param usage - Store.
 * @param projectId - Tenant.
 * @param snaps - `detectConnections` cards.
 */
export function persistProbeQuota(
  usage: UsageStore,
  projectId: string,
  snaps: readonly OfficialQuotaSnapCard[],
): void {
  persistOfficialQuotaPuts((row) => {
    usage.putQuota(projectId, storedQuotaFromPut(row))
  }, snaps)
}
