// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { ReactionChip, REACTION_IDS, StickerPicker, type ReactionId } from '../src/client/primitives/index.ts'

afterEach(() => { cleanup() })

const LABELS: Readonly<Record<ReactionId, string>> = {
  joinha: 'Joinha', coracao: 'Coração', rindo: 'Rindo', comemorando: 'Comemorando', pensando: 'Pensando', feito: 'Feito',
}

describe('StickerPicker', () => {
  it('offers the six contract reactions with names, marks the chosen ones and picks on click', () => {
    const onPick = vi.fn()
    render(<StickerPicker animal="nina-default" labels={LABELS} label="Reagir com figurinha" selected={['feito']} onPick={onPick} />)
    const group = screen.getByRole('group', { name: 'Reagir com figurinha' })
    const buttons = [...group.querySelectorAll('button')]
    expect(buttons.map(b => b.getAttribute('aria-label'))).toEqual(REACTION_IDS.map(id => LABELS[id]))
    expect(screen.getByRole('button', { name: 'Feito' }).getAttribute('aria-pressed')).toBe('true')
    fireEvent.click(screen.getByRole('button', { name: 'Coração' }))
    expect(onPick).toHaveBeenCalledWith('coracao')
  })

  it('arrow keys move focus across the grid', () => {
    render(<StickerPicker labels={LABELS} label="Reagir" onPick={() => undefined} />)
    const first = screen.getByRole('button', { name: 'Joinha' })
    first.focus()
    fireEvent.keyDown(first, { key: 'ArrowDown' })
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Comemorando' }))
  })
})

describe('ReactionChip sticker', () => {
  it('shows the sticker instead of the emoji when given', () => {
    const { container } = render(<ReactionChip emoji="👍" sticker="data:image/webp;base64,AA==" count={2} label="2 reações Joinha" />)
    expect(container.querySelector('img')).not.toBeNull()
    expect(container.textContent).not.toContain('👍')
  })
})
