// @vitest-environment jsdom
// CV-9 atrás de flag (Muse, D-077): `persona.flag.bubbles`, desligada por padrão, no mesmo formato da navPlaces. Desligada, o fio é o de
// antes (nenhum balão, rosto 48, nome e hora em linha); ligada, os balões. Não vai num instalador sem o aceite da Muse.
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { MessageList } from '../src/client/chat/GeneralChannelView.tsx'
import { BUBBLES_FLAG_KEY, isBubblesEnabled } from '../src/client/chat/bubbles-flag.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
  vi.restoreAllMocks()
})

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

const msg = (id: string, authorId: string, timeLabel: string, body: string): ChannelMessageUi => ({
  id,
  authorId,
  authorName: authorId === 'user' ? 'Você' : 'Nina',
  body,
  timeLabel,
  reactions: [],
})

const THREAD = [
  msg('a', 'nina', '14:05', 'Achei 3 concorrentes.'),
  msg('b', 'nina', '14:06', 'Quer que eu atualize o cardápio?'),
  msg('c', 'user', '14:07', 'Pode atualizar.'),
]

describe('a flag', () => {
  it('desligada por padrão', () => {
    expect(isBubblesEnabled()).toBe(false)
  })

  it('liga por localStorage="1" e por window.__PERSONA_FLAGS__; "0" ou lixo não liga; storage bloqueado = desligada', () => {
    localStorage.setItem(BUBBLES_FLAG_KEY, '1')
    expect(isBubblesEnabled()).toBe(true)
    localStorage.setItem(BUBBLES_FLAG_KEY, '0')
    expect(isBubblesEnabled()).toBe(false)
    localStorage.setItem(BUBBLES_FLAG_KEY, 'sim')
    expect(isBubblesEnabled()).toBe(false)
    ;(window as unknown as { __PERSONA_FLAGS__: unknown }).__PERSONA_FLAGS__ = { bubbles: true }
    expect(isBubblesEnabled()).toBe(true)
    delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(isBubblesEnabled()).toBe(false)
  })

  it('a chave é a mesma regra da navPlaces: persona.flag.bubbles', () => {
    expect(BUBBLES_FLAG_KEY).toBe('persona.flag.bubbles')
  })
})

describe('flag DESLIGADA: o fio de antes', () => {
  it('nenhum balão, nenhuma folhinha, nenhuma linha "Você · hora"', () => {
    const { container } = render(<MessageList t={t as never} messages={THREAD} />)
    expect(container.querySelector('[data-persona-bubble]')).toBeNull()
    expect(container.querySelector('[data-persona-sprig]')).toBeNull()
    expect(screen.queryByText(/^Você ·/u)).toBeNull()
    expect(container.querySelector('[data-group]')).toBeNull()
  })

  it('o texto das mensagens continua no fio, com o nome e a hora em linha (como antes)', () => {
    const { container } = render(<MessageList t={t as never} messages={THREAD} />)
    expect(screen.getByText('Achei 3 concorrentes.')).toBeTruthy()
    expect(screen.getByText('Pode atualizar.')).toBeTruthy()
    // 1ª da Nina e a da pessoa levam nome + hora; a 2ª da Nina continua a anterior (só a hora ao passar o mouse)
    expect(container.querySelectorAll('time')).toHaveLength(3 + 0)
  })

  it('a pessoa também tem rosto (como antes): a lateral existe para todas as linhas', () => {
    const { container } = render(<MessageList t={t as never} messages={THREAD} />)
    const rows = [...container.querySelectorAll('[data-message-id]')]
    expect(rows).toHaveLength(3)
    for (const row of rows) expect(row.querySelector('[class*="gutter"]')).toBeTruthy()
  })

  it('o markdown das respostas da persona segue valendo (IV-3) e o da pessoa continua texto simples', () => {
    const { container } = render(<MessageList t={t as never} messages={[msg('a', 'nina', '14:05', 'Veja **isto**'), msg('b', 'user', '14:06', 'olha **aquilo**')]} />)
    expect(container.querySelectorAll('strong')).toHaveLength(1)
  })
})

describe('flag LIGADA: os balões', () => {
  beforeEach(() => { localStorage.setItem(BUBBLES_FLAG_KEY, '1') })

  it('o mesmo fio vira balões (2 da persona agrupados + 1 da pessoa)', () => {
    const { container } = render(<MessageList t={t as never} messages={THREAD} />)
    const bubbles = [...container.querySelectorAll('[data-persona-bubble]')]
    expect(bubbles.map(b => `${b.getAttribute('data-author')}:${b.getAttribute('data-position')}`)).toEqual(['persona:first', 'persona:last', 'user:single'])
    expect(screen.getByText(/^Você ·/u).textContent).toBe('Você · 14:07')
  })
})
