// @vitest-environment jsdom
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { pt } from '../src/client/locale/shell/locales.ts'
import { MOCK_AWAY_SUMMARY, MOCK_OVERVIEW_NOW } from '../src/client/overview/mock-overview-proactivity.ts'
import { OverviewView } from '../src/client/overview/OverviewView.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'

installPreviewTheme()

describe('overview preview', () => {
  beforeEach(() => {
    sessionStorage.clear()
  })
  afterEach(() => { cleanup() })

  it('shows Agora strip, away summary, and attention action label', () => {
    render(
      <OverviewView
        t={shellTranslate}
        attentionItems={[pt['overview.attentionSample']]}
        nowRows={MOCK_OVERVIEW_NOW}
        awayEvents={MOCK_AWAY_SUMMARY}
      />,
    )
    expect(screen.getByRole('heading', { name: pt['overview.nowTitle'] })).toBeTruthy()
    expect(screen.getByRole('heading', { name: pt['overview.awayTitle'] })).toBeTruthy()
    // With pending work the first-task nudge is hidden (Atlas: only while the team has no work).
    expect(screen.queryByText(pt['overview.suggestedTaskTitle'])).toBeNull()
    expect(screen.getByText(pt['overview.attentionSample'])).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['overview.attentionAction'] })).toBeTruthy()
    expect(screen.getByText(pt['team.statusStuck'])).toBeTruthy()
  })

  it('shows the first-task nudge only from the company profile, and only while there is no work yet', () => {
    const coordination = {
      member: { id: 'atlas' as const, name: 'Guia', role: 'Coordenação', state: 'resting' as const, systemRoles: ['coordination' as const] },
      queueCount: 0,
    }
    render(<OverviewView t={shellTranslate} attentionItems={[]} nowRows={[coordination]} awayEvents={[]} />)
    // no profile, no block: the screen never invents an example for a company it does not know
    expect(screen.queryByText(pt['overview.suggestedTaskTitle'])).toBeNull()
    cleanup()
    render(
      <OverviewView
        t={shellTranslate}
        attentionItems={[]}
        nowRows={[coordination]}
        awayEvents={[]}
        companySuggestion={{ title: 'Sobre “Padaria”: crie cinco ideias.' }}
        onAskCoordination={() => undefined}
      />,
    )
    expect(screen.getByText(pt['overview.suggestedTaskTitle'])).toBeTruthy()
    expect(screen.getByText('Sobre “Padaria”: crie cinco ideias.')).toBeTruthy()
  })
})
