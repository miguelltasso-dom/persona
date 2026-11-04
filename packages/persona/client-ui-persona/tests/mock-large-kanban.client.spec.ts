import { describe, expect, it } from 'vitest'
import { mockLargeKanbanCards } from '../src/client/kanban/mock-large-kanban-cards.ts'

describe('mockLargeKanbanCards (gallery seed)', () => {
  it('builds 200 and 1000 spread across columns', () => {
    const medium = mockLargeKanbanCards(200)
    expect(medium).toHaveLength(200)
    expect(medium.some(c => c.column === 'todo')).toBe(true)
    expect(medium.some(c => c.conversationSubject !== undefined)).toBe(true)

    const large = mockLargeKanbanCards(1000)
    expect(large).toHaveLength(1000)
    const done = large.filter(c => c.column === 'done').length
    expect(done).toBeGreaterThan(150)
  })
})
