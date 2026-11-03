// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
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
})
