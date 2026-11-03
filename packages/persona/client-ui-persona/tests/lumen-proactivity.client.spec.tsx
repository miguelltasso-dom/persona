// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { pt as rulesPt } from '../src/client/locale/rules/locales.ts'
import { PersonaProfilePage } from '../src/client/profile/PersonaProfilePage.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { TriageRulesView } from '../src/client/rules/TriageRulesView.tsx'

installPreviewTheme()

beforeEach(() => {
  document.body.replaceChildren()
})

function wrap(ui: ReactElement): void {
  render(
    <PreviewFrame brandLabel="Persona">
      <div className="panel">{ui}</div>
    </PreviewFrame>,
  )
}

describe('proactivity UI (PROACTIVITY.md)', () => {
  it('groups proactive proposals in daily summary per persona', () => {
    wrap(<ApprovalsInbox dict={approvalsPt} />)
    expect(screen.getByRole('heading', { name: /Resumo de iniciativa/i })).toBeTruthy()
    expect(document.querySelector('[data-persona-approvals="proactive-daily"]')).toBeTruthy()
    expect(screen.getByText('Nina')).toBeTruthy()
    expect(screen.getByText(/Automatizar smoke do checkout/i)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: approvalsPt['proactive.action.accept'] }).length).toBeGreaterThan(0)
  })

  it('shows rules limits, quiet windows, and log-only log', () => {
    wrap(<TriageRulesView dict={rulesPt} />)
    expect(screen.getByLabelText(rulesPt['limits.maxProposals'])).toBeTruthy()
    expect(screen.getByText(/Noites de semana/i)).toBeTruthy()
    expect(screen.getByText(/Teria aberto ticket de revisão/i)).toBeTruthy()
  })

  it('shows proactivity metrics on persona profile overview', () => {
    wrap(<PersonaProfilePage dict={profilePt} />)
    expect(screen.getByRole('heading', { name: profilePt['proactivity.title'] })).toBeTruthy()
    expect(screen.getByText(profilePt['proactivity.lazinessGrade.strong'])).toBeTruthy()
    expect(document.querySelector('[data-persona-surface="proactivity-metrics"]')).toBeTruthy()
  })
})
