// @vitest-environment jsdom
// Muse A-3: "Luna está acompanhando este assunto" deixa de ser texto morto: abre o cartão da persona.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { GeneralChannelView, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { passThroughFollowers } from '../src/client/remote/derive-pass-through.ts'
import type { PersonaCardShellBridge } from '../src/client/remote/persona-card-shell-bridge.ts'
import type { TeamView } from '../src/client/remote/persona-remote-types.ts'
import type { PersonaCardInfo } from '../src/client/profile/PersonaInfoCard.tsx'
import type { ChannelPersonaMember, PersonaNowSnapshot } from '../src/client/team/persona-work-state.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as profilePt } from '../src/client/locale/profile/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const shellT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as GeneralChannelViewProps['shellT']

const MEMBERS: ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] },
  { id: 'luna', name: 'Luna', role: 'Pesquisa', state: 'working' },
]

const TEAM = {
  members: [],
  personas: [
    { id: 'p-atlas', name: 'Atlas', title: 'Coordenação', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'atlas', systemRoles: ['coordination'], canRecruit: false },
    { id: 'p-luna', name: 'Luna', title: 'Pesquisa', workspaceId: 'ws', projectId: 'pp', description: '', avatarKind: 'gallery', avatarRef: 'luna', systemRoles: [], canRecruit: false },
  ],
} as unknown as TeamView

const LUNA_CARD: PersonaCardInfo = {
  personaId: 'p-luna',
  name: 'Luna',
  handle: '@luna',
  role: 'Pesquisa',
  sector: 'Produto',
  characterId: 'luna',
  systemRoles: [],
  nowKind: 'working',
  nowText: 'Pesquisando concorrentes',
  presence: 'online',
  talk: { everyone: true, names: [] },
  ownerName: 'Ana',
  engineLabel: 'Claude · Sonnet',
}

const STABLE_REVISION = { n: 0 }

function bridge(): PersonaCardShellBridge {
  return {
    cardInfo: (id: string) => (id === 'p-luna' ? LUNA_CARD : undefined),
    prefetch: vi.fn(),
    cardDict: profilePt,
    // useSyncExternalStore exige o MESMO objeto entre leituras sem mudança (senão: loop de atualização).
    revision: { getSnapshot: () => STABLE_REVISION, subscribe: () => () => undefined } as never,
    sendToPersona: vi.fn(),
    togglePause: vi.fn(),
    switchEngine: vi.fn(),
    editTalk: vi.fn(),
    editPersona: vi.fn(),
    teachPersona: vi.fn(),
  }
}

function view(extra: Partial<GeneralChannelViewProps> = {}) {
  return render(
    <GeneralChannelView
      t={t}
      shellT={shellT}
      members={MEMBERS}
      messages={[]}
      team={TEAM}
      passThroughFollowers={[{ name: 'Luna', id: 'luna' }]}
      {...extra}
    />,
  )
}

describe('A-3: quem está acompanhando o assunto', () => {
  it('com o cartão da persona disponível, a frase é um botão e abre o cartão da Luna', () => {
    view({ personaCard: bridge(), openPersonaProfile: () => undefined })
    const sentence = screen.getByRole('button', { name: 'Luna está acompanhando este assunto' })
    expect(sentence.getAttribute('aria-haspopup')).toBe('dialog')
    fireEvent.click(sentence)
    expect(screen.getByRole('dialog', { name: 'Luna' })).toBeTruthy()
  })

  it('sem o cartão (sem ponte) continua sendo só a frase: nunca um botão que não faz nada', () => {
    view()
    expect(screen.getByText('Luna está acompanhando este assunto')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Luna está acompanhando este assunto' })).toBeNull()
  })

  it('quem acompanha vem com o id da persona (o mesmo da faixa da equipe), sem a Coordenação', () => {
    const row = (name: string, id: ChannelPersonaMember['id'], state: 'working' | 'resting', task?: string, systemRoles?: ChannelPersonaMember['systemRoles']): PersonaNowSnapshot => ({
      member: { id, name, role: 'x', state, ...(systemRoles === undefined ? {} : { systemRoles }) },
      queueCount: 0,
      ...(task === undefined ? {} : { currentTask: task }),
    })
    expect(passThroughFollowers([
      row('Atlas', 'atlas', 'working', 'Triagem', ['coordination']),
      row('Luna', 'luna', 'working', 'Pesquisa'),
      row('Nina', 'nina', 'resting', 'Brief'),
    ])).toEqual([{ name: 'Luna', id: 'luna' }])
  })
})

describe('CV-4: rosto na faixa da equipe — clicar abre a DM; o cartão vem pelo ⋯', () => {
  it('clicar no rosto chama a DM da persona e não abre o cartão', () => {
    const onOpenPersonaDm = vi.fn()
    view({ personaCard: bridge(), openPersonaProfile: () => undefined, onOpenPersonaDm, passThroughFollowers: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Conversar com Luna' }))
    expect(onOpenPersonaDm).toHaveBeenCalledWith('p-luna')
    expect(screen.queryByRole('dialog', { name: 'Luna' })).toBeNull()
  })

  it('o ⋯ ("Sobre Luna") abre o cartão e traz data-persona-card-trigger', () => {
    const { container } = view({ personaCard: bridge(), openPersonaProfile: () => undefined, onOpenPersonaDm: () => undefined, passThroughFollowers: [] })
    const more = screen.getByRole('button', { name: 'Sobre Luna' })
    expect(more.getAttribute('data-persona-card-trigger')).toBe('p-luna')
    expect(container.querySelectorAll('[data-persona-card-trigger]').length).toBeGreaterThanOrEqual(2) // Atlas e Luna
    fireEvent.click(more)
    expect(screen.getByRole('dialog', { name: 'Luna' })).toBeTruthy()
  })

  it('sem o handler da DM a faixa se comporta como antes (clicar no rosto abre o cartão)', () => {
    view({ personaCard: bridge(), openPersonaProfile: () => undefined, passThroughFollowers: [] })
    fireEvent.click(screen.getByRole('button', { name: 'Luna' }))
    expect(screen.getByRole('dialog', { name: 'Luna' })).toBeTruthy()
  })
})
