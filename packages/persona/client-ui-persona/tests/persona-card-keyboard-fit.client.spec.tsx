// @vitest-environment jsdom
// Muse S6 (4) e (5): o cartão da persona nunca passa do rodapé e o Esc fecha de onde estiver o foco.
import type { ReactNode } from 'react'
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { PersonaCardPopover, usePersonaCardController } from '../src/client/primitives/index.ts'
import { PersonaInfoCard, type PersonaCardInfo } from '../src/client/profile/PersonaInfoCard.tsx'

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

const NINA: PersonaCardInfo = {
  personaId: 'nina',
  name: 'Nina',
  handle: '@nina',
  role: 'Pesquisa',
  sector: 'Produto',
  characterId: 'nina',
  systemRoles: [],
  nowKind: 'quota',
  nowText: 'Esperando o plano do Claude renovar',
  presence: 'online',
  talk: { everyone: true, names: [] },
  ownerName: 'Ana',
  engineLabel: 'Plano do Claude · Sonnet',
  quota: { fiveHourPct: 100, weekPct: 17, limitedUntil: '18:30' },
}

function Harness(): ReactNode {
  const card = usePersonaCardController()
  return (
    <>
      <button type="button" {...card.triggerProps('nina')}>Nina</button>
      <input aria-label="Outro campo" />
      <PersonaCardPopover {...card.popoverProps} label="Cartão de Nina">
        <PersonaInfoCard info={NINA} onSendMessage={() => undefined} />
      </PersonaCardPopover>
    </>
  )
}

describe('Esc fecha o cartão da persona', () => {
  it('aberto por clique: Esc com o foco no campo de mensagem do cartão', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Nina' }))
    const field = screen.getByRole('textbox', { name: 'Mensagem para Nina' })
    field.focus()
    fireEvent.keyDown(field, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('aberto por passar o mouse (sem foco dentro): Esc no corpo da página fecha', () => {
    vi.useFakeTimers()
    render(<Harness />)
    fireEvent.pointerEnter(screen.getByRole('button', { name: 'Nina' }))
    act(() => { vi.advanceTimersByTime(800) })
    expect(screen.getByRole('dialog', { name: 'Cartão de Nina' })).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('aberto por clique e o foco foi para outro campo: Esc no documento ainda fecha', () => {
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Nina' }))
    // o clique fora do cartão fecharia; aqui só o foco sai (teclado), o cartão segue aberto
    const other = screen.getByRole('textbox', { name: 'Outro campo' })
    other.focus()
    fireEvent.keyDown(other, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('depois do Esc o hover não reabre o cartão com o mouse parado; ao mexer o mouse ele volta', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Nina' })
    fireEvent.pointerEnter(trigger)
    act(() => { vi.advanceTimersByTime(800) })
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.keyDown(document.body, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).toBeNull()
    // o navegador dispara pointerenter sozinho quando o cartão some debaixo do ponteiro parado
    fireEvent.pointerLeave(trigger)
    fireEvent.pointerEnter(trigger)
    act(() => { vi.advanceTimersByTime(900) })
    expect(screen.queryByRole('dialog')).toBeNull()
    // o mouse se mexe de verdade: o hover volta
    act(() => {
      const move = new MouseEvent('pointermove', { bubbles: true })
      Object.defineProperty(move, 'movementX', { value: 6 })
      Object.defineProperty(move, 'movementY', { value: 2 })
      document.dispatchEvent(move)
    })
    fireEvent.pointerLeave(trigger)
    fireEvent.pointerEnter(trigger)
    act(() => { vi.advanceTimersByTime(800) })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('o Esc devolve o foco ao avatar que abriu o cartão', () => {
    render(<Harness />)
    const trigger = screen.getByRole('button', { name: 'Nina' })
    fireEvent.click(trigger)
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    expect(document.activeElement).toBe(trigger)
  })
})

describe('o cartão cabe na janela', () => {
  let resize: (() => void) | undefined
  beforeEach(() => {
    class FakeResizeObserver {
      constructor(callback: () => void) { resize = callback }
      observe(): void {}
      disconnect(): void {}
    }
    vi.stubGlobal('ResizeObserver', FakeResizeObserver)
  })

  it('remede quando o conteúdo cresce depois de abrir e mantém o rodapé dentro da janela', () => {
    let height = 300
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => 344)
    vi.stubGlobal('innerHeight', 900)
    vi.stubGlobal('innerWidth', 1440)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      top: 700, bottom: 740, left: 100, right: 140, width: 40, height: 40, x: 100, y: 700, toJSON: () => ({}),
    }))
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Nina' }))
    const dialog = screen.getByRole('dialog')
    const bottomOf = (): number => Number.parseFloat(dialog.style.top) + height
    expect(bottomOf()).toBeLessThanOrEqual(900 - 8)
    height = 520 // o cartão cresce quando chegam os dados
    act(() => { resize?.() })
    expect(bottomOf()).toBeLessThanOrEqual(900 - 8)
  })

  /** Abre o cartão de um rosto na posição dada (a janela é 1440×900, o cartão mede `height` × 344) e devolve o topo e o fundo do popover. */
  function openAt(face: { readonly top: number; readonly bottom: number }, height: number): { readonly top: number; readonly bottom: number } {
    vi.spyOn(HTMLElement.prototype, 'offsetHeight', 'get').mockImplementation(() => height)
    vi.spyOn(HTMLElement.prototype, 'offsetWidth', 'get').mockImplementation(() => 344)
    vi.stubGlobal('innerHeight', 900)
    vi.stubGlobal('innerWidth', 1440)
    vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(() => ({
      top: face.top, bottom: face.bottom, left: 100, right: 140, width: 40, height: face.bottom - face.top, x: 100, y: face.top, toJSON: () => ({}),
    }))
    render(<Harness />)
    fireEvent.click(screen.getByRole('button', { name: 'Nina' }))
    const top = Number.parseFloat(screen.getByRole('dialog').style.top)
    return { top, bottom: top + height }
  }

  it('com espaço abaixo do rosto, o cartão abre PARA BAIXO: começa 24 px acima do rosto', () => {
    const box = openAt({ top: 100, bottom: 140 }, 500)
    expect(box.top).toBe(76)
    expect(box.bottom).toBeLessThanOrEqual(900 - 8)
  })

  it('sem espaço abaixo do rosto, o cartão abre PARA CIMA: termina 24 px abaixo do rosto e nunca passa do fundo', () => {
    const box = openAt({ top: 700, bottom: 740 }, 520)
    expect(box.bottom).toBe(764)
    expect(box.top).toBe(244)
    expect(box.bottom).toBeLessThanOrEqual(900 - 8)
  })

  it('um cartão da altura da janela (janela − 16 px) cobre de 8 px do topo a 8 px do fundo, qualquer que seja o rosto', () => {
    for (const face of [{ top: 100, bottom: 140 }, { top: 450, bottom: 490 }, { top: 820, bottom: 860 }]) {
      cleanup()
      vi.restoreAllMocks()
      const box = openAt(face, 900 - 16)
      expect(box.top).toBe(8)
      expect(box.bottom).toBe(900 - 8)
    }
  })

  it('o topo nunca fica acima da janela, nem com um rosto colado no alto e o cartão para cima', () => {
    const box = openAt({ top: 10, bottom: 50 }, 880)
    expect(box.top).toBeGreaterThanOrEqual(8)
    expect(box.bottom).toBeLessThanOrEqual(900 - 8)
  })
})

// CV-4 (CONVERSAS-SPEC §5): clicar no rosto abre a DM; o cartão vem por hover longo (~700 ms), ⋯ ou Shift+F10.
function FaceHarness({ onOpenDm }: { onOpenDm: () => void }): ReactNode {
  const card = usePersonaCardController()
  const face = card.faceProps('nina', onOpenDm)
  return (
    <>
      <button type="button" {...face}>Nina</button>
      <button type="button" aria-label="Sobre Nina" {...card.menuProps('nina')}>⋯</button>
      <PersonaCardPopover {...card.popoverProps} label="Cartão de Nina">
        <PersonaInfoCard info={NINA} />
      </PersonaCardPopover>
    </>
  )
}

describe('rosto: clique = DM, cartão por hover longo / ⋯ / Shift+F10', () => {
  it('clicar (ou Enter) no rosto abre a DM e NÃO abre o cartão', () => {
    const onOpenDm = vi.fn()
    render(<FaceHarness onOpenDm={onOpenDm} />)
    fireEvent.click(screen.getByRole('button', { name: 'Nina' }))
    expect(onOpenDm).toHaveBeenCalledTimes(1)
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('hover longo (~700 ms) abre o cartão; passar de leve pelo rosto não abre', () => {
    vi.useFakeTimers()
    render(<FaceHarness onOpenDm={() => undefined} />)
    const face = screen.getByRole('button', { name: 'Nina' })
    fireEvent.pointerEnter(face)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.queryByRole('dialog')).toBeNull()
    fireEvent.pointerLeave(face)
    act(() => { vi.advanceTimersByTime(500) })
    expect(screen.queryByRole('dialog')).toBeNull() // saiu antes dos 700 ms: nunca abriu no caminho do mouse
    fireEvent.pointerEnter(face)
    act(() => { vi.advanceTimersByTime(800) })
    expect(screen.getByRole('dialog', { name: 'Cartão de Nina' })).toBeTruthy()
  })

  it('clicar no rosto com o cartão aberto por hover fecha o cartão e abre a DM', () => {
    vi.useFakeTimers()
    const onOpenDm = vi.fn()
    render(<FaceHarness onOpenDm={onOpenDm} />)
    const face = screen.getByRole('button', { name: 'Nina' })
    fireEvent.pointerEnter(face)
    act(() => { vi.advanceTimersByTime(800) })
    expect(screen.getByRole('dialog')).toBeTruthy()
    fireEvent.click(face)
    expect(screen.queryByRole('dialog')).toBeNull()
    expect(onOpenDm).toHaveBeenCalledTimes(1)
  })

  it('Shift+F10 e a tecla de menu no rosto abrem o cartão com o foco dentro (sem abrir a DM)', () => {
    const onOpenDm = vi.fn()
    render(<FaceHarness onOpenDm={onOpenDm} />)
    const face = screen.getByRole('button', { name: 'Nina' })
    expect(face.getAttribute('aria-keyshortcuts')).toBe('Shift+F10')
    fireEvent.keyDown(face, { key: 'F10', shiftKey: true })
    expect(screen.getByRole('dialog', { name: 'Cartão de Nina' })).toBeTruthy()
    expect(onOpenDm).not.toHaveBeenCalled()
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' })
    fireEvent.keyDown(face, { key: 'ContextMenu' })
    expect(screen.getByRole('dialog')).toBeTruthy()
  })

  it('⋯ abre o cartão e traz data-persona-card-trigger (gancho estável para gates e capturas)', () => {
    const { container } = render(<FaceHarness onOpenDm={() => undefined} />)
    const more = screen.getByRole('button', { name: 'Sobre Nina' })
    expect(more.getAttribute('data-persona-card-trigger')).toBe('nina')
    expect(container.querySelectorAll('[data-persona-card-trigger]')).toHaveLength(1)
    fireEvent.click(more)
    expect(screen.getByRole('dialog', { name: 'Cartão de Nina' })).toBeTruthy()
    expect(more.getAttribute('aria-expanded')).toBe('true')
  })
})
