// @vitest-environment jsdom
import { render, screen, type RenderResult } from '@testing-library/react'
import type { ReactNode } from 'react'
import { describe, expect, it } from 'vitest'
import { ConnectionsView } from '../src/client/connections/ConnectionsView.tsx'
import { FilesView } from '../src/client/files/FilesView.tsx'
import { KnowledgeVault } from '../src/client/knowledge/KnowledgeVault.tsx'
import { pt as connectionsPt } from '../src/client/locale/connections/locales.ts'
import { pt as filesPt } from '../src/client/locale/files/locales.ts'
import { pt as knowledgePt } from '../src/client/locale/knowledge/locales.ts'
import { pt as routinesPt } from '../src/client/locale/routines/locales.ts'
import { pt as usagePt } from '../src/client/locale/usage/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { RoutinesView } from '../src/client/routines/RoutinesView.tsx'
import { UsageLimits } from '../src/client/usage/UsageLimits.tsx'

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
    wrap(<KnowledgeVault dict={knowledgePt} />)
    expect(screen.getByRole('heading', { level: 1, name: knowledgePt.title })).toBeTruthy()
    expect(screen.getByRole('tab', { name: knowledgePt['tab.proposals'] })).toBeTruthy()
  })

  it('renders routines week grid', () => {
    wrap(<RoutinesView dict={routinesPt} />)
    expect(screen.getByRole('heading', { level: 1, name: routinesPt.title })).toBeTruthy()
    expect(screen.getByText(routinesPt['run.result.failed'])).toBeTruthy()
  })

  it('renders files table', () => {
    wrap(<FilesView dict={filesPt} />)
    expect(screen.getByRole('heading', { level: 1, name: filesPt.title })).toBeTruthy()
    expect(screen.getByText('hero-v3.png')).toBeTruthy()
  })

  it('shows unavailable usage as em dash not zero', () => {
    wrap(<UsageLimits dict={usagePt} />)
    expect(screen.getByRole('heading', { level: 1, name: usagePt.title })).toBeTruthy()
    expect(screen.getAllByText(usagePt['meter.unavailable']).length).toBeGreaterThan(0)
    expect(screen.getByText(/Cursor agent.*82%/)).toBeTruthy()
  })

  it('renders connection statuses with text', () => {
    wrap(<ConnectionsView dict={connectionsPt} />)
    expect(screen.getByRole('heading', { level: 1, name: connectionsPt.title })).toBeTruthy()
    expect(screen.getByText(connectionsPt['status.expired'])).toBeTruthy()
  })
})
