// @vitest-environment jsdom
// Luz da luminária no chat (NIGHT-THEME-SPEC §5, aprovada pelo Miguel): só no escuro, atrás de `persona.flag.lampLight` + balões; uma
// camada de fundo `aria-hidden`; `--lit` por layout (nunca no scroll). O jsdom não pinta gradiente nem calcula cor: aqui ficam
// provados a flag, a conta do `--lit`, a camada e que nada existe sem as duas flags. A cor e o contraste, na captura por pixel.
import { act, cleanup, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import { GeneralChannelView } from '../src/client/chat/GeneralChannelView.tsx'
import { BUBBLES_FLAG_KEY } from '../src/client/chat/bubbles-flag.ts'
import {
  LAMP_LIGHT_FLAG_KEY,
  isLampLightEnabled,
  isLampLightFlagOn,
  lampPosition,
  litFor,
  useLampLight,
} from '../src/client/chat/lamp-light.ts'
import { installPreviewTheme } from '../src/client/preview/install-preview-theme.ts'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { pt as shellPt } from '../src/client/locale/shell/locales.ts'

installPreviewTheme()
HTMLElement.prototype.scrollTo = () => {}

beforeEach(() => { localStorage.clear() })
afterEach(() => {
  cleanup()
  localStorage.clear()
  delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

const t = (key: string, params?: Readonly<Record<string, string | number>>) => {
  const raw = chatPt[key as keyof typeof chatPt] ?? key
  return params === undefined ? raw : raw.replace(/\{(\w+)\}/gu, (_m, name: string) => String(params[name] ?? ''))
}
const shellT = (key: string) => shellPt[key as keyof typeof shellPt] ?? key

describe('as flags', () => {
  it('desligada por padrão', () => {
    expect(isLampLightFlagOn()).toBe(false)
    expect(isLampLightEnabled()).toBe(false)
  })

  it('persona.flag.lampLight: liga por localStorage="1" e por window.__PERSONA_FLAGS__; "0" ou lixo não; storage bloqueado = desligada', () => {
    expect(LAMP_LIGHT_FLAG_KEY).toBe('persona.flag.lampLight')
    localStorage.setItem(LAMP_LIGHT_FLAG_KEY, '1')
    expect(isLampLightFlagOn()).toBe(true)
    localStorage.setItem(LAMP_LIGHT_FLAG_KEY, '0')
    expect(isLampLightFlagOn()).toBe(false)
    localStorage.setItem(LAMP_LIGHT_FLAG_KEY, 'sim')
    expect(isLampLightFlagOn()).toBe(false)
    ;(window as unknown as { __PERSONA_FLAGS__: unknown }).__PERSONA_FLAGS__ = { lampLight: true }
    expect(isLampLightFlagOn()).toBe(true)
    delete (window as unknown as { __PERSONA_FLAGS__?: unknown }).__PERSONA_FLAGS__
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('blocked') })
    expect(isLampLightFlagOn()).toBe(false)
  })

  it('a luz SÓ existe com os balões ligados (a flag da luz sozinha nunca muda nada)', () => {
    localStorage.setItem(LAMP_LIGHT_FLAG_KEY, '1')
    expect(isLampLightEnabled()).toBe(false)
    localStorage.setItem(BUBBLES_FLAG_KEY, '1')
    expect(isLampLightEnabled()).toBe(true)
    localStorage.removeItem(LAMP_LIGHT_FLAG_KEY)
    expect(isLampLightEnabled()).toBe(false)
  })
})

describe('litFor: o quanto um elemento está perto da luz', () => {
  const box = { left: 300, top: 0, width: 1000, height: 800 }

  it('a luminária fica 110 px à esquerda do chat, a 93% da altura', () => {
    expect(lampPosition(box)).toEqual({ x: 190, y: 744 })
  })

  it('colado na luz: perto de 1; no canto oposto: 0', () => {
    expect(litFor(box, { left: 190 - 80, top: 744 - 20, width: 160, height: 40 })).toBeGreaterThan(0.95)
    expect(litFor(box, { left: 1200, top: 0, width: 100, height: 40 })).toBe(0)
  })

  it('perto > longe, sempre entre 0 e 1', () => {
    const near = litFor(box, { left: 320, top: 600, width: 300, height: 50 })
    const far = litFor(box, { left: 900, top: 100, width: 300, height: 50 })
    expect(near).toBeGreaterThan(far)
    for (const value of [near, far]) {
      expect(value).toBeGreaterThanOrEqual(0)
      expect(value).toBeLessThanOrEqual(1)
    }
  })

  it('um balão largo conta pela ponta que olha para a luz (até 160 px de largura), não pelo meio', () => {
    const wide = litFor(box, { left: 320, top: 700, width: 800, height: 60 })
    const narrow = litFor(box, { left: 320, top: 700, width: 160, height: 60 })
    expect(wide).toBe(narrow)
  })

  it('chat sem tamanho (ainda não mediu): 0, nunca NaN', () => {
    expect(litFor({ left: 0, top: 0, width: 0, height: 0 }, { left: 0, top: 0, width: 10, height: 10 })).toBe(0)
  })
})

describe('useLampLight', () => {
  function Harness({ on, count = 1 }: { readonly on: boolean; readonly count?: number }) {
    const ref = useLampLight<HTMLDivElement>(on, count)
    return (
      <div ref={ref} data-testid="root">
        <div data-lit="" data-testid="near" />
        <div data-lit="" data-testid="far" />
      </div>
    )
  }

  function mockRects(): void {
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mocked(this: HTMLElement) {
      const rect = (left: number, top: number, width: number, height: number): DOMRect => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) })
      const id = this.getAttribute('data-testid')
      if (id === 'root') return rect(300, 0, 1000, 800)
      if (id === 'near') return rect(320, 700, 160, 40)
      if (id === 'far') return rect(1100, 20, 160, 40)
      return rect(0, 0, 0, 0)
    })
  }

  it('ligado: põe --lit em cada [data-lit], mais alto perto da luz', () => {
    mockRects()
    render(<Harness on />)
    const near = Number(screen.getByTestId('near').style.getPropertyValue('--lit'))
    const far = Number(screen.getByTestId('far').style.getPropertyValue('--lit'))
    expect(near).toBeGreaterThan(far)
    expect(near).toBeGreaterThan(0)
  })

  it('desligado: não põe nada e não observa nada', () => {
    mockRects()
    const observe = vi.fn()
    vi.stubGlobal('ResizeObserver', class { observe = observe; disconnect = vi.fn() })
    render(<Harness on={false} />)
    expect(screen.getByTestId('near').style.getPropertyValue('--lit')).toBe('')
    expect(observe).not.toHaveBeenCalled()
  })

  it('recalcula no resize da janela e quando o conteúdo muda; solta tudo ao sair', () => {
    mockRects()
    const callbacks: (() => void)[] = []
    const disconnect = vi.fn()
    vi.stubGlobal('ResizeObserver', class { constructor(cb: () => void) { callbacks.push(cb) } observe = vi.fn(); disconnect = disconnect })
    const view = render(<Harness on />)
    const first = screen.getByTestId('near').style.getPropertyValue('--lit')
    expect(first).not.toBe('')
    // o chat muda de tamanho: o ResizeObserver chama de novo
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(function mocked(this: HTMLElement) {
      const rect = (left: number, top: number, width: number, height: number): DOMRect => ({ left, top, width, height, right: left + width, bottom: top + height, x: left, y: top, toJSON: () => ({}) })
      return this.getAttribute('data-testid') === 'root' ? rect(300, 0, 600, 400) : rect(320, 300, 160, 40)
    })
    act(() => { callbacks.forEach((cb) => { cb() }) })
    expect(screen.getByTestId('near').style.getPropertyValue('--lit')).not.toBe(first)
    // mensagem nova (contentKey muda): recalcula sem esperar o resize
    view.rerender(<Harness on count={2} />)
    expect(disconnect).toHaveBeenCalled() // o efeito antigo soltou o observador
    view.unmount()
    expect(disconnect.mock.calls.length).toBeGreaterThanOrEqual(2)
  })

  it('sem ResizeObserver (ambiente antigo) só usa o resize da janela, sem lançar', () => {
    mockRects()
    vi.stubGlobal('ResizeObserver', undefined)
    expect(() => { render(<Harness on />) }).not.toThrow()
  })
})

describe('no fio: a camada de luz', () => {
  const MEMBER = { id: 'bento' as const, name: 'Bento', role: 'Engenharia', state: 'waiting' as const }
  const message = { id: 'm1', authorId: 'bento', authorName: 'Bento', body: 'Oi.', timeLabel: '10:00', reactions: [] }

  function channel() {
    return render(<GeneralChannelView t={t as never} shellT={shellT} members={[MEMBER]} messages={[message]} memberId="owner" />)
  }

  it('flags desligadas: nenhuma camada e nenhum data-lamp (o fio de hoje)', () => {
    const { container } = channel()
    expect(container.querySelector('[data-lamp]')).toBeNull()
    expect(container.querySelector('[class*="lampLayer"]')).toBeNull()
  })

  it('só a luz (sem balões): nada', () => {
    localStorage.setItem(LAMP_LIGHT_FLAG_KEY, '1')
    const { container } = channel()
    expect(container.querySelector('[data-lamp]')).toBeNull()
    expect(container.querySelector('[class*="lampLayer"]')).toBeNull()
  })

  it('só os balões (sem a luz): balões com data-lit mas sem camada', () => {
    localStorage.setItem(BUBBLES_FLAG_KEY, '1')
    const { container } = channel()
    expect(container.querySelector('[data-lamp]')).toBeNull()
    expect(container.querySelector('[class*="lampLayer"]')).toBeNull()
    expect(container.querySelector('[data-persona-bubble][data-lit]')).toBeTruthy()
  })

  it('balões + luz: a camada aria-hidden é a primeira do contêiner; balões e composer são data-lit', () => {
    localStorage.setItem(BUBBLES_FLAG_KEY, '1')
    localStorage.setItem(LAMP_LIGHT_FLAG_KEY, '1')
    const { container } = channel()
    const view = container.querySelector('[data-lamp]') as HTMLElement
    expect(view).toBeTruthy()
    const layer = view.firstElementChild as HTMLElement
    expect(layer.className).toContain('lampLayer')
    expect(layer.getAttribute('aria-hidden')).toBe('true')
    expect(layer.textContent).toBe('')
    expect(view.querySelector('[data-persona-bubble][data-lit]')).toBeTruthy()
    expect(view.querySelector('[data-persona-area="composer"][data-lit]')).toBeTruthy()
  })
})

describe('na DM: a mesma camada', () => {
  const dm = { id: 'd1', peerId: 'nina', peerName: 'Nina', role: 'Pesquisa' }

  function thread() {
    return render(
      <DirectMessagesView
        t={t as never}
        shellT={shellT as never}
        loading={false}
        dms={[dm]}
        selectedId="d1"
        messages={[{ id: 'm1', authorId: 'nina', authorName: 'Nina', body: 'Oi.', timeLabel: '10:00', reactions: [] }]}
        onSelect={() => {}}
        onSend={() => {}}
      />,
    )
  }

  it('sem as duas flags: nada', () => {
    const { container } = thread()
    expect(container.querySelector('[data-lamp]')).toBeNull()
  })

  it('com as duas: a camada fica no painel da conversa (atrás do fio e do composer)', () => {
    localStorage.setItem(BUBBLES_FLAG_KEY, '1')
    localStorage.setItem(LAMP_LIGHT_FLAG_KEY, '1')
    const { container } = thread()
    const pane = container.querySelector('[data-lamp]') as HTMLElement
    expect(pane).toBeTruthy()
    expect(pane.tagName).toBe('SECTION')
    expect((pane.firstElementChild as HTMLElement).className).toContain('lampLayer')
    expect(pane.querySelector('[data-persona-bubble][data-lit]')).toBeTruthy()
  })
})
