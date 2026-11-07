// @vitest-environment jsdom
import { cleanup, render, screen, within, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { afterEach, describe, expect, it } from 'vitest'
import { ConnectionsView } from '../src/client/connections/ConnectionsView.tsx'
import { MOCK_CONNECTIONS } from '../src/client/connections/mock-data.ts'
import { FilesView } from '../src/client/files/FilesView.tsx'
import { MOCK_FILES } from '../src/client/files/mock-data.ts'
import { KnowledgeVault } from '../src/client/knowledge/KnowledgeVault.tsx'
import { MOCK_KNOWLEDGE_RECORDS } from '../src/client/knowledge/mock-data.ts'
import { pt as connectionsPt } from '../src/client/locale/connections/locales.ts'
import { pt as reviewPt } from '../src/client/locale/review/locales.ts'
import { ReviewDeliveryPanel } from '../src/client/review/ReviewDeliveryPanel.tsx'
import { MOCK_REVIEW_SUMMARY } from '../src/client/review/mock-data.ts'
import { pt as filesPt } from '../src/client/locale/files/locales.ts'
import { pt as knowledgePt } from '../src/client/locale/knowledge/locales.ts'
import { pt as routinesPt } from '../src/client/locale/routines/locales.ts'
import { pt as usagePt } from '../src/client/locale/usage/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { MOCK_QUIET_WINDOWS, MOCK_ROUTINE_RUNS } from '../src/client/routines/mock-data.ts'
import { RoutinesView } from '../src/client/routines/RoutinesView.tsx'
import { UsageLimits } from '../src/client/usage/UsageLimits.tsx'
import { MOCK_LIMIT_NOTICE, MOCK_USAGE_METERS } from '../src/client/usage/mock-data.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

function wrap(ui: ReactNode): RenderResult {
  return render(
    <PreviewFrame brandLabel="Persona">
      <div className="panel" style={{ maxWidth: 'none' }}>{ui}</div>
    </PreviewFrame>,
  )
}

describe('lumen surface previews', () => {
  it('renders knowledge vault tabs', () => {
    wrap(<KnowledgeVault dict={knowledgePt} records={MOCK_KNOWLEDGE_RECORDS} />)
    expect(screen.getByRole('heading', { level: 1, name: knowledgePt.title })).toBeTruthy()
    expect(screen.getByRole('tab', { name: knowledgePt['tab.proposals'] })).toBeTruthy()
  })

  it('renders routines week grid', () => {
    wrap(<RoutinesView dict={routinesPt} routineRuns={MOCK_ROUTINE_RUNS} quietWindows={MOCK_QUIET_WINDOWS} />)
    expect(screen.getByRole('heading', { level: 1, name: routinesPt.title })).toBeTruthy()
    expect(screen.getByText(routinesPt['run.result.failed'])).toBeTruthy()
  })

  it('renders files table', () => {
    wrap(<FilesView dict={filesPt} files={MOCK_FILES} />)
    expect(screen.getByRole('heading', { level: 1, name: filesPt.title })).toBeTruthy()
    expect(screen.getByText('hero-v3.png')).toBeTruthy()
  })

  it('shows need-root state with choose-folder action', () => {
    wrap(<FilesView dict={filesPt} initialState="needRoot" onChooseProjectRoot={() => {}} />)
    expect(screen.getByRole('heading', { level: 3, name: filesPt['needRoot.title'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: filesPt['needRoot.action'] })).toBeTruthy()
  })

  it('shows unavailable usage as em dash not zero', () => {
    wrap(<UsageLimits dict={usagePt} meters={MOCK_USAGE_METERS} limitNotice={MOCK_LIMIT_NOTICE} />)
    expect(screen.getByRole('heading', { level: 1, name: usagePt.title })).toBeTruthy()
    expect(screen.getAllByText(usagePt['meter.unavailable']).length).toBeGreaterThan(0)
    expect(screen.getByText(/Cursor agent.*82%/)).toBeTruthy()
  })

  it('renders connection statuses with text', () => {
    wrap(<ConnectionsView dict={connectionsPt} entries={MOCK_CONNECTIONS} />)
    expect(screen.getByRole('heading', { level: 1, name: connectionsPt.title })).toBeTruthy()
    expect(screen.getByText(connectionsPt['status.expired'])).toBeTruthy()
    expect(screen.getByRole('button', { name: connectionsPt['action.copyCommand'] })).toBeTruthy()
  })

  it('renders review delivery with accept and patch', () => {
    const view = wrap(
      <ReviewDeliveryPanel
        dict={reviewPt}
        taskTitle="Contrato v2"
        summary={MOCK_REVIEW_SUMMARY}
      />,
    )
    const panel = view.container.querySelector('[data-persona-surface="review-delivery"]')
    expect(panel).toBeTruthy()
    const scope = within(panel as HTMLElement)
    // Two-pane review: the h1 says what is ready ("Mudanças prontas para revisar" when the host gives no name, Muse 05:51); "Revisar mudanças" is the small label above it.
    expect(scope.getByRole('heading', { level: 1, name: 'Mudanças prontas para revisar em Contrato v2' })).toBeTruthy()
    expect(scope.getByText(reviewPt.title)).toBeTruthy()
    expect(scope.getByText(reviewPt.question)).toBeTruthy()
    expect(scope.getByRole('button', { name: reviewPt['action.accept'] })).toBeTruthy()
    expect(scope.getByText('pnpm exec vitest run tests/auth/login.spec.ts')).toBeTruthy()
  })

  it('shows blocked state on merge conflict', () => {
    const view = wrap(
      <ReviewDeliveryPanel
        dict={reviewPt}
        summary={MOCK_REVIEW_SUMMARY}
        blocked={{ explanation: 'Conflito em src/auth/login.ts' }}
      />,
    )
    const panel = view.container.querySelector('[data-persona-surface="review-delivery"]')
    const scope = within(panel as HTMLElement)
    expect(scope.getByText(reviewPt['blocked.chip'])).toBeTruthy()
    expect(scope.queryByRole('button', { name: reviewPt['action.accept'] })).toBeNull()
  })
})
