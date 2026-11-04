import { describe, expect, it } from 'vitest'
import { deriveFirstDeliveryMilestone } from '../src/client/overview/derive-first-delivery.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'

function card(id: string, column: KanbanCardModel['column']): KanbanCardModel {
  return {
    id,
    title: `Task ${id}`,
    projectId: 'p1',
    projectName: 'Site',
    teamId: 't',
    teamName: 'Equipe',
    column,
    waitingEvent: false,
    blocked: false,
    reviewApproved: column === 'done',
  }
}

describe('deriveFirstDeliveryMilestone', () => {
  it('returns undefined when nothing is done', () => {
    expect(deriveFirstDeliveryMilestone([card('a', 'todo')])).toBeUndefined()
  })

  it('picks the first done card for the milestone', () => {
    const milestone = deriveFirstDeliveryMilestone([
      card('a', 'todo'),
      card('b', 'done'),
      card('c', 'done'),
    ])
    expect(milestone?.taskId).toBe('b')
    expect(milestone?.title).toBe('Task b')
  })
})
