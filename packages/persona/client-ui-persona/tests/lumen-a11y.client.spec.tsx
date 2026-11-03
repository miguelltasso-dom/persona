// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within, type RenderResult } from '@testing-library/react'
import type { ReactElement } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { CanvasView } from '../src/client/canvas/CanvasView.tsx'
import { MOCK_CANVAS_EDGES, MOCK_CANVAS_NODES } from '../src/client/canvas/mock-data.ts'
import { ImportWizard } from '../src/client/importers/ImportWizard.tsx'
import { pt as canvasPt } from '../src/client/locale/canvas/locales.ts'
import { GlobalKanban } from '../src/client/kanban/GlobalKanban.tsx'
import { MOCK_GLOBAL_KANBAN_CARDS } from '../src/client/kanban/mock-data.ts'
import { pt as importersPt } from '../src/client/locale/importers/locales.ts'
import { pt } from '../src/client/locale/kanban/locales.ts'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import { MOCK_APPROVALS } from '../src/client/approvals/mock-data.ts'
import { MOCK_PERSONA_DAILY_SUMMARIES } from '../src/client/approvals/proactivity-mock-data.ts'
import { ConnectionsView } from '../src/client/connections/ConnectionsView.tsx'
import { MOCK_CONNECTIONS } from '../src/client/connections/mock-data.ts'
import { KnowledgeVault } from '../src/client/knowledge/KnowledgeVault.tsx'
import { MOCK_KNOWLEDGE_RECORDS } from '../src/client/knowledge/mock-data.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { pt as connectionsPt } from '../src/client/locale/connections/locales.ts'
import { pt as knowledgePt } from '../src/client/locale/knowledge/locales.ts'
import { pt as membersPt } from '../src/client/locale/members/locales.ts'
import { MembersView } from '../src/client/members/MembersView.tsx'
import { MOCK_MEMBERS } from '../src/client/members/mock-data.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

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

describe('lumen a11y (dom)', () => {
  it('kanban board region and card action menu keyboard path', () => {
    renderPreview(<GlobalKanban dict={pt} initialCards={MOCK_GLOBAL_KANBAN_CARDS} />)
    const root = document.querySelector('[data-persona-kanban="global"]')
    expect(root).toBeTruthy()
    const board = within(root as HTMLElement).getByRole('region', { name: pt['a11y.boardRegion'] })
    const firstCard = within(board).getAllByRole('article')[0]!
    const cardTitle = firstCard.getAttribute('aria-label')
    expect(cardTitle).toBeTruthy()
    fireEvent.click(within(firstCard).getByRole('button', { name: pt['a11y.cardMenu'] }))
    fireEvent.click(screen.getByRole('menuitem', { name: `Mover para ${pt['column.done']}` }))
    const doneSection = board.querySelector('section[aria-labelledby="col-done"]')
    expect(doneSection).toBeTruthy()
    expect(within(doneSection as HTMLElement).getByRole('article', { name: cardTitle! })).toBeTruthy()
  })

  it('stage filter chips expose pressed state', () => {
    renderPreview(<GlobalKanban dict={pt} initialCards={MOCK_GLOBAL_KANBAN_CARDS} />)
    const root = document.querySelector('[data-persona-kanban="global"]') as HTMLElement
    const allChip = within(root).getByRole('button', { name: pt['filter.all'] })
    expect(allChip.getAttribute('aria-pressed')).toBe('true')
  })

  it('import wizard stepper marks current step', () => {
    renderPreview(<ImportWizard dict={importersPt} initialState="ready" />)
    const stepper = screen.getByRole('list', { name: importersPt['progressLabel'] })
    const current = within(stepper).getByRole('listitem', { current: 'step' })
    expect(within(current).getByText(importersPt['step.file'])).toBeTruthy()
  })

  it('canvas graph nodes respond to keyboard selection', () => {
    renderPreview(
      <CanvasView dict={canvasPt} nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} initialState="ready" />,
    )
    const region = screen.getByRole('region', { name: canvasPt['a11y.graphRegion'] })
    const nodeButton = within(region).getByRole('button', { name: /Atlas/i })
    fireEvent.keyDown(nodeButton, { key: 'Enter' })
    expect(nodeButton.getAttribute('aria-pressed')).toBe('true')
    expect(screen.getByRole('status')).toBeTruthy()
  })

  it('canvas list mode exposes table headers', () => {
    renderPreview(
      <CanvasView dict={canvasPt} nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} initialState="ready" />,
    )
    fireEvent.click(screen.getByRole('tab', { name: canvasPt['mode.list'] }))
    expect(screen.getByRole('columnheader', { name: canvasPt['column.label'] })).toBeTruthy()
    const rows = screen.getAllByRole('row').slice(1)
    expect(rows[0]?.tabIndex).toBe(0)
  })

  it('approvals reactive section has labelled heading', () => {
    renderPreview(
      <ApprovalsInbox
        dict={approvalsPt}
        items={MOCK_APPROVALS}
        proactiveSummaries={MOCK_PERSONA_DAILY_SUMMARIES}
        onDecideItem={() => {}}
      />,
    )
    expect(screen.getByRole('heading', { level: 2, name: approvalsPt['reactive.title'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: approvalsPt['action.primary.hire'] })).toBeTruthy()
  })

  it('connections loading exposes busy status', () => {
    renderPreview(<ConnectionsView dict={connectionsPt} initialState="loading" />)
    expect(screen.getByRole('status', { busy: true })).toBeTruthy()
  })

  it('connections copy announces via live region', async () => {
    Object.assign(navigator, {
      clipboard: { writeText: async () => { /* ok */ } },
    })
    renderPreview(<ConnectionsView dict={connectionsPt} entries={MOCK_CONNECTIONS} />)
    fireEvent.click(screen.getByRole('button', { name: connectionsPt['action.copyCommand'] }))
    await waitFor(() => {
      expect(screen.getByRole('status').textContent).toBe(connectionsPt['action.copied'])
    })
  })

  it('knowledge vault tabs are keyboard reachable', () => {
    renderPreview(<KnowledgeVault dict={knowledgePt} records={MOCK_KNOWLEDGE_RECORDS} />)
    const proposals = screen.getByRole('tab', { name: knowledgePt['tab.proposals'] })
    proposals.focus()
    expect(document.activeElement).toBe(proposals)
  })

  it('members invite uses medium primary control', () => {
    renderPreview(<MembersView dict={membersPt} members={MOCK_MEMBERS} />)
    expect(screen.getByRole('button', { name: membersPt['action.invite'] })).toBeTruthy()
  })
})
