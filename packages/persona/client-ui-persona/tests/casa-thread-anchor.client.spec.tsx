// @vitest-environment jsdom
// Casa da Equipe, microdetalhe 11 (COLHEITA-MUSE §29b, atrás de `persona.flag.channelSections`): cada canal lembra ONDE a pessoa estava e o fio volta
// exatamente ali, sem animação; quem estava no fim abre no fim. Com a flag desligada o fio é o de sempre.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { THREAD_ANCHORS_KEY, clearThreadAnchorSession, readThreadAnchor, rememberThreadAnchor } from '../src/client/chat/thread-anchor.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'
import type { ChannelMessageUi } from '../src/client/remote/map-host-ui.ts'
import { CHANNEL_SECTIONS_FLAG_KEY } from '../src/client/shell/channel-sections-flag.ts'
import type { ChannelPersonaMember } from '../src/client/team/persona-work-state.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = function scrollTo(this: HTMLElement, options?: ScrollToOptions | number): void {
  if (typeof options === 'object' && options.top !== undefined) this.scrollTop = options.top
}

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}

const MEMBERS: ChannelPersonaMember[] = [{ id: 'nina', name: 'Nina', role: 'Vendas', state: 'resting' }]
const message = (id: string): ChannelMessageUi =>
  ({ id, authorId: 'nina', authorName: 'Nina', body: `texto ${id}`, timeLabel: '09:00', reactions: [] })
const MESSAGES = ['m1', 'm2', 'm3', 'm4', 'm5'].map(message)

// A geometria que o jsdom não tem: o contêiner do fio tem topo 0 e 400 px de altura, 3000 de conteúdo; cada mensagem mora a 600 px × posição.
const POSITIONS: Record<string, number> = { m1: 0, m2: 600, m3: 1200, m4: 1800, m5: 2400 }
const original = Element.prototype.getBoundingClientRect

beforeEach(() => {
  localStorage.clear()
  localStorage.setItem('persona.hint.whoResponds', '1')
  clearThreadAnchorSession()
  Element.prototype.getBoundingClientRect = function rect(this: Element): DOMRect {
    const id = (this as HTMLElement).dataset?.messageId
    const isScroller = this.getAttribute('role') === 'region'
    const top = isScroller ? 0 : id === undefined ? 0 : (POSITIONS[id] ?? 0) - scroller().scrollTop
    const height = isScroller ? 400 : 80
    return { top, bottom: top + height, left: 0, right: 300, width: 300, height, x: 0, y: top, toJSON: () => ({}) }
  }
  Object.defineProperty(HTMLElement.prototype, 'scrollHeight', { configurable: true, get: () => 3000 })
  Object.defineProperty(HTMLElement.prototype, 'clientHeight', { configurable: true, get: () => 400 })
})
afterEach(() => {
  cleanup()
  Element.prototype.getBoundingClientRect = original
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).scrollHeight
  delete (HTMLElement.prototype as unknown as Record<string, unknown>).clientHeight
  localStorage.clear()
})

function thread(conversationKey: string, messages: readonly ChannelMessageUi[] = MESSAGES, loading = false) {
  return render(
    <GeneralChannelView t={t as never} shellT={key => shellPt[key as keyof typeof shellPt] ?? key} members={MEMBERS} messages={messages}
      conversationKey={conversationKey} loading={loading} />,
  )
}
const scroller = (): HTMLElement => screen.getByRole('region', { name: chatPt['header.channelGeneral'] })
const nextFrame = async (): Promise<void> => { await act(async () => { await new Promise<void>(resolve => requestAnimationFrame(() => { resolve() })) }) }

describe('o fio volta onde a pessoa estava', () => {
  it('com âncora guardada para o canal, o fio abre exatamente nela (sem animação)', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    rememberThreadAnchor('channel:vendas', 'm3')
    thread('channel:vendas')
    expect(scroller().scrollTop).toBe(1200)
  })

  it('sem âncora (quem estava no fim), o fio abre no fim', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    thread('channel:vendas')
    expect(scroller().scrollTop).toBe(3000)
  })

  it('a âncora é de cada canal: o outro canal tem a sua', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    rememberThreadAnchor('channel:vendas', 'm3')
    rememberThreadAnchor('channel:pedidos', 'm2')
    thread('channel:pedidos')
    expect(scroller().scrollTop).toBe(600)
  })

  it('uma âncora que não está mais no fio carregado cai no fim', () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    rememberThreadAnchor('channel:vendas', 'm-sumiu')
    thread('channel:vendas')
    expect(scroller().scrollTop).toBe(3000)
  })

  it('enquanto o canal carrega nada é restaurado nem guardado', async () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    rememberThreadAnchor('channel:vendas', 'm3')
    thread('channel:vendas', [], true)
    scroller().dispatchEvent(new Event('scroll'))
    await nextFrame()
    expect(readThreadAnchor('channel:vendas')).toBe('m3')
  })

  it('ao ler no meio, a âncora passa a ser a 1ª mensagem que aparece no alto; ao voltar ao fim, ela some', async () => {
    localStorage.setItem(CHANNEL_SECTIONS_FLAG_KEY, '1')
    thread('channel:vendas')
    scroller().scrollTop = 1300 // m3 (1200..1280) já saiu pelo alto; a 1ª que ainda aparece é m4
    scroller().dispatchEvent(new Event('scroll'))
    await nextFrame()
    expect(readThreadAnchor('channel:vendas')).toBe('m4')
    scroller().scrollTop = 2700 // perto do fim (3000 − 2700 − 400 < 240)
    scroller().dispatchEvent(new Event('scroll'))
    await nextFrame()
    expect(readThreadAnchor('channel:vendas')).toBeUndefined()
    expect(localStorage.getItem(THREAD_ANCHORS_KEY)).toBe('{}')
  })

  it('com a flag desligada o fio é o de sempre: nada é restaurado e nada é guardado', async () => {
    rememberThreadAnchor('channel:vendas', 'm3')
    thread('channel:vendas')
    expect(scroller().scrollTop).toBe(0)
    scroller().scrollTop = 1300
    scroller().dispatchEvent(new Event('scroll'))
    await nextFrame()
    expect(readThreadAnchor('channel:vendas')).toBe('m3')
  })
})
