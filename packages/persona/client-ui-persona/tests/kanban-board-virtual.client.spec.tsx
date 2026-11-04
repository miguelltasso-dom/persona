// @vitest-environment jsdom
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { KanbanBoard } from '../src/client/kanban/KanbanBoard.tsx'
import { mockLargeKanbanCards } from '../src/client/kanban/mock-large-kanban-cards.ts'
import { KANBAN_COLUMN_VIRTUAL_MIN } from '../src/client/kanban/kanban-virtual.ts'
import { pt as kanbanDict } from '../src/client/locale/kanban/locales.ts'

afterEach(() => { cleanup() })

const columnLabels = {
  todo: 'A fazer',
  in_progress: 'Em andamento',
  in_review: 'Em revisão',
  blocked: 'Bloqueado',
  done: 'Concluído',
} as const

describe('KanbanBoard scale (DESEMPENHO)', () => {
  it('virtualizes a 1000-card global board within jsdom budget', () => {
    const cards = mockLargeKanbanCards(1000)
    const start = performance.now()
    const { container } = render(
      <KanbanBoard
        dict={kanbanDict}
        cards={cards}
        surfaceState="ready"
        showProjectOnCard
        columnLabels={columnLabels}
      />,
    )
    const ms = performance.now() - start
    const mounted = container.querySelectorAll('[data-persona-kanban-card]').length
    expect(mounted).toBeLessThan(cards.length)
    expect(mounted).toBeGreaterThan(KANBAN_COLUMN_VIRTUAL_MIN)
    expect(ms).toBeLessThan(8_000)
  })

  it('supports drag-and-drop to move a card between columns on a 1000-card board', () => {
    const cards = mockLargeKanbanCards(1000)
    const onMoveCard = vi.fn()
    const { container } = render(
      <KanbanBoard
        dict={kanbanDict}
        cards={cards}
        surfaceState="ready"
        showProjectOnCard
        columnLabels={columnLabels}
        onMoveCard={onMoveCard}
      />,
    )
    const firstCard = container.querySelector('[data-persona-kanban-card]')
    expect(firstCard).toBeTruthy()
    const cardId = firstCard!.getAttribute('data-persona-kanban-card')!

    const dataTransfer = {
      data: {} as Record<string, string>,
      setData(type: string, val: string) { this.data[type] = val },
      getData(type: string) { return this.data[type] ?? '' },
      effectAllowed: 'none',
      dropEffect: 'none',
    }

    fireEvent.dragStart(firstCard!, { dataTransfer })
    expect(dataTransfer.getData('text/persona-kanban-card')).toBe(cardId)

    const doneColumn = container.querySelector('#col-done')
    expect(doneColumn).toBeTruthy()

    fireEvent.dragOver(doneColumn!, { dataTransfer })
    fireEvent.drop(doneColumn!, { dataTransfer })

    expect(onMoveCard).toHaveBeenCalledWith(cardId, 'done')
  })
})
