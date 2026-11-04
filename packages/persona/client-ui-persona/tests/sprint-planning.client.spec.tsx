// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { SprintPlanningView } from '../src/client/kanban/SprintPlanningView.tsx'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import type { FlowCardModel } from '../src/client/kanban/flow-types.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

const backlogCard: FlowCardModel = {
  id: 'tk-1',
  title: 'README',
  columnId: 'col-todo',
  column: 'todo',
  projectId: 'code',
  projectName: 'Software',
  teamId: 'team',
  teamName: 'Equipe',
  blocked: false,
  waitingEvent: false,
  reviewApproved: false,
}

describe('SprintPlanningView (BOARDS-SPEC §3)', () => {
  it('disables start until objective, name and sprint tasks', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <SprintPlanningView
          dict={pt}
          projectName="Software"
          backlog={[backlogCard]}
          sprintCards={[]}
          draft={{ name: '', objective: '', startsAt: '', endsAt: '' }}
          selectedBacklogId={null}
          selectedSprintId={null}
          onDraftChange={() => {}}
          onSelectBacklog={() => {}}
          onSelectSprint={() => {}}
          onAddToSprint={() => {}}
          onRemoveFromSprint={() => {}}
          onCancel={() => {}}
          onStart={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('button', { name: pt['planSprint.start'] }).hasAttribute('disabled')).toBe(true)
  })

  it('moves a backlog card into sprint via add control', () => {
    const onAdd = vi.fn()
    render(
      <PreviewFrame brandLabel="Persona">
        <SprintPlanningView
          dict={pt}
          projectName="Software"
          backlog={[backlogCard]}
          sprintCards={[]}
          draft={{ name: 'S1', objective: 'Ship', startsAt: '', endsAt: '' }}
          selectedBacklogId="tk-1"
          selectedSprintId={null}
          onDraftChange={() => {}}
          onSelectBacklog={() => {}}
          onSelectSprint={() => {}}
          onAddToSprint={onAdd}
          onRemoveFromSprint={() => {}}
          onCancel={() => {}}
          onStart={() => {}}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['planSprint.addToSprint'] }))
    expect(onAdd).toHaveBeenCalled()
  })
})
