import { describe, expect, it } from 'vitest'
import { detectPersonaMoves } from '../src/client/kanban/use-kanban-carry.ts'

describe('detectPersonaMoves', () => {
  it('flags column changes with assignee when not a local move', () => {
    const previous = new Map([['a', 'todo'], ['b', 'done']])
    const cards = [
      { id: 'a', columnKey: 'in_progress', hasAssignee: true },
      { id: 'b', columnKey: 'done', hasAssignee: true },
    ]
    expect([...detectPersonaMoves(previous, cards, new Set())]).toEqual(['a'])
  })

  it('ignores local moves and cards without assignee', () => {
    const previous = new Map([['a', 'todo'], ['c', 'todo']])
    const cards = [
      { id: 'a', columnKey: 'done', hasAssignee: true },
      { id: 'c', columnKey: 'done', hasAssignee: false },
    ]
    expect([...detectPersonaMoves(previous, cards, new Set(['a']))]).toEqual([])
  })
})
