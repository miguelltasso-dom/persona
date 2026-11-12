// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { BoardsHome } from '../src/client/boards/BoardsHome.tsx'
import { MOCK_PROJECT_BOARD_SUMMARIES } from '../src/client/boards/mock-data.ts'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

describe('Quadros hub (BOARDS-SPEC §1)', () => {
  it('renders project grid with Contratação and Site summaries', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <BoardsHome
          dict={pt}
          summaries={MOCK_PROJECT_BOARD_SUMMARIES}
          onOpenProject={() => {}}
        />
      </PreviewFrame>,
    )
    expect(document.querySelector('[data-persona-boards]')).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: pt['title.boards'] })).toBeTruthy()
    expect(screen.getByText('Contratação — Designer')).toBeTruthy()
    expect(screen.getByText('Site da agência')).toBeTruthy()
    expect(screen.getByText(pt['flowModel.contratacao'])).toBeTruthy()
  })

  it('names active workers on the project card in words, not only in a hidden group (axe AA)', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <BoardsHome
          dict={pt}
          summaries={MOCK_PROJECT_BOARD_SUMMARIES}
          onOpenProject={() => {}}
        />
      </PreviewFrame>,
    )
    // PB-5: visible words ("Atlas, Nina, Bento trabalham agora"); the portraits are decoration.
    expect(screen.getByText('Atlas, Nina, Bento trabalham agora')).toBeTruthy()
  })

  it('offers global category view when handler is provided', () => {
    let opened = false
    render(
      <PreviewFrame brandLabel="Persona">
        <BoardsHome
          dict={pt}
          summaries={MOCK_PROJECT_BOARD_SUMMARIES}
          onOpenProject={() => {}}
          onGlobalView={() => { opened = true }}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['boards.globalView'] }))
    expect(opened).toBe(true)
  })

  it('filters to projects that need you', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <BoardsHome
          dict={pt}
          summaries={MOCK_PROJECT_BOARD_SUMMARIES}
          onOpenProject={() => {}}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['boards.filter.needsYou'] }))
    expect(screen.getByText('Contratação — Designer')).toBeTruthy()
    expect(screen.queryByText('Site da agência')).toBeNull()
  })
})
