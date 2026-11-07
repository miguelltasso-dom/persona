// @vitest-environment jsdom
// CV-4 (CONVERSAS-SPEC §5): no organograma, clicar no rosto abre a DM; o cartão vem pelo ⋯ ("Sobre {nome}").
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  OrgChart,
  PersonaCardPopover,
  usePersonaCardController,
  type OrgGroup,
  type PersonaFaceTriggers,
} from '../src/client/primitives/index.ts'
import { ORG_MAP_THRESHOLD } from '../src/client/primitives/Governance.tsx'
import { PersonaInfoCard, type PersonaCardInfo } from '../src/client/profile/PersonaInfoCard.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
afterEach(() => {
  cleanup()
  vi.useRealTimers()
})

const GROUPS: readonly OrgGroup[] = [
  { id: 'miguel', kind: 'person', title: 'Miguel', subtitle: 'Dono', members: [
    { id: 'bento', name: 'Bento', role: 'Engenharia', characterId: 'bento', state: 'working', stateLabel: 'Trabalhando' },
  ] },
]
const ROOT = { id: 'atlas', name: 'Atlas', role: 'Coordenação', characterId: 'atlas', state: 'resting' as const, stateLabel: 'Descansando', caption: 'seu braço direito' }

const INFO = (id: string, name: string): PersonaCardInfo => ({
  personaId: id, name, handle: `@${id}`, role: 'Engenharia', characterId: id, systemRoles: [], nowKind: 'idle', presence: 'online',
})

function Harness({ mode, onDm }: { mode: 'chart' | 'list'; onDm: (id: string) => void }) {
  const card = usePersonaCardController()
  const faces: PersonaFaceTriggers = {
    face: id => card.faceProps(id, () => { onDm(id) }),
    menu: id => card.menuProps(id),
    menuLabel: name => `Sobre ${name}`,
  }
  return (
    <>
      <OrgChart mode={mode} label="Quem cuida de quem" root={ROOT} groups={GROUPS} faces={faces} />
      <PersonaCardPopover {...card.popoverProps} label="Cartão">
        {card.personaId === null ? null : <PersonaInfoCard info={INFO(card.personaId, card.personaId === 'bento' ? 'Bento' : 'Atlas')} />}
      </PersonaCardPopover>
    </>
  )
}

describe.each(['chart', 'list'] as const)('organograma (%s)', (mode) => {
  it('clicar no rosto abre a DM com a persona e NÃO abre o cartão', () => {
    const onDm = vi.fn()
    render(<Harness mode={mode} onDm={onDm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bento, Engenharia — Trabalhando' }))
    expect(onDm).toHaveBeenCalledWith('bento')
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('o ⋯ "Sobre Bento" abre o cartão e traz data-persona-card-trigger; o rosto e o ⋯ são botões irmãos', () => {
    const { container } = render(<Harness mode={mode} onDm={() => undefined} />)
    const more = screen.getByRole('button', { name: 'Sobre Bento' })
    expect(more.getAttribute('data-persona-card-trigger')).toBe('bento')
    expect(more.closest('button')).toBe(more) // nenhum botão dentro de outro
    expect(container.querySelectorAll('button button')).toHaveLength(0)
    fireEvent.click(more)
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('hover longo (~700 ms) no rosto abre o cartão; Shift+F10 também', () => {
    vi.useFakeTimers()
    render(<Harness mode={mode} onDm={() => undefined} />)
    const face = screen.getByRole('button', { name: 'Bento, Engenharia — Trabalhando' })
    fireEvent.pointerEnter(face)
    act(() => { vi.advanceTimersByTime(800) })
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.keyDown(face, { key: 'F10', shiftKey: true })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })
})

describe('sem as faces (rail antigo / host sem DM) o organograma é o de antes', () => {
  it('o clique segue o onSelectPersona e não há ⋯', () => {
    const onSelect = vi.fn()
    render(<OrgChart mode="chart" label="Quem cuida de quem" root={ROOT} groups={GROUPS} onSelectPersona={onSelect} />)
    fireEvent.click(screen.getByRole('button', { name: 'Bento, Engenharia — Trabalhando' }))
    expect(onSelect).toHaveBeenCalledWith('bento')
    expect(screen.queryByRole('button', { name: 'Sobre Bento' })).toBeNull()
  })
})

describe('equipe grande (mapa de escala, mais de 24 pessoas)', () => {
  const MANY: readonly OrgGroup[] = [{
    id: 'ana',
    kind: 'person',
    title: 'Ana',
    subtitle: 'Operações',
    members: Array.from({ length: ORG_MAP_THRESHOLD + 3 }, (_, index) => ({
      id: `p${String(index)}`, name: `Pessoa ${String(index)}`, role: 'Operações', characterId: 'bento', state: 'resting' as const, stateLabel: 'Descansando',
    })),
  }]

  function MapHarness({ onDm }: { onDm: (id: string) => void }) {
    const card = usePersonaCardController()
    const faces: PersonaFaceTriggers = { face: id => card.faceProps(id, () => { onDm(id) }), menu: id => card.menuProps(id), menuLabel: name => `Sobre ${name}` }
    return (
      <>
        <OrgChart mode="chart" label="Quem cuida de quem" groups={MANY} faces={faces} />
        <PersonaCardPopover {...card.popoverProps} label="Cartão"><span>cartão</span></PersonaCardPopover>
      </>
    )
  }

  it('o rosto abre a DM e o ⋯ abre o cartão também no mapa de escala', () => {
    const onDm = vi.fn()
    const { container } = render(<MapHarness onDm={onDm} />)
    // até 40 pessoas o mapa de escala começa com os grupos abertos
    fireEvent.click(screen.getByRole('button', { name: 'Pessoa 0, Operações — Descansando' }))
    expect(onDm).toHaveBeenCalledWith('p0')
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.click(screen.getByRole('button', { name: 'Sobre Pessoa 0' }))
    expect(screen.getByRole('dialog')).toBeTruthy()
    expect(container.querySelectorAll('button button')).toHaveLength(0)
  })
})
