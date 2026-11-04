// @vitest-environment jsdom
// Composer a 200% (Muse, opção A): a barra de baixo quebra em 2 linhas abaixo de ~480 px da ÁREA DO COMPOSER (container query no CSS;
// o jsdom não calcula layout). Aqui fica provado o que o CSS precisa para quebrar certo: as ferramentas formam UM grupo, "Quem
// responde" forma OUTRO, o Enviar fica fora dos dois, e nada some (todos os controles continuam no DOM e no teclado).
import { cleanup, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ChannelComposer } from '../src/client/chat/ChannelComposer.tsx'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()

afterEach(() => {
  cleanup()
  localStorage.clear()
})

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

const MEMBERS: readonly ChannelPersonaMember[] = [
  { id: 'atlas', name: 'Atlas', role: 'Coordenação', state: 'resting', systemRoles: ['coordination'] },
  { id: 'luna', name: 'Luna', role: 'Vigia', state: 'resting' },
]

function mount(props: Partial<React.ComponentProps<typeof ChannelComposer>> = {}) {
  localStorage.setItem('persona.hint.whoResponds', '1')
  render(<ChannelComposer t={t as never} members={MEMBERS} onSend={vi.fn()} {...props} />)
  return {
    tools: document.querySelector('[data-persona-composer-tools]') as HTMLElement,
    responder: document.querySelector('[data-persona-composer-responder]') as HTMLElement,
    send: screen.getByRole('button', { name: chatPt['composer.send'] }),
  }
}

describe('barra do composer: os grupos que a quebra em 2 linhas usa', () => {
  it('as 5 ferramentas ficam num grupo só; "Quem responde" noutro; o Enviar fora dos dois', () => {
    const { tools, responder, send } = mount()
    expect(tools).toBeTruthy()
    expect(responder).toBeTruthy()
    expect(tools.querySelectorAll('button').length).toBe(5)
    expect(responder.querySelector('select')).toBeTruthy()
    expect(tools.contains(responder)).toBe(false)
    expect(tools.contains(send)).toBe(false)
    expect(responder.contains(send)).toBe(false)
  })

  it('ordem no DOM = ordem do teclado: ferramentas, depois Quem responde, depois Enviar', () => {
    const { tools, responder, send } = mount()
    const follows = (a: Node, b: Node): boolean => (a.compareDocumentPosition(b) & Node.DOCUMENT_POSITION_FOLLOWING) !== 0
    expect(follows(tools, responder)).toBe(true)
    expect(follows(responder, send)).toBe(true)
  })

  it('o Enviar e os grupos estão dentro do container da barra (é ele que mede a largura)', () => {
    const { tools, responder, send } = mount()
    const bar = tools.closest('[class*="toolbarBox"]') as HTMLElement | null
    expect(bar).toBeTruthy()
    expect(bar?.contains(responder)).toBe(true)
    expect(bar?.contains(send)).toBe(true)
  })

  it('sem ninguém para responder não há seletor: o grupo some, as ferramentas e o Enviar ficam', () => {
    localStorage.setItem('persona.hint.whoResponds', '1')
    render(<ChannelComposer t={t as never} members={[]} onSend={vi.fn()} />)
    expect(document.querySelector('[data-persona-composer-responder]')).toBeNull()
    expect(document.querySelector('[data-persona-composer-tools]')?.querySelectorAll('button').length).toBe(5)
    expect(screen.getByRole('button', { name: chatPt['composer.send'] })).toBeTruthy()
  })
})
