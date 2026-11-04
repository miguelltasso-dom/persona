import { describe, expect, it } from 'vitest'
import { previewTitlesByCategory } from '../src/client/boards/global-lane-previews.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'

const CARD = (id: string, projectId: string, column: KanbanCardModel['column'], title: string): KanbanCardModel => ({
  id,
  title,
  column,
  projectId,
  projectName: 'P',
  teamId: 't',
  teamName: 'T',
  waitingEvent: false,
  blocked: false,
  reviewApproved: false,
})

describe('previewTitlesByCategory', () => {
  it('returns up to three titles per category for one project', () => {
    const cards = [
      CARD('1', 'proj-a', 'todo', 'A'),
      CARD('2', 'proj-a', 'todo', 'B'),
      CARD('3', 'proj-a', 'todo', 'C'),
      CARD('4', 'proj-a', 'todo', 'D'),
      CARD('5', 'proj-b', 'todo', 'Other'),
      CARD('6', 'proj-a', 'blocked', 'Needs you'),
    ]
    const map = previewTitlesByCategory('proj-a', cards)
    expect(map.todo).toEqual(['A', 'B', 'C'])
    expect(map.needs_you).toEqual(['Needs you'])
    expect(map.doing).toBeUndefined()
  })
})
