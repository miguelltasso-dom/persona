/** Persona usage ledger and official quota readers with labelled origins. */

export { default } from './plugin.ts'
export { default as PersonaUsage } from './plugin.ts'
export type { Config as PersonaUsageConfig } from './plugin.ts'

export const PACKAGE_USAGE = 'persona-usage'

export { foldUsage } from './book.ts'
export { labelledEstimate, readCodexRolloutLimits, readDeepSeekBalance, readOarAccountUsage } from './official.ts'
export { officialQuota, type OfficialQuotaOptions } from './official-quota.ts'
export { createMemoryUsageStore } from './store.ts'
export type {
  UsageCostEstimate,
  UsageEvent,
  UsageQuery,
  UsageStore,
  UsageTotals,
} from './store-types.ts'
export { originLabel, USAGE_ORIGIN_LABEL } from './types.ts'
export type {
  OfficialQuota,
  UsageEstimate,
  UsageFold,
  UsageOrigin,
  UsageRecord,
  UsageWindow,
} from './types.ts'
