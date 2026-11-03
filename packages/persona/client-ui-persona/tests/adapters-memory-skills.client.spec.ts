import { describe, expect, it } from 'vitest'
import { memoryViewsToRows } from '../src/client/data/adapters/memory.ts'
import { skillViewsToRecords } from '../src/client/data/adapters/skills.ts'

describe('memoryViewsToRows', () => {
  it('maps vault origin to project visibility', () => {
    const rows = memoryViewsToRows([
      { id: 'm1', body: 'Cofre seed', origin: 'vault', status: 'active' },
    ], 'ws', 'pp')
    expect(rows[0]?.visibility).toEqual({ kind: 'project', projectId: 'pp' })
    expect(rows[0]?.uiOrigin).toBe('vault')
  })
})

describe('skillViewsToRecords', () => {
  it('maps host skill rows', () => {
    const records = skillViewsToRecords([
      { id: 's1', name: 'Lint', version: 1, status: 'active', body: '', sharedWithTeam: true },
    ])
    expect(records[0]?.name).toBe('Lint')
    expect(records[0]?.sharedWithTeam).toBe(true)
  })
})
