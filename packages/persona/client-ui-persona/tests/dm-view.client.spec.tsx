// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { DirectMessagesView } from '../src/client/chat/DirectMessagesView.tsx'
import { pt as chatPt } from '../src/client/locale/chat/locales.ts'
import { bindLocale } from '../src/client/preview/locale-bind.ts'
import { shellTranslate } from '../src/client/preview/shell-translate.ts'

HTMLElement.prototype.scrollTo = () => {}
afterEach(() => { cleanup() })

const t = ((key: string, params?: Readonly<Record<string, string>>) => bindLocale(chatPt, key, params)) as never
const NINA = { id: 'dm-nina', peerId: 'nina', peerName: 'Nina', characterId: 'nina', role: 'Pesquisa', state: 'resting' as const }

function renderDm(onSend: (body: string) => void): void {
  render(
    <DirectMessagesView t={t} shellT={shellTranslate} loading={false} dms={[NINA]} selectedId="dm-nina" messages={[]} onSelect={() => undefined} onSend={onSend} />,
  )
}

describe('DM with a persona', () => {
  it('composer talks to the persona, not #geral, and sends to the DM handler', () => {
    const onSend = vi.fn()
    renderDm(onSend)
    const field = screen.getByPlaceholderText('Mensagem para Nina…')
    expect(screen.queryByPlaceholderText(chatPt['composer.placeholderChannel'])).toBeNull()
    fireEvent.change(field, { target: { value: 'Oi, Nina' } })
    fireEvent.click(screen.getByRole('button', { name: chatPt['composer.send'] }))
    expect(onSend.mock.calls[0]?.[0]).toBe('Oi, Nina')
  })

  it('empty thread offers first-request suggestions that match the job title (one click sends)', () => {
    const onSend = vi.fn()
    renderDm(onSend)
    const suggestion = screen.getByRole('button', { name: chatPt['dm.suggest.research.1'] })
    fireEvent.click(suggestion)
    expect(onSend).toHaveBeenCalledWith(chatPt['dm.suggest.research.1'])
  })
})
