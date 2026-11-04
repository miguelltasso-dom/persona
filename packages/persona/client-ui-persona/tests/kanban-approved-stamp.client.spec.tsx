// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { KanbanCard } from '../src/client/kanban/KanbanCard.tsx'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

describe('KanbanCard ApprovedStamp', () => {
  it('shows static stamp on done cards and animates only when fresh', () => {
    const base = {
      id: 't1',
      title: 'Deploy',
      column: 'done' as const,
      projectId: 'p',
      projectName: 'Site',
      teamId: 't',
      teamName: 't',
      waitingEvent: false,
      blocked: false,
      reviewApproved: true,
    }
    const { rerender } = render(
      <PreviewFrame brandLabel="Persona">
        <KanbanCard
          dict={pt}
          card={base}
          draggingId={null}
          showProject={false}
          columnLabels={{ todo: '', in_progress: '', in_review: '', blocked: '', done: '' }}
          onDragStart={() => {}}
          onDragEnd={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('img', { name: pt['stamp.approved'] }).hasAttribute('data-animate')).toBe(false)
    rerender(
      <PreviewFrame brandLabel="Persona">
        <KanbanCard
          dict={pt}
          card={base}
          draggingId={null}
          showProject={false}
          columnLabels={{ todo: '', in_progress: '', in_review: '', blocked: '', done: '' }}
          onDragStart={() => {}}
          onDragEnd={() => {}}
          approvalStampFresh
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('img', { name: pt['stamp.approved'] }).hasAttribute('data-animate')).toBe(true)
  })
})
