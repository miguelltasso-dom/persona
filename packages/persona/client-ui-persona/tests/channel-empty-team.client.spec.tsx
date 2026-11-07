// @vitest-environment jsdom
// CV-7 (Muse 21:12): o VAZIO do canal de equipe: os rostos da equipe + "Este é o canal da equipe de {x}. Peça algo e a equipe divide entre si." Só quando o
// CV-6 entrega o canal de equipe (createdForTeam) e a barra única está ligada; o #geral vazio segue o de hoje; sem botão "Conversas".
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { ILLUSTRATIONS } from '../src/client/assets/generated-imports.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

beforeEach(() => { localStorage.clear(); localStorage.setItem('persona.hint.whoResponds', '1') })
afterEach(() => { cleanup(); localStorage.clear() })

const MEMBERS: ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] },
  { id: 'nina', name: 'Nina', role: 'Design', state: 'resting' },
]
const SENTENCE = 'Este é o canal da equipe de Marketing. Peça algo e a equipe divide entre si.'

function view(props: Partial<React.ComponentProps<typeof GeneralChannelView>> = {}) {
  return render(
    <GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={MEMBERS} messages={[]} {...props} />,
  )
}

describe('o vazio do canal de equipe (CV-7)', () => {
  it('com a barra única e o canal de equipe, sem mensagens: a frase da equipe e os rostos', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    view({ createdForTeam: 'Marketing' })
    expect(screen.getByText(SENTENCE)).toBeTruthy()
    expect(screen.queryByText(chatPt['stream.emptyTitle'])).toBeNull()
    expect(document.querySelector('[class*="empty"] [role="group"], [class*="empty"] [aria-label]')).not.toBeNull()
  })

  it('a arte é o ÍCONE-CENA da própria equipe (96 px), nunca a arte do #geral', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    view({ createdForTeam: 'Marketing' })
    const art = document.querySelector('[class*="empty"] img') as HTMLImageElement
    expect(art.getAttribute('src')).toBe(ILLUSTRATIONS['channel-marketing'])
    expect(art.getAttribute('src')).not.toBe(ILLUSTRATIONS['empty-dm'])
  })

  it('equipe sem cena própria usa o ícone genérico "channel-equipe"', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    view({ createdForTeam: 'Oficina' })
    const art = document.querySelector('[class*="empty"] img') as HTMLImageElement
    expect(art.getAttribute('src')).toBe(ILLUSTRATIONS['channel-equipe'])
  })

  it('NÃO há botão "Conversas" no vazio (o botão do trilho já é o caminho)', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    view({ createdForTeam: 'Marketing' })
    expect(screen.queryByRole('button', { name: /^Conversas$/u })).toBeNull()
  })

  it('o #geral vazio (sem canal de equipe) segue o de hoje', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    view()
    expect(screen.getByText(chatPt['stream.emptyTitle'])).toBeTruthy()
    expect(screen.queryByText(SENTENCE)).toBeNull()
  })

  it('sem a barra única (flag desligada) o vazio é o de hoje, mesmo com o nome da equipe', () => {
    view({ createdForTeam: 'Marketing' })
    expect(screen.getByText(chatPt['stream.emptyTitle'])).toBeTruthy()
    expect(screen.queryByText(SENTENCE)).toBeNull()
  })

  it('com mensagens não há vazio: o fio aparece', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    const message: ChannelMessageUi = { id: 'm1', authorId: 'user', authorName: 'Ana', body: 'Oi, equipe', timeLabel: '10:00', reactions: [] }
    view({ createdForTeam: 'Marketing', messages: [message] })
    expect(screen.queryByText(SENTENCE)).toBeNull()
    expect(screen.getByText('Oi, equipe')).toBeTruthy()
  })

  it('carregando, o esqueleto (nunca o vazio antes da hora)', () => {
    localStorage.setItem('persona.flag.navPlaces', '1')
    view({ createdForTeam: 'Marketing', loading: true })
    expect(screen.queryByText(SENTENCE)).toBeNull()
    expect(document.querySelector('[data-loading]')).not.toBeNull()
  })
})
