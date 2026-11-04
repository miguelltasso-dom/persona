// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { detectPersonaMoves, KANBAN_CARRY_MS, useKanbanCarry } from '../src/client/kanban/use-kanban-carry.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

const nina = { id: 'nina', name: 'Nina' } as unknown as NonNullable<KanbanCardModel['assignee']>
type C = Pick<KanbanCardModel, 'id' | 'column' | 'assignee' | 'carry'>
const card = (id: string, column: KanbanCardModel['column'], assignee = true): C =>
  ({ id, column, ...(assignee ? { assignee: nina } : {}) })

describe('detectPersonaMoves', () => {
  it('only column changes that were not local and have an assignee', () => {
    const prev = new Map([['a', 'todo'], ['b', 'todo'], ['c', 'todo'], ['d', 'todo']])
    const moved = detectPersonaMoves(prev, [
      { id: 'a', columnKey: 'in_progress', hasAssignee: true },
      { id: 'b', columnKey: 'in_progress', hasAssignee: true },
      { id: 'c', columnKey: 'in_progress', hasAssignee: false },
      { id: 'd', columnKey: 'todo', hasAssignee: true },
    ], new Set(['b']))
    expect([...moved]).toEqual(['a'])
  })
})

describe('useKanbanCarry (UX-GUIDE §3: the persona carries the card)', () => {
  it('no carrier on first paint; persona move gets one for a beat; human move never does', () => {
    vi.useFakeTimers()
    const { result, rerender } = renderHook(({ cards }) => useKanbanCarry(cards), { initialProps: { cards: [card('a', 'todo'), card('b', 'todo')] } })
    expect(result.current.cards.every(c => c.carry === undefined)).toBe(true)

    result.current.markLocalMove('b')
    rerender({ cards: [card('a', 'in_progress'), card('b', 'done')] })
    const a = result.current.cards.find(c => c.id === 'a')!
    expect(a.carry?.persona.name).toBe('Nina')
    expect(a.carry?.fromColumn).toBe('todo')
    expect(result.current.isCarried('a')).toBe(true)
    expect(result.current.cards.find(c => c.id === 'b')!.carry).toBeUndefined()

    act(() => { vi.advanceTimersByTime(KANBAN_CARRY_MS + 10) })
    expect(result.current.isCarried('a')).toBe(false)
    expect(result.current.cards.find(c => c.id === 'a')!.carry).toBeUndefined()
  })
})
