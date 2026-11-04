import { describe, expect, it } from 'vitest'
import { dedupeTwoDayRows, twoDayRowIdentity } from '../src/client/governance/two-day-dedupe.ts'
import { preferDerivedTwoDay } from '../src/client/governance/two-day-prefer-derived.ts'

describe('twoDayRowIdentity', () => {
  it('keys persona rows by role and name', () => {
    expect(twoDayRowIdentity({ id: 'a', label: 'Vigia (Luna)', slots: ['runs', 'runs', 'runs', 'runs'] }))
      .toBe('luna|vigia')
  })
})

describe('dedupeTwoDayRows', () => {
  it('collapses duplicate Vigia (Luna) keeping the row with waits', () => {
    const rows = dedupeTwoDayRows([
      { id: 'host', label: 'Vigia (Luna)', slots: ['runs', 'runs', 'runs', 'runs'] },
      { id: 'live', label: 'Vigia (Luna)', slots: ['waits', 'waits', 'waits', 'waits'] },
    ])
    expect(rows).toHaveLength(1)
    expect(rows[0]?.slots[0]).toBe('waits')
  })
})

describe('preferDerivedTwoDay merge', () => {
  it('dedupes host and derived Luna', () => {
    const merged = preferDerivedTwoDay(
      {
        workspaceId: 'ws',
        slotLabels: ['a', 'b', 'c', 'd'],
        rows: [{ id: 'host', label: 'Vigia (Luna)', slots: ['runs', 'runs', 'runs', 'runs'] }],
      },
      {
        workspaceId: 'ws',
        slotLabels: ['a', 'b', 'c', 'd'],
        rows: [
          { id: 'live-persona-luna', label: 'Vigia (Luna)', slots: ['waits', 'waits', 'waits', 'waits'] },
          { id: 'live-approvals-you', label: 'Aprovações (você)', slots: ['waits', 'waits', 'waits', 'waits'] },
        ],
      },
    )
    expect(merged.rows.some(row => row.label === 'Vigia (Luna)')).toBe(true)
    expect(merged.rows.filter(row => row.label === 'Vigia (Luna)')).toHaveLength(1)
  })
})
