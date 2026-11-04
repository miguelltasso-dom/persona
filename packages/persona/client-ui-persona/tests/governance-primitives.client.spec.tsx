// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { HealthItem, OrgChart, SectorIcon, TwoDayTimeline, type OrgGroup } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

const GROUPS: readonly OrgGroup[] = [
  { id: 'miguel', kind: 'person', title: 'Miguel', subtitle: 'Dono', members: [
    { id: 'bento', name: 'Bento', role: 'Engenharia', characterId: 'bento', state: 'working', stateLabel: 'Trabalhando' },
  ] },
  { id: 'ana', kind: 'person', title: 'Ana', subtitle: 'Suporte', members: [
    { id: 'sol', name: 'Sol', role: 'Atendimento', characterId: 'sol', state: 'waiting', stateLabel: 'Aguardando você' },
  ] },
]

describe('governance primitives', () => {
  it('org chart: chart and accessible list show the same people and personas with state', () => {
    const onSelect = vi.fn()
    const root = { id: 'atlas', name: 'Atlas', role: 'Coordenação', characterId: 'atlas', state: 'resting' as const, stateLabel: 'Descansando', caption: 'seu braço direito' }
    const { rerender } = render(<OrgChart mode="chart" label="Quem cuida de quem" root={root} groups={GROUPS} onSelectPersona={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Sol, Atendimento — Aguardando você' }))
    expect(onSelect).toHaveBeenCalledWith('sol')
    rerender(<OrgChart mode="list" label="Quem cuida de quem" root={root} groups={GROUPS} onSelectPersona={onSelect} />)
    const region = screen.getByRole('region', { name: 'Quem cuida de quem' })
    expect(within(region).getByRole('heading', { name: /Miguel/u })).toBeTruthy()
    expect(within(region).getByRole('button', { name: 'Bento, Engenharia — Trabalhando' })).toBeTruthy()
  })

  it('health item offers a one-click fix; two-day timeline labels every slot', () => {
    const fix = vi.fn()
    render(
      <>
        <ul><HealthItem level="risk" title="Tudo depende de você para aprovar" actionLabel="Definir substituto" onAction={fix} /></ul>
        <TwoDayTimeline
          label="Teste dos 2 dias"
          slotLabels={['Dia 1 · manhã', 'Dia 1 · tarde', 'Dia 2 · manhã', 'Dia 2 · tarde']}
          legend={{ runs: 'Continua', waits: 'Espera você', stops: 'Para' }}
          rows={[{ id: 'r1', label: 'Responder clientes (Sol)', slots: ['runs', 'runs', 'waits', 'stops'], reason: 'precisa da sua aprovação' }]}
        />
      </>,
    )
    fireEvent.click(screen.getByRole('button', { name: 'Definir substituto' }))
    expect(fix).toHaveBeenCalledOnce()
    expect(screen.getByRole('img', { name: 'Dia 2 · tarde: Para' })).toBeTruthy()
  })
})

describe('SectorIcon', () => {
  it('renders the Brush sector glyph as decoration and nothing for unknown sectors', () => {
    const { container, rerender } = render(<SectorIcon sector="vendas" size={18} />)
    const glyph = container.querySelector('span')
    expect(glyph?.getAttribute('aria-hidden')).toBe('true')
    expect(glyph?.getAttribute('style')).toContain('--persona-icon-size: 18px')
    rerender(<SectorIcon sector="nao-existe" />)
    expect(container.querySelector('span')).toBeNull()
  })
})
