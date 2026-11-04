import type { UsageTokenPanelUi } from '../data/adapters/usage-panel.ts'

/** Gallery / empty-host preview (OPT-7). */
export const MOCK_USAGE_TOKEN_PANEL: UsageTokenPanelUi = {
  origin: 'estimated',
  tokensPerSuccessfulTask: 12_400,
  cacheHitPct: 42,
  byPersona: [
    { key: 'Nina', tokens: 48_000, calls: 12, cacheHitPct: 38 },
    { key: 'Atlas', tokens: 22_000, calls: 6, cacheHitPct: 51 },
  ],
  byKind: [
    { key: 'execution', tokens: 54_000, calls: 14, cacheHitPct: 40 },
    { key: 'triage', tokens: 16_000, calls: 4, cacheHitPct: 55 },
  ],
}
