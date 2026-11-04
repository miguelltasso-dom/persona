// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { Tooltip } from '../src/client/primitives/Overlays.tsx'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('Tooltip (UX-BEYOND P0: shortcuts taught where they are used)', () => {
  it('shows the shortcut as key chips, describes the control and closes on Esc', () => {
    vi.useFakeTimers()
    render(<Tooltip content="Buscar em tudo" shortcut={['Ctrl', 'K']}><button type="button">Buscar</button></Tooltip>)
    const button = screen.getByRole('button', { name: 'Buscar' })
    fireEvent.focus(button)
    act(() => { vi.advanceTimersByTime(450) })
    const tip = screen.getByRole('tooltip')
    expect(tip.textContent).toBe('Buscar em tudoCtrlK')
    expect([...tip.querySelectorAll('kbd')].map(k => k.textContent)).toEqual(['Ctrl', 'K'])
    expect(button.closest('[aria-describedby]')?.getAttribute('aria-describedby')).toBe(tip.id)
    fireEvent.keyDown(button, { key: 'Escape' })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  it('disabled: never opens (and closes one that is already open), without remounting the child', () => {
    vi.useFakeTimers()
    const view = render(<Tooltip content="Dica"><button type="button">Alvo</button></Tooltip>)
    const button = screen.getByRole('button', { name: 'Alvo' })
    fireEvent.focus(button)
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.getByRole('tooltip')).toBeTruthy()
    view.rerender(<Tooltip content="Dica" disabled><button type="button">Alvo</button></Tooltip>)
    expect(screen.queryByRole('tooltip')).toBeNull()
    expect(screen.getByRole('button', { name: 'Alvo' })).toBe(button)
    fireEvent.blur(button)
    fireEvent.focus(button)
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.queryByRole('tooltip')).toBeNull()
  })

  describe('clamp: never past the window edge (Muse, A-5)', () => {
    const realRect = Element.prototype.getBoundingClientRect
    afterEach(() => { Element.prototype.getBoundingClientRect = realRect })

    /** Faz o tooltip "nascer" nesta posição natural (o jsdom não tem layout); o deslocamento aplicado entra na conta como no navegador. */
    function placeTooltipAt(left: number, width: number): void {
      Element.prototype.getBoundingClientRect = function mocked(this: Element): DOMRect {
        if (this.getAttribute('role') !== 'tooltip') return realRect.call(this)
        const shift = Number.parseFloat((this as HTMLElement).style.getPropertyValue('--tooltip-shift') || '0')
        return { left: left + shift, right: left + shift + width, top: 0, bottom: 20, width, height: 20, x: left + shift, y: 0, toJSON: () => ({}) }
      }
    }
    const open = (): HTMLElement => {
      vi.useFakeTimers()
      render(<Tooltip content="A cota oficial do Claude ainda não está disponível."><button type="button">Alvo</button></Tooltip>)
      fireEvent.focus(screen.getByRole('button'))
      act(() => { vi.advanceTimersByTime(450) })
      return screen.getByRole('tooltip')
    }

    it('past the left edge: shifts right just enough to leave the margin', () => {
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 960 })
      placeTooltipAt(-60, 200)
      expect(open().style.getPropertyValue('--tooltip-shift')).toBe('68px')
    })

    it('past the right edge: shifts left', () => {
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 960 })
      placeTooltipAt(800, 200)
      expect(open().style.getPropertyValue('--tooltip-shift')).toBe('-48px')
    })

    it('inside the window: no shift at all', () => {
      Object.defineProperty(document.documentElement, 'clientWidth', { configurable: true, value: 960 })
      placeTooltipAt(300, 200)
      expect(open().style.getPropertyValue('--tooltip-shift')).toBe('')
    })
  })

  it('without a shortcut renders no key chips', () => {
    vi.useFakeTimers()
    render(<Tooltip content="Sem atalho"><button type="button">Ação</button></Tooltip>)
    fireEvent.focus(screen.getByRole('button'))
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.getByRole('tooltip').querySelectorAll('kbd')).toHaveLength(0)
  })
})
