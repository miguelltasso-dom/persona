// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ApprovedStamp, MilestoneCard, usePawCelebration } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup(); vi.useRealTimers() })

function Harness(): React.ReactNode {
  const { node, celebrate } = usePawCelebration()
  return (
    <div style={{ position: 'relative' }}>
      <button type="button" onClick={celebrate}>Aprovar</button>
      <div data-testid="burst">{node}</div>
    </div>
  )
}

describe('peak-end celebration', () => {
  it('paw burst plays once and is throttled (no noise on repeated approvals)', () => {
    vi.useFakeTimers()
    render(<Harness />)
    const burstHost = screen.getByTestId('burst')
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(burstHost.children.length).toBe(1)
    act(() => { vi.advanceTimersByTime(1200) })
    expect(burstHost.children.length).toBe(0)
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(burstHost.children.length).toBe(0)
    act(() => { vi.advanceTimersByTime(3000) })
    fireEvent.click(screen.getByRole('button', { name: 'Aprovar' }))
    expect(burstHost.children.length).toBe(1)
  })

  it('milestone card renders big numbers and who did what', () => {
    render(
      <MilestoneCard
        title="Sprint 3 concluída"
        stats={[{ label: 'Entregues', value: 8, tone: 'success' }, { label: 'Atrasadas', value: 1, tone: 'warning' }]}
        contributorsLabel="Quem fez o quê"
        contributors={[{ name: 'Nina', characterId: 'nina', count: 3 }]}
      />,
    )
    expect(screen.getByRole('heading', { name: 'Sprint 3 concluída' })).toBeTruthy()
    expect(screen.getByText('Entregues')).toBeTruthy()
    expect(screen.getByText('Nina')).toBeTruthy()
  })
})

describe('ApprovedStamp', () => {
  it('is one labelled image that animates only at the moment of approval', () => {
    const { rerender } = render(<ApprovedStamp label="Aprovado" />)
    const stamp = screen.getByRole('img', { name: 'Aprovado' })
    expect(stamp.hasAttribute('data-animate')).toBe(true)
    rerender(<ApprovedStamp label="Aprovado" animate={false} />)
    expect(screen.getByRole('img', { name: 'Aprovado' }).hasAttribute('data-animate')).toBe(false)
  })
})
