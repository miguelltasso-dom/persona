// @vitest-environment jsdom
import { useState } from 'react'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GestorPlanCard, GestorSettings, OrgChart, type GestorLimitsValue } from '../src/client/primitives/index.ts'
import { PersonaInfoCard } from '../src/client/profile/PersonaInfoCard.tsx'

afterEach(() => { cleanup() })

const LABELS = {
  title: 'Gestor de equipe',
  explain: (n: string) => `${n} pode contratar personas e organizar a equipe.`,
  approvalLegend: 'Quando contratar ou mudar alguém',
  approval: { ask: { title: 'Sempre me perguntar', body: 'Mostra o plano e espera seu ok.' }, 'auto-within': { title: 'Fazer sozinho dentro dos limites', body: 'x' }, 'auto-notify': { title: 'Fazer e me avisar', body: 'y' } },
  recommended: 'Recomendado', maxPersonas: 'Tamanho máximo da equipe', maxPersonasValue: (n: number) => `Até ${n} personas`, fewer: 'Menos', more: 'Mais',
  budget: 'Gasto das novas personas', areas: 'Onde pode agir', areasAll: 'Em toda a empresa',
  canGrant: 'Pode tornar outra persona Gestor de equipe', canGrantHint: 'Desligado: só você dá essa função.', ceiling: (n: string) => `Nunca cria persona com mais acesso que ${n}.`,
}

describe('GestorSettings', () => {
  it('switch reveals limits in plain language; stepper and areas update the value', () => {
    const Wrapper = () => {
      const [on, setOn] = useState(false)
      const [value, setValue] = useState<GestorLimitsValue>({ approval: 'ask', maxPersonas: 8, budget: 'normal', areas: [], canGrantGestor: false })
      return <GestorSettings personaName="Atlas" enabled={on} onEnabledChange={setOn} value={value} onChange={setValue} budgetOptions={[{ id: 'pouco', label: 'Pouco', hint: '≈ 20 tarefas/mês' }, { id: 'normal', label: 'Normal', hint: '≈ 50' }]} areaOptions={[{ id: 'site', label: 'Projeto Site' }]} labels={LABELS} />
    }
    render(<Wrapper />)
    const sw = screen.getByRole('switch', { name: 'Gestor de equipe' })
    expect(sw.getAttribute('aria-checked')).toBe('false')
    expect(screen.queryByText('Até 8 personas')).toBeNull()
    fireEvent.click(sw)
    expect(screen.getByText('Até 8 personas')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Mais' }))
    expect(screen.getByText('Até 9 personas')).toBeTruthy()
    expect((screen.getByRole('radio', { name: /Sempre me perguntar/u }) as HTMLInputElement).checked).toBe(true)
    expect((screen.getByRole('checkbox', { name: /Pode tornar outra persona Gestor de equipe/u }) as HTMLInputElement).checked).toBe(false)
    fireEvent.click(screen.getByRole('checkbox', { name: 'Projeto Site' }))
    expect((screen.getByRole('checkbox', { name: 'Em toda a empresa' }) as HTMLInputElement).checked).toBe(false)
  })
})

describe('GestorPlanCard', () => {
  const labels = { title: (m: string) => `Plano do ${m}`, kinds: { hire: 'Contratar', board: 'Criar quadro', allocate: 'Alocar', sprint: 'Sprint 1', move: 'Mover', pause: 'Pausar' }, approve: 'Aprovar', adjust: 'Ajustar', decline: 'Agora não', approvedText: '3 personas chegaram ao Site.', declinedText: 'Plano recusado.', adjustingText: 'Ajustando…', stamp: 'Aprovado' }
  it('pending shows the plan and the 3 choices; approved shows the stamp and outcome', () => {
    const approve = vi.fn()
    const steps = [
      { id: 's1', kind: 'hire' as const, title: 'Pipoca · Designer', detail: 'gato · Claude · Sonnet' },
      { id: 's2', kind: 'board' as const, title: 'Quadro Site', flowModel: 'site' as const },
    ]
    const { rerender } = render(<GestorPlanCard gestor={{ name: 'Atlas' }} summary="Vou contratar 3 personas e criar o quadro Site." steps={steps} state="pending" onApprove={approve} onAdjust={() => undefined} onDecline={() => undefined} labels={labels} />)
    expect(screen.getByRole('article', { name: /Plano do Atlas/u })).toBeTruthy()
    expect(screen.getByText('Pipoca · Designer')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(approve).toHaveBeenCalled()
    rerender(<GestorPlanCard gestor={{ name: 'Atlas' }} summary="Vou contratar 3 personas e criar o quadro Site." steps={steps} state="approved" labels={labels} />)
    expect(screen.queryByRole('button', { name: 'Aprovar' })).toBeNull()
    expect(screen.getByRole('status').textContent).toContain('3 personas chegaram ao Site.')
  })
})

describe('Gestor marks', () => {
  it('card badge and org chart use the Gestor selo', () => {
    render(<PersonaInfoCard info={{ personaId: 'atlas', name: 'Atlas', handle: '@atlas', role: 'Coordenação', characterId: 'atlas', systemRoles: ['coordination', 'team_manager'], nowKind: 'idle', nowText: 'Disponível', presence: 'online', talk: { everyone: true, names: [] } } as never} />)
    expect(screen.getByText('Gestor').closest('li')?.getAttribute('data-tone')).toBe('gestor')
    cleanup()
    render(<OrgChart mode="chart" label="Quem cuida" groups={[{ id: 'g', title: 'Você', kind: 'person', members: [{ id: 'a', name: 'Atlas', role: 'Coordenação', state: 'working', stateLabel: 'Disponível', gestor: true, gestorLabel: 'Gestor' }] }]} />)
    expect(screen.getByRole('button', { name: /Atlas \(Gestor\)/u })).toBeTruthy()
  })
})
