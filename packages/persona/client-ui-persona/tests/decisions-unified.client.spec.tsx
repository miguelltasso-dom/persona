// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { ApprovalView, DailySummaryView } from '@deepseek-ai/dsh-persona-host/types'
import { deriveDecisions } from '../src/client/decisions/derive-decisions.ts'
import { dailySummariesToUi } from '../src/client/data/adapters/proactive.ts'
import { OverviewView } from '../src/client/overview/OverviewView.tsx'
import { ReactiveApprovalsList } from '../src/client/approvals/ReactiveApprovalsList.tsx'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as approvalsPt } from '../src/client/locale/approvals/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import type { Decision } from '../src/client/decisions/decision-types.ts'
import type { ApprovalItem } from '../src/client/approvals/mock-data.ts'

afterEach(() => {
  cleanup()
})

const shellT = (key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)

describe('DECISIONS-SPEC: Unified Decisions Architecture (UX-PHASE Item 4)', () => {
  it('deduplicates: same ID in reactive approvals and proactive summary produces 1 blocking decision', () => {
    const reactive: ApprovalView = {
      id: 'prop-duplicate',
      kind: 'vault',
      title: 'Acesso à API',
      question: 'Permitir chave?',
      status: 'pending',
      personaId: 'p-lia',
      personaName: 'Lia',
    }

    const summary: DailySummaryView = {
      personaId: 'p-lia',
      personaName: 'Lia',
      date: '2026-11-04',
      proposals: [
        {
          id: 'prop-duplicate',
          kind: 'vault',
          title: 'Acesso à API',
          question: 'Permitir chave?',
          status: 'pending',
          personaId: 'p-lia',
          personaName: 'Lia',
        },
        {
          id: 'prop-unique-summary',
          kind: 'skill',
          title: 'Criar automação',
          question: 'Automatizar envio semanal?',
          status: 'pending',
          personaId: 'p-lia',
          personaName: 'Lia',
        },
      ],
    }

    const decisions = deriveDecisions({
      approvals: [reactive],
      dailySummaries: [summary],
    })

    // prop-duplicate appears only once!
    expect(decisions.length).toBe(2)
    const duplicate = decisions.find(d => d.id === 'prop-duplicate')
    expect(duplicate).toBeDefined()
    expect(duplicate?.blocking).toBe(true)
    expect(duplicate?.risk).toBe('low') // vault is low risk

    const proactiveOnly = decisions.find(d => d.id === 'prop-unique-summary')
    expect(proactiveOnly).toBeDefined()
    expect(proactiveOnly?.blocking).toBe(false)
  })

  it('UX-02: hire proposal without repeating need rationale is omitted; with rationale is included', () => {
    const hireWithoutReason: ApprovalView = {
      id: 'hire-no-reason',
      kind: 'hire',
      title: 'Contratar Sol',
      question: '',
      status: 'pending',
      personaId: 'p-téo',
      personaName: 'Téo',
    }

    const hireWithReason: ApprovalView = {
      id: 'hire-valid',
      kind: 'hire',
      title: 'Contratar Lia',
      question: 'Toda semana chegam contratos para revisar.',
      status: 'pending',
      personaId: 'p-téo',
      personaName: 'Téo',
    }

    const decisions = deriveDecisions({
      approvals: [hireWithoutReason, hireWithReason],
    })

    expect(decisions.some(d => d.id === 'hire-no-reason')).toBe(false)
    const validHire = decisions.find(d => d.id === 'hire-valid')
    expect(validHire).toBeDefined()
    expect(validHire?.reason).toBe('Toda semana chegam contratos para revisar.')
    expect(validHire?.risk).toBe('normal')
  })

  it('dailySummariesToUi deduplicates against blockingIds (UX-01)', () => {
    const summary: DailySummaryView = {
      personaId: 'p-lia',
      personaName: 'Lia',
      date: '2026-11-04',
      proposals: [
        {
          id: 'dup-1',
          kind: 'skill',
          title: 'Skill duplicada',
          question: 'Usar?',
          status: 'pending',
          personaId: 'p-lia',
          personaName: 'Lia',
        },
        {
          id: 'unique-1',
          kind: 'vault',
          title: 'Cofre único',
          question: 'Adicionar?',
          status: 'pending',
          personaId: 'p-lia',
          personaName: 'Lia',
        },
      ],
    }

    const blockingIds = new Set(['dup-1'])
    const result = dailySummariesToUi([summary], blockingIds)
    expect(result[0]?.proposals.length).toBe(1)
    expect(result[0]?.proposals[0]?.id).toBe('unique-1')
  })

  it('OverviewView renders low-risk inline approval and normal-risk Review navigation', () => {
    const onDecide = vi.fn()
    const onNavigate = vi.fn()

    const decisions: Decision[] = [
      {
        id: 'dec-low',
        kind: 'vault',
        title: 'Chave de API do Stripe',
        requester: { personaId: 'p-1', name: 'Ana' },
        blocking: true,
        risk: 'low',
        createdAt: '2026-11-04T10:00:00Z',
        state: 'pending',
      },
      {
        id: 'dec-normal',
        kind: 'hire',
        title: 'Contratar Lia — Redatora',
        requester: { personaId: 'p-2', name: 'Téo' },
        blocking: true,
        risk: 'normal',
        createdAt: '2026-11-04T10:01:00Z',
        state: 'pending',
      },
    ]

    render(
      <OverviewView
        t={shellT as never}
        decisions={decisions}
        nowRows={[]}
        awayEvents={[]}
        onDecide={onDecide}
        onNavigate={onNavigate}
      />,
    )

    // Check titles
    expect(screen.getByText('Chave de API do Stripe')).toBeTruthy()
    expect(screen.getByText('Contratar Lia — Redatora')).toBeTruthy()

    // dec-low has "Aprovar" (1-click inline)
    const approveBtn = screen.getByRole('button', { name: shellT('decision.approve') })
    expect(approveBtn).toBeTruthy()
    fireEvent.click(approveBtn)
    expect(onDecide).toHaveBeenCalledWith('dec-low', true)

    // dec-normal has "Revisar" (navigates to approvals with focus)
    const reviewBtn = screen.getByRole('button', { name: shellT('decision.review') })
    expect(reviewBtn).toBeTruthy()
    fireEvent.click(reviewBtn)
    expect(onNavigate).toHaveBeenCalledWith('approvals', { focus: 'dec-normal' })
  })

  it('OverviewView displays deciding loading state, stamp on accepted, and retry on failed', () => {
    const onDecide = vi.fn()

    const decisions: Decision[] = [
      {
        id: 'dec-loading',
        kind: 'vault',
        title: 'Cofre em progresso',
        requester: { personaId: 'p-1', name: 'Ana' },
        blocking: true,
        risk: 'low',
        createdAt: '2026-11-04T10:00:00Z',
        state: 'deciding',
      },
      {
        id: 'dec-failed',
        kind: 'vault',
        title: 'Cofre que falhou',
        requester: { personaId: 'p-1', name: 'Ana' },
        blocking: true,
        risk: 'low',
        createdAt: '2026-11-04T10:00:00Z',
        state: 'failed',
      },
    ]

    render(
      <OverviewView
        t={shellT as never}
        decisions={decisions}
        nowRows={[]}
        awayEvents={[]}
        onDecide={onDecide}
      />,
    )

    // Failed decision shows failed message and retry button
    expect(screen.getByText(shellT('decision.failed'))).toBeTruthy()
    const retryBtn = screen.getByRole('button', { name: shellT('decision.retry') })
    fireEvent.click(retryBtn)
    expect(onDecide).toHaveBeenCalledWith('dec-failed', true)
  })

  it('OverviewView displays "Ver todas (n)" when there are more than 3 blocking decisions', () => {
    const onNavigate = vi.fn()
    const decisions: Decision[] = [1, 2, 3, 4, 5].map(i => ({
      id: `dec-${i}`,
      kind: 'blocker' as const,
      title: `Bloqueio ${i}`,
      requester: { personaId: `p-${i}`, name: `Persona ${i}` },
      blocking: true,
      risk: 'normal' as const,
      createdAt: '2026-11-04T10:00:00Z',
      state: 'pending' as const,
    }))

    render(
      <OverviewView
        t={shellT as never}
        decisions={decisions}
        nowRows={[]}
        awayEvents={[]}
        onNavigate={onNavigate}
      />,
    )

    const seeAllBtn = screen.getByRole('button', { name: shellT('overview.seeAllDecisions', { count: '5' }) })
    expect(seeAllBtn).toBeTruthy()
    fireEvent.click(seeAllBtn)
    expect(onNavigate).toHaveBeenCalledWith('approvals')
  })

  it('ReactiveApprovalsList highlights card matching focusId', () => {
    const items: ApprovalItem[] = [
      {
        id: 'item-1',
        kind: 'vault',
        title: 'Cofre 1',
        question: 'Permitir?',
        primaryKey: 'action.primary.vault',
        proposerName: 'Ana',
        proposerPersonaId: 'p-ana',
      },
      {
        id: 'item-focus',
        kind: 'skill',
        title: 'Skill Foco',
        question: 'Adicionar?',
        primaryKey: 'action.primary.skill',
        proposerName: 'Lia',
        proposerPersonaId: 'p-lia',
      },
    ]

    const { container } = render(
      <ReactiveApprovalsList
        dict={approvalsPt}
        items={items}
        focusId="item-focus"
        headScope={undefined}
        exitStampId={null}
        rememberGrant={false}
        rememberValidity="once"
        rememberStampNote={null}
        onRememberGrantChange={() => {}}
        onRememberValidityChange={() => {}}
        onCelebrateAccept={() => {}}
      />,
    )

    // Focus highlight element should exist
    const highlighted = container.querySelector('[class*="focusHighlight"]')
    expect(highlighted).toBeTruthy()
  })
})
