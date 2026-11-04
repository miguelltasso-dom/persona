// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { TeamHealthView } from '../src/client/governance/TeamHealthView.tsx'
import { mockTeamHealth, mockTwoDayTest } from '../src/client/governance/mock-governance.ts'
import { pt } from '../src/client/locale/governance/locales.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
})

describe('TeamHealthView (GOV-7)', () => {
  it('shows score, findings and two-day timeline', () => {
    render(
      <PreviewFrame brandLabel="Persona">
        <TeamHealthView
          dict={pt}
          health={mockTeamHealth('ws')}
          twoDay={mockTwoDayTest('ws')}
          surfaceState="ready"
          onTwoDayFix={() => {}}
          gestorAudit={{
            persona: { name: 'Atlas' },
            items: [{ id: '1', kind: 'hire', title: 'Pipoca', status: 'done' }],
          }}
        />
      </PreviewFrame>,
    )
    expect(screen.getByRole('heading', { name: pt['health.title'] })).toBeTruthy()
    expect(screen.getByText(mockTeamHealth('ws').findings[0]!.title)).toBeTruthy()
    expect(screen.getByRole('region', { name: pt['a11y.twoDayRegion'] })).toBeTruthy()
    expect(screen.getByText(pt['health.gestorAudit'])).toBeTruthy()
  })

  it('fires one-click fixes for findings and two-day rows', () => {
    const onApplyFix = vi.fn()
    const onTwoDayFix = vi.fn()
    const health = mockTeamHealth('ws')
    const twoDay = mockTwoDayTest('ws')
    render(
      <PreviewFrame brandLabel="Persona">
        <TeamHealthView
          dict={pt}
          health={health}
          twoDay={twoDay}
          surfaceState="ready"
          onApplyFix={onApplyFix}
          onTwoDayFix={onTwoDayFix}
        />
      </PreviewFrame>,
    )
    fireEvent.click(screen.getByRole('button', { name: pt['health.fix.raise_autonomy'] }))
    expect(onTwoDayFix).toHaveBeenCalledWith(expect.objectContaining({ id: 'r-clients' }))
    const findings = screen.getByRole('region', { name: pt['health.findings'] })
    fireEvent.click(within(findings).getAllByRole('button', { name: pt['health.fix.set_substitute'] })[0]!)
    expect(onApplyFix).toHaveBeenCalledWith('f-spof', 'set_substitute', 'h-kenji')
  })
})
