// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GlobalCategoryLanes } from '../src/client/boards/GlobalCategoryLanes.tsx'
import { MOCK_PROJECT_BOARD_SUMMARIES } from '../src/client/boards/mock-data.ts'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import type { KanbanCardModel } from '../src/client/kanban/types.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const PREVIEW: readonly KanbanCardModel[] = [{
  id: 't1',
  title: 'Triagem de currículos',
  column: 'todo',
  projectId: 'proj-contratacao',
  projectName: 'Contratação — Designer',
  teamId: 't',
  teamName: 'T',
  waitingEvent: false,
  blocked: false,
  reviewApproved: false,
}]

describe('GlobalCategoryLanes (PB-5)', () => {
  it('shows card title previews when previewCards are provided', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <GlobalCategoryLanes
          dict={pt}
          summaries={MOCK_PROJECT_BOARD_SUMMARIES}
          previewCards={PREVIEW}
          onBack={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText('Triagem de currículos')).toBeTruthy()
  })

  it('shows live card previews even when summary counts are zero (PB-5 hub fallback)', () => {
    const summaries = MOCK_PROJECT_BOARD_SUMMARIES.map(row =>
      row.id === 'proj-site'
        ? { ...row, counts: { ...row.counts, todo: 0 }, needsYouCount: 0 }
        : row,
    )
    render(
      <PreviewFrame brandLabel="Persona">
        <GlobalCategoryLanes
          dict={pt}
          summaries={summaries}
          previewCards={[{
            id: 't-site',
            title: 'Hero da home',
            column: 'todo',
            projectId: 'proj-site',
            projectName: 'Site da agência',
            teamId: 't',
            teamName: 'T',
            waitingEvent: false,
            blocked: false,
            reviewApproved: false,
          }]}
          onBack={() => {}}
        />
      </PreviewFrame>,
    )
    expect(screen.getByText('Hero da home')).toBeTruthy()
  })
})
