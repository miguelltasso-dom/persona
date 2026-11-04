/** Persona usage ledger and official quota readers with labelled origins. */

export { default } from './plugin.ts'
export { default as PersonaUsage } from './plugin.ts'
export type { Config as PersonaUsageConfig } from './plugin.ts'

export const PACKAGE_USAGE = 'persona-usage'

export { foldUsage } from './book.ts'
export {
  cacheHitRate,
  foldTurnLedger,
  usagePortKind,
  usagePortWindow,
  type CanonicalTurnKind,
  type LegacyTurnKind,
  type TurnKind,
  type TurnLedgerFold,
  type TurnLedgerRow,
} from './turn-ledger.ts'
export { labelledEstimate, readCodexRolloutLimits, readDeepSeekBalance, readOarAccountUsage } from './official.ts'
export { quotaUiState, readableAccountLabel, type QuotaUiState } from './account-label.ts'
export {
  AUTO_QUOTA_CHECK_MS,
  officialQuota,
  shouldAutoCheckQuota,
  type OfficialQuotaOptions,
} from './official-quota.ts'
export {
  accountIdentityKey,
  canUseReset,
  dedupeLimitAccounts,
  poolProviderLimits,
  redeemReset,
  type DedupedLimitAccount,
  type LimitAccountReport,
  type LimitPool,
  type LimitPoolWindow,
  type LimitWindow,
  type LimitWindowKind,
  type RedeemResetResult,
  type ResetCredits,
} from './limit-pool.ts'
export {
  harvestLimitReports,
  limitWindowKindOf,
  officialQuotaPuts,
  persistOfficialQuotaPuts,
  reportFromOfficialQuota,
  type HarvestAccount,
  type OfficialQuotaPutRow,
  type OfficialQuotaSnapCard,
} from './harvest-limits.ts'
export {
  readNativeHistoryTotals,
  type NativeHistoryTotals,
  type NativeHistoryTurn,
} from './native-history.ts'
export {
  foldClaudeJsonl,
  foldCodexRollout,
  turnsFromClaudeJsonl,
  turnsFromCodexRollout,
} from './native-session-history.ts'
export {
  STABLE_PREFIX_LAYERS,
  composeStablePrefix,
  prefixCacheHit,
  volatilePrefixHits,
  type ComposedPrefix,
  type PrefixLayers,
} from './stable-prefix.ts'
export { quotaCardMeters, type QuotaCardMeters } from './quota-card.ts'
export { createMemoryUsageStore } from './store.ts'
export {
  evaluateSpend,
  spendDayWindow,
  spendMonthWindow,
  type SpendDecision,
  type SpendKind,
  type SpendLimits,
} from './limits.ts'
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
