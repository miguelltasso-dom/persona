// @vitest-environment jsdom
import { cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
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
})
