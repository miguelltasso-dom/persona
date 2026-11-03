// @vitest-environment jsdom
import { render, screen, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { ConnectionsView } from '../src/client/connections/ConnectionsView.tsx'
import { MOCK_CONNECTIONS } from '../src/client/connections/mock-data.ts'
import { FilesView } from '../src/client/files/FilesView.tsx'
import { MOCK_FILES } from '../src/client/files/mock-data.ts'
import { KnowledgeVault } from '../src/client/knowledge/KnowledgeVault.tsx'
import { MOCK_KNOWLEDGE_RECORDS } from '../src/client/knowledge/mock-data.ts'
import { pt as connectionsPt } from '../src/client/locale/connections/locales.ts'
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
    expect(screen.getByRole('heading', { level: 2, name: filesPt['needRoot.title'] })).toBeTruthy()
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
  })
})
