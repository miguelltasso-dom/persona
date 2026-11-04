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
    act(() => { vi.advanceTimersByTime(600) })
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
    act(() => { vi.advanceTimersByTime(600) })
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
    act(() => { vi.advanceTimersByTime(600) })
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
    expect(bottomOf()).toBeLessThanOrEqual(900 - 12)
    height = 520 // o cartão cresce quando chegam os dados
    act(() => { resize?.() })
    expect(bottomOf()).toBeLessThanOrEqual(900 - 12)
  })
})
