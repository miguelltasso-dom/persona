import type { OfficialQuotaView, UsageView } from '@deepseek-ai/dsh-persona-host/types'
import type { ProjectLimitsView } from '@deepseek-ai/dsh-persona-host/types'
import type { UsageOrigin as HostUsageOrigin } from '@deepseek-ai/dsh-persona-usage'
import { runnerLabel } from '../../team/engine-label.ts'
import type { UsageMeter, UsageOrigin } from '../../usage/mock-data.ts'

/** Inclusive UTC calendar month for D5a `getUsage`. */
export function currentUsagePeriod(): { from: string; to: string } {
  const now = new Date()
  const from = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString()
  const to = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0, 23, 59, 59, 999)).toISOString()
  return { from, to }
}

function mapOrigin(origin: HostUsageOrigin): UsageOrigin {
  switch (origin) {
    case 'estimate': return 'estimated'
    case 'measured': return 'measured'
    case 'official': return 'official'
    case 'unavailable': return 'unavailable'
  }
}

/** Official quota windows + project book → meters (never fake 0% when unavailable). */
export function usageBookToMeters(usage: UsageView, quotas: readonly OfficialQuotaView[]): UsageMeter[] {
  const meters: UsageMeter[] = []

  for (const quota of quotas) {
    const providerLabel = runnerLabel(quota.provider)
    const seatSuffix = quota.accountLabel !== undefined && quota.accountLabel !== ''
      ? ` · ${quota.accountLabel}`
      : ''
    const baseLabel = `${providerLabel}${seatSuffix}`
    for (const window of quota.windows) {
      const label = `${baseLabel} · ${window.id}`
      const origin = mapOrigin(window.origin)
      const accountKey = quota.accountId ?? 'default'
      meters.push({
        id: `quota:${quota.provider}:${accountKey}:${window.id}`,
        label,
        origin,
        ...(window.usedPercent === undefined ? {} : { percent: Math.min(100, Math.max(0, window.usedPercent)) }),
      })
    }
    if (quota.windows.length === 0 && quota.origin === 'unavailable') {
      meters.push({
        id: `quota:${quota.provider}:${quota.accountId ?? 'default'}:unavailable`,
        label: baseLabel,
        origin: 'unavailable',
      })
    }
  }

  if (usage.tokensPerMonthLimit !== undefined && usage.origin !== 'unavailable') {
    const idle = usage.tokens === 0 && usage.runs === 0
    if (idle) {
      meters.push({
        id: 'project-tokens-month',
        label: 'Projeto (tokens no período)',
        origin: 'notYet',
      })
    } else {
      const percent = Math.min(100, Math.round((usage.tokens / usage.tokensPerMonthLimit) * 100))
      const origin = usage.origin === 'measured' ? 'measured' : mapOrigin(usage.origin)
      meters.push({
        id: 'project-tokens-month',
        label: 'Projeto (tokens no período)',
        origin,
        percent,
      })
    }
  } else if (usage.runs > 0 || usage.tokens > 0) {
    const percent = usage.tokensPerMonthLimit === undefined
      ? undefined
      : Math.min(100, Math.round((usage.tokens / usage.tokensPerMonthLimit) * 100))
    meters.push({
      id: 'project-tokens-month',
      label: 'Projeto (tokens no período)',
      origin: mapOrigin(usage.origin),
      ...(percent === undefined ? {} : { percent }),
    })
  }

  if (meters.length === 0 && usage.origin === 'unavailable') {
    meters.push({
      id: 'usage-unavailable',
      label: 'Uso no período',
      origin: 'unavailable',
    })
  }

  return meters
}

/** @deprecated Rules panel only — not the D5a usage book. */
export function limitsToUsageMeters(limits: ProjectLimitsView): UsageMeter[] {
  return [
    {
      id: 'proposals-cap',
      label: 'Propostas / dia (teto)',
      origin: 'official',
      percent: Math.min(100, limits.maxProposalsPerDay * 10),
    },
  ]
}
