import type { UsageProviderPoolUi } from '../data/adapters/usage-pooled.ts'

/** Stable order: Trabalho (18:30) → Pessoal → Extra (no 5h window). */
export const MOCK_USAGE_PROVIDER_POOLS: readonly UsageProviderPoolUi[] = [
  {
    provider: 'claude-code',
    providerName: 'Claude Code',
    accountOrder: ['work', 'personal', 'extra'],
    accounts: [
      { id: 'work', label: 'Trabalho', plan: 'Max', state: 'ready', fiveHourUsedPct: 60, weekUsedPct: 35, inUse: true },
      { id: 'personal', label: 'Pessoal', plan: 'Pro', state: 'ready', fiveHourUsedPct: 20, weekUsedPct: 55 },
      { id: 'extra', label: 'Extra', state: 'checking', weekUsedPct: 10 },
    ],
    fiveHour: [
      { id: 'work', label: 'Trabalho', leftPct: 40, refillPct: 18, refillAt: '18:30' },
      { id: 'personal', label: 'Pessoal', leftPct: 80 },
      { id: 'extra', label: 'Extra' },
    ],
    week: [
      { id: 'work', label: 'Trabalho', leftPct: 65, refillPct: 8, refillAt: 'Seg 09:00' },
      { id: 'personal', label: 'Pessoal', leftPct: 45 },
      { id: 'extra', label: 'Extra', leftPct: 90 },
    ],
  },
]

/** Provider connected but no quota windows reported (Muse integ). */
export const MOCK_USAGE_PROVIDER_POOL_NO_LIMITS: UsageProviderPoolUi = {
  provider: 'claude-code',
  providerName: 'Claude',
  accountOrder: ['default'],
  accounts: [
    { id: 'default', label: 'default', state: 'ready' },
  ],
  fiveHour: [{ id: 'default', label: 'default' }],
  week: [{ id: 'default', label: 'default' }],
}
