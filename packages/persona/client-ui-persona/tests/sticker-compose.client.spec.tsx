// @vitest-environment jsdom
// COLHEITA §14 (Quill): figurinha armada no composer. "Reagir" manda a figurinha sem texto; a dica aparece só quando pedida; fechar não manda nada.
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { StickerComposeBar } from '../src/client/chat/StickerComposeBar.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'

afterEach(() => { cleanup() })

const t = (key: string) => (chatPt[key as keyof typeof chatPt] ?? key) as string

describe('figurinha armada no composer', () => {
  it('"Reagir" manda a figurinha escolhida, sem texto', () => {
    const onSend = vi.fn()
    render(<StickerComposeBar t={t as never} reaction="joinha" showHint={false} onSend={onSend} onClose={() => {}} />)
    fireEvent.click(screen.getByRole('button', { name: 'Reagir' }))
    expect(onSend).toHaveBeenCalledWith('joinha')
  })

  it('a dica "Figurinha sozinha não pede resposta." aparece só quando pedida (primeiro uso)', () => {
    const { rerender } = render(<StickerComposeBar t={t as never} reaction="joinha" showHint={false} onSend={() => {}} onClose={() => {}} />)
    expect(screen.queryByText('Figurinha sozinha não pede resposta.')).toBeNull()
    rerender(<StickerComposeBar t={t as never} reaction="joinha" showHint onSend={() => {}} onClose={() => {}} />)
    expect(screen.getByText('Figurinha sozinha não pede resposta.')).toBeTruthy()
  })

  it('tirar a figurinha só fecha a barra; não manda nada', () => {
    const onSend = vi.fn()
    const onClose = vi.fn()
    render(<StickerComposeBar t={t as never} reaction="joinha" showHint={false} onSend={onSend} onClose={onClose} />)
    fireEvent.click(screen.getByRole('button', { name: 'Tirar a figurinha' }))
    expect(onClose).toHaveBeenCalledTimes(1)
    expect(onSend).not.toHaveBeenCalled()
  })
})
