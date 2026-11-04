// @vitest-environment jsdom
// Gauge (reload com equipe de 5): o primeiro quadro pintava "Monte sua equipe / Vaga aberta ×3 / O canal está quietinho"
// (estado de equipe vazia) até os dados chegarem. Agora, enquanto o host não respondeu, é skeleton — nunca afirma o vazio.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { GeneralChannelView, type GeneralChannelViewProps } from '../src/client/chat/GeneralChannelView.tsx'
import { OverviewNowStrip } from '../src/client/overview/OverviewNowStrip.tsx'
import { TeamChannelStrip } from '../src/client/team/TeamChannelStrip.tsx'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(chatPt, key, params)) as GeneralChannelViewProps['t']
const shellT = ((key: string, params?: Readonly<Record<string, string | number>>) => bindLocale(shellPt, key, params)) as GeneralChannelViewProps['shellT']

const MEMBERS: ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting' },
  { id: 'bento', name: 'Bento', role: 'Engenharia', state: 'working' },
]

describe('faixa da equipe', () => {
  it('carregando e sem equipe ainda: skeleton, sem "Monte sua equipe" nem "Vaga aberta"', () => {
    const { container } = render(<TeamChannelStrip t={shellT} members={[]} loading onBuildTeam={() => undefined} />)
    expect(screen.queryByText(shellPt['team.emptyTitle'])).toBeNull()
    expect(screen.queryByText(shellPt['team.emptySeat'])).toBeNull()
    expect(screen.queryByRole('button', { name: shellPt['team.emptyAction'] })).toBeNull()
    expect(container.querySelector('section')?.getAttribute('aria-busy')).toBe('true')
  })

  it('terminou de carregar e a equipe é mesmo vazia: aí sim o convite para montar a equipe', () => {
    render(<TeamChannelStrip t={shellT} members={[]} loading={false} onBuildTeam={() => undefined} />)
    expect(screen.getByRole('heading', { name: shellPt['team.emptyTitle'] })).toBeTruthy()
    expect(screen.getAllByText(shellPt['team.emptySeat']).length).toBeGreaterThan(0)
    expect(screen.getByRole('button', { name: shellPt['team.emptyAction'] })).toBeTruthy()
  })

  it('com membros o `loading` não esconde ninguém (releituras em segundo plano)', () => {
    const { container } = render(<TeamChannelStrip t={shellT} members={MEMBERS} loading />)
    expect(screen.getByText('Atlas')).toBeTruthy()
    expect(screen.getByText('Bento')).toBeTruthy()
    expect(container.querySelector('section')?.getAttribute('aria-busy')).toBeNull()
  })
})

describe('"Agora" da Visão geral', () => {
  it('carregando: skeleton em vez do vazio "Monte sua equipe"', () => {
    const { container } = render(<OverviewNowStrip t={shellT} rows={[]} loading />)
    expect(screen.queryByText(shellPt['team.emptyTitle'])).toBeNull()
    expect(container.querySelector('[data-loading]')).not.toBeNull()
  })

  it('sem equipe de verdade: o vazio que ensina continua', () => {
    render(<OverviewNowStrip t={shellT} rows={[]} loading={false} />)
    expect(screen.getByText(shellPt['team.emptyTitle'])).toBeTruthy()
  })
})

describe('#geral', () => {
  it('carregando: linhas de skeleton e uma frase para o leitor de tela; nada de "canal quietinho" nem "Monte sua equipe"', () => {
    render(<GeneralChannelView t={t} shellT={shellT} members={[]} messages={[]} loading />)
    expect(screen.queryByText(chatPt['stream.emptyTitle'])).toBeNull()
    expect(screen.queryByText(shellPt['team.emptyTitle'])).toBeNull()
    expect(screen.getByText(chatPt['stream.loading']).getAttribute('role')).toBe('status')
  })

  it('já carregou e não há mensagens: o canal quietinho de sempre', () => {
    render(<GeneralChannelView t={t} shellT={shellT} members={MEMBERS} messages={[]} loading={false} />)
    expect(screen.getByText(chatPt['stream.emptyTitle'])).toBeTruthy()
    expect(screen.queryByText(chatPt['stream.loading'])).toBeNull()
  })
})
