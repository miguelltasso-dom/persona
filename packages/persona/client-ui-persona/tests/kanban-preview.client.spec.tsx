// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { GlobalKanban } from '../src/client/kanban/GlobalKanban.tsx'
import { MOCK_GLOBAL_KANBAN_CARDS, MOCK_PROJECT_KANBAN_CARDS } from '../src/client/kanban/mock-data.ts'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { ProjectKanban } from '../src/client/kanban/ProjectKanban.tsx'
import { columnFromTicketStage } from '../src/client/kanban/stage-map.ts'

installPreviewTheme()

beforeEach(() => {
  document.body.replaceChildren()
})

afterEach(() => {
  cleanup()
})

function renderPreview(ui: ReactElement): RenderResult {
  return render(
    <PreviewFrame brandLabel="Persona">
      <div className="panel" style={{ maxWidth: 'none' }}>{ui}</div>
    </PreviewFrame>,
  )
}

function globalKanbanRoot(): HTMLElement {
  const root = document.querySelector('[data-persona-kanban="global"]')
  if (root === null || !(root instanceof HTMLElement)) {
    throw new Error('global kanban surface missing')
  }
  return root
}

describe('kanban stage projection', () => {
  it('maps ticket stages to board columns (D-029)', () => {
    expect(columnFromTicketStage({ stage: 'working', action: 'queued' })).toBe('todo')
    expect(columnFromTicketStage({ stage: 'working' })).toBe('in_progress')
    expect(columnFromTicketStage({ stage: 'idle' })).toBe('in_progress')
    expect(columnFromTicketStage({ stage: 'person', action: 'review' })).toBe('in_review')
    expect(columnFromTicketStage({ stage: 'person', action: 'blocked' })).toBe('blocked')
    expect(columnFromTicketStage({ stage: 'ended' })).toBe('done')
  })
})

describe.sequential('kanban preview (dom)', () => {
  it('renders project board with five columns and waiting-event chip', () => {
    const view = renderPreview(<ProjectKanban dict={pt} />)
    const projectRoot = document.querySelector('[data-persona-kanban="project"]')
    expect(projectRoot).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: pt['title.project'] })).toBeTruthy()
    const board = within(projectRoot as HTMLElement).getByRole('region', { name: pt['a11y.boardRegion'] })
    expect(board.querySelector('#col-todo')?.textContent).toContain(pt['column.todo'])
    expect(within(projectRoot as HTMLElement).getByText(pt['chip.state.waiting'])).toBeTruthy()
    view.unmount()
  })

  it('shows Revisar on in-review cards when handler is set', () => {
    const opened: string[] = []
    renderPreview(
      <GlobalKanban
        dict={pt}
        initialCards={MOCK_GLOBAL_KANBAN_CARDS}
        onOpenReview={(card) => { opened.push(card.id) }}
      />,
    )
    const globalRoot = globalKanbanRoot()
    const reviewCard = within(globalRoot).getByRole('article', { name: 'Revisar copy da página de preços' })
    fireEvent.click(within(reviewCard).getByRole('button', { name: pt['a11y.cardMenu'] }))
    fireEvent.click(screen.getByRole('menuitem', { name: pt['action.open'] }))
    expect(opened.length).toBe(1)
  })

  it('filters global board cards by project id', () => {
    renderPreview(<GlobalKanban dict={pt} initialCards={MOCK_GLOBAL_KANBAN_CARDS} />)
    const globalRoot = globalKanbanRoot()
    expect(within(globalRoot).getByRole('heading', { level: 1, name: pt['title.global'] })).toBeTruthy()
    expect(within(globalRoot).getByText('Mapear campos do processo civil')).toBeTruthy()

    fireEvent.change(within(globalRoot).getByLabelText(pt['filter.project']), { target: { value: 'proj-site' } })

    expect(within(globalRoot).queryByText('Mapear campos do processo civil')).toBeNull()
    const board = within(globalRoot).getByRole('region', { name: pt['a11y.boardRegion'] })
    const briefingCards = within(board).getAllByRole('article', { name: 'Briefing do hero da landing' })
    expect(briefingCards).toHaveLength(1)
    expect(within(board).getAllByRole('article')).toHaveLength(MOCK_PROJECT_KANBAN_CARDS.length)
  })
})
