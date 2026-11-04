// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FlowKanbanBoard, FLOW_KANBAN_VIRTUAL_MIN } from '../src/client/kanban/FlowKanbanBoard.tsx'
import { pt as kanbanDict } from '../src/client/locale/kanban/locales.ts'
import type { FlowCardModel, FlowColumnModel } from '../src/client/kanban/flow-types.ts'

function makeCards(count: number, columnId: string): FlowCardModel[] {
  return Array.from({ length: count }, (_, index) => ({
    id: `t-${index}`,
    title: `Task ${index}`,
    columnId,
    column: 'todo',
    projectId: 'p1',
    projectName: 'Proj',
    teamId: 't',
    teamName: 'Equipe',
    blocked: false,
    waitingEvent: false,
    reviewApproved: false,
  }))
}

afterEach(() => { cleanup() })

const columns: FlowColumnModel[] = [
  { id: 'col-todo', name: 'A fazer', category: 'todo' },
]

describe('FlowKanbanBoard column virtualization (DESEMPENHO)', () => {
  it('windows large columns instead of mounting every card', () => {
    const cards = makeCards(FLOW_KANBAN_VIRTUAL_MIN + 12, 'col-todo')
    const { container } = render(
      <FlowKanbanBoard
        dict={kanbanDict}
        columns={columns}
        cards={cards}
        surfaceState="ready"
        projectName="Scale"
      />,
    )
    const mounted = container.querySelectorAll('[data-persona-kanban-card]').length
    expect(mounted).toBeLessThan(cards.length)
    expect(mounted).toBeGreaterThan(8)
  })
})
