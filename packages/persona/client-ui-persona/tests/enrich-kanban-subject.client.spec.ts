import { describe, expect, it } from 'vitest'
import { enrichKanbanCardsFromHost } from '../src/client/remote/map-host-ui.ts'
import type { TaskView } from '../src/client/remote/persona-remote-types.ts'

describe('enrichKanbanCardsFromHost conversation subject (W2-3)', () => {
  it('maps host conversationSubjectId to card dot metadata', () => {
    const task: TaskView = {
      id: 't1',
      projectId: 'pp',
      title: 'README',
      stage: 'todo',
      stageAction: '',
      conversationSubjectId: 'sub-ui',
    }
    const cards = enrichKanbanCardsFromHost(
      [task],
      [{ id: 'pp', name: 'Site' }],
      [],
      [{ id: 'sub-ui', name: 'UI', colorIndex: 2, unreadCount: 0 }],
    )
    expect(cards[0]?.conversationSubject).toEqual({ name: 'UI', colorIndex: 2 })
  })
})
