// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import type { ReactElement } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'
import { parsePersona } from '@deepseek-ai/dsh-persona-core'
import { ApprovalsInbox } from '../src/client/approvals/ApprovalsInbox.tsx'
import { MOCK_APPROVALS } from '../src/client/approvals/mock-data.ts'
import { CanvasView } from '../src/client/canvas/CanvasView.tsx'
import { MOCK_CANVAS_EDGES, MOCK_CANVAS_NODES } from '../src/client/canvas/mock-data.ts'
import { ImportWizard } from '../src/client/importers/ImportWizard.tsx'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { pt as canvasPt } from '../src/client/locale/canvas/locales.ts'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { MembersView } from '../src/client/members/MembersView.tsx'
import { MemoryPanel } from '../src/client/memory/MemoryPanel.tsx'
import { MOCK_MEMBERS } from '../src/client/members/mock-data.ts'
import { MOCK_GESTOR_AUDIT_ACTIVITY } from '../src/client/governance/gestor-audit-mock.ts'
import { pt as governancePt } from '../src/client/locale/governance/locales.ts'
import { MOCK_PERSONA_ATLAS, MOCK_PROFILE_ATLAS, type PersonaProfileSnapshot } from '../src/client/profile/mock-data.ts'
import {
  MOCK_PROACTIVITY_LIMITS,
  MOCK_QUIET_WINDOWS,
  MOCK_TRIAGE_LOG,
  MOCK_TRIAGE_RULES,
} from '../src/client/rules/mock-data.ts'
import { PersonaProfilePage } from '../src/client/profile/PersonaProfilePage.tsx'
import { PersonaInfoCard } from '../src/client/profile/PersonaInfoCard.tsx'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { TriageRulesView } from '../src/client/rules/TriageRulesView.tsx'
import { SkillsPanel } from '../src/client/skills/SkillsPanel.tsx'
import { MOCK_SKILLS } from '../src/client/skills/mock-data.ts'

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

describe('lumen queue 2 previews', () => {
  it('validates profile mock against Forge parsePersona', () => {
    expect(() => parsePersona(MOCK_PERSONA_ATLAS)).not.toThrow()
  })

  it('renders persona profile with memory tab', () => {
    wrap(<PersonaProfilePage dict={profilePt} snapshot={MOCK_PROFILE_ATLAS} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Atlas' })).toBeTruthy()
    fireEvent.click(screen.getByRole('tab', { name: profilePt['tab.memory'] }))
    expect(screen.getByRole('heading', { level: 2, name: 'Memória da equipe' })).toBeTruthy()
  })

  it('shows gestor audit on profile when team_manager and items provided (GES-5)', () => {
    const snapshot: PersonaProfileSnapshot = {
      ...MOCK_PROFILE_ATLAS,
      persona: parsePersona({
        ...MOCK_PROFILE_ATLAS.persona,
        systemRoles: ['coordination', 'team_manager'],
      }),
    }
    wrap(
      <PersonaProfilePage
        dict={profilePt}
        snapshot={snapshot}
        gestorAuditItems={MOCK_GESTOR_AUDIT_ACTIVITY}
      />,
    )
    expect(screen.getByText(governancePt['health.gestorAudit'])).toBeTruthy()
  })

  it('renders gestor audit fact on PersonaInfoCard when gestorAuditReason present (GES-5)', () => {
    wrap(
      <PersonaInfoCard
        dict={profilePt}
        info={{
          personaId: 'atlas',
          name: 'Atlas',
          handle: '@atlas',
          role: 'Coordenação',
          systemRoles: ['coordination', 'team_manager'],
          nowKind: 'working',
          presence: 'online',
          gestorAuditReason: 'Criou 3 tarefas no projeto Site',
        }}
      />,
    )
    expect(screen.getByText(profilePt['card.gestorAudit'])).toBeTruthy()
    expect(screen.getByText('Criou 3 tarefas no projeto Site')).toBeTruthy()
  })

  it('renders approvals inbox with hire card', () => {
    wrap(<ApprovalsInbox dict={approvalsPt} items={MOCK_APPROVALS} />)
    expect(screen.getByRole('heading', { level: 3, name: 'Contratar Sol?' })).toBeTruthy()
  })

  it('renders memory panel actions only when there is something behind them', () => {
    wrap(<MemoryPanel />)
    expect(screen.queryAllByRole('button', { name: /Esquecer|Editar|Aprovar/i })).toHaveLength(0)
    cleanup()
    wrap(<MemoryPanel actions={{ onApprove: async () => {}, onEdit: async () => {}, onForget: async () => {} }} />)
    expect(screen.getAllByRole('button', { name: /Esquecer/i }).length).toBeGreaterThan(0)
  })

  it('renders skills panel', () => {
    // The panel has no sample skills of its own (IV-8): the preview hands them in.
    wrap(<SkillsPanel skills={MOCK_SKILLS} />)
    expect(screen.getByText('Revisão de PR')).toBeTruthy()
  })

  it('renders triage rules and members', () => {
    wrap(<TriageRulesView rules={MOCK_TRIAGE_RULES} quietWindows={MOCK_QUIET_WINDOWS} limits={MOCK_PROACTIVITY_LIMITS} triageLog={MOCK_TRIAGE_LOG} />)
    expect(screen.getByText(/deploy em produção/i)).toBeTruthy()
    wrap(<MembersView members={MOCK_MEMBERS} />)
    expect(screen.getByText(/DMs nunca sobem/i)).toBeTruthy()
  })

  it('renders import wizard and canvas list mode', () => {
    wrap(<ImportWizard />)
    expect(screen.getByRole('button', { name: /Continuar/i })).toBeTruthy()
    wrap(<CanvasView dict={canvasPt} nodes={MOCK_CANVAS_NODES} edges={MOCK_CANVAS_EDGES} />)
    fireEvent.click(screen.getByRole('tab', { name: canvasPt['mode.list'] }))
    expect(screen.getByText('Hero landing')).toBeTruthy()
  })
})
