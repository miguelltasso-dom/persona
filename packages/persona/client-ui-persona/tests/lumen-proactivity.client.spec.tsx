// @vitest-environment jsdom
import { fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import { MOCK_PERSONA_DAILY_SUMMARIES } from '../src/client/approvals/proactivity-mock-data.ts'
import type { PersonaDailyProactiveSummary } from '../src/client/approvals/proactivity-mock-data.ts'
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

  it('shows rules limits, quiet windows (only when the host obeys them: HONEST-1), and log-only log', () => {
    wrap(<TriageRulesView dict={rulesPt} rules={MOCK_TRIAGE_RULES} quietWindows={MOCK_QUIET_WINDOWS} limits={MOCK_PROACTIVITY_LIMITS} triageLog={MOCK_TRIAGE_LOG} obeyed={{ quietWindows: true }} />)
    expect(screen.getByLabelText(rulesPt['limits.maxProposals'])).toBeTruthy()
    expect(screen.getByText(/Toda noite · 22h às 7h · Toda a equipe/u)).toBeTruthy() // Muse 08:51: a linha diz o tipo e as horas, não o rótulo do mock ("Noites de semana")
    expect(screen.getByText(/Todo dia · 0h às 23h59 · Toda a equipe/u)).toBeTruthy()
    expect(screen.getByText(/Teria aberto ticket de revisão/i)).toBeTruthy()
  })

  it('shows proactivity metrics on persona profile overview', () => {
    wrap(<PersonaProfilePage dict={profilePt} snapshot={MOCK_PROFILE_ATLAS} />)
    expect(screen.getByRole('heading', { name: profilePt['proactivity.title'] })).toBeTruthy()
    expect(screen.getByText(profilePt['proactivity.lazinessGrade.strong'])).toBeTruthy()
    expect(document.querySelector('[data-persona-surface="proactivity-metrics"]')).toBeTruthy()
  })

  it('caps proactive proposals at 3 when overflowing and expands on click', () => {
    const overflowSummaries: readonly PersonaDailyProactiveSummary[] = [
      {
        personaId: 'p-overflow',
        personaName: 'Luna',
        personaCharacterId: 'luna',
        summaryDate: '2026-11-04',
        proposals: [
          { id: 'prop-1', kind: 'initiative', title: 'Prop 1', oneQuestion: 'Q 1?', impactDetail: 'Impact 1', cost: { tokens: 100, runs: 1 }, approvalKind: 'skill' },
          { id: 'prop-2', kind: 'initiative', title: 'Prop 2', oneQuestion: 'Q 2?', impactDetail: 'Impact 2', cost: { tokens: 100, runs: 1 }, approvalKind: 'skill' },
          { id: 'prop-3', kind: 'initiative', title: 'Prop 3', oneQuestion: 'Q 3?', impactDetail: 'Impact 3', cost: { tokens: 100, runs: 1 }, approvalKind: 'skill' },
          { id: 'prop-4', kind: 'initiative', title: 'Prop 4', oneQuestion: 'Q 4?', impactDetail: 'Impact 4', cost: { tokens: 100, runs: 1 }, approvalKind: 'skill' },
          { id: 'prop-5', kind: 'initiative', title: 'Prop 5', oneQuestion: 'Q 5?', impactDetail: 'Impact 5', cost: { tokens: 100, runs: 1 }, approvalKind: 'skill' },
        ],
      },
    ]
    wrap(<ApprovalsInbox dict={approvalsPt} proactiveSummaries={overflowSummaries} />)
    expect(screen.getByText('Prop 1')).toBeTruthy()
    expect(screen.getByText('Prop 3')).toBeTruthy()
    expect(screen.queryByText('Prop 4')).toBeNull()
    const toggleButton = screen.getByRole('button', { name: /Ver mais 2 propostas/i })
    expect(toggleButton).toBeTruthy()
    fireEvent.click(toggleButton)
    expect(screen.getByText('Prop 4')).toBeTruthy()
    expect(screen.getByText('Prop 5')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Mostrar menos/i })).toBeTruthy()
  })
})
