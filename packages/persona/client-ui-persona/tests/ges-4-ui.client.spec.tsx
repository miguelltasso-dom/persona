// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GestorPlanCard, GestorSettings, type GestorLimitsValue } from '../src/client/primitives/index.ts'
import { PersonaInfoCard } from '../src/client/profile/PersonaInfoCard.tsx'
import { RailTeam, type RailPersona } from '../src/client/shell/RailTeam.tsx'
import { TeamChannelStrip } from '../src/client/team/TeamChannelStrip.tsx'
import { mergeArrivingFlags, isPersonaArriving } from '../src/client/remote/gestor-arriving.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const LABELS = {
  title: 'Gestor de equipe',
  explain: (n: string) => `${n} pode contratar personas e organizar a equipe.`,
  approvalLegend: 'Quando contratar ou mudar alguém',
  approval: {
    ask: { title: 'Sempre me perguntar', body: 'Mostra o plano e espera seu ok.' },
    'auto-within': { title: 'Fazer sozinho dentro dos limites', body: 'x' },
    'auto-notify': { title: 'Fazer e me avisar', body: 'y' },
  },
  recommended: 'Recomendado',
  maxPersonas: 'Tamanho máximo da equipe',
  maxPersonasValue: (n: number) => `Até ${n} personas`,
  fewer: 'Menos',
  more: 'Mais',
  budget: 'Gasto das novas personas',
  areas: 'Onde pode agir',
  areasAll: 'Em toda a empresa',
  canGrant: 'Pode tornar outra persona Gestor de equipe',
  canGrantHint: 'Desligado: só você dá essa função.',
  ceiling: (n: string) => `Nunca cria persona com mais acesso que ${n}.`,
}

describe('GES-4: Interruptor Gestor de equipe + limites', () => {
  it('toggles switch and updates limits in plain language', () => {
    let enabled = false
    let limits: GestorLimitsValue = {
      approval: 'ask',
      maxPersonas: 6,
      budget: 'normal',
      areas: [],
      canGrantGestor: false,
    }
    const { rerender } = render(
      <GestorSettings
        personaName="Atlas"
        enabled={enabled}
        onEnabledChange={(next) => { enabled = next }}
        value={limits}
        onChange={(next) => { limits = next }}
        budgetOptions={[{ id: 'normal', label: 'Normal', hint: '≈ 50 tarefas/mês' }]}
        areaOptions={[{ id: 'site', label: 'Projeto Site' }]}
        labels={LABELS}
      />,
    )
    const sw = screen.getByRole('switch', { name: 'Gestor de equipe' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByText('Até 6 personas')).toBeNull()

    fireEvent.click(sw)
    expect(enabled).toBe(true)

    rerender(
      <GestorSettings
        personaName="Atlas"
        enabled={true}
        onEnabledChange={() => {}}
        value={limits}
        onChange={(next) => { limits = next }}
        budgetOptions={[{ id: 'normal', label: 'Normal', hint: '≈ 50 tarefas/mês' }]}
        areaOptions={[{ id: 'site', label: 'Projeto Site' }]}
        labels={LABELS}
      />,
    )
    expect(screen.getByText('Até 6 personas')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    expect(limits.maxPersonas).toBe(7)
  })
})

describe('GES-4: Selo Gestor em todas as superfícies', () => {
  it('displays the Gestor badge on the PersonaInfoCard', () => {
    render(
      <PersonaInfoCard
        info={{
          personaId: 'atlas',
          name: 'Atlas',
          handle: '@atlas',
          role: 'Coordenação',
          characterId: 'atlas',
          systemRoles: ['coordination', 'team_manager'],
          nowKind: 'idle',
          nowText: 'Disponível',
          presence: 'online',
          talk: { everyone: true, names: [] },
        } as never}
      />,
    )
    const badge = screen.getByText('Gestor').closest('li')
    expect(badge?.getAttribute('data-tone')).toBe('gestor')
  })

  it('displays the baton icon on RailTeam avatar when gestor is true', () => {
    const member: RailPersona = {
      id: 'atlas',
      characterId: 'atlas',
      name: 'Atlas',
      role: 'Coordenação',
      state: 'working',
      unread: 0,
      gestor: true,
    }
    const { container } = render(
      <RailTeam t={shellTranslate} collapsed={false} members={[member]} />,
    )
    expect(container.querySelector('[class*="gestorMark"]')).toBeTruthy()
  })

  it('displays the baton icon on TeamChannelStrip figure when team_manager is present', () => {
    const member: ChannelPersonaMember = {
      id: 'atlas',
      name: 'Atlas',
      role: 'Coordenação',
      state: 'working',
      systemRoles: ['team_manager'],
    }
    const { container } = render(
      <TeamChannelStrip t={shellTranslate} members={[member]} />,
    )
    expect(container.querySelector('[class*="gestorIcon"]')).toBeTruthy()
  })
})

describe('GES-4: Cartão de plano', () => {
  const planLabels = {
    title: (m: string) => `Plano do ${m}`,
    kinds: {
      hire: 'Contratar',
      board: 'Criar quadro',
      allocate: 'Alocar',
      sprint: 'Sprint 1',
      move: 'Mover',
      pause: 'Pausar',
    },
    approve: 'Aprovar',
    adjust: 'Ajustar',
    decline: 'Agora não',
    approvedText: 'Equipe contratada e alocada.',
    declinedText: 'Plano recusado.',
    adjustingText: 'Ajustando…',
    stamp: 'Aprovado',
  }

  it('renders plan summary, steps, and executes actions', () => {
    const onApprove = vi.fn()
    const onAdjust = vi.fn()
    const onDecline = vi.fn()
    const steps = [
      { id: '1', kind: 'hire' as const, title: 'Pipoca · Designer', detail: 'gato · Claude' },
      { id: '2', kind: 'board' as const, title: 'Quadro Site', flowModel: 'site' as const },
    ]
    const { rerender } = render(
      <GestorPlanCard
        gestor={{ name: 'Atlas' }}
        summary="Vou contratar 2 personas e criar o quadro Site."
        steps={steps}
        state="pending"
        onApprove={onApprove}
        onAdjust={onAdjust}
        onDecline={onDecline}
        labels={planLabels}
      />,
    )
    expect(screen.getByRole('article', { name: /Plano do Atlas/u })).toBeTruthy()
    expect(screen.getByText('Pipoca · Designer')).toBeTruthy()
    expect(screen.getByText('Quadro Site')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(onApprove).toHaveBeenCalledOnce()

    rerender(
      <GestorPlanCard
        gestor={{ name: 'Atlas' }}
        summary="Vou contratar 2 personas e criar o quadro Site."
        steps={steps}
        state="approved"
        labels={planLabels}
      />,
    )
    expect(screen.getByRole('status').textContent).toContain('Equipe contratada e alocada.')
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull()
  })
})

describe('GES-4: Animação de entrada (newcomers)', () => {
  it('manages arriving flags with expiry', () => {
    const now = 1000
    const { untilById, arrivingIds } = mergeArrivingFlags(['pipoca'], {}, now)
    expect(arrivingIds.has('pipoca')).toBe(true)
    expect(isPersonaArriving('pipoca', untilById, now)).toBe(true)
    expect(isPersonaArriving('pipoca', untilById, now + 5000)).toBe(false)
  })

  it('renders arriving status and animation attribute on TeamChannelStrip and RailTeam', () => {
    const member: ChannelPersonaMember = {
      id: 'sol',
      name: 'Pipoca',
      role: 'Designer',
      state: 'working',
      arriving: true,
    }
    const { container: stripContainer } = render(
      <TeamChannelStrip t={shellTranslate} members={[member]} />,
    )
    expect(stripContainer.querySelector('[data-arriving]')).toBeTruthy()
    expect(screen.getByRole('status').textContent).toContain('Pipoca')

    cleanup()

    const railMember: RailPersona = {
      id: 'pipoca',
      characterId: 'sol',
      name: 'Pipoca',
      role: 'Designer',
      state: 'working',
      unread: 0,
      arriving: true,
    }
    const { container: railContainer } = render(
      <RailTeam t={shellTranslate} collapsed={false} members={[railMember]} />,
    )
    expect(railContainer.querySelector('[data-arriving]')).toBeTruthy()
  })
})
