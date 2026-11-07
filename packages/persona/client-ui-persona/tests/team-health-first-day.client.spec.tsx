// @vitest-environment jsdom
// The team's first day (Muse/Atlas, 04/11): no red score, no grid of crosses — "Ainda conhecendo a equipe"; the score comes with real data.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { TeamHealthView } from '../src/client/governance/TeamHealthView.tsx'
import { mockTeamHealth, mockTwoDayTest } from '../src/client/governance/mock-governance.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => { cleanup() })

const HEALTH = { ...mockTeamHealth('ws'), level: 'risk' as const, score: 16, title: 'A equipe para se alguém some' }

function view(firstDay: boolean) {
  return render(
    <PreviewFrame brandLabel="Persona">
      <TeamHealthView dict={governancePt} health={HEALTH} twoDay={mockTwoDayTest('ws')} surfaceState="ready" onTwoDayFix={() => {}} firstDay={firstDay} />
    </PreviewFrame>,
  )
}

describe('Saúde no 1º dia', () => {
  it('first day: a calm note, no score, no red sentence, no grid of crosses', () => {
    view(true)
    expect(screen.getByText('Ainda conhecendo a equipe')).toBeTruthy()
    expect(screen.getByText('A nota aparece depois que a equipe trabalhar alguns dias. Até lá, nada aqui é problema.')).toBeTruthy()
    expect(screen.queryByText('A equipe para se alguém some')).toBeNull()
    expect(screen.queryByText(governancePt['health.scoreLabel'])).toBeNull()
    expect(document.body.textContent).not.toMatch(/\b16\b/u)
    // the 2-day grid says "no data" instead of crosses
    expect(screen.getByText('Ainda sem dados')).toBeTruthy()
    expect(screen.queryByRole('table')).toBeNull()
    expect(document.querySelector('[data-persona-surface="team-health"] [data-slot]')).toBeNull()
  })

  it('with real data the score and the grid are back, untouched', () => {
    view(false)
    expect(screen.getByText('A equipe para se alguém some')).toBeTruthy()
    expect(screen.queryByText('Ainda conhecendo a equipe')).toBeNull()
    expect(screen.queryByText('Ainda sem dados')).toBeNull()
  })
})
