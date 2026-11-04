// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { FlowKanbanBoard } from '../src/client/kanban/FlowKanbanBoard.tsx'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

describe('FlowKanbanBoard (BOARDS-SPEC §2.2)', () => {
  it('renders workflow column headers with category stripe', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <FlowKanbanBoard
          dict={pt}
          projectName="Site"
          surfaceState="ready"
          columns={[
            { id: 'c1', name: 'Descoberta', category: 'todo' },
            { id: 'c2', name: 'Design', category: 'doing', wip: 3 },
          ]}
          cards={[
            {
              id: 't1',
              title: 'Home',
              columnId: 'c1',
              column: 'todo',
              projectId: 'p1',
              projectName: 'Site',
              teamId: 't',
              teamName: 'Equipe',
              waitingEvent: false,
              blocked: false,
              reviewApproved: false,
            },
          ]}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText('Descoberta')).toBeTruthy()
    expect(screen.getByText('Design')).toBeTruthy()
    expect(screen.getByText('Home')).toBeTruthy()
    expect(screen.getByText('0/3')).toBeTruthy()
  })
})
