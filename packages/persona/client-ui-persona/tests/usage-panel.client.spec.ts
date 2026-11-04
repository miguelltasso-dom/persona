import { describe, expect, it } from 'vitest'
import { usagePanelToUi } from '../src/client/data/adapters/usage-panel.ts'
import type { UsagePanelView } from '@deepseek-ai/dsh-persona-host/types'

describe('usagePanelToUi (OPT-7)', () => {
  it('maps origin and omits zero cache hit display', () => {
    const view: UsagePanelView = {
      origin: 'measured',
      tokensPerSuccessfulTask: 120,
      cacheHitRate: 0.42,
      byPersona: [{ key: 'Nina', tokens: 4800, calls: 3, cacheHitRate: 0.5 }],
      byKind: [],
    }
    const ui = usagePanelToUi(view)
    expect(ui.origin).toBe('measured')
    expect(ui.cacheHitPct).toBe(42)
    expect(ui.byPersona[0]?.cacheHitPct).toBe(50)
  })

  it('shows the persona by name, not by the id the ledger keys on (Gauge: "onb-1 · 1112 tokens")', () => {
    const view: UsagePanelView = {
      origin: 'measured',
      tokensPerSuccessfulTask: 10,
      cacheHitRate: 0,
      byPersona: [{ key: 'onb-1', tokens: 1112, calls: 2, cacheHitRate: 0 }, { key: 'sem-cadastro', tokens: 5, calls: 1, cacheHitRate: 0 }],
      byKind: [],
    }
    const ui = usagePanelToUi(view, { 'onb-1': 'Nina' })
    expect(ui.byPersona.map(row => row.key)).toEqual(['Nina', 'sem-cadastro'])
    expect(usagePanelToUi(view).byPersona[0]?.key).toBe('onb-1')
  })

  it('empty estimate origin', () => {
    const ui = usagePanelToUi({
      origin: 'estimate',
      tokensPerSuccessfulTask: 0,
      cacheHitRate: 0,
      byPersona: [],
      byKind: [],
    })
    expect(ui.origin).toBe('estimated')
    expect(ui.cacheHitPct).toBeUndefined()
  })
})
