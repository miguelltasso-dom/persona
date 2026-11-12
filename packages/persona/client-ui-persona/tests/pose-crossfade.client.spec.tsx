// @vitest-environment jsdom
import { act, cleanup, render } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { PersonaTeamFigure } from '../src/client/team/PersonaTeamFigure.tsx'

afterEach(() => { cleanup(); vi.useRealTimers() })

describe('pose crossfade on real state change (UX-GUIDE §3)', () => {
  it('no animation on first mount; a state change keeps the old pose fading out, then removes it', () => {
    vi.useFakeTimers()
    const member = { id: 'nina' as const, name: 'Nina', role: 'Pesquisa', state: 'working' as const }
    const { container, rerender } = render(<PersonaTeamFigure member={member} breatheDelay="0s" />)
    const imgs = (): number => container.querySelectorAll('img').length
    const before = imgs()
    rerender(<PersonaTeamFigure member={{ ...member, state: 'resting', quiet: true }} breatheDelay="0s" />)
    expect(imgs()).toBe(before + 1)
    act(() => { vi.advanceTimersByTime(300) })
    expect(imgs()).toBe(before)
  })
})
