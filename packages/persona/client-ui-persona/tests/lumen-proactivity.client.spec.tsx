// @vitest-environment jsdom
import { render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import { MOCK_PERSONA_DAILY_SUMMARIES } from '../src/client/approvals/proactivity-mock-data.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { pt as rulesPt } from '../src/client/locale/rules/locales.ts'
import { MOCK_PROFILE_ATLAS } from '../src/client/profile/mock-data.ts'
import { PersonaProfilePage } from '../src/client/profile/PersonaProfilePage.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import {
  MOCK_PROACTIVITY_LIMITS,
  MOCK_QUIET_WINDOWS,
  MOCK_TRIAGE_LOG,
  MOCK_TRIAGE_RULES,
} from '../src/client/rules/mock-data.ts'
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
    wrap(<ApprovalsInbox dict={approvalsPt} proactiveSummaries={MOCK_PERSONA_DAILY_SUMMARIES} />)
    expect(screen.getByRole('heading', { name: /Resumo de iniciativa/i })).toBeTruthy()
    expect(document.querySelector('[data-persona-approvals="proactive-daily"]')).toBeTruthy()
    expect(screen.getByText('Nina')).toBeTruthy()
    expect(screen.getByText(/Automatizar smoke do checkout/i)).toBeTruthy()
    expect(screen.getAllByRole('button', { name: approvalsPt['proactive.action.accept'] }).length).toBeGreaterThan(0)
  })

  it('shows rules limits, quiet windows, and log-only log', () => {
    wrap(<TriageRulesView dict={rulesPt} rules={MOCK_TRIAGE_RULES} quietWindows={MOCK_QUIET_WINDOWS} limits={MOCK_PROACTIVITY_LIMITS} triageLog={MOCK_TRIAGE_LOG} />)
    expect(screen.getByLabelText(rulesPt['limits.maxProposals'])).toBeTruthy()
    expect(screen.getByText(/Noites de semana/i)).toBeTruthy()
    expect(screen.getByText(/Teria aberto ticket de revisão/i)).toBeTruthy()
  })

  it('shows proactivity metrics on persona profile overview', () => {
    wrap(<PersonaProfilePage dict={profilePt} snapshot={MOCK_PROFILE_ATLAS} />)
    expect(screen.getByRole('heading', { name: profilePt['proactivity.title'] })).toBeTruthy()
    expect(screen.getByText(profilePt['proactivity.lazinessGrade.strong'])).toBeTruthy()
    expect(document.querySelector('[data-persona-surface="proactivity-metrics"]')).toBeTruthy()
  })
})
