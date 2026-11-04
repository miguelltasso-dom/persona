import { describe, expect, it } from 'vitest'
import type { OfficialQuotaView } from '@deepseek-ai/dsh-persona-host/types'
import { officialQuotasToProviderPools } from '../src/client/data/adapters/usage-pooled.ts'

describe('officialQuotasToProviderPools (T3 §7)', () => {
  it('keeps the same segment order in 5h and week (soonest refill first)', () => {
    const quotas: OfficialQuotaView[] = [
      {
        provider: 'claude-code',
        origin: 'official',
        accountId: 'personal',
        accountLabel: 'Pessoal',
        detail: 'Pro',
        windows: [
          { id: '5h', origin: 'official', usedPercent: 30, resetsAt: '2026-11-04T22:00:00.000Z' },
          { id: 'week', origin: 'official', usedPercent: 50 },
        ],
      },
      {
        provider: 'claude-code',
        origin: 'official',
        accountId: 'work',
        accountLabel: 'Trabalho',
        detail: 'Max',
        windows: [
          { id: '5h', origin: 'official', usedPercent: 60, resetsAt: '2026-11-04T21:30:00.000Z' },
          { id: 'week', origin: 'official', usedPercent: 35 },
        ],
      },
      {
        provider: 'claude-code',
        origin: 'official',
        accountId: 'extra',
        accountLabel: 'Extra',
        windows: [{ id: 'week', origin: 'official', usedPercent: 10 }],
      },
    ]
    const pools = officialQuotasToProviderPools(quotas)
    expect(pools).toHaveLength(1)
    const pool = pools[0]!
    expect(pool.accountOrder).toEqual(['work', 'personal', 'extra'])
    expect(pool.fiveHour.map(s => s.id)).toEqual(['work', 'personal', 'extra'])
    expect(pool.week.map(s => s.id)).toEqual(['work', 'personal', 'extra'])
    expect(pool.fiveHour.find(s => s.id === 'extra')?.leftPct).toBeUndefined()
    expect(pool.fiveHour.find(s => s.id === 'work')?.leftPct).toBe(40)
  })
})
