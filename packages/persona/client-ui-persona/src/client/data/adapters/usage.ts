import type { OfficialQuotaView, UsageView } from '@deepseek-ai/dsh-persona-host/types'
import type { ProjectLimitsView } from '@deepseek-ai/dsh-persona-host/types'
import type { UsageOrigin as HostUsageOrigin } from '@deepseek-ai/dsh-persona-usage'
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
    for (const window of quota.windows) {
      const label = `${quota.provider} · ${window.id}`
      const origin = mapOrigin(window.origin)
      meters.push({
        id: `quota:${quota.provider}:${window.id}`,
        label,
        origin,
        ...(window.usedPercent === undefined ? {} : { percent: Math.min(100, Math.max(0, window.usedPercent)) }),
      })
    }
    if (quota.windows.length === 0 && quota.origin === 'unavailable') {
      meters.push({
        id: `quota:${quota.provider}:unavailable`,
        label: quota.provider,
        origin: 'unavailable',
      })
    }
  }

  if (usage.tokensPerMonthLimit !== undefined && usage.origin !== 'unavailable') {
    const percent = Math.min(100, Math.round((usage.tokens / usage.tokensPerMonthLimit) * 100))
    meters.push({
      id: 'project-tokens-month',
      label: 'Projeto (tokens no período)',
      origin: mapOrigin(usage.origin),
      percent,
    })
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
