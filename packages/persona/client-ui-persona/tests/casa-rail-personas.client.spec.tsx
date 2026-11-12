// @vitest-environment jsdom
// Casa da Equipe, 1ª versão (COLHEITA-MUSE §29, atrás de `persona.flag.channelSections`): a persona na barra com o rosto R2 de 40 px e a linha do que
// faz AGORA ("Criação · Escrevendo a legenda"), em vez de só o cargo. A frase é a do host (`PersonaNowView.sentence`, que chega como `step`) e só
// existe enquanto a persona trabalha; sem ela a linha diz o estado de sempre. Com a flag desligada a barra é a de sempre.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { mapRailTeamFromLive } from '../src/client/remote/map-rail-team.ts'
import type { PersonaLiveSnapshot } from '../src/client/remote/persona-live-store.ts'
import { CHANNEL_SECTIONS_FLAG_KEY } from '../src/client/shell/channel-sections-flag.ts'
import { ConversationsRail } from '../src/client/shell/ConversationsRail.tsx'
import type { ConversationPerson } from '../src/client/shell/conversations-model.ts'
import { mapConversationsSource, type ConversationsSource } from '../src/client/shell/conversations-source.ts'

const t = ((key: string, params?: Record<string, string | number>) => bindLocale(shellPt, key, params)) as never

afterEach(() => { cleanup(); localStorage.clear() })

const person = (over: Partial<ConversationPerson> & Pick<ConversationPerson, 'id' | 'name' | 'role'>): ConversationPerson =>
  ({ teamId: null, teamName: null, unread: 0, hasConversation: false, ...over })

function mount(people: readonly ConversationPerson[]) {
  const source: ConversationsSource = { channels: [{ id: 'ch-geral', name: 'geral', unread: 0 }], people }
  return render(<ConversationsRail t={t} source={source} active={null} openConversation={vi.fn()} />)
}

const faceWidth = (row: HTMLElement): string => (row.firstElementChild as HTMLElement).style.width

describe('a persona na barra', () => {
  it('com a flag ligada: rosto de 40 px e a linha "cargo · o que faz agora"', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    mount([person({ id: 'bento', name: 'Bento', role: 'Criação', state: 'working', step: 'escrevendo a legenda' })])
    const row = screen.getByRole('button', { name: /Conversar com Bento/u })
    expect(faceWidth(row)).toBe('40px')
    expect(row.textContent).toContain('Criação · Escrevendo a legenda')
    expect(row.getAttribute('aria-label')).toMatch(/Bento · Criação · Escrevendo a legenda/u)
  })

  it('sem frase do host, a linha diz o estado de sempre (nunca uma frase inventada)', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    mount([person({ id: 'nina', name: 'Nina', role: 'Vendas', state: 'resting' })])
    const row = screen.getByRole('button', { name: /Conversar com Nina/u })
    // `resting` sem janela de silêncio nem pausa é "Disponível" no vocabulário único (`persona-state.ts`).
    expect(row.textContent).toContain(`Vendas · ${shellPt['team.statusAvailable']}`)
  })

  it('com a flag desligada a linha é a de sempre: rosto de 32 px e a frase não aparece', () => {
    mount([person({ id: 'bento', name: 'Bento', role: 'Criação', state: 'working', step: 'escrevendo a legenda' })])
    const row = screen.getByRole('button', { name: /Conversar com Bento/u })
    expect(faceWidth(row)).toBe('32px')
    expect(row.textContent).not.toContain('Escrevendo a legenda')
  })

  it('cargo igual ao nome continua aparecendo uma vez só, também na linha nova', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    mount([person({ id: 'probe', name: 'Probe', role: 'Probe', state: 'working', step: 'lendo os arquivos' })])
    const row = screen.getByRole('button', { name: /Conversar com Probe/u })
    expect((row.textContent ?? '').match(/Probe/gu)).toHaveLength(1)
    expect(row.textContent).toContain('Lendo os arquivos')
  })
})

describe('a frase chega do host até a barra', () => {
  it('mapConversationsSource copia a frase da persona', () => {
    const source = mapConversationsSource({
      rail: [{ id: 'bento', characterId: 'bento', name: 'Bento', role: 'Criação', state: 'working', unread: 0, step: 'escrevendo a legenda' }],
      dms: [], channelId: 'ch-geral', generalName: 'geral', sectorByPersonaId: {},
    })
    expect(source.people[0]?.step).toBe('escrevendo a legenda')
  })

  it('mapRailTeamFromLive leva o step do membro (só o que o host mandou)', () => {
    const snap = {
      ready: true,
      team: { personas: [
        { id: 'p-bento', name: 'Bento', title: 'Criação', avatarRef: 'bento', systemRoles: [] },
        { id: 'p-nina', name: 'Nina', title: 'Vendas', avatarRef: 'nina', systemRoles: [] },
      ], members: [] },
      nowRows: [
        { member: { id: 'bento', name: 'Bento', role: 'Criação', state: 'working', step: 'escrevendo a legenda' }, queueCount: 0 },
        { member: { id: 'nina', name: 'Nina', role: 'Vendas', state: 'resting' }, queueCount: 0 },
      ],
      stripMembers: [], kanbanCards: [], dmUnreadByPersonaId: {}, dms: [], selectedDmId: null, arrivingHostPersonaIds: [],
    } as unknown as PersonaLiveSnapshot
    const rail = mapRailTeamFromLive(snap, true)
    expect(rail.find(row => row.name === 'Bento')?.step).toBe('escrevendo a legenda')
    expect(rail.find(row => row.name === 'Nina')?.step).toBeUndefined()
  })
})
