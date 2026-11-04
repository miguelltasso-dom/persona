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

  it('without a shortcut renders no key chips', () => {
    vi.useFakeTimers()
    render(<Tooltip content="Sem atalho"><button type="button">Ação</button></Tooltip>)
    fireEvent.focus(screen.getByRole('button'))
    act(() => { vi.advanceTimersByTime(450) })
    expect(screen.getByRole('tooltip').querySelectorAll('kbd')).toHaveLength(0)
  })
})
