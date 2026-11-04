// @vitest-environment jsdom
// Muse, aceite GES-4: o cartão do plano no chat não repete o resumo como "passo" e mostra o porquê do host.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import type { GestorPlanView } from '@deepseek-ai/dsh-persona-host/types'
import { GestorPlanMessageCard, isFeminineName } from '../src/client/chat/GestorPlanMessageCard.tsx'
import { pt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { PreviewFrame } from '../src/client/preview/PreviewFrame.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(pt, key, params)) as never

const plan = (patch: Partial<GestorPlanView> = {}): GestorPlanView => ({
  id: 'plan-1',
  workspaceId: 'ws',
  gestorId: 'atlas',
  action: 'hire',
  scopeKey: 'site',
  summary: 'Vou contratar 3 personas e criar o quadro Site.',
  reason: 'Você pediu um time para o Site e hoje ninguém cobre design.',
  status: 'proposed',
  createdAt: '2026-11-04T12:00:00.000Z',
  ...patch,
})

const show = (p: GestorPlanView) => render(
  <PreviewFrame brandLabel="Persona">
    <GestorPlanMessageCard t={t} plan={p} team={null} onApprove={() => undefined} onAdjust={() => undefined} onDecline={() => undefined} />
  </PreviewFrame>,
)

describe('GestorPlanMessageCard', () => {
  it('mostra o resumo uma vez e o porquê que o host mandou', () => {
    show(plan())
    expect(screen.getAllByText('Vou contratar 3 personas e criar o quadro Site.')).toHaveLength(1)
    expect(screen.getByText('Você pediu um time para o Site e hoje ninguém cobre design.')).toBeTruthy()
  })

  it('sem passos do host não desenha lista (nem um passo que repete o resumo)', () => {
    const { container } = show(plan({ action: 'assemble' }))
    expect(container.querySelector('ol')).toBeNull()
    expect(screen.queryByText(pt['gestorPlan.kind.board'])).toBeNull()
  })

  it('as três ações continuam (aprovar, ajustar, recusar)', () => {
    show(plan())
    expect(screen.getByRole('button', { name: pt['gestorPlan.approve'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['gestorPlan.adjust'] })).toBeTruthy()
    expect(screen.getByRole('button', { name: pt['gestorPlan.decline'] })).toBeTruthy()
  })

  it('o título concorda com o nome: "Plano da Coordenação", "Plano do Atlas"', () => {
    const { unmount } = show(plan({ gestorId: 'Coordenação' }))
    expect(screen.getByText('Plano da COORDENAÇÃO')).toBeTruthy()
    unmount()
    show(plan({ gestorId: 'Atlas' }))
    expect(screen.getByText('Plano do ATLAS')).toBeTruthy()
    expect(isFeminineName('Luna')).toBe(true)
    expect(isFeminineName('Bento')).toBe(false)
    expect(isFeminineName('Guaxinim')).toBe(false)
  })

  it('aprovado afirma só o que aconteceu: a pessoa aprovou, sem prometer personas criadas', () => {
    show(plan({ status: 'applied' }))
    expect(screen.getByText(pt['gestorPlan.approved'])).toBeTruthy()
    expect(pt['gestorPlan.approved']).not.toMatch(/alocad|cri(ad|ou)|contrat/iu)
  })
})
