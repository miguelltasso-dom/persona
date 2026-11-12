// @vitest-environment jsdom
// Equipe › Personas (NAV-SPEC; Keel 03:33 + Muse 03:34): a LISTA de personas em cartões no lugar do "Membros e convites". Ordem calculada ao abrir (Coordenação,
// depois quem trabalha ou espera a pessoa, depois o resto por nome) e sem reordenar ao vivo; estado em palavras, "Fila: n", "Quem cuida: {nome}", clique no perfil.
import { cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ConnectedPersonasTeamPanel } from '../src/client/remote/ConnectedPersonasTeamPanel.tsx'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import { PersonasTeamPanel, type PersonasTeamPanelProps } from '../src/client/team/PersonasTeamPanel.tsx'
import { buildRoster, orderRosterIds, rosterPriority, type RosterEntry } from '../src/client/team/personas-roster.ts'
import type { ChannelPersonaMember, PersonaNowSnapshot, PersonaWorkUiState } from '../src/client/team/persona-work-state.ts'
import { en as shellEn, pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { NAV_PLACES } from '../src/client/shell/nav-places.ts'

installPreviewTheme()
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as PersonasTeamPanelProps['t']

const entry = (id: string, name: string, state: PersonaWorkUiState, extra: Partial<RosterEntry> = {}): RosterEntry => ({
  id, name, role: `Função de ${name}`, characterId: 'nina', state, queueCount: 0, coordination: false, ...extra,
})

describe('a ordem de abertura', () => {
  it('Coordenação → Precisa de ajuda → Esperando você → Trabalhando → o resto por nome (pt-BR, com acento)', () => {
    const roster = [
      entry('p-zeca', 'Zeca', 'resting'),
      entry('p-ana', 'Ana', 'resting'),
      entry('p-bia', 'Bia', 'working'),
      entry('p-atlas', 'Atlas', 'resting', { coordination: true }),
      entry('p-eva', 'Éva', 'resting'),
      entry('p-cris', 'Cris', 'waiting'),
      entry('p-dan', 'Dan', 'stuck'),
      entry('p-bruno', 'Bruno', 'working'),
      entry('p-abel', 'Abel', 'stuck'),
    ]
    expect(orderRosterIds(roster)).toEqual(['p-atlas', 'p-abel', 'p-dan', 'p-cris', 'p-bia', 'p-bruno', 'p-ana', 'p-eva', 'p-zeca'])
  })

  it('quem precisa de ajuda vem ANTES de quem descansa por nome (o caso do Sol e da Luna)', () => {
    const roster = [entry('p-luna', 'Luna', 'resting'), entry('p-sol', 'Sol', 'stuck'), entry('p-atlas', 'Atlas', 'resting', { coordination: true })]
    expect(orderRosterIds(roster)).toEqual(['p-atlas', 'p-sol', 'p-luna'])
  })

  it('a prioridade: 0 Coordenação (mesmo descansando), 1 precisa de ajuda, 2 aguardando você, 3 trabalhando, 4 o resto', () => {
    expect(rosterPriority({ coordination: true, state: 'resting' })).toBe(0)
    expect(rosterPriority({ coordination: false, state: 'stuck' })).toBe(1)
    expect(rosterPriority({ coordination: false, state: 'waiting' })).toBe(2)
    expect(rosterPriority({ coordination: false, state: 'working' })).toBe(3)
    expect(rosterPriority({ coordination: false, state: 'resting' })).toBe(4)
  })
})

const TEAM = {
  personas: [
    { id: 'p-atlas', name: 'Atlas', title: 'Coordenação', avatarRef: 'atlas', systemRoles: ['coordination'] },
    { id: 'p-nina', name: 'Nina', title: 'Pesquisa', avatarRef: 'nina' },
    { id: 'p-bento', name: 'Bento', title: 'Engenharia', avatarRef: 'bento' },
  ],
  members: [],
} as unknown as TeamView
const member = (id: string, name: string, role: string, state: PersonaWorkUiState): ChannelPersonaMember => ({ id: id as never, name, role, state })
// stripMembers vem na ordem de `sortPersonasForUi` (Coordenação, depois a ordem do host/contratação): Atlas, Nina, Bento
const STRIP: readonly ChannelPersonaMember[] = [member('atlas', 'Atlas', 'Coordenação', 'resting'), member('nina', 'Nina', 'Pesquisa', 'working'), member('bento', 'Bento', 'Engenharia', 'resting')]
const NOW: readonly PersonaNowSnapshot[] = [{ member: member('nina', 'Nina', 'Pesquisa', 'working'), currentTask: 'Pesquisa de preços', queueCount: 2 }]

describe('buildRoster: a equipe do host com o estado vivo de cada persona', () => {
  it('junta estado, tarefa atual e fila; quem não tem linha no "Agora" descansa com a fila vazia', () => {
    const roster = buildRoster(TEAM, STRIP, NOW)
    expect(roster.map(row => row.id)).toEqual(['p-atlas', 'p-nina', 'p-bento'])
    expect(roster.find(row => row.id === 'p-nina')).toMatchObject({ name: 'Nina', role: 'Pesquisa', state: 'working', currentTask: 'Pesquisa de preços', queueCount: 2, coordination: false })
    expect(roster.find(row => row.id === 'p-bento')).toMatchObject({ state: 'resting', queueCount: 0 })
    expect(roster.find(row => row.id === 'p-bento')?.currentTask).toBeUndefined()
    expect(roster.find(row => row.id === 'p-atlas')?.coordination).toBe(true)
  })

  it('"Quem cuida" vem do organograma por pessoa; sem ele, nada', () => {
    const roster = buildRoster(TEAM, STRIP, NOW, new Map([['p-nina', 'Ana']]))
    expect(roster.find(row => row.id === 'p-nina')?.caretaker).toBe('Ana')
    expect(roster.find(row => row.id === 'p-bento')?.caretaker).toBeUndefined()
  })

  it('sem equipe carregada, lista vazia', () => {
    expect(buildRoster(null, [], [])).toEqual([])
  })
})

const roster3 = (): readonly RosterEntry[] => [
  entry('p-atlas', 'Atlas', 'resting', { coordination: true }),
  entry('p-nina', 'Nina', 'working', { currentTask: 'Pesquisa de preços', queueCount: 2, caretaker: 'Ana' }),
  entry('p-bento', 'Bento', 'resting'),
]
const cards = (): HTMLButtonElement[] => [...document.querySelectorAll<HTMLButtonElement>('[data-persona-card-id]')]

describe('o painel Equipe › Personas', () => {
  it('eyebrow "Equipe", título "Personas" e o primário "Contratar persona" (só com o fluxo de contratação)', () => {
    render(<PersonasTeamPanel t={t} roster={roster3()} onHire={vi.fn()} />)
    expect(screen.getByText('Equipe', { selector: 'p, span, div' })).toBeTruthy()
    expect(screen.getByRole('heading', { level: 1, name: 'Personas' })).toBeTruthy()
    expect(screen.getByRole('button', { name: /Contratar persona/u })).toBeTruthy()
    cleanup()
    render(<PersonasTeamPanel t={t} roster={roster3()} />)
    expect(screen.queryByRole('button', { name: /Contratar persona/u })).toBeNull()
  })

  it('"Contratar persona" abre o fluxo de contratação', () => {
    const onHire = vi.fn()
    render(<PersonasTeamPanel t={t} roster={roster3()} onHire={onHire} />)
    fireEvent.click(screen.getByRole('button', { name: /Contratar persona/u }))
    expect(onHire).toHaveBeenCalledTimes(1)
  })

  it('um cartão por persona, na ordem de abertura: Coordenação, quem trabalha, o resto', () => {
    render(<PersonasTeamPanel t={t} roster={roster3()} />)
    expect(cards().map(card => card.dataset.personaCardId)).toEqual(['p-atlas', 'p-nina', 'p-bento'])
    expect(screen.getByRole('list', { name: 'Personas da equipe' })).toBeTruthy()
  })

  it('cada cartão diz o estado em palavras, a tarefa (ou "Sem tarefa agora"), a fila e quem cuida; nunca um id', () => {
    render(<PersonasTeamPanel t={t} roster={roster3()} />)
    const nina = document.querySelector<HTMLElement>('[data-persona-card-id="p-nina"]')!
    expect(nina.textContent).toContain('Nina')
    expect(nina.textContent).toContain('Função de Nina')
    expect(nina.textContent).toContain('Trabalhando')
    expect(nina.textContent).toContain('Pesquisa de preços')
    expect(nina.textContent).toContain('Fila: 2')
    expect(nina.textContent).toContain('Quem cuida: Ana')
    const bento = document.querySelector<HTMLElement>('[data-persona-card-id="p-bento"]')!
    expect(bento.textContent).toContain('Disponível')
    expect(bento.textContent).toContain('Sem tarefa agora')
    expect(bento.textContent).toContain('Fila vazia')
    expect(bento.textContent).not.toContain('Quem cuida')
    for (const card of cards()) expect(card.textContent).not.toMatch(/p-(atlas|nina|bento)/u)
  })

  it('os outros estados em palavras: esperando você e precisa de ajuda', () => {
    render(<PersonasTeamPanel t={t} roster={[entry('p-a', 'Ana', 'waiting'), entry('p-b', 'Beto', 'stuck')]} />)
    expect(screen.getByText('Esperando você')).toBeTruthy()
    expect(screen.getByText('Precisa de ajuda')).toBeTruthy()
  })

  it('o nome acessível do cartão traz nome, função, estado e a ação ("Abrir o perfil")', () => {
    render(<PersonasTeamPanel t={t} roster={roster3()} />)
    expect(screen.getByRole('button', { name: 'Nina, Função de Nina — Trabalhando. Abrir o perfil' })).toBeTruthy()
  })

  it('o clique no cartão abre o perfil pelo id da persona', () => {
    const onOpenPersona = vi.fn()
    render(<PersonasTeamPanel t={t} roster={roster3()} onOpenPersona={onOpenPersona} />)
    fireEvent.click(screen.getByRole('button', { name: /^Bento/u }))
    expect(onOpenPersona).toHaveBeenCalledWith('p-bento')
  })

  it('a ordem NÃO muda ao vivo: o estado muda no lugar; quem chega depois entra no fim', () => {
    const view = render(<PersonasTeamPanel t={t} roster={roster3()} />)
    expect(cards().map(card => card.dataset.personaCardId)).toEqual(['p-atlas', 'p-nina', 'p-bento'])
    // Bento começa a trabalhar e Nina descansa: seria outra ordem, mas a tela abriu assim
    view.rerender(<PersonasTeamPanel t={t} roster={[
      entry('p-atlas', 'Atlas', 'resting', { coordination: true }),
      entry('p-nina', 'Nina', 'resting'),
      entry('p-bento', 'Bento', 'working', { currentTask: 'Texto do cardápio' }),
    ]} />)
    expect(cards().map(card => card.dataset.personaCardId)).toEqual(['p-atlas', 'p-nina', 'p-bento'])
    expect(within(cards()[2]!).getByText('Trabalhando')).toBeTruthy()
    expect(within(cards()[1]!).getByText('Disponível')).toBeTruthy()
    // uma persona nova (contratada agora) entra no fim, sem embaralhar as de antes
    view.rerender(<PersonasTeamPanel t={t} roster={[
      entry('p-atlas', 'Atlas', 'resting', { coordination: true }),
      entry('p-nina', 'Nina', 'resting'),
      entry('p-bento', 'Bento', 'working'),
      entry('p-caio', 'Caio', 'working'),
    ]} />)
    expect(cards().map(card => card.dataset.personaCardId)).toEqual(['p-atlas', 'p-nina', 'p-bento', 'p-caio'])
    // uma persona que saiu some, sem mexer nas outras
    view.rerender(<PersonasTeamPanel t={t} roster={[entry('p-atlas', 'Atlas', 'resting', { coordination: true }), entry('p-bento', 'Bento', 'working')]} />)
    expect(cards().map(card => card.dataset.personaCardId)).toEqual(['p-atlas', 'p-bento'])
  })

  it('sem nenhuma persona: "Sua equipe ainda está vazia" com "Contratar persona"; nada de grade', () => {
    const onHire = vi.fn()
    render(<PersonasTeamPanel t={t} roster={[]} onHire={onHire} />)
    expect(screen.getByRole('heading', { name: 'Sua equipe ainda está vazia' })).toBeTruthy()
    expect(document.querySelector('[data-personas-grid]')).toBeNull()
    fireEvent.click(screen.getAllByRole('button', { name: /Contratar persona/u })[0]!)
    expect(onHire).toHaveBeenCalled()
  })

  it('carregando: esqueleto (aria-busy), nunca o vazio "sua equipe está vazia"', () => {
    render(<PersonasTeamPanel t={t} roster={[]} loading />)
    expect(document.querySelector('[aria-busy="true"][data-loading]')).toBeTruthy()
    expect(screen.queryByText('Sua equipe ainda está vazia')).toBeNull()
  })

  it('em inglês', () => {
    const tEn = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellEn, key, params)) as PersonasTeamPanelProps['t']
    render(<PersonasTeamPanel t={tEn} roster={roster3()} onHire={vi.fn()} />)
    expect(screen.getByRole('heading', { level: 1, name: 'Personas' })).toBeTruthy()
    expect(screen.getByText('Looked after by Ana')).toBeTruthy()
    expect(screen.getByRole('button', { name: /Hire a persona|Contratar persona/u })).toBeTruthy()
  })
})

describe('o painel conectado (a mesma fonte do "Agora" e da faixa da equipe)', () => {
  const snapshot = (extra: Partial<PersonaLiveSnapshot> = {}): PersonaLiveSnapshot => ({
    ready: true, tenant: { workspaceId: 'ws', projectId: 'proj' } as never, team: TEAM, stripMembers: STRIP, nowRows: NOW, ...extra,
  }) as PersonaLiveSnapshot
  const useLive = (snap: PersonaLiveSnapshot) => (<T,>(select: (state: PersonaLiveSnapshot) => T): T => select(snap))

  it('desenha as personas do time e abre o perfil e a contratação pelos handlers do shell', () => {
    const openPersonaProfile = vi.fn()
    const hirePersona = vi.fn()
    render(<ConnectedPersonasTeamPanel t={t} useLive={useLive(snapshot()) as never} openPersonaProfile={openPersonaProfile} hirePersona={hirePersona} />)
    expect(cards().map(card => card.dataset.personaCardId)).toEqual(['p-atlas', 'p-nina', 'p-bento'])
    fireEvent.click(screen.getByRole('button', { name: /^Nina/u }))
    expect(openPersonaProfile).toHaveBeenCalledWith('p-nina')
    fireEvent.click(screen.getByRole('button', { name: /Contratar persona/u }))
    expect(hirePersona).toHaveBeenCalled()
  })

  it('"Quem cuida" chega do organograma por pessoa do host', async () => {
    const getOrgChart = vi.fn(async () => ({ ok: true, value: {
      workspaceId: 'ws', groupBy: 'person', personaCount: 3, humanCount: 1,
      groups: [{ id: 'g1', title: 'Ana', kind: 'person', members: [{ id: 'p-nina', name: 'Nina', role: 'Pesquisa', state: 'working' }] }],
    } }))
    render(<ConnectedPersonasTeamPanel t={t} useLive={useLive(snapshot()) as never} openPersonaProfile={vi.fn()} persona={{ getOrgChart } as never} />)
    expect(await screen.findByText('Quem cuida: Ana')).toBeTruthy()
    expect(getOrgChart).toHaveBeenCalledWith({ workspaceId: 'ws', groupBy: 'person' })
  })

  it('o organograma que falha só deixa os cartões sem a linha (a lista segue)', async () => {
    const getOrgChart = vi.fn(async () => { throw new Error('host fora') })
    render(<ConnectedPersonasTeamPanel t={t} useLive={useLive(snapshot()) as never} openPersonaProfile={vi.fn()} persona={{ getOrgChart } as never} />)
    await waitFor(() => { expect(getOrgChart).toHaveBeenCalled() })
    expect(cards()).toHaveLength(3)
    expect(screen.queryByText(/Quem cuida/u)).toBeNull()
  })

  it('antes dos dados do host: esqueleto; equipe carregada e vazia: o vazio com Contratar', () => {
    const { unmount } = render(<ConnectedPersonasTeamPanel t={t} useLive={useLive(snapshot({ ready: false, team: null, stripMembers: [], nowRows: [] })) as never} openPersonaProfile={vi.fn()} />)
    expect(document.querySelector('[data-loading]')).toBeTruthy()
    unmount()
    render(<ConnectedPersonasTeamPanel t={t} useLive={useLive(snapshot({ team: { personas: [], members: [] } as never, stripMembers: [], nowRows: [] })) as never} openPersonaProfile={vi.fn()} hirePersona={vi.fn()} />)
    expect(screen.getByRole('heading', { name: 'Sua equipe ainda está vazia' })).toBeTruthy()
  })
})

describe('a aba e o estilo', () => {
  it('Equipe › Personas é a primeira aba do lugar Equipe (o painel `team`); Membros não é aba da Equipe (em Configurações só com a flag da equipe remota, DESIGN-01 cena 20)', () => {
    const team = NAV_PLACES.find(place => place.id === 'team')!
    expect(team.tabs[0]).toMatchObject({ panel: 'team' })
    expect(shellPt[team.tabs[0]!.labelKey]).toBe('Personas')
    expect(team.tabs.map(tab => tab.panel)).not.toContain('members')
  })

  it('a grade: auto-fill com mínimo de 280 px (3–4 colunas a 1440, 2 a 960, 1 a 200 %), só tokens, sem hex', () => {
    const css = readFileSync(join(import.meta.dirname, '../src/client/team/PersonasTeamPanel.module.css'), 'utf8').replaceAll('\r\n', '\n')
    expect(css).toContain('grid-template-columns: repeat(auto-fill, minmax(min(100%, 280px), 1fr));')
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/u)
    expect(css).toMatch(/prefers-reduced-motion: reduce/u)
  })
})
