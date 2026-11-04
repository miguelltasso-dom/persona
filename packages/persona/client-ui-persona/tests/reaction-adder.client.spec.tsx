// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReactionAdder, reactionIdFromEmoji } from '../src/client/chat/ReactionAdder.tsx'

afterEach(() => { cleanup() })

const LABELS = { joinha: 'Joinha', coracao: 'Coração', rindo: 'Rindo', comemorando: 'Comemorando', pensando: 'Pensando', feito: 'Feito' } as const

describe('ReactionAdder', () => {
  it('opens the sticker picker, reacts with id + emoji, and returns focus to the button', () => {
    const onReact = vi.fn()
    render(<ReactionAdder animal="nina" label="Reagir com figurinha" labels={LABELS} onReact={onReact} />)
    const button = screen.getByRole('button', { name: 'Reagir com figurinha' })
    fireEvent.click(button)
    expect(button.getAttribute('aria-expanded')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Comemorando' }))
    expect(onReact).toHaveBeenCalledWith('comemorando', '🎉')
    expect(screen.queryByRole('group')).toBeNull()
    expect(document.activeElement).toBe(button)
  })

  it('Esc closes without reacting', () => {
    const onReact = vi.fn()
    render(<ReactionAdder label="Reagir" labels={LABELS} onReact={onReact} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reagir' }))
    fireEvent.keyDown(screen.getByRole('group'), { key: 'Escape' })
    expect(screen.queryByRole('group')).toBeNull()
    expect(onReact).not.toHaveBeenCalled()
  })

  it('maps host emoji to sticker ids', () => {
    expect(reactionIdFromEmoji('👍')).toBe('joinha')
    expect(reactionIdFromEmoji('❤')).toBe('coracao')
    expect(reactionIdFromEmoji('🦄')).toBeUndefined()
  })
})
