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

  it('"Você parou aqui · Continuar" na DM manda "Continue de onde parou." (a conversa já é com ela, sem menção)', () => {
    const onSend = vi.fn()
    const stopped = { id: 'coord-m1-reply', authorId: 'nina', authorName: 'Nina', body: 'Vou explicar em três passos: primeiro', timeLabel: '10:01', reactions: [], stopped: true as const }
    render(<DirectMessagesView t={t} shellT={shellTranslate} loading={false} dms={[NINA]} selectedId="dm-nina" messages={[stopped]} onSelect={() => undefined} onSend={onSend} />)
    fireEvent.click(screen.getByRole('button', { name: 'Continuar' }))
    expect(onSend).toHaveBeenCalledWith('Continue de onde parou.')
  })

  it('thread header ⋯ menu opens Ensinar for a persona peer', () => {
    const onTeach = vi.fn()
    render(
      <DirectMessagesView
        t={t}
        shellT={shellTranslate}
        loading={false}
        dms={[NINA]}
        selectedId="dm-nina"
        messages={[]}
        onSelect={() => undefined}
        onSend={() => undefined}
        onTeach={onTeach}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: bindLocale(chatPt, 'dm.threadMenu', { name: 'Nina' }) }))
    fireEvent.click(screen.getByRole('menuitem', { name: bindLocale(chatPt, 'dm.threadMenuTeach', { name: 'Nina' }) }))
    expect(onTeach).toHaveBeenCalledTimes(1)
  })

  it('empty thread offers first-request suggestions that match the job title (one click sends)', () => {
    const onSend = vi.fn()
    renderDm(onSend)
    const suggestion = screen.getByRole('button', { name: chatPt['dm.suggest.research.1'] })
    fireEvent.click(suggestion)
    expect(onSend).toHaveBeenCalledWith(chatPt['dm.suggest.research.1'])
  })
})
