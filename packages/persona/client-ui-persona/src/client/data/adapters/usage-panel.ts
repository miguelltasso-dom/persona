import type { UsagePanelView } from '@deepseek-ai/dsh-persona-host/types'
import type { UsageOrigin } from '../../usage/mock-data.ts'

export interface UsageTokenSliceUi {
  readonly key: string
  readonly tokens: number
  readonly calls: number
  readonly cacheHitPct?: number | undefined
}

export interface UsageTokenPanelUi {
  readonly origin: UsageOrigin
  readonly tokensPerSuccessfulTask: number
  readonly cacheHitPct?: number | undefined
  readonly byPersona: readonly UsageTokenSliceUi[]
  readonly byKind: readonly UsageTokenSliceUi[]
}

function mapLedgerOrigin(origin: UsagePanelView['origin']): UsageOrigin {
  if (origin === 'measured') return 'measured'
  return 'estimated'
}

function pct(rate: number): number | undefined {
  if (!Number.isFinite(rate) || rate <= 0) return undefined
  return Math.round(rate * 100)
}

/**
 * OPT-7 — host `UsagePanelView` → Uso UI (never show 0% cache when unknown). The ledger keys by persona id: with the
 * team's names the screen reads "Nina · 1.112 tokens", never "onb-1".
 */
export function usagePanelToUi(view: UsagePanelView, personaNames: Readonly<Record<string, string>> = {}): UsageTokenPanelUi {
  return {
    origin: mapLedgerOrigin(view.origin),
    tokensPerSuccessfulTask: view.tokensPerSuccessfulTask,
    cacheHitPct: pct(view.cacheHitRate),
    byPersona: view.byPersona.map(row => ({
      key: personaNames[row.key] ?? row.key,
      tokens: row.tokens,
      calls: row.calls,
      cacheHitPct: pct(row.cacheHitRate),
    })),
    byKind: view.byKind.map(row => ({
      key: row.key,
      tokens: row.tokens,
      calls: row.calls,
      cacheHitPct: pct(row.cacheHitRate),
    })),
  }
}
