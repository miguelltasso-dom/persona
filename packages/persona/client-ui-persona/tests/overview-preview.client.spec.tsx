// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it } from 'vitest'
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
    expect(screen.queryByText(pt['overview.suggestedTaskBody'])).toBeNull()
    expect(screen.getByText(pt['overview.attentionSample'])).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['overview.attentionAction'] })).toBeTruthy()
    expect(screen.getByText(pt['team.statusStuck'])).toBeTruthy()
  })

  it('shows the first-task nudge only while there is no work yet', () => {
    render(<OverviewView t={shellTranslate} attentionItems={[]} nowRows={[]} awayEvents={[]} />)
    expect(screen.getByText(pt['overview.suggestedTaskBody'])).toBeTruthy()
  })
})
