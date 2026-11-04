import { expect, it } from 'vitest'
import { groupTurnActivity } from '../src/index.ts'
import type { TurnActivityEvent } from '../src/index.ts'

const at = '2026-11-04T04:40:00.000Z'

function ev(overrides: Partial<TurnActivityEvent> & Pick<TurnActivityEvent, 'id' | 'kind' | 'status'>): TurnActivityEvent {
  return {
    personaId: 'nina',
    threadId: 'geral',
    title: overrides.id,
    at,
    ...overrides,
  }
}

it('groups a turn: mutations first, failures out of done, waiting is unfinished', () => {
  const fold = groupTurnActivity([
    ev({ id: 'r1', kind: 'read', status: 'done', title: 'README' }),
    ev({ id: 'c1', kind: 'command', status: 'done', title: 'npm test' }),
    ev({ id: 'f1', kind: 'file', status: 'failed', title: 'patch' }),
    ev({ id: 'm1', kind: 'message', status: 'waiting', title: 'Sol' }),
    ev({ id: 'c2', kind: 'command', status: 'done', title: 'lint' }),
    ev({ id: 'h1', kind: 'hire', status: 'done', title: 'Pipoca', personaId: 'atlas' }),
  ])
  expect(fold).toHaveLength(2)
  const nina = fold.find(row => row.personaId === 'nina')
  expect(nina?.items.map(row => row.kind)).toEqual(['command', 'command', 'file', 'message', 'read'])
  expect(nina?.doneByKind).toEqual({ command: 2, read: 1 })
  expect(nina?.shownKinds).toEqual(['command', 'read'])
  expect(nina?.failedCount).toBe(1)
  expect(nina?.unfinished).toBe(true)
  expect(nina?.moreCount).toBe(0)
  expect(fold.find(row => row.personaId === 'atlas')?.doneByKind.hire).toBe(1)
})
