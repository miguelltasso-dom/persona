// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ActionReplay, PersonaCursor, arcPath, cursorAt, minJerk, moveDuration, totalMoveMs } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

describe('cursor motion (COMPUTER-USE-SPEC §4)', () => {
  it('minimum jerk is 0→1, symmetric, slow at both ends', () => {
    expect(minJerk(0)).toBe(0)
    expect(minJerk(1)).toBe(1)
    expect(minJerk(0.5)).toBeCloseTo(0.5, 6)
    expect(minJerk(0.1)).toBeLessThan(0.1)
  })

  it('arcs bend to alternating sides within the curvature envelope', () => {
    const a = arcPath({ x: 0, y: 0 }, { x: 400, y: 0 }, 0)
    const b = arcPath({ x: 0, y: 0 }, { x: 400, y: 0 }, 1)
    expect(Math.sign(a.p1.y)).toBe(-Math.sign(b.p1.y))
    expect(Math.abs(a.p1.y)).toBeLessThanOrEqual(120)
    expect(Math.abs(arcPath({ x: 0, y: 0 }, { x: 2000, y: 0 }, 0).p1.y)).toBe(120)
  })

  it('duration is Fitts-like and capped; long moves overshoot then land exactly', () => {
    expect(moveDuration(0)).toBe(220)
    expect(moveDuration(100_000)).toBe(900)
    const from = { x: 0, y: 0 }
    const to = { x: 800, y: 0 }
    expect(cursorAt(from, to, 0, totalMoveMs(from, to)).point).toEqual(to)
    expect(cursorAt(from, to, 0, totalMoveMs(from, to)).done).toBe(true)
    const nearEnd = cursorAt(from, to, 0, moveDuration(808) - 1).point
    expect(nearEnd.x).toBeGreaterThan(800)
  })
})

describe('PersonaCursor / ActionReplay (W3-6)', () => {
  it('shows face, name and what it is doing; human state says who paused', () => {
    const { container, rerender } = render(<PersonaCursor persona={{ name: 'Nina', color: '#f0be6a' }} point={{ x: 10, y: 10 }} state="typing" detail="Padaria Lua" />)
    expect(container.textContent).toContain('Nina')
    expect(container.textContent).toContain('Padaria Lua')
    rerender(<PersonaCursor persona={{ name: 'Nina', color: '#f0be6a' }} point={{ x: 10, y: 10 }} state="human" humanLabel="você assumiu" />)
    expect(container.querySelector('[data-state="human"]')?.textContent).toContain('você assumiu')
  })

  it('steps with buttons and arrow keys, captions "Passo n de N"', () => {
    const steps = [
      { id: 'a', shotSrc: 'a.png', at: { x: 10, y: 10 }, kind: 'click' as const, label: 'abrindo o cadastro' },
      { id: 'b', shotSrc: 'b.png', at: { x: 300, y: 120 }, kind: 'type' as const, label: 'digitando', typed: 'Padaria Lua' },
      { id: 'c', shotSrc: 'c.png', at: { x: 500, y: 300 }, kind: 'click' as const, label: 'salvando o pedido' },
    ]
    const labels = { region: 'O que a Nina fez', play: 'Assistir', pause: 'Pausar', previous: 'Passo anterior', next: 'Próximo passo', restart: 'Ver de novo', stepOf: (n: number, total: number) => `Passo ${n} de ${total}` }
    render(<ActionReplay persona={{ name: 'Nina', color: '#f0be6a' }} steps={steps} shotSize={{ w: 800, h: 500 }} labels={labels} />)
    expect(screen.getByText('Passo 1 de 3')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Próximo passo' }))
    expect(screen.getByText('Passo 2 de 3')).toBeTruthy()
    fireEvent.keyDown(screen.getByRole('region', { name: 'O que a Nina fez' }), { key: 'ArrowRight' })
    expect(screen.getByText('Passo 3 de 3')).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Ver de novo' })).toBeTruthy()
  })
})
