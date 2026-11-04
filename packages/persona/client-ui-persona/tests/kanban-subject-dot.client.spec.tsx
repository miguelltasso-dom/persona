// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { KanbanCard } from '../src/client/kanban/KanbanCard.tsx'
import { pt as kanbanPt } from '../src/client/locale/kanban/locales.ts'

afterEach(() => { cleanup() })

describe('KanbanCard subject dot (W2-3)', () => {
  it('shows subject dot and accessible subject name', () => {
    render(
      <KanbanCard
        dict={kanbanPt}
        card={{
          id: 't1',
          title: 'Landing v2',
          projectId: 'p1',
          projectName: 'Site',
          teamId: 't',
          teamName: 'Equipe',
          column: 'todo',
          waitingEvent: false,
          blocked: false,
          reviewApproved: false,
          conversationSubject: { name: 'Design', colorIndex: 2 },
        }}
        draggingId={null}
        showProject={false}
        columnLabels={{
          todo: 'A fazer',
          in_progress: 'Em andamento',
          in_review: 'Em revisão',
          blocked: 'Bloqueado',
          done: 'Concluído',
        }}
        onDragStart={() => {}}
        onDragEnd={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Landing v2' })).toBeTruthy()
    expect(screen.getByText(kanbanPt['card.subjectLabel'].replace('{name}', 'Design'))).toBeTruthy()
  })
})
