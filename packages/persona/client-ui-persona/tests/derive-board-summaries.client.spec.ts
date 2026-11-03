import { describe, expect, it } from 'vitest'
import { deriveBoardSummaries } from '../src/client/boards/derive-board-summaries.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'

describe('deriveBoardSummaries', () => {
  it('counts cards by column category for live projects', () => {
    const cards: KanbanCardModel[] = [
      {
        id: '1',
        title: 'A',
        projectId: 'p1',
        projectName: 'P1',
        teamId: 't',
        teamName: 'T',
        column: 'todo',
        waitingEvent: false,
        blocked: false,
        reviewApproved: false,
      },
      {
        id: '2',
        title: 'B',
        projectId: 'p1',
        projectName: 'P1',
        teamId: 't',
        teamName: 'T',
        column: 'blocked',
        waitingEvent: false,
        blocked: true,
        reviewApproved: false,
      },
    ]
    const summaries = deriveBoardSummaries({
      projects: [{ id: 'p1', name: 'Projeto um' }, { id: 'p2', name: 'Dois' }],
      kanbanCards: cards,
      nowRows: [],
    })
    const p1 = summaries.find(s => s.id === 'p1')
    expect(p1?.counts.todo).toBe(1)
    expect(p1?.counts.needs_you).toBe(1)
    expect(p1?.needsYouCount).toBe(1)
  })
})
