import { describe, expect, it } from 'vitest'
import { officialQuotaPuts, quotaPutLabel } from '../src/usage-quota-bridge.ts'

describe('official quota put rows', () => {
  it('maps probe cards to Anvil putQuota rows with readable labels', () => {
    expect(quotaPutLabel('claude', 'max')).toBe('Claude Max')
    expect(quotaPutLabel('codex', 'chatgpt')).toBe('ChatGPT')
    expect(quotaPutLabel('claude', undefined)).toBe('Claude')
    const rows = officialQuotaPuts([
      { id: 'dsh' },
      {
        id: 'claude',
        officialQuota: {
          provider: 'claude',
          origin: 'official',
          detail: 'max',
          windows: [{ id: '5h', origin: 'official', usedPercent: 0 }],
        },
      },
      {
        id: 'codex',
        officialQuota: {
          provider: 'codex',
          origin: 'unavailable',
          detail: 'accountUsage timeout',
          windows: [],
        },
      },
    ])
    expect(rows).toEqual([
      {
        provider: 'claude',
        origin: 'official',
        windows: [{ id: '5h', origin: 'official', usedPercent: 0 }],
        accountId: 'claude',
        accountLabel: 'Claude Max',
        detail: 'max',
      },
      {
        provider: 'codex',
        origin: 'unavailable',
        windows: [],
        accountId: 'codex',
        accountLabel: 'ChatGPT',
        detail: 'accountUsage timeout',
      },
    ])
    expect(JSON.stringify(rows)).not.toMatch(/"accountLabel":"default"/u)
  })
})
