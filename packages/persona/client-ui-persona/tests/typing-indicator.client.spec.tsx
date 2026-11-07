// @vitest-environment jsdom
// P1-4 (Muse, BR-P3-SPEC): "{persona} está escrevendo…". Quem: a persona que vai responder à última mensagem DA PESSOA, sem resposta já crescendo.
// Como: a pose `digitando` INTEIRA a 48 px quando a persona a tem; senão o retrato de 32 px + o texto. Atrás da flag do controle de trabalho.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { registerPoseUrl } from '../src/client/assets/asset-url.ts'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import type { HostTurnControls } from '../src/client/chat/host-turn.ts'
import { TypingIndicator } from '../src/client/chat/TypingIndicator.tsx'
import { typingPersona } from '../src/client/chat/typing-indicator.ts'
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

const member = (id: string, name: string, state: ChannelPersonaMember['state'], over: Partial<ChannelPersonaMember> = {}): ChannelPersonaMember => ({ id: id as never, name, role: 'x', state, ...over })
const ATLAS = member('atlas', 'Atlas', 'working', { systemRoles: ['coordination'] })
const NINA = member('nina', 'Nina', 'working')
const ask: ChannelMessageUi = { id: 'm1', authorId: 'user', authorName: 'Ana', body: 'Explique o plano', timeLabel: '10:00', reactions: [] }
const answer = (over: Partial<ChannelMessageUi> = {}): ChannelMessageUi => ({ id: 'm2', authorId: 'nina', authorName: 'Nina', body: 'Pronto.', timeLabel: '10:01', reactions: [], ...over })

describe('quem está escrevendo', () => {
  it('a última mensagem é da pessoa e alguém trabalha: a persona que responde por padrão (Coordenação)', () => {
    expect(typingPersona([ask], [NINA, ATLAS])?.name).toBe('Atlas')
  })

  it('a Coordenação está ociosa: o primeiro que trabalha', () => {
    expect(typingPersona([ask], [member('atlas', 'Atlas', 'resting', { systemRoles: ['coordination'] }), NINA])?.name).toBe('Nina')
  })

  it('ninguém trabalhando: ninguém escreve', () => {
    expect(typingPersona([ask], [member('atlas', 'Atlas', 'resting'), member('nina', 'Nina', 'waiting')])).toBeNull()
  })

  it('a última mensagem é de uma persona (já respondeu): ninguém escreve', () => {
    expect(typingPersona([ask, answer()], [NINA])).toBeNull()
  })

  it('já existe uma resposta crescendo: o balão que cresce é o sinal, o indicador sai', () => {
    expect(typingPersona([ask, answer({ streaming: true })], [NINA])).toBeNull()
  })

  it('a mensagem da pessoa não foi enviada: ninguém escreve', () => {
    expect(typingPersona([{ ...ask, sendFailed: true }], [NINA])).toBeNull()
  })

  it('fio vazio: ninguém escreve', () => {
    expect(typingPersona([], [NINA])).toBeNull()
  })
})

describe('o indicador', () => {
  it('sem a pose `digitando` (os 12 extras): o retrato de 32 px e o texto "Bia está escrevendo"', () => {
    render(<TypingIndicator t={t as never} member={member('bia', 'Bia', 'working')} />)
    const node = document.querySelector('[data-persona-typing]') as HTMLElement
    expect(node.getAttribute('data-pose')).toBe('avatar')
    expect(node.querySelector('img[height="48"]')).toBeNull()
    expect(node.textContent).toContain('Bia está escrevendo')
  })

  it('com a pose `digitando`: a pose inteira a 48 px de altura, sem texto alternativo (decorativa)', () => {
    registerPoseUrl('nina-digitando', '/nina-digitando.webp')
    render(<TypingIndicator t={t as never} member={NINA} />)
    const node = document.querySelector('[data-persona-typing]') as HTMLElement
    expect(node.getAttribute('data-pose')).toBe('digitando')
    const image = node.querySelector('img') as HTMLImageElement
    expect(image.getAttribute('height')).toBe('48')
    expect(image.getAttribute('src')).toBe('/nina-digitando.webp')
    expect(image.getAttribute('alt')).toBe('')
  })

  it('as reticências animadas ficam fora da leitura (o nome acessível não repete pontos)', () => {
    render(<TypingIndicator t={t as never} member={NINA} />)
    const dots = document.querySelector('[data-persona-typing] [aria-hidden="true"]') as HTMLElement
    expect(dots.textContent).toBe('...')
  })

  it('não é região ao vivo (o aviso do leitor de tela é o do início da resposta)', () => {
    render(<TypingIndicator t={t as never} member={NINA} />)
    const node = document.querySelector('[data-persona-typing]') as HTMLElement
    expect(node.closest('[aria-live]')).toBeNull()
    expect(node.getAttribute('role')).toBeNull()
  })
})

describe('no #geral', () => {
  const controls: HostTurnControls = { stoppable: null, stop: vi.fn(), steer: vi.fn(), stoppedPersona: null, error: null, clearError: vi.fn() }
  const view = (messages: readonly ChannelMessageUi[], turnControls?: HostTurnControls) => (
    <GeneralChannelView
      t={t as never}
      shellT={key => shellPt[key as keyof typeof shellPt] ?? key}
      members={[ATLAS]}
      messages={messages}
      onSendMessage={vi.fn()}
      {...(turnControls === undefined ? {} : { turnControls })}
    />
  )

  it('com o controle de trabalho ligado e um pedido sem resposta: "Atlas está escrevendo"', () => {
    render(view([ask], controls))
    expect(screen.getByText(/Atlas está escrevendo/u)).toBeTruthy()
  })

  it('sem o controle de trabalho (flag desligada) nada aparece', () => {
    render(view([ask]))
    expect(document.querySelector('[data-persona-typing]')).toBeNull()
  })

  it('quando a resposta começa a crescer, o indicador sai', () => {
    const { rerender } = render(view([ask], controls))
    expect(document.querySelector('[data-persona-typing]')).not.toBeNull()
    rerender(view([ask, answer({ id: 'coord-m1-reply', authorId: 'atlas', authorName: 'Atlas', streaming: true })], controls))
    expect(document.querySelector('[data-persona-typing]')).toBeNull()
  })
})
