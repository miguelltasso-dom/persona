import type { OfficialQuotaView, UsageWindowView } from '@deepseek-ai/dsh-persona-host/types'
import { runnerLabel } from '../../team/engine-label.ts'
import type { PooledAccount } from '../../primitives/Pooled.tsx'
import type { AccountState } from '../../primitives/Accounts.tsx'
import type { UsageMeter } from '../../usage/mock-data.ts'

/** One connected account under a provider pool (T3-UX-HARVEST §7). */
export interface UsagePoolAccountUi {
  readonly id: string
  readonly label: string
  /** Plan or vendor detail line for segment tooltips. */
  readonly plan?: string | undefined
  readonly state: AccountState
  readonly fiveHourUsedPct?: number | undefined
  readonly weekUsedPct?: number | undefined
  readonly inUse?: boolean | undefined
}

export interface UsageProviderPoolUi {
  readonly provider: string
  readonly providerName: string
  readonly accounts: readonly UsagePoolAccountUi[]
  /** Same order as `accounts` — one segment per account in every window bar. */
  readonly accountOrder: readonly string[]
  readonly fiveHour: readonly PooledAccount[]
  readonly week: readonly PooledAccount[]
}

const WINDOW_5H = new Set(['5h', 'five_hour', 'five-hour'])
const WINDOW_WEEK = new Set(['week', 'seven_day', '7d'])

function windowKind(id: string): 'fiveHour' | 'week' | null {
  if (WINDOW_5H.has(id)) return 'fiveHour'
  if (WINDOW_WEEK.has(id)) return 'week'
  return null
}

function formatRefillAt(iso: string | undefined): string | undefined {
  if (iso === undefined || iso === '') return undefined
  const date = new Date(iso)
  if (Number.isNaN(date.getTime())) return undefined
  return new Intl.DateTimeFormat(undefined, { hour: '2-digit', minute: '2-digit' }).format(date)
}

function refillSortKey(views: readonly OfficialQuotaView[], accountId: string): number {
  const view = views.find(row => (row.accountId ?? 'default') === accountId)
  if (view === undefined) return Number.POSITIVE_INFINITY
  let min = Number.POSITIVE_INFINITY
  for (const window of view.windows) {
    if (window.resetsAt === undefined) continue
    const t = new Date(window.resetsAt).getTime()
    if (!Number.isNaN(t)) min = Math.min(min, t)
  }
  return min
}

function pickWindow(windows: readonly UsageWindowView[], kind: 'fiveHour' | 'week'): UsageWindowView | undefined {
  return windows.find(window => windowKind(window.id) === kind)
}

function toPooledSegment(window: UsageWindowView | undefined, label: string): PooledAccount {
  if (window === undefined || window.usedPercent === undefined) {
    return { id: label, label }
  }
  const used = Math.min(100, Math.max(0, window.usedPercent))
  const leftPct = 100 - used
  const refillAt = formatRefillAt(window.resetsAt)
  const refillPct = refillAt !== undefined && used > 0 ? used : undefined
  return {
    id: label,
    label,
    leftPct,
    ...(refillPct === undefined ? {} : { refillPct }),
    ...(refillAt === undefined ? {} : { refillAt }),
  }
}

function accountStateFromWindows(five?: UsageWindowView, week?: UsageWindowView): AccountState {
  const used = [five?.usedPercent, week?.usedPercent].filter((v): v is number => v !== undefined)
  if (used.length === 0) return 'checking'
  if (used.some(v => v >= 100)) return 'limit'
  return 'ready'
}

/** Group official quotas by provider; stable segment order = soonest refill first. */
export function officialQuotasToProviderPools(quotas: readonly OfficialQuotaView[]): UsageProviderPoolUi[] {
  const byProvider = new Map<string, OfficialQuotaView[]>()
  for (const row of quotas) {
    const list = byProvider.get(row.provider) ?? []
    list.push(row)
    byProvider.set(row.provider, list)
  }

  const pools: UsageProviderPoolUi[] = []
  for (const [provider, views] of byProvider) {
    const accountIds = views.map(v => v.accountId ?? 'default')
    const uniqueIds = [...new Set(accountIds)]
    uniqueIds.sort((a, b) => refillSortKey(views, a) - refillSortKey(views, b))

    const accounts: UsagePoolAccountUi[] = uniqueIds.map((accountId) => {
      const view = views.find(v => (v.accountId ?? 'default') === accountId) ?? views[0]!
      const label = view.accountLabel ?? accountId
      const five = pickWindow(view.windows, 'fiveHour')
      const week = pickWindow(view.windows, 'week')
      return {
        id: accountId,
        label,
        ...(view.detail === undefined || view.detail === '' ? {} : { plan: view.detail }),
        state: accountStateFromWindows(five, week),
        ...(five?.usedPercent === undefined ? {} : { fiveHourUsedPct: five.usedPercent }),
        ...(week?.usedPercent === undefined ? {} : { weekUsedPct: week.usedPercent }),
      }
    })

    const fiveHour: PooledAccount[] = uniqueIds.map((accountId) => {
      const view = views.find(v => (v.accountId ?? 'default') === accountId)!
      const meta = accounts.find(a => a.id === accountId)!
      const seg = toPooledSegment(pickWindow(view.windows, 'fiveHour'), meta.label)
      return { ...seg, id: accountId }
    })
    const week: PooledAccount[] = uniqueIds.map((accountId) => {
      const view = views.find(v => (v.accountId ?? 'default') === accountId)!
      const meta = accounts.find(a => a.id === accountId)!
      const seg = toPooledSegment(pickWindow(view.windows, 'week'), meta.label)
      return { ...seg, id: accountId }
    })

    pools.push({
      provider,
      providerName: runnerLabel(provider),
      accounts,
      accountOrder: uniqueIds,
      fiveHour,
      week,
    })
  }

  return pools.sort((a, b) => a.providerName.localeCompare(b.providerName))
}

/** Drop per-account quota rows when aggregated pools are shown. */
export function usageMetersWithoutQuotaDuplicates(meters: readonly UsageMeter[]): readonly UsageMeter[] {
  return meters.filter(m => !m.id.startsWith('quota:'))
}
