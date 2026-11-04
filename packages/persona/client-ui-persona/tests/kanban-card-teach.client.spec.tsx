// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KanbanCard } from '../src/client/kanban/KanbanCard.tsx'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'
import { pt as kanbanDict } from '../src/client/locale/kanban/locales.ts'

afterEach(() => { cleanup() })

const columnLabels = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  in_review: 'Em revisão',
  blocked: 'Bloqueado',
  done: 'Concluído',
} as const

const cardWithAssignee: KanbanCardModel = {
  id: 'card-1',
  title: 'Implementar checkout',
  column: 'in_progress',
  teamId: 'team-1',
  teamName: 'Equipe',
  projectId: 'proj-1',
  projectName: 'Site',
  waitingEvent: false,
  blocked: false,
  reviewApproved: false,
  assignee: { id: 'p-nina', name: 'Nina', initials: 'N' },
}

const cardWithoutAssignee: KanbanCardModel = {
  id: 'card-2',
  title: 'Tarefa sem dono',
  column: 'todo',
  teamId: 'team-1',
  teamName: 'Equipe',
  projectId: 'proj-1',
  projectName: 'Site',
  waitingEvent: false,
  blocked: false,
  reviewApproved: false,
}

describe('KanbanCard teach (W2-10)', () => {
  it('exposes Ensinar in menu when onTeach provided and assignee exists, and calls handler', () => {
    const onTeach = vi.fn()
    render(
      <KanbanCard
        dict={kanbanDict}
        card={cardWithAssignee}
        draggingId={null}
        showProject={false}
        columnLabels={columnLabels}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onMoveCard={() => {}}
        onTeach={onTeach}
      />,
    )

    const menuTrigger = screen.getByRole('button', { name: kanbanDict['a11y.cardMenu'] })
    fireEvent.click(menuTrigger)

    const teachItem = screen.getByRole('menuitem', { name: kanbanDict['action.teach'] })
    expect(teachItem).toBeTruthy()
    fireEvent.click(teachItem)

    expect(onTeach).toHaveBeenCalledWith('card-1', 'p-nina')
  })

  it('omits Ensinar when card has no assignee', () => {
    const onTeach = vi.fn()
    render(
      <KanbanCard
        dict={kanbanDict}
        card={cardWithoutAssignee}
        draggingId={null}
        showProject={false}
        columnLabels={columnLabels}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onMoveCard={() => {}}
        onTeach={onTeach}
      />,
    )

    const menuTrigger = screen.getByRole('button', { name: kanbanDict['a11y.cardMenu'] })
    fireEvent.click(menuTrigger)

    expect(screen.queryByRole('menuitem', { name: kanbanDict['action.teach'] })).toBeNull()
  })

  it('omits Ensinar when onTeach is not passed', () => {
    render(
      <KanbanCard
        dict={kanbanDict}
        card={cardWithAssignee}
        draggingId={null}
        showProject={false}
        columnLabels={columnLabels}
        onDragStart={() => {}}
        onDragEnd={() => {}}
        onMoveCard={() => {}}
      />,
    )

    const menuTrigger = screen.getByRole('button', { name: kanbanDict['a11y.cardMenu'] })
    fireEvent.click(menuTrigger)

    expect(screen.queryByRole('menuitem', { name: kanbanDict['action.teach'] })).toBeNull()
  })
})
